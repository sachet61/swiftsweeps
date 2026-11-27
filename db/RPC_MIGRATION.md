# Supabase RPC / Edge Function Replacement Specification

This document records the audit, server-side transactional replacement, locking/error parity, operational requirements, and remaining legacy callers for **Supabase RPCs and Edge Functions**.

---

## 1. Audit Summary

| Capability Category | Audit Result | Details |
| --- | --- | --- |
| **Supabase Edge Functions** (`supabase/functions/*`, `functions.invoke`, `Deno.serve`) | **NOT FOUND** | Zero Edge Functions or client invocations exist in this repository. No replacement implemented. |
| **Supabase `.rpc(...)` Calls** | **CONFIRMED (3 functions)** | `claim_wheel_of_luck_spin`, `transfer_game_credits_atomic`, and `credit_referral_award_atomic` defined in `supabase_schema.sql` / `public/supabase_schema.sql` and called from legacy Vercel handlers `api/wheelHandlers.ts` and `api/referralHandlers.ts`. Frontend `src/` makes zero `.rpc()` calls. |
| **Supabase SQL Triggers** | **Already replaced / Natively kept** | `handle_auth_user_sync()` (`supabase_schema.sql:292`, `public/supabase_schema.sql:281`) was replaced by `UserDirectoryRepo` + Better Auth; `audit_official_partners_changes()` (`supabase/migrations/20261120_official_partners.sql:117`) was replaced in `OfficialPartnerRepo`. Pure PostgreSQL triggers/helpers (`prevent_verification_downgrade`, `is_valid_official_partner_url`, `touch_official_partners_updated_at`) remain active natively in `db/migrations/0001_*.sql` and `0008_*.sql`. |

---

## 2. Confirmed RPC Replacements

### A. `public.claim_wheel_of_luck_spin` -> `WheelRepo.spin()` + `POST /api/wheel/spin`
- **Legacy SQL & Caller**: `supabase_schema.sql` (lines 940–1112); `api/wheelHandlers.ts` (line 259).
- **Self-Hosted Replacement**:
  - `server/wheel/wheelRepo.ts` (`WheelRepo.spin`)
  - `server/routes/wheel.ts` (`POST /api/wheel/spin`)
- **Preserved Transaction, Locking, & Authorization Semantics**:
  1. **Server-Derived Identity**: `POST /api/wheel/spin` requires `requireAuth` (`req.authContext.user.appUserId`); client-supplied `userId` mismatch or privileged fields (`rewardAmount`, `simulatedWinAmount`, `segmentId`, `freePlayBalance`, etc.) are rejected with `403 FORBIDDEN`.
  2. **Transactional Row Locks (`BEGIN` / `COMMIT` / `ROLLBACK`)**: Locks `public.users WHERE id = $1 FOR UPDATE`, idempotently provisions `public.wallets` (`ON CONFLICT DO NOTHING`), then locks `public.wallets WHERE customer_id = $1 FOR UPDATE` inside a single PostgreSQL transaction.
  3. **Idempotency Replay Before Spin**: Checks `(customer_id, idempotency_key)` on `public.wheel_spins` before cooldown or RNG selection and replays `idempotentReplay: true` with `actualRewardAmount` and live wallet balances without double-crediting.
  4. **Rolling 24-Hour Cooldown**: Checks latest `completed` row in `public.wheel_spins`; returns `429 COOLDOWN_ACTIVE` with `eligibility` if within `ROLLING_SPIN_COOLDOWN_MS` (86,400,000 ms).
  5. **Strict Simulated Showcase Separation**: Cryptographically weighted segment selection (`crypto.randomInt`) credits **only** `rewardAmount` to `wallets.free_play_balance` (never `simulatedWinAmount`), inserts `public.transactions` (`type = 'free_play_bonus'`, `status = 'completed'`, `game_name = 'Wheel of Luck'`), inserts `public.notifications` (`type = 'bonus'`, `link_tab = 'game_accounts'`), and records `WHEEL_OF_LUCK_SPIN_CLAIMED` in `public.audit_logs`.
  6. **Error Parity**: Missing user -> `404 USER_NOT_FOUND`, disabled wheel -> `403 WHEEL_DISABLED`, no active segments -> `409 NO_ACTIVE_SEGMENTS`, cooldown active -> `429 COOLDOWN_ACTIVE`. Any write failure triggers `ROLLBACK` before emitting SSE invalidations.

