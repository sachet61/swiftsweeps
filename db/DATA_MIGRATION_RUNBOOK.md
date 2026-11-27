# Controlled Data Migration & Validation Runbook (Supabase PostgreSQL -> Self-Hosted PostgreSQL)

**Status**: Tooling & Staging Dry-Run Ready. **Do NOT execute against production without an approved maintenance freeze window, fresh backups, and explicit operator sign-off.**

---

## 1. Architecture & Safety Policy

1. **No Unsafe Dual Writes**: This migration uses a deterministic **maintenance/freeze window** (`REPEATABLE READ READ ONLY` snapshot export from source -> batched transactional import into target -> reconciliation validation) rather than live dual-writes.
2. **Fail-Closed Environment Guards**:
   - `MIGRATION_SOURCE_ENV` and `MIGRATION_TARGET_ENV` must be explicitly set to `local`, `staging`, or `production`.
   - `MIGRATION_SOURCE_DATABASE_URL` and `MIGRATION_TARGET_DATABASE_URL` must be distinct PostgreSQL URIs (`postgres://` or `postgresql://`).
   - If `MIGRATION_SOURCE_ENV=production`, the tool fails closed unless `MIGRATION_ALLOW_PRODUCTION_SOURCE=CONFIRMED_OPERATOR_READONLY_EXPORT` is set.
   - If `MIGRATION_TARGET_ENV=production`, the tool fails closed unless **both** `MIGRATION_ALLOW_PRODUCTION_TARGET=CONFIRMED_OPERATOR_PRODUCTION_CUTOVER` **and** the `--confirm-production` CLI flag are supplied.
3. **Zero Secret / Credential Leakage**:
   - Connection strings, passwords, tokens, `auth.users.encrypted_password`, `auth.sessions`, `auth.refresh_tokens`, `game_accounts` passwords/PINs, and Web Push keys are **never** written to stdout logs, checkpoint files, or dry-run validation reports.
   - Snapshot exports (`snapshot-data.json`) contain operational `public.game_accounts` rows (`username`/`password`/`pin` used by customers) and are written with `0600` permissions; keep export directories on encrypted operator storage (`chmod 700`) and shred securely after cutover verification.

---

## 2. Schema Mapping & Supabase-Specific Handling

### Canonical Import Dependency Order
1. `public.users` (preserves exact `id`, lowercase trimmed `email`, `role`, `status`, `email_verified`, `referral_code`, timestamps; respects `tr_prevent_verification_downgrade` trigger)
2. `public.ba_user` & `public.auth_user_links` (synthesized deterministically with `migration_source = 'supabase_import'` and `password_reset_required = true`; **excludes** Supabase Auth password hashes & sessions)
3. `public.app_config`
4. `public.push_subscriptions` (imported directly if present, or unpacked from `app_config['push_subscriptions']` using `hashPushEndpointId(endpoint)`)
5. `public.audit_logs` (coalesces legacy `user_id` -> `actor_id`, `user_email` -> `actor_name`, `created_at` -> `timestamp`)
6. `public.game_catalog`
7. `public.faked_cashouts`
8. `public.official_partners` (casts Supabase `updated_by::uuid` -> `TEXT`)
9. `public.official_partner_icons`
10. `public.wallets` (`NUMERIC(12, 2)`, non-negative constraints)
11. `public.game_accounts`
12. `public.topups` (`amount >= 0`, `NUMERIC(12, 2)`, `metadata JSONB`)
13. `public.withdrawals` (`NUMERIC(12, 2)`, `payout_details JSONB`)
14. `public.transactions`
15. `public.referral_awards` (`UNIQUE(referee_id)`, `referrer_id <> referee_id`)
16. `public.wheel_spins` (`NUMERIC(12, 2)` rewards, `NUMERIC(10, 4)` probability weight)
17. `public.notifications` (normalizes legacy Supabase `"read"` column -> `is_read`)
18. `public.conversations`
19. `public.messages`
20. `public.chat_attachments`
21. `public.storage_objects`

