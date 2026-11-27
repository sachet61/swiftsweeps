# Supabase Realtime to Self-Hosted SSE Migration

This document specifies the replacement of Supabase Realtime (`supabase.channel` / `postgres_changes` / `broadcast`) with authenticated same-origin Server-Sent Events (SSE) on the persistent Node.js API (`/api/realtime/stream` and `/api/chat/stream`).

## 1. Architecture & Event Transport

- **Chat Stream (`GET /api/chat/stream`)**:
  - Pushes `chat_message`, `message_updated`, and `conversation_status` events produced by `ChatEventBroker` (`server/chat/chatEvents.ts`) strictly after PostgreSQL commits succeed.
  - Strictly enforces customer isolation and suppresses `isInternalNote` events from non-staff sessions during both live delivery and reconnect replay.
- **Application Domain & Audit Stream (`GET /api/realtime/stream`)**:
  - Pushes two event classes produced by `RealtimeEventBroker` (`server/realtime/realtimeEvents.ts`) strictly after HTTP route repository mutations resolve cleanly:
    - `audit_log`: delivered strictly to `role === 'admin'` (`{ scope: 'admin' }`).
    - `domain_invalidation`: table/domain invalidation hints (`tables`, optional `customerId`, `reason`, `timestamp`) delivered by server-verified audience scope (`admin`, `staff`, `user`, `user_and_staff`, `authenticated`).
- **Financial Source-of-Truth Guarantee**:
  - `domain_invalidation` events carry **only metadata/table hints** — never wallet balances, ledger totals, or secrets.
  - Clients (`src/services/dataService.ts`) debounce invalidation hints (250 ms) and perform authoritative REST fetches (`fetchDepositsFromServer`, `fetchWithdrawalsFromServer`, `fetchWalletFromServer`, `fetchWalletTransactionsFromServer`, `reconcileCustomerWallet`, etc.) to update state. Failed or rolled-back database mutations never emit realtime events.

## 2. Reconnect, `Last-Event-ID` Replay, & Reconciliation

- Both brokers tag emitted events with monotonic composite cursors: `id: <epoch>:<seq>` (e.g., `re_a1b2c3d4:12`, `ce_f1e2d3c4:8`).
- Each broker maintains a bounded in-memory ring buffer (`maxHistory = 250`).
- On SSE reconnect, browsers (via native `Last-Event-ID`) or explicit reconnect URLs (`?lastEventId=...`) send the last seen cursor:
  - Within buffer & matching `epoch`: missed authorized events (`seq > cursor.seq`) are replayed immediately after `ready`. Role/ownership filters are re-evaluated on every replayed event.
  - Stale cursor (`buffer_evicted`), API restart (`epoch_mismatch`), `future_cursor`, or `invalid_cursor`: server emits `event: resync_required`.
- Client SSE adapters (`src/services/realtimeStreamClient.ts`, `src/services/chatStreamClient.ts`, `src/services/sseReconnectUtils.ts`):
  - Track the latest cursor and pass `?lastEventId=...` on reconnect.
  - Use bounded exponential backoff (`3s -> 6s -> 12s -> 24s -> 30s` with jitter, min `1000ms`) after `EventSource.CLOSED` — no aggressive `setInterval` polling.
  - Fire `onReconnect` on stream recovery and on `resync_required` so callers (`dataService.syncDelta()`, `CustomerChat`, `AdminChat`, `GlobalChatNotificationManager`) reconcile against authoritative REST endpoints.

## 3. Production Operational Requirements & Limitations

### Nginx Reverse Proxy Configuration
SSE connections are long-lived HTTP responses with 15s `: ping\n\n` heartbeats. Nginx must disable response buffering and allow long read timeouts specifically on `/api/realtime/stream` and `/api/chat/stream`:

```nginx
location ~ ^/api/(realtime|chat)/stream$ {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_buffering off;
    proxy_cache off;
    add_header X-Accel-Buffering no;
    chunked_transfer_encoding on;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

### Operational Limitations (Current Phase)
1. **Single-Process In-Memory Broker**: `ChatEventBroker` and `RealtimeEventBroker` are process-local in-memory event hubs with a 250-event replay buffer. This matches a single persistent Node.js API process supervised by `systemd`. Running multiple API worker processes behind a load balancer without sticky sessions + an external pub/sub bus (PostgreSQL `LISTEN/NOTIFY` or Redis Pub/Sub) will cause missed live events across processes and `epoch_mismatch` -> `resync_required` fallbacks.
2. **Legacy Supabase Realtime Code Retained Pending Cutover Approval**:
   - `src/services/dataService.ts` retains `initSupabaseRealtimeSync()` (executed only when `isSupabaseConfigured()` is true).
   - `src/services/realtimeChatHub.ts`, `src/services/chatRealtime.ts`, and `src/services/realtimeChatHub.test.ts` remain in the repository untouched and should be retired only when Supabase is formally decommissioned.
3. **Auth Middleware Scope**: `/api/realtime/stream` enforces active authenticated sessions (`requireAuth`); unauthenticated or suspended sessions are rejected (`401`/`403`) before opening an SSE stream. EventSource browsers cannot read JSON error bodies directly on `401`/`403`, so session expiration triggers `CLOSED` + backoff / auth revalidation through REST callers.
