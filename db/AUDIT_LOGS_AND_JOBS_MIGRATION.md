# Scheduled Jobs & Audit Logs RLS Migration Specification

This document records the audit of Supabase scheduled jobs, platform extensions, and remaining Supabase RLS capabilities, along with the self-hosted replacement for **`public.audit_logs` (`/api/audit-logs`)**.

---

## 1. Audit Summary (Scheduled Jobs & Other Capabilities)

| Capability Category | Audit Result | Verification Details |
| --- | --- | --- |
| **Scheduled Jobs (`pg_cron`, `cron.schedule`, Vercel `crons`, durable cron workers)** | **NOT FOUND** | Zero references in `supabase_schema.sql`, `public/supabase_schema.sql`, `supabase/migrations/`, `vercel.json`, `api/`, `server/`, or `src/`. Only transient 15-second SSE keepalive `: ping\n\n` timers on open HTTP streams exist (`server/routes/realtime.ts`, `server/routes/chat.ts`). No scheduler invented. |
| **Platform Extensions (`pg_net`, `pgmq`, Vault, `pgvector`, Database Webhooks, Edge Functions)** | **NOT FOUND** | Zero extension definitions or usages found across SQL schemas or runtime code. |
| **Server-Enforced Audit Log Query/Write & RLS Policy (`"Admins can read audit_logs"`)** | **CONFIRMED** | `supabase_schema.sql` lines 159–169 & 251–264 define `public.audit_logs` RLS restricting `SELECT` to verified admins; `api/index.ts` lines 1728–1879 handled `/api/audit-logs` via Supabase; `vite.config.ts` omitted `/api/audit-logs` from self-hosted proxy routing and `server/app.ts` lacked a mounted route (previously only an ad-hoc mock existed in `server/devMockApp.ts`). |

---

## 2. Confirmed Replacement: Self-Hosted `/api/audit-logs` & RBAC Enforcement

### Self-Hosted Modules Added / Updated
- **Repository**: `server/auditLogs/auditLogRepo.ts` (`AuditLogRepo.listAuditLogs`, `AuditLogRepo.createAuditLog`)
- **HTTP Router**: `server/routes/auditLogs.ts` (`createAuditLogRouter` — `GET /api/audit-logs`, `POST /api/audit-logs`)
- **App Wiring**: `server/app.ts` mounts `createAuditLogRouter` directly under `/api`; `server/devMockApp.ts` duplicate `extraRoutes` closure removed so local dev mock and production Node.js API share the exact same router.
- **Dev Proxy Routing**: `vite.config.ts` (`isSelfHostedAuthPath`) now routes `/api/audit-logs` and `/api/audit-logs/*` to `SELF_HOSTED_API_TARGET` when configured.
- **Minimum Client Compatibility Fix**:
  - `src/services/dataService.ts`: `fetchAuditLogsFromServer` and `persistAuditLogViaApi` use `extractServerApiError(...)` and inspect both `data.code` and `data.error.code` so structured `{ error: { code, message, requestId } }` responses render cleanly in `AdminAudit.tsx`.
  - `src/utils/auditLogUtils.ts`: `normalizeAuditLogRow` retains `official_partner` entity types matching `AuditLog` (`src/types/index.ts`) and `AdminAudit.tsx`.

### Preserved Security, Query, & Failure Semantics
1. **Strict Admin Read Access (`GET /api/audit-logs`)**:
   - Enforces `requireAuth` + `requireRole('admin')` (`401 UNAUTHENTICATED` for anonymous callers, `403 ACCOUNT_SUSPENDED` / `PASSWORD_RESET_REQUIRED` for inactive/locked accounts, `403 FORBIDDEN` for `customer` and `agent` roles).
   - Legacy `userId` query parameter is accepted for wire compatibility with `dataService.ts` and ignored for identity/authorization.
   - Responses set `Cache-Control: no-store`.
