# Security Summary

A targeted security and regression review of the migrated self-hosted API, authentication, authorization, database repositories, realtime streams, storage, and React frontend identified three concrete defects, each patched with minimal surgical edits and covered by automated regression tests:

1. **Unmasked Database Error Propagation in Chat API (`server/routes/chat.ts`)**
   - **Risk**: `mapRepoErrorToHttp` wrapped unknown repository/database errors in `HttpError(500, 'INTERNAL_ERROR', err.message)`. Because the centralized error handler passes `HttpError.safeMessage` directly to clients, unexpected PostgreSQL errors (including table/query details or connection URIs) could leak in HTTP responses instead of being logged privately with redaction.
   - **Fix**: Updated `mapRepoErrorToHttp` to return unknown errors unchanged so `createErrorHandler` redacts secrets/connection strings in server logs and returns a generic `INTERNAL_SERVER_ERROR` response to clients.

2. **Stored Markup Injection Sinks & Weak Tag Validation in Platform Rules / Policies CMS (`src/pages/customer/CustomerRules.tsx`, `src/components/admin/PolicyAndPartnerCmsCard.tsx`, `src/utils/uiCopyUtils.ts`, `src/components/common/SafeFormattedText.tsx`, `server/routes/appConfig.ts`)**
   - **Risk**: `CustomerRules.tsx` and `PolicyAndPartnerCmsCard.tsx` rendered formatted HTML strings via `dangerouslySetInnerHTML`, while `server/routes/appConfig.ts` relied on an incomplete blacklist (`<script`, `<iframe`, `<object`, `<embed`, `javascript:`, `on[a-z]+\s*=`) for `policies.*Html` and accepted arbitrary raw tags inside `platformRules.*` (allowing bypass payloads such as `<svg/onload=...>`, `<img src=x onerror=...>`, or `data:text/html`).
   - **Fix**: Replaced all `dangerouslySetInnerHTML` usage across `src/` with a structured parser (`parseSafeFormattedBlocks`) and React JSX renderer (`SafeFormattedText`), eliminating client-side raw HTML injection sinks. Replaced the server blacklist with strict tag/attribute allowlisting (`assertSafeLimitedHtmlTags`) across both `policies.*Html` and `platformRules.*`.

3. **Telegram Bot Token Redaction in Error Paths (`server/routes/appConfig.ts`, `server/logging/logger.ts`)**
   - **Risk**: In `GET /api/telegram/status`, caught network errors from `fetch('https://api.telegram.org/bot<token>/getMe')` placed `err.message` directly into `lastError`, which could expose the bot token if the HTTP client annotated the thrown error with the request URL.
   - **Fix**: Scrubbed both literal `cfg.botToken` and `/bot<digits>:<token>` URL segments from `lastError` before responding, and added `/bot\d*:[^\s/'"]+/gi` redaction to `redactString` in `server/logging/logger.ts`.

## PoC Verification

- **Chat DB Error Masking (`server/tests/chat.test.ts`)**:
  - Simulated an unexpected PostgreSQL failure (`relation "public.conversations" failed on postgres://dbuser:supersecret@10.0.0.5:5432/prod`) during `GET /api/chat/conversations`.
  - Verified the endpoint returns HTTP `500` with `error.code === 'INTERNAL_SERVER_ERROR'` and none of the raw SQL error text, table name, PostgreSQL URI, or credentials appear in the response body.

- **Policy / Platform Rules XSS Bypass Rejection & Safe Client Parsing (`server/tests/appConfig.test.ts`, `src/utils/uiCopyUtils.test.ts`)**:
  - Verified `PATCH /api/admin/app-config/policies` rejects `<svg/onload=alert(1)>`, `<p><img src=x onerror=alert(1)></p>`, `<p onclick="alert(1)">Click</p>`, and `data:text/html,<script>alert(1)</script>` with HTTP `400`.
  - Verified `PUT /api/admin/app-config` rejects `<p><img src=x onerror=alert(1)></p>` inside `platformRules.depositTerms` with HTTP `400`, while permitting plain comparisons (`Deposits < $50 require verification.`) and safe allowlisted formatting (`<p>Processed within <strong>15 minutes</strong>.</p>`).
  - Verified `parseSafeFormattedBlocks` preserves headings, lists, and inline bold/italic emphasis while stripping `<script>`, `<svg>`, and `<img onerror=...>` payloads.

- **Telegram Status URL Token Redaction (`server/tests/appConfig.test.ts`)**:
  - Configured a Telegram bot token and forced the injected `fetch` dependency to throw `Error('request to https://api.telegram.org/bot9876543210:AAHiddenSecretToken12345/getMe failed, reason: ECONNREFUSED')`.
  - Verified `GET /api/telegram/status` returns HTTP `200` with `lastError` containing `[REDACTED]` and zero occurrences of the raw bot token.
