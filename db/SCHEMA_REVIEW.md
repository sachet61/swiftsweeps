# PostgreSQL Migration Framework & Slice 1 Schema Review

This document records the source-to-target verification for **Slice 1** (`db/migrations/0001_*.sql` and `0002_*.sql`), auth-library separation, unresolved source mappings, and rollback rules.

## 1. Migration Runner & Commands

- Migration directory: `db/migrations/*.sql` (strict `NNNN_<slug>.sql` ordering, tracked in `public.schema_migrations` by SHA-256 checksum inside per-file PostgreSQL transactions guarded by `pg_advisory_lock`).
- Offline integrity & hygiene check (no DB required): `npm run db:migrate:check`
- Staging/local status check (read-only against `DATABASE_URL`): `npm run db:migrate:status`
- Explicit staging/local apply (never auto-run by the API server or tests): `npm run db:migrate:up`

## 2. Verified Slice 1 Tables & Source Traceability

| Target Table | Migration | Verified Source Evidence | Preserved Semantics |
| --- | --- | --- | --- |
| `public.users` | `0001` | `supabase_schema.sql` lines 7–19, 376–393, 549–556 | Preserves `id TEXT PRIMARY KEY`, `email UNIQUE`, `role`, `status`, `email_verified`, `referral_code` upper-trimmed unique partial index, and local `prevent_verification_downgrade` trigger without `auth.*` references. |
| `public.auth_user_links` | `0001` | Migration blueprint (Prompt 2) | Application-owned cross-reference table mapping `app_user_id -> public.users(id)` (`ON DELETE CASCADE`), `auth_user_id`, `legacy_supabase_uid`, and `password_reset_required`. Auth-library internal tables are **not** created manually here. |
| `public.app_config` | `0001` | `supabase_schema.sql` lines 172–176; `api/index.ts`, `api/referralHandlers.ts`, `api/wheelHandlers.ts` | Preserves `id TEXT PRIMARY KEY`, `data JSONB NOT NULL`, `updated_at`. |
| `public.audit_logs` | `0001` | `supabase_schema.sql` lines 159–169, 475–529; `api/index.ts` lines 1660–1675 | Canonical `actor_id`, `actor_name`, `actor_role`, `action`, `entity_type`, `entity_id`, `details`, `timestamp` and descending indexes. |
| `public.wallets` | `0002` | `supabase_schema.sql` lines 22–31, 558–559, 870–871 | `customer_id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE`, all monetary balances exact `NUMERIC(12, 2)` (`>= 0`), `currency TEXT NOT NULL DEFAULT 'USD'`. |
| `public.transactions` | `0002` | `supabase_schema.sql` lines 34–44, 277, 643–645; `api/referralHandlers.ts` | `customer_id REFERENCES public.users(id) ON DELETE CASCADE`, `amount NUMERIC(12, 2)`, verified status set (`completed`, `pending`, `processing`, `failed`, `cancelled`, `reversed`), `(customer_id, created_at DESC)` and partial `(reference_id, type)` indexes. |
| `public.topups` | `0002`, `0004` | `supabase_schema.sql` lines 47–65, 278; `src/types/index.ts`, `src/pages/customer/CustomerTopUp.tsx` | `amount NUMERIC(12, 2) CHECK (amount >= 0)` (relaxed in `0004` for proof-first submissions awaiting staff verification), `bonus_amount NUMERIC(12, 2) CHECK (bonus_amount >= 0)`, `bonus_percentage NUMERIC(5, 2)`, `fee_amount`/`final_wallet_credit NUMERIC(12, 2)`, `reviewer_id` & `target_game_account_id` left unconstrained `TEXT`. |
| `public.withdrawals` | `0002` | `supabase_schema.sql` lines 68–85, 279; `src/types/index.ts`, `src/types.ts` | `amount`, `fee`, `net_amount` all `NUMERIC(12, 2)`, `payout_details JSONB`, `transaction_hash TEXT`, verified status set (`pending`, `pending_verification`, `submitted`, `processing`, `approved`, `completed`, `rejected`, `cancelled`). |
| `public.game_catalog` | `0003` | `supabase_schema.sql` lines 88–99; `src/types/index.ts`, `src/services/gameCatalogUtils.ts` | Preserves `id TEXT PRIMARY KEY`, `title`, `category`, `description`, `min_load NUMERIC(12, 2)`, `bonus_pct NUMERIC(5, 2)`, `is_active`, `icon_url`, `image_url`, `created_at`; additively persists `game_url`, `download_url`, `links JSONB`, and `updated_at` previously synthesized from static seed data. |