### Supabase Features Explicitly Handled / Excluded
| Supabase Feature | Handling in Target PostgreSQL | Operator Action Required |
| --- | --- | --- |
| `auth.users`, `auth.sessions`, `auth.refresh_tokens` | Password hashes and sessions are **not compatible** and **never** imported. Identities map to `ba_user` + `public.auth_user_links` (`password_reset_required = true`). | Ensure transactional email (`EMAIL_PROVIDER=brevo` / `smtp`) is live before traffic switch so users complete password reset on first login. |
| `storage.objects` / `storage.buckets` (`chat_attachments`, `avatars`, `partner-icons`) | Binary object blobs live in Supabase Object Storage outside SQL tables. `preflight` counts `storage.objects` rows and flags `storageObjectsPendingBackfill`. | Run an authenticated Storage API object-transfer script using `SUPABASE_SERVICE_ROLE_KEY` to populate `public.storage_objects` (preserving exact `(bucket, object_path)` and `is_public` flags) before retiring Supabase Storage. |
| `public.password_reset_tokens` | Unused legacy table intentionally excluded (`ba_verification` owns reset tokens). | None (`preflight` logs row count for audit trail). |
| `pg_policies` RLS, `supabase_realtime`, `pg_net` / `pg_cron` | Omitted on target; enforced by Node API RBAC and SSE brokers (`REALTIME_MIGRATION.md`). | Verify Nginx SSE buffering rules before traffic cutover. |
| PL/pgSQL RPCs (`claim_wheel_of_luck_spin`, `transfer_game_credits_atomic`, `credit_referral_award_atomic`) | Replaced in Node API (`WheelRepo`, `ReferralRepo`). | Keep legacy Supabase functions untouched until cutover is complete. |
| Unmapped code-only columns (`users.registered_payment_method`, `is_parent_admin`, `deleted_at`, etc.; `transactions.fee`, `net_amount`, `balance_after`) | Inspected by `preflight` (`unmappedSourceColumns`) with exact non-null row counts. | If `preflight` reports non-null rows in any unmapped column needed at cutover, add an additive migration (`0013_*.sql`) before importing. |
| PostgreSQL `SERIAL` / `IDENTITY` sequences | `import` inspects `pg_get_serial_sequence` dynamically and advances sequences safely via `setval` (never moving backwards). Current tables use `TEXT`/`UUID` PKs (`0` serial sequences). | Confirm `sequences` array in post-import report. |

---

## 3. Environment Variables (Safe Placeholders)

Configure only the variables needed for your current staging/cutover environment (never commit secrets):

```bash
MIGRATION_SOURCE_ENV=staging
MIGRATION_TARGET_ENV=staging
MIGRATION_SOURCE_DATABASE_URL=postgres://<readonly_user>:<password>@<source_host>:5432/<source_db>
MIGRATION_TARGET_DATABASE_URL=postgres://<target_user>:<password>@<target_host>:5432/<target_db>
MIGRATION_SOURCE_SSL_MODE=require
MIGRATION_TARGET_SSL_MODE=require
MIGRATION_BATCH_SIZE=500
MIGRATION_MAX_RETRIES=3
MIGRATION_CHECKPOINT_PATH=.migration-work/checkpoint.json
MIGRATION_REPORT_PATH=.migration-work/report.json
```

---

## 4. Staging Dry-Run Procedure (Recommended First)

1. **Apply Target Schemas (Staging Target)**:
   ```bash
   DATABASE_URL="$MIGRATION_TARGET_DATABASE_URL" PG_SSL_MODE="$MIGRATION_TARGET_SSL_MODE" npm run db:migrate:up
   DATABASE_URL="$MIGRATION_TARGET_DATABASE_URL" PG_SSL_MODE="$MIGRATION_TARGET_SSL_MODE" npm run auth:migrate:up
   ```