### B. `public.transfer_game_credits_atomic` -> `WheelRepo.transferGameCredits()` + `POST /api/game-accounts/transfer`
- **Legacy SQL & Caller**: `supabase_schema.sql` (lines 1114–1269); `api/wheelHandlers.ts` (line 924).
- **Self-Hosted Replacement**:
  - `server/wheel/wheelRepo.ts` (`WheelRepo.transferGameCredits`)
  - `server/routes/wheel.ts` (`POST /api/game-accounts/transfer`)
- **Preserved Transaction, Locking, & Authorization Semantics**:
  1. **Ownership & Role Checks**: Non-staff (`customer`) can only transfer on their own `game_accounts` (`403 FORBIDDEN` on `customerId` mismatch or third-party `gameAccountId`). Active game account status (`status = 'active'`) is required (`400 VALIDATION_ERROR` otherwise).
  2. **Deadlock-Free Canonical Lock Order (`wallets -> game_accounts`)**: Resolves target `ownerId` non-lockingly first (for `gameAccountId` lookup), checks ownership before acquiring locks, upserts `public.wallets`, acquires `SELECT ... FROM public.wallets WHERE customer_id = $1 FOR UPDATE`, and **then** acquires `SELECT ... FROM public.game_accounts ... FOR UPDATE` and re-verifies `customer_id` and `status = 'active'` under lock.
  3. **Precision & Bonus Isolation**:
     - `load` (`free_play`, `referral_bonus`, or `wallet_cash`): enforces exact 2-decimal balance checks (`INSUFFICIENT_FREE_PLAY`, `INSUFFICIENT_REFERRAL_BONUS`, `INSUFFICIENT_WALLET_CASH`); bonus loads increment both `game_accounts.balance` and `game_accounts.free_play_balance` so bonus credits cannot wash into cashable balance.
     - `unload`: `computeGameCreditUnloadSplit` returns `free_play_balance` to `wallets.free_play_balance` **before** returning remaining winnings to `wallets.balance` (`INSUFFICIENT_GAME_CREDITS` on shortfall).
  4. **Ledger, Audit, Chat, & Post-Commit Telegram Alert**:
     - Inserts `public.transactions` (`game_load` / `game_redeem`), `public.audit_logs`, `public.notifications`, and (`free_play` / `referral_bonus` loads) `public.conversations` + `public.messages` inside the transaction.
     - Dispatches Telegram bonus-load alerts via `appConfigRepo` **strictly after transaction commit** so DB locks are never held across external network calls and Telegram outages never roll back committed wallet transfers (`telegramNotified: boolean` reflects real delivery).

### C. `public.credit_referral_award_atomic` -> `ReferralRepo.creditReferralAwardInTx()` (+ `reconcileMissingReferralRewards()`)
- **Legacy SQL & Caller**: `supabase_schema.sql` (lines 647–864), `public/supabase_schema.sql` (line 579); `api/referralHandlers.ts` (line 545).
- **Self-Hosted Replacement**:
  - `server/referrals/referralRepo.ts` (`ReferralRepo.creditReferralAwardInTx`, called atomically inside `evaluateReferralQualification`, `manualAssignReferral`, and `reviewHeldReferral`; plus `reconcileMissingReferralRewards`)
  - `server/routes/referrals.ts` (`/api/referrals/evaluate`, `/api/referrals/manual-assign`, `/api/referrals/review`, `/api/referrals/reconcile`)