2. **Bounded Keyset Pagination & Filtering**:
   - Supports `entityType` (`all` or validated entity types), `search` (`ILIKE ... ESCAPE '\'` across `action`, `actor_name`, `entity_id`, `details` with wildcard characters `%`, `_`, `\` escaped), `fromDate`, `toDate`, `beforeTimestamp`, `format=csv`, and `export=1`.
   - Fetches `limit + 1` rows ordered by `timestamp DESC, id DESC` (capped at `100` standard, `500` when `format=csv` or `export=1`) and returns `{ success: true, logs, hasMore, nextCursor }`.
3. **Server-Derived Audit Actor (`POST /api/audit-logs`)**:
   - Requires `requireAuth` (active `customer`, `agent`, or `admin`).
   - Validates `action` (`1..100` chars uppercase, non-empty, no control chars), rejects immutable fields (`id`, `timestamp`, `created_at`, `createdAt`, `role`, `actingUserId`) with `403 FORBIDDEN_FIELD_MODIFICATION`, and accepts legacy client `actorId`/`actorName`/`actorRole` keys solely to overwrite them from `req.authContext.user` (preventing identity spoofing).
   - Preserves `actorId = 'system'` alias (`actorRole = 'admin'`) strictly when `caller.role === 'admin' && body.actorId === 'system'`.
   - Emits `realtimeEvents?.emitAuditLog(createdLog)` strictly after `INSERT INTO public.audit_logs` commits.
4. **Error Masking**:
   - Invalid query params or payloads return `400 VALIDATION_ERROR`.
   - Database failures propagate to `createErrorHandler`, returning `500 INTERNAL_SERVER_ERROR` without exposing SQL text, constraint names, or stack traces.

---

## 3. Operational Requirements & Limitations

1. **Schema & Indexes Required**:
   - `db/migrations/0001_core_users_auth_links_and_audit.sql` must be applied (`public.audit_logs` canonical columns `id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, timestamp` plus `idx_audit_logs_timestamp` and `idx_audit_logs_entity_timestamp`).
2. **Legacy Column ETL Limitation**:
   - Unlike legacy `api/index.ts`, self-hosted PostgreSQL enforces canonical column names only (`SCHEMA_REVIEW.md` item 5). Any historical rows exported with `user_id` / `user_email` / `created_at` must be mapped during database import before cutover.
3. **Pre-Cutover Coexistence**:
   - Because Vite proxies `/api/audit-logs` to the Node server only when `SELF_HOSTED_API_TARGET` or `DATABASE_URL` is configured, and `dataService.ts` retains `fetchAuditLogsDirectViaRls()` as a pre-cutover fallback on `404`/`5xx`, legacy Vercel + Supabase deployments continue functioning untouched until cutover.

---

## 4. Remaining Legacy Supabase Callers (Cutover Audit)

Do **not** remove legacy Supabase code until final cutover is explicitly approved. Remaining callers across the codebase:

- **Audit Logs Legacy Paths**:
  - `src/services/dataService.ts:8990–9120, 9221, 9233` (`fetchAuditLogsDirectViaRls()` calling `supabase.from('audit_logs')` on backend `404`/`5xx`/network failure)
  - `api/index.ts:1728–1879, 2574–2579` (`handleGetAuditLogs`, `handlePostAuditLog`, and Vercel `/api/audit-logs` dispatch)
  - `supabase_schema.sql:251–264` & `public/supabase_schema.sql` (`"Admins can read audit_logs"` RLS policy)
- **Other Unretired Legacy Fallbacks (Out of Scope for This Feature Slice)**:
  - Auth & Profile: `src/services/supabaseAuthService.ts` (`supabase.auth.*`, `supabase.from('users')`), `src/services/supabaseClient.ts`, `src/services/supabaseTokenManager.ts`
  - Storage fallback: `src/services/storageService.ts` (`supabase.storage.*`), `api/index.ts`
  - Realtime fallback: `src/services/dataService.ts:504, 680–687` (`supabase.channel(...)`)
  - Legacy wallet/tx sync fallback: `src/services/dataService.ts:2087, 2140` (`persistToSupabase`)
  - Vercel Handlers & Schema: `api/index.ts`, `api/officialPartnerHandlers.ts`, `api/referralHandlers.ts`, `api/wheelHandlers.ts`, `api/pushUtils.ts`, `supabase_schema.sql`, `public/supabase_schema.sql`, `supabase/migrations/20261120_official_partners.sql`
