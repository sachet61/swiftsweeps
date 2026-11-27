# SwiftSweeps Production Cutover & Rollback Runbook

> **Mode & Safety Gate**: This runbook governs the transition from the legacy stack (**Vercel static/functions + Supabase PostgreSQL/Auth/Storage**) to the self-hosted stack (**Nginx static `dist/` + persistent Node.js API via `systemd` + private PostgreSQL**).
> - **Do NOT execute this cutover until every mandatory Staging Acceptance check in Section 1 passes.**
> - **Do NOT use unsafe dual-writes.** Cutover uses a **full write-freeze maintenance window**.
> - **Rollback after live writes on the new system is NOT automatically lossless** (see Section 5 for post-cutover delta reconciliation).

---

## 1. Pre-Cutover Staging Acceptance Gate (Required Before Scheduling Cutover)

All 10 items below must be verified on an isolated staging VPS matching production topology (`Nginx` + `systemd` + `PostgreSQL 15+` + real TLS + staging email provider):

| # | Acceptance Criterion | Verification Method | Expected Result |
|---|---|---|---|
| 1 | Nginx serves `dist/` SPA and proxies `/api/` & `/webhooks/` | `curl` SPA routes, missing `/assets/*`, `/.env`, `/api/healthz`, `/api/chat/stream`, `/webhooks/test` | SPA routes return `200` `index.html`; missing `/assets/*` & `/.env` return `404`; `/api/*` & `/webhooks/*` proxy to `127.0.0.1:4000` (never fall back to `index.html`) |
| 2 | HTTPS & `Secure` cookie behavior | Inspect `Set-Cookie` on `POST /api/auth/sign-in/email` over `https://<staging-domain>` (`NODE_ENV=production`) and verify HTTP -> HTTPS `301` | Cookie includes `HttpOnly; Secure; SameSite=Lax`; cross-origin `POST` returns `403 ORIGIN_FORBIDDEN`; plain HTTP returns `301` |
| 3 | API process restart & graceful shutdown (no separate worker required) | `kill -KILL` PID to test `systemd` `Restart=on-failure`, then `systemctl stop myapp-api` (`SIGTERM`) | `systemd` restarts failed API within 5s; `SIGTERM` marks `/api/readyz` `503`, drains HTTP, closes PG pool, and exits `0` within `TimeoutStopSec=15` |
| 4 | Private PostgreSQL & least-privilege runtime role | `ss -tlnp \| grep 5432`, external port scan on `5432`/`4000`, and `psql` DDL attempt as `swiftsweeps_app` | PG listens on `127.0.0.1`/private IP only; external `5432`/`4000` blocked; `CREATE TABLE` as `swiftsweeps_app` fails with permission denied |
| 5 | End-to-end login, session, logout & password recovery | Register -> verify OTP email -> sign in -> reload `/api/auth/me` -> sign out -> forgot-password OTP -> reset password (incl. `password_reset_required=true` account) | All flows succeed over HTTPS; old sessions revoke on password reset; unverified users cannot bypass `email_verified` gate |
| 6 | Feature-parity & negative authorization tests across all domains | Run `npm run test:server` + staging smoke checks across profile, catalog, wallet, deposits, withdrawals, game accounts, wheel, referrals, chat/SSE, partners, storage, notifications, appConfig, auditLogs, adminUsers | `100%` pass (`401` anon, `403` wrong-owner/non-admin, `400`/`409` invalid/duplicate financial transitions) |
| 7 | Inbound webhooks signature & duplicate-event checks | Repository audit (`server/`, `api/`) | **N/A** at initial cutover (zero inbound `/webhooks/*` endpoints exist; Nginx `/webhooks/` block returns Express `404`) |
| 8 | Data import counts, FKs, unique constraints, timestamps & money proofs | Run `npm run db:data:preflight`, `export`, `import`, `validate` against staging Supabase -> staging Postgres | `passed: true`, `readyForHumanReview: true`, `discrepancies: []`, `financialReconciliation.matched: true` |
| 9 | Backup & restore verification in separate DB | Run `pg_dump -Fc`, restore into throwaway `swiftsweeps_restore_verify`, verify counts/money totals, then drop throwaway DB | Restore completes with zero errors and matching row/ledger totals |
| 10 | Logs, monitoring, disk, memory & PG connection observability | Inspect `journalctl -u myapp-api`, `df -h`, `free -m`, `pg_stat_activity` under staging load | JSON logs show redacted metadata only; bounded disk/memory; active PG connections stay within `PG_POOL_MAX` |