2. **Run Read-Only Preflight Validation & Inspection**:
   ```bash
   npm run db:data:preflight -- --report .migration-work/preflight-report.json
   ```
   Review `.migration-work/preflight-report.json` for:
   - `discrepancies: []` (source integrity issues, missing target tables, orphan FKs, duplicate keys)
   - `unmappedObjects.unmappedSourceColumns` (`nonNullCount`)
   - `unmappedObjects.storageObjectsPendingBackfill`
3. **Export Snapshot (Optional Two-Stage Artifact Flow)**:
   ```bash
   npm run db:data:export -- --export-dir .migration-work/staging-snapshot
   ```
4. **Run Staging Import + Automatic Post-Import Reconciliation**:
   ```bash
   npm run db:data:import -- --checkpoint .migration-work/checkpoint.json --report .migration-work/import-report.json
   ```
   *(Or import from the verified snapshot directory via `--snapshot-dir .migration-work/staging-snapshot`.)*
5. **Run Independent Read-Only Verification**:
   ```bash
   npm run db:data:validate -- --report .migration-work/validate-report.json
   ```
   Confirm `passed: true`, `readyForHumanReview: true`, `discrepancies: []`, and `financialReconciliation.matched: true`.

---

## 5. Checksum Limits & Semantic Equivalence Notes

Row SHA-256 checksums are necessary but **not sufficient alone** to prove semantic equivalence:
- **JSON/JSONB formatting**: Key ordering and whitespace are normalized recursively before hashing.
- **Timestamps**: Normalized to UTC ISO-8601 milliseconds.
- **`public.official_partners.updated_at`**: Target trigger `trg_official_partners_updated_at` sets `updated_at = now()` on `INSERT`, so `official_partners` checksums compare all business columns excluding `updated_at`.
- **Schema transitions**: `notifications."read" -> is_read`, `audit_logs` legacy actor columns, `app_config['push_subscriptions'] -> public.push_subscriptions`, and `auth.users -> ba_user + auth_user_links` (`password_reset_required = true`) map structurally rather than byte-for-byte.
- **Exact Money Proofs**: Financial columns use integer-cent exact arithmetic (`toMoneyCents`) across all `wallets`, `transactions` (grouped by `type:status`), `topups` (grouped by `status`), `withdrawals` (grouped by `status`), `game_accounts`, `referral_awards`, `wheel_spins`, and `faked_cashouts`.

---

## 6. Controlled Production Cutover & Rollback Outline (Operator-Only)

> **Do not run these commands until staging validation passes with zero unexplained discrepancies and an approved freeze window is active.**

1. Take an **operator-run logical & physical backup** of both Supabase source and target PostgreSQL **before** starting:
   ```bash
   pg_dump --format=custom --no-owner --no-acl "$MIGRATION_SOURCE_DATABASE_URL" > supabase-pre-cutover-$(date -u +%Y%m%dT%H%M%SZ).dump
   pg_dump --format=custom --no-owner --no-acl "$MIGRATION_TARGET_DATABASE_URL" > target-pre-cutover-$(date -u +%Y%m%dT%H%M%SZ).dump
   ```
2. Place frontend / API into maintenance freeze mode so no new balances, deposits, withdrawals, or signups occur during export.
3. Run `preflight`, `import` (with `MIGRATION_ALLOW_PRODUCTION_SOURCE=CONFIRMED_OPERATOR_READONLY_EXPORT`, `MIGRATION_ALLOW_PRODUCTION_TARGET=CONFIRMED_OPERATOR_PRODUCTION_CUTOVER`, and `--confirm-production`), and `validate`.
4. Execute Storage binary backfill from Supabase Storage into `public.storage_objects` (verified separately).
5. **Rollback**: If validation fails or post-cutover smoke checks fail, keep Supabase intact, restore target from `pg_dump` if needed (never run destructive `DROP TABLE` manually against live state), and keep traffic on the prior stack. **Do not delete Supabase data, drop old tables, or alter production RLS** until post-cutover verification and human approval are complete.
