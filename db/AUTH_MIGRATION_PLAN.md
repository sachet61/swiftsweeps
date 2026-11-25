# Supabase Auth to Better Auth Cutover Plan

This document specifies how existing SwiftSweeps users, foreign keys, credentials, and transactional email flows transition from Supabase Auth to the self-hosted Better Auth layer (`ba_user`, `ba_session`, `ba_account`, `ba_verification`, `ba_rate_limit`) and `public.auth_user_links`.

## 1. Identity & Primary Key Preservation

- Application tables (`wallets`, `transactions`, `topups`, `withdrawals`, `payout_requests`, `referrals`, `audit_logs`, etc.) reference `public.users.id` (`TEXT` primary key).
- Legacy Supabase Auth UUIDs (`auth.users.id`) are recorded in `public.auth_user_links.legacy_supabase_uid` alongside `public.auth_user_links.app_user_id`.
- New self-hosted Better Auth credentials use `ba_user.id` stored in `public.auth_user_links.auth_user_id`.
- Application authorization middleware (`server/middleware/auth.ts`) resolves `ba_session -> ba_user.id -> public.auth_user_links.auth_user_id -> public.users`. Financial and domain foreign keys remain bound to `public.users.id` without rewriting historical ledger rows.

## 2. Password Hashes & Active Sessions

- **Do not import or assume compatibility of Supabase Auth password hashes.** Better Auth uses Node `scrypt` credential hashes in `ba_account` (`providerId = 'credential'`), whereas legacy Supabase Auth hashes and active JWT/refresh tokens are owned by GoTrue.
- **Do not carry over Supabase sessions.** Active Supabase JWT/refresh sessions terminate at cutover; users establish fresh same-origin `HttpOnly` cookie sessions (`ba_session`) on the self-hosted API.
- Imported legacy users must be inserted into `ba_user` (preserving `email_verified` status from the verified export) with `public.auth_user_links.migration_source = 'supabase_import'` and `public.auth_user_links.password_reset_required = true`.
- `session.create.before` in `server/auth/authInstance.ts` blocks sign-in with `403 PASSWORD_RESET_REQUIRED` while `password_reset_required = true`, forcing imported or admin-provisioned users through a verified password-reset flow (`POST /api/auth/request-password-reset` or `POST /api/auth/email-otp/request-password-reset` + reset completion), after which `onPasswordReset` clears `password_reset_required = false`.

## 3. Pre-Cutover Operational Requirements

1. **PostgreSQL Schemas**
   - Review and apply application migrations (`npm run db:migrate:status`, `npm run db:migrate:up`).
   - Review and apply Better Auth schema migrations (`npm run auth:migrate:sql`, `npm run auth:migrate:status`, `npm run auth:migrate:up`).
2. **Secrets & Environment**
   - Set `AUTH_SECRET` to a cryptographically random secret (>= 32 characters; startup fails in `production` if missing or placeholder).
   - Set `APP_ORIGIN` to the canonical HTTPS origin served by Nginx (no wildcard `*`).
   - Set `TRUST_PROXY=loopback` when Nginx runs on the same host and forwards `X-Forwarded-For` / `X-Forwarded-Proto`.
3. **Transactional Email Provider**
   - Password reset and email verification OTP flows require `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, and `EMAIL_FROM_ADDRESS`.
   - When `EMAIL_PROVIDER=disabled`, email-dependent auth endpoints fail closed with `503 EMAIL_DELIVERY_UNAVAILABLE` rather than pretending delivery succeeded.
4. **Google OAuth Note**
   - This auth slice implements email/password registration, sign-in, logout, session management, email verification OTP, password reset, and admin user provisioning. If Google sign-in is retained for production cutover, configure Better Auth `socialProviders.google` with real `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` before retiring Supabase OAuth.
5. **Parent Admin Invariants**
   - Protected parent administrator identities (`sachet61@gmail.com`, `usr_admin_master`, `usr_admin_1`) cannot be demoted or suspended via `/api/admin/users/:userId/*`.

## 4. Cutover Sequence (Runbook Outline — Do Not Auto-Execute)

1. Provision production `AUTH_SECRET`, Brevo credentials, and `APP_ORIGIN`.
2. Run `npm run db:migrate:up` and `npm run auth:migrate:up` against the target database during maintenance window.
3. Run the reviewed one-time identity mapping job to populate `ba_user` and `public.auth_user_links` (`migration_source = 'supabase_import'`, `password_reset_required = true`) from verified `public.users` + `auth.users` exports.
4. Verify `/api/readyz`, test sign-in/OTP/password-reset against a controlled staging account, and confirm `audit_logs` records.
5. Switch frontend traffic (in the subsequent frontend migration phase) and retire Supabase Auth only after verification completes.