---

## 2. Write-Freeze & Maintenance Window Plan

Because Supabase PostgreSQL and self-hosted PostgreSQL must never perform uncoordinated live dual-writes on financial tables (`wallets`, `transactions`, `topups`, `withdrawals`, `game_accounts`, `referral_awards`, `wheel_spins`), cutover requires a **full write-freeze**:

1. **T-24h Notice**: Announce scheduled maintenance window to players and desk operators (recommended low-traffic window, 30–60 minutes budgeted).
2. **T-15m Pre-Freeze Preparation**:
   - Confirm staging dry-run report, target VPS hardware/disk capacity, TLS cert readiness, and production `/var/www/myapp/.env` (`NODE_ENV=production`, `APP_ORIGIN=https://swiftsweeps.net`, fresh `AUTH_SECRET`, live `EMAIL_PROVIDER` credentials, `swiftsweeps_app` DB URI).
   - Keep `myapp-api.service` **stopped** (or not yet receiving public traffic).
3. **T-0 Enter Maintenance / Write-Freeze Mode (Human Checkpoint 1)**:
   - Place the active Vercel/Supabase entry behind a static maintenance response (or disable mutating operations/logins cleanly) so **zero** new deposits, withdrawals, game transfers, spins, referrals, signups, or admin approvals can modify Supabase.
   - Verify no active transactions remain open in Supabase (`SELECT pid, state, query_start FROM pg_stat_activity WHERE state <> 'idle' AND datname = current_database();`).

---

## 3. Exact Production Cutover Sequence & Checkpoints

Each step requires verifying the **Expected Result** before advancing. If any **Abort Condition** triggers, stop immediately and execute Section 4.

### Step 1 — Pre-Cutover Backups (Human Checkpoint 2)
- **Action**:
  ```bash
  pg_dump --format=custom --no-owner --no-acl "$MIGRATION_SOURCE_DATABASE_URL" > "/var/backups/swiftsweeps/supabase-pre-cutover-$(date -u +%Y%m%dT%H%M%SZ).dump"
  pg_dump --format=custom --no-owner --no-acl "$MIGRATION_TARGET_DATABASE_URL" > "/var/backups/swiftsweeps/pg-pre-cutover-$(date -u +%Y%m%dT%H%M%SZ).dump"
  ```
- **Expected Result**: Both dump files exist, non-empty, readable (`pg_restore --list <file> | head`).
- **Abort Condition**: Any `pg_dump` error or unreadable archive.

### Step 2 — Apply & Verify Target Schema (Human Checkpoint 3)
- **Action** (using `swiftsweeps_migrator` credentials):
  ```bash
  npm run db:migrate:check
  DATABASE_URL="$MIGRATOR_DATABASE_URL" PG_SSL_MODE="$MIGRATION_TARGET_SSL_MODE" npm run db:migrate:up
  DATABASE_URL="$MIGRATOR_DATABASE_URL" PG_SSL_MODE="$MIGRATION_TARGET_SSL_MODE" npm run auth:migrate:up
  ```
- **Expected Result**: All 12 SQL migrations + Better Auth tables (`ba_user`, `ba_session`, `ba_account`, `ba_verification`, `ba_rate_limit`) applied cleanly; `swiftsweeps_app` runtime grants verified.
- **Abort Condition**: Checksum mismatch, migration failure, or missing runtime permissions.