## 3. Unresolved / Divergent Source Mappings (Not Guessed in SQL)

1. **`public.users` optional code-only columns**: `api/index.ts` (lines 2072–2079) and `src/services/dataService.ts` (lines 1656, 3246–3253) optionally read `registered_payment_method`, `registered_payment_details`, `is_parent_admin`, `promoted_by`, `promoted_by_name`, `promoted_at`, `last_login_at`, and `deleted_at`. None of these columns exist in `supabase_schema.sql`. Migration `0001` does not guess or fabricate them; add only via an explicit additive migration after verifying live production column types.
2. **`public.wallets` legacy frontend alias reads**: `src/services/dataService.ts` (lines 3211–3215) falls back to `available_balance`, `reserved_balance`, `pending_deposit_balance`, and `last_updated_at` when reading, while `supabase_schema.sql` and writes use `balance`, `pending_withdrawal`, `pending_deposit`, `updated_at`. Migration `0002` follows the canonical database columns.
3. **`public.transactions` extended frontend fields**: `src/types/index.ts` and `src/services/walletActivityUtils.ts` (lines 253–276) read optional `fee`, `net_amount`, and `balance_after` from transaction rows, whereas `supabase_schema.sql` only defines `amount`. Deferred until the server-side wallet/ledger mutation slice decides whether to persist those derived columns.
4. **`public.topups` extended frontend fields**: `0004` additively adds `currency`, `bonus_percentage`, `fee_amount`, `final_wallet_credit`, `provider_ref`, `receipt_name`, `target_game_username`, `funding_source`, and `metadata JSONB` (for `cryptoNetwork`, `cryptoTxHash`, `depositAddress`), relaxes `topups_amount_check` to `CHECK (amount >= 0)` for proof-first customer requests, and preserves `targetGameCatalogId` inside `target_game_account_id` without a foreign key.
5. **`public.audit_logs` legacy columns**: `supabase_schema.sql` (lines 483–520) and `api/index.ts` (lines 1690–1710) contain a fallback for legacy `user_id`, `user_email`, `created_at`. On clean self-hosted PostgreSQL, only canonical `actor_id`, `actor_name`, `actor_role`, `timestamp` are created; pre-cutover data imports must map any legacy export rows into canonical columns during ETL.
6. **`public.password_reset_tokens`**: Present in `supabase_schema.sql` (lines 191–200), but unused by active auth flows (`api/index.ts` line 2515 returns `404`). Intentionally excluded from Slice 1 because the self-hosted auth library will manage verification/reset tokens in its own tables.
7. **Deferred domain slices**: `game_accounts`, `referral_awards`, `wheel_spins`, `official_partners`, `conversations`, `messages`, `notifications`, `faked_cashouts`, atomic SQL RPCs (`credit_referral_award_atomic`, `claim_wheel_of_luck_spin`, `transfer_game_credits_atomic`), and any async outbox/job table are deferred to their respective migration slices. Supabase `auth.*`, `storage.*`, `supabase_realtime`, and `auth.uid()` RLS policies are intentionally omitted because authorization moves to the Node.js API.

## 4. Additive Rules & Rollback Limitations

- **Additive / Expand-First Policy**: All future schema transitions must add nullable columns/tables or defaults first, backfill safely, and switch readers/writers before retiring legacy fields. Destructive statements (`DROP TABLE`, `TRUNCATE`, column drops) are blocked by `npm run db:migrate:check` and require separate manual operator review.
- **Rollback Limitation**: Once live financial or identity rows are inserted into `users`, `auth_user_links`, `wallets`, `transactions`, `topups`, `withdrawals`, or `audit_logs`, running a destructive `DOWN` migration (`DROP TABLE`) would permanently destroy customer balances and ledger history. Recovery from a bad deploy relies on taking a consistent `pg_dump` backup immediately before `npm run db:migrate:up` and executing an additive forward-fix migration rather than an automated schema drop.