- **Preserved Transaction, Locking, & Authorization Semantics**:
  1. **Award & Deterministic Dual-Wallet Lock Order**: Locks `public.referral_awards WHERE id = $1 FOR UPDATE` first (returning immediately if already `status = 'rewarded'`), then sorts `[referrerId, refereeId]` (`Array.from(new Set(...)).sort()`), ensures both `public.wallets` rows exist (`ON CONFLICT DO NOTHING`), and locks them in deterministic ascending ID order (`FOR UPDATE`) to prevent A->B vs B->A deadlocks.
  2. **Per-Leg Idempotency & Stub Transaction Healing**: Inspects existing `referral_reward` transactions by `(reference_id, type)` or deterministic IDs (`tx_ref_r_<awardId>`, `tx_ref_f_<awardId>`). Each unpaid leg credits `balance` (for `available_balance`) or `referral_bonus_balance` (for `referral_bonus`), upserts `public.transactions` with `game_name = 'Swift Sweeps Referral'` using `ON CONFLICT (id) DO UPDATE SET ... status = 'completed'` (healing any interrupted non-completed stub rows), and inserts idempotent `public.notifications` (`ON CONFLICT (id) DO NOTHING`).
  3. **Rollback Safety**: All wallet updates, transaction inserts, notifications, and `referral_awards` finalization (`status = 'rewarded'`) execute inside `BEGIN ... COMMIT` with automatic `ROLLBACK` on any query error.

---

## 3. Operational Requirements & Schema Dependencies

1. **Live PostgreSQL Transaction Pool**:
   - `WheelRepo` and `ReferralRepo` require a `DatabasePool` implementing `.connect()` returning a dedicated pooled `pg.PoolClient` so `BEGIN`, `FOR UPDATE` row locks, `COMMIT`, and `ROLLBACK` execute on a single PostgreSQL session.
   - Schema migrations `db/migrations/0001_*` through `0012_*` must be applied (`npm run db:migrate:up`) so `UNIQUE (customer_id, idempotency_key)` on `wheel_spins`, `UNIQUE (referee_id)` on `referral_awards`, `NUMERIC(12, 2) CHECK (>= 0)` constraints on `wallets` and `game_accounts`, and `public.notifications` exist.
2. **Deadlock Prevention Discipline**:
   - All multi-table locking across the self-hosted API must preserve the canonical lock DAG (`users -> wallets -> game_accounts` and sorted `customer_id` order for multi-wallet locks).
3. **External Alert Config (`Telegram`)**:
   - `POST /api/game-accounts/transfer` reads `appConfigRepo.getTelegramInternalConfig()` post-commit; if `botToken`, `channelId`, or `enabled` is unset or Telegram API returns an error, the transfer still succeeds with `telegramNotified: false`.

---

## 4. Operational Limitations (Current Phase)

1. **In-Memory Dev Mock Concurrency**: When `DATABASE_URL` and `SELF_HOSTED_API_TARGET` are both unset, Vite's `devMockApp` mounts `InMemoryDatabasePool` (`server/db/inMemoryPool.ts`), which simulates SQL behavior for local dev/testing without cross-process PostgreSQL row locks. Production must run against PostgreSQL.
2. **Sandboxed Test Environment**: Unit and integration tests in `server/tests/wheel.test.ts` and `server/tests/referrals.test.ts` execute against deterministic in-memory PostgreSQL mocks (`InMemoryWheelDatabase`, `InMemoryReferralDatabase`); a live PostgreSQL instance is not provisioned in this build sandbox.
3. **Best-Effort Telegram Notification**: Post-commit Telegram alerts for free-play/referral bonus loads do not use a durable outbox retry worker; transient Telegram API downtime results in `telegramNotified: false` while still recording the in-app staff chat message (`staffMessage`) inside PostgreSQL.
4. **Legacy Supabase Artifacts Retained Pending Cutover**:
   - `api/wheelHandlers.ts` (lines 259, 924) and `api/referralHandlers.ts` (line 545) remain untouched in `api/` and should only be removed when Vercel Functions + Supabase are formally retired.
   - `supabase_schema.sql` (lines 647–1269) and `public/supabase_schema.sql` (line 579) still retain the historical PL/pgSQL RPC definitions until final Supabase decommission.