### Step 3 — Snapshot Preflight, Import & Reconciliation (Human Checkpoint 4)
- **Action** (explicit production confirmation tokens required):
  ```bash
  export MIGRATION_SOURCE_ENV=production
  export MIGRATION_TARGET_ENV=production
  export MIGRATION_ALLOW_PRODUCTION_SOURCE=CONFIRMED_OPERATOR_READONLY_EXPORT
  export MIGRATION_ALLOW_PRODUCTION_TARGET=CONFIRMED_OPERATOR_PRODUCTION_CUTOVER

  npm run db:data:preflight -- --report /var/backups/swiftsweeps/prod-preflight.json
  npm run db:data:export -- --export-dir /var/backups/swiftsweeps/prod-snapshot
  npm run db:data:import -- --snapshot-dir /var/backups/swiftsweeps/prod-snapshot --confirm-production --checkpoint /var/backups/swiftsweeps/prod-checkpoint.json --report /var/backups/swiftsweeps/prod-import.json
  npm run db:data:validate -- --report /var/backups/swiftsweeps/prod-validate.json
  ```
  - Also run the authenticated Storage binary backfill from Supabase Storage buckets (`chat_attachments`, `avatars`, `partner-icons`) into `public.storage_objects`, verifying object counts and `(bucket, object_path, is_public)` parity.
- **Expected Result**:
  - `prod-validate.json` reports `"passed": true`, `"readyForHumanReview": true`, `"discrepancies": []`, `"financialReconciliation": { "matched": true }`.
  - Storage object counts match `preflight` `storageObjectsPendingBackfill` (`0` missing blobs).
  - Imported users exist in `ba_user` and `public.auth_user_links` with `password_reset_required = true`.
- **Abort Condition**: Any row-count mismatch, FK/unique error, money cent discrepancy, or missing storage object.

### Step 4 — Start Self-Hosted API & Validate Loopback Before DNS Flip (Human Checkpoint 5)
- **Action**:
  ```bash
  sudo systemctl start myapp-api
  sudo systemctl status myapp-api --no-pager
  curl -fsS http://127.0.0.1:4000/api/healthz
  curl -fsS http://127.0.0.1:4000/api/readyz
  sudo nginx -t && sudo systemctl reload nginx
  ```
- **Expected Result**: `myapp-api` active; `/api/healthz` returns `{"status":"ok"}`; `/api/readyz` returns `{"status":"ready"}`; `journalctl -u myapp-api` shows zero fatal/config errors; port `4000` & `5432` remain unreachable externally.
- **Abort Condition**: Service crash loop, `/api/readyz` returning `503`, or unexpected public listening socket.

### Step 5 — DNS Cutover & Post-Cutover Live Smoke Verification (Human Checkpoint 6)
- **Action**:
  1. Switch DNS `A`/`AAAA` records to the self-hosted VPS IP (with pre-lowered TTL from T-24h).
  2. Verify HTTPS response, SPA load, `/api/readyz`, `/api/app-config`, `/api/game-catalog`, and a controlled test-account password-reset -> login (`HttpOnly; Secure; SameSite=Lax`) -> profile read -> sign-out cycle (without altering live financial balances).
  3. Confirm email delivery (`BREVO`/`SMTP`) works for migrated-user password reset (`password_reset_required = true`).
- **Expected Result**: All public HTTPS, auth cookie, SSE `/api/realtime/stream`, and email flows succeed cleanly; error rate stays normal.
- **Abort Condition**: 5xx spike, TLS failure, broken email OTP/reset delivery, broken cookie persistence, or data discrepancy.

### Step 6 — Post-Cutover Observation & Legacy Decommissioning Policy
- **Action**: Monitor `journalctl -u myapp-api`, Nginx access/error logs, and `pg_stat_activity` for **at least 48–72 hours** of clean live operation.
- **Retention**: **Do NOT delete Supabase data, Vercel projects, `api/`, `supabase/`, or `vercel.json`** until explicit human approval is granted after the observation window closes.
- **Cleanup**: Once approved, securely shred `/var/backups/swiftsweeps/prod-snapshot` (which contains exported `game_accounts` credentials).

---

## 4. Rollback Procedure

### Case A — Abort BEFORE DNS Cutover or BEFORE Accepting New Writes
*(Lossless)*
1. Keep DNS pointed to the prior Vercel deployment (or revert DNS immediately if zero post-cutover writes occurred).
2. Stop `myapp-api.service` (`sudo systemctl stop myapp-api`).
3. Leave Supabase PostgreSQL untouched (it remained frozen since Step 2). Lift the Vercel/Supabase maintenance freeze so traffic resumes on the legacy stack cleanly.
4. Restore target PostgreSQL from `pg-pre-cutover-*.dump` before retrying any future cutover attempt.

### Case B — Rollback AFTER the New System Has Accepted Live Writes
*(**NOT automatically lossless** — requires mandatory delta reconciliation)*
1. **Immediately Freeze New Writes**: Put Nginx into maintenance/503 mode for mutating `/api/` routes (or stop `myapp-api.service` after capturing the exact abort timestamp `T_ABORT`) so neither system mutates financial state simultaneously.
2. **Revert Traffic**: Switch DNS back to the legacy Vercel/Supabase endpoint **only in maintenance/read-only mode** until Section 5 reconciliation finishes—or keep maintenance banner up if active wallet/deposit/withdrawal mutations occurred on the new system.
3. **Preserve Evidence**: Take an immediate snapshot of the new PostgreSQL database **before** resetting or wiping anything:
   ```bash
   pg_dump --format=custom --no-owner --no-acl "$SELF_HOSTED_DB_URL" > "/var/backups/swiftsweeps/pg-aborted-cutover-$(date -u +%Y%m%dT%H%M%SZ).dump"
   ```

---

## 5. Reconciling Post-Cutover Writes on Rollback (Explicit Manual Protocol)

Because Supabase PostgreSQL and self-hosted PostgreSQL have independent schemas after cutover (`ba_user` / `auth_user_links` / `public.storage_objects` vs Supabase `auth.users` / `storage.objects`), **automatic backward sync is unsafe and unsupported**. Any records created or updated between `T_CUTOVER` (Step 5) and `T_ABORT` must be audited and reconciled before re-enabling writes on Supabase:

1. **Extract Post-Cutover Delta Window (`updated_at >= T_CUTOVER` / `created_at >= T_CUTOVER`)** from `pg-aborted-cutover-*.dump` (restored into an isolated analysis DB, never live):
   - **New Users & Profile Edits**: `public.users`, `public.game_accounts`.
   - **Financial State & Requests**: `public.topups`, `public.withdrawals`, `public.transactions`, `public.wallets`, `public.referral_awards`, `public.wheel_spins`.
   - **Support & Media**: `public.conversations`, `public.messages`, `public.chat_attachments`, `public.storage_objects`.
2. **Verify External Payment / Operator Reality**:
   - Cross-check every post-cutover `topups` (`submitted`/`approved`/`completed`) and `withdrawals` (`pending`/`approved`/`completed`) record against actual payment processor/CashApp/crypto receipts and desk audit logs (`public.audit_logs`).
   - Do **not** blindly overwrite Supabase `wallets` balances; reconstruct wallet deltas (`availableBalance`, `pending_deposit`, `pending_withdrawal`, `free_play_balance`, `referral_bonus_balance`) transactionally from verified `transactions` rows.
3. **Reconcile Into Supabase Before Lifting Legacy Freeze**:
   - Replay verified missing `users` / `game_accounts` / `topups` / `withdrawals` / `transactions` / `wallets` adjustments into Supabase inside an audited, operator-approved SQL transaction, and re-provision any newly registered users in Supabase Auth (or require password recovery).
   - Lift the legacy maintenance banner **only after** `SELECT SUM(balance), SUM(pending_withdrawal), SUM(free_play_balance), SUM(referral_bonus_balance) FROM public.wallets` and ledger sums match verified external cash movements.
