# SwiftSweeps VPS Deployment & Operations Runbook

> **Scope & Safety Notice**: This runbook documents the approved self-hosted VPS deployment topology:
> - **Static frontend**: Vite React build (`dist/`) served directly by Nginx.
> - **Persistent API**: Single Node.js (`v22.x` LTS) TypeScript build (`dist-server/index.js`) managed by `systemd`, bound strictly to `127.0.0.1:4000`.
> - **Private database**: PostgreSQL 15+ bound to loopback (`127.0.0.1`) or private VPC network, never exposed publicly.
> - **Legacy files**: Do **not** delete `api/`, `supabase/`, or `vercel.json` until staging and production cutover are verified and final retirement is explicitly approved.

---

## 1. Repository Build, Runtime & Migration Commands

Verified against `package.json` and `tsconfig.server.json`:
- **Node.js version**: **Node 22 LTS** (verified `v22.23.5`; required for native `process.loadEnvFile` support in `server/config/loadDotEnv.ts` and `NodeNext` ES module execution).
- **Install dependencies**: `npm ci`
- **Build frontend + server**: `npm run build` (runs `vite build` -> `dist/` and `tsc -p tsconfig.server.json` -> `dist-server/`)
- **Typecheck**: `npm run lint` (`tsc --noEmit && tsc -p tsconfig.server.json --noEmit`)
- **Start compiled API**: `npm run start:api` (`node dist-server/index.js`)
- **Schema migrations (custom SQL in `db/migrations/`)**:
  - Offline checksum/order check: `npm run db:migrate:check`
  - Inspect applied/pending migrations: `npm run db:migrate:status`
  - Apply pending migrations: `npm run db:migrate:up`
- **Better Auth tables (`ba_user`, `ba_session`, `ba_account`, `ba_verification`, `ba_rate_limit`)**:
  - Inspect pending auth schema changes: `npm run auth:migrate:status`
  - Print SQL without applying: `npm run auth:migrate:sql`
  - Apply Better Auth schema: `npm run auth:migrate:up`
- **Controlled data migration CLI** (see `db/DATA_MIGRATION_RUNBOOK.md`):
  - `npm run db:data:preflight`, `npm run db:data:export`, `npm run db:data:import`, `npm run db:data:validate`

### Process Topology Note (No Separate Worker Required)
The current backend runs chat/domain SSE brokers (`ChatEventBroker`, `RealtimeEventBroker`), Better Auth, PostgreSQL repositories, Web Push delivery, and Telegram HTTP alerts inside one Express process (`server/index.ts`). **Run exactly 1 API worker process** (`swiftsweeps-api.service`) so in-memory SSE event replay rings stay consistent across connected browsers. Do **not** run PM2 cluster mode or multiple instances without first replacing the in-process SSE brokers with an external pub/sub broker.

---

## 2. Manual Host Provisioning & Firewall Hardening (Human Operator)

1. **Create least-privilege service account and directories**:
   ```bash
   sudo useradd --system --home /var/www/swiftsweeps --shell /usr/sbin/nologin swiftsweeps
   sudo mkdir -p /var/www/swiftsweeps/releases /etc/swiftsweeps /var/backups/swiftsweeps /var/www/certbot
   sudo chown -R swiftsweeps:swiftsweeps /var/www/swiftsweeps
   sudo chmod 0750 /etc/swiftsweeps /var/backups/swiftsweeps
   ```

2. **Configure host firewall (`ufw`)** — expose **only** HTTP/HTTPS and restricted SSH; keep `4000` (API) and `5432` (PostgreSQL) closed externally:
   ```bash
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw deny 4000/tcp
   sudo ufw deny 5432/tcp
   sudo ufw enable
   sudo ufw status verbose
   ```

3. **PostgreSQL network & auth hardening**:
   - Edit `/etc/postgresql/<version>/main/postgresql.conf`:
     ```ini
     listen_addresses = 'localhost'
     port = 5432
     password_encryption = scram-sha-256
     ```
     *(If PostgreSQL runs on a separate private database host, bind `listen_addresses` strictly to the private VPC interface IP, enable `ssl = on`, restrict host firewall port `5432` strictly to the API host's private IP, and set `PG_SSL_MODE=verify-full` in the API environment.)*
   - Edit `/etc/postgresql/<version>/main/pg_hba.conf` so local TCP connections require `scram-sha-256` (no `trust` authentication):
     ```text
     local   all             postgres                                peer
     host    swiftsweeps     swiftsweeps_migrator 127.0.0.1/32       scram-sha-256
     host    swiftsweeps     swiftsweeps_app      127.0.0.1/32       scram-sha-256
     host    swiftsweeps     swiftsweeps_backup   127.0.0.1/32       scram-sha-256
     host    swiftsweeps     swiftsweeps_migrator ::1/128            scram-sha-256
     host    swiftsweeps     swiftsweeps_app      ::1/128            scram-sha-256
     host    swiftsweeps     swiftsweeps_backup   ::1/128            scram-sha-256
     ```
   - Restart PostgreSQL (`sudo systemctl restart postgresql`) and verify `ss -tlnp | grep 5432` shows `127.0.0.1:5432` only.
   - Generate strong random passwords and run a customized copy of `deploy/postgres/setup-roles.sql` as `postgres` (then immediately shred/delete the temporary SQL copy containing passwords).

---

## 3. Manual Secret Creation & Environment File (`/etc/swiftsweeps/api.env`)

Create `/etc/swiftsweeps/api.env` manually on the VPS (outside any repository or webroot directory) using `.env.example` as reference:

```bash
# Generate AUTH_SECRET (minimum 32 chars; 64 hex chars recommended):
openssl rand -hex 32

# Generate Web Push VAPID keys (optional; omit or leave empty if push is disabled):
npx web-push generate-vapid-keys
```

Set strict permissions so only `root` can edit and only the `swiftsweeps` service user can read:
```bash
sudo chown root:swiftsweeps /etc/swiftsweeps/api.env
sudo chmod 0640 /etc/swiftsweeps/api.env
```

Required production guards enforced by `server/config/env.ts` on startup:
- `NODE_ENV=production`
- `HOST=127.0.0.1`, `API_PORT=4000`, `TRUST_PROXY=loopback`
- `APP_ORIGIN=https://<your-verified-domain>` (no wildcard, no trailing path)
- `AUTH_SECRET` >= 32 chars and not a placeholder value
- `DATABASE_URL` pointing to `swiftsweeps_app` (never `postgres` superuser)
- `EMAIL_PROVIDER=brevo` (with `BREVO_API_KEY` + `EMAIL_FROM_ADDRESS`) or `EMAIL_PROVIDER=smtp` (with `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM_ADDRESS`) before enabling email verification/password resets (`AUTH_REQUIRE_EMAIL_VERIFICATION=true`).

> **Migrator Credentials Rule**: Never put `swiftsweeps_migrator` credentials inside `/etc/swiftsweeps/api.env`. During deployments, supply `DATABASE_URL` for `swiftsweeps_migrator` transiently in the operator shell or `/etc/swiftsweeps/migrator.env` (`chmod 0600`, root-only) solely for `db:migrate:*` and `auth:migrate:*`.

---

## 4. Nginx Setup, TLS Certificates & Verification

1. **Provision TLS certificate** using your approved CA (e.g., Certbot / Let's Encrypt):
   - Keep port 80 reachable for `/.well-known/acme-challenge/` before enabling HTTPS, or use DNS-01 verification.
   - Never fabricate or self-sign public production certificates.
2. **Install Nginx configuration**:
   - Copy `deploy/nginx/swiftsweeps.conf` to `/etc/nginx/sites-available/swiftsweeps.conf`.
   - Replace `__DOMAIN_NAME__`, `__APP_DIST_DIR__` (`/var/www/swiftsweeps/current/dist`), `__SSL_CERT_PATH__`, and `__SSL_KEY_PATH__`.
   - Symlink into `/etc/nginx/sites-enabled/swiftsweeps.conf` and remove default unconfigured site if unused.
   - Validate and reload:
     ```bash
     sudo nginx -t
     sudo systemctl reload nginx
     ```
3. **Verify proxy boundaries**:
   - `/api/chat/stream` and `/api/realtime/stream` have `proxy_buffering off` and `proxy_read_timeout 3600s` for SSE heartbeats (sent every `15s`).
   - `/api/chat/attachments` allows `3m` and `/api/storage/upload` allows `5m` (covering Express's `4mb` JSON envelope); all other `/api/` and `/webhooks/` requests enforce `1m`.
   - Public requests to `http://<vps-ip>:4000` must fail/time out; `TRUST_PROXY=loopback` ensures Express trusts `X-Forwarded-*` headers only from loopback Nginx.

---

## 5. Startup, Shutdown, Health Checks & Logs

1. **Install and enable systemd unit**:
   ```bash
   sudo cp /var/www/swiftsweeps/current/deploy/systemd/swiftsweeps-api.service /etc/systemd/system/swiftsweeps-api.service
   sudo systemctl daemon-reload
   sudo systemctl enable swiftsweeps-api
   sudo systemctl start swiftsweeps-api
   ```
2. **Startup & Health Checks**:
   - Process state: `sudo systemctl status swiftsweeps-api`
   - Liveness (loopback only): `curl -fsS http://127.0.0.1:4000/api/healthz` -> `{"status":"ok"}`
   - Readiness / PostgreSQL check (loopback only): `curl -fsS http://127.0.0.1:4000/api/readyz` -> `{"status":"ready"}`
   - Public HTTPS check: `curl -fsS https://<your-domain>/api/readyz` -> `{"status":"ready"}`
3. **Graceful Shutdown**:
   - `sudo systemctl stop swiftsweeps-api` (or `restart`) sends `SIGTERM`.
   - `server/index.ts` immediately marks `/api/readyz` unavailable (`503`), stops accepting new TCP connections, drains active requests within `SHUTDOWN_TIMEOUT_MS` (`10000` ms default), and closes the PG pool cleanly before exiting within systemd's `TimeoutStopSec=15`.
4. **Logs & Retention**:
   - View live JSON logs: `sudo journalctl -u swiftsweeps-api -f`
   - Inspect errors/last 100 lines: `sudo journalctl -u swiftsweeps-api -p warning -n 100 --no-pager`
   - Configure bounded journal retention in `/etc/systemd/journald.conf` (e.g., `SystemMaxUse=1G`, `MaxRetentionSec=30day`) and reload `sudo systemctl restart systemd-journald`.
   - `server/logging/logger.ts` automatically redacts passwords, tokens, authorization headers, PostgreSQL URIs, and Telegram bot token paths.

---

## 6. Backups & Restore Verification

1. **Pre-migration / daily logical backup** (run as `swiftsweeps_backup` or `postgres` via local peer/SCRAM):
   ```bash
   BACKUP_FILE="/var/backups/swiftsweeps/swiftsweeps_$(date -u +%Y%m%dT%H%M%SZ).dump"
   PGPASSFILE=/etc/swiftsweeps/backup.pgpass pg_dump \
     -h 127.0.0.1 -U swiftsweeps_backup -d swiftsweeps \
     --format=custom --no-owner --no-privileges \
     --file="$BACKUP_FILE"
   chmod 0600 "$BACKUP_FILE"
   ```
   - Encrypt backups before shipping off-host (e.g., `age` or `gpg` to off-site object storage) and retain daily/weekly snapshots according to financial compliance requirements.
2. **Mandatory periodic restore verification** (on staging or an isolated verification database—**never overwrite live production**):
   ```bash
   # Create throwaway database and restore backup to confirm readability and schema integrity
   sudo -u postgres createdb -O swiftsweeps_migrator swiftsweeps_restore_verify
   sudo -u postgres pg_restore --dbname=swiftsweeps_restore_verify --no-owner --role=swiftsweeps_migrator "$BACKUP_FILE"
   sudo -u postgres psql -d swiftsweeps_restore_verify -c "SELECT count(*) AS users_count FROM public.users; SELECT count(*) AS wallets_count FROM public.wallets; SELECT count(*) AS tx_count FROM public.transactions;"
   sudo -u postgres dropdb swiftsweeps_restore_verify
   ```

---

## 7. Upgrade & Rollback Procedure

### Atomic Release Upgrade
1. Take a pre-upgrade `pg_dump` backup (Section 6) if any pending migrations exist.
2. Check out/extract the verified release into `/var/www/swiftsweeps/releases/<release_id>` owned by `swiftsweeps:swiftsweeps`.
3. Install dependencies and build as `swiftsweeps`:
   ```bash
   cd /var/www/swiftsweeps/releases/<release_id>
   npm ci
   npm run build
   npm run db:migrate:check
   ```
4. Apply any pending migrations using `swiftsweeps_migrator` credentials:
   ```bash
   npm run db:migrate:status
   npm run db:migrate:up
   npm run auth:migrate:status
   npm run auth:migrate:up
   ```
   *(If migrations created new tables/sequences, re-verify runtime grants to `swiftsweeps_app`.)*
5. Atomically update `/var/www/swiftsweeps/current` symlink, restart API, and reload Nginx:
   ```bash
   sudo -u swiftsweeps ln -sfn /var/www/swiftsweeps/releases/<release_id> /var/www/swiftsweeps/current
   sudo systemctl restart swiftsweeps-api
   sudo nginx -t && sudo systemctl reload nginx
   ```
6. Verify `curl -fsS http://127.0.0.1:4000/api/readyz` and `journalctl -u swiftsweeps-api -n 30`.

### Rollback Procedure
- **Application-only rollback (no irreversible schema changes)**:
  1. Repoint `/var/www/swiftsweeps/current` to `/var/www/swiftsweeps/releases/<previous_release_id>`.
  2. `sudo systemctl restart swiftsweeps-api && sudo systemctl reload nginx`.
  3. Confirm `/api/readyz` returns `200` and review `journalctl`.
- **Schema/data rollback**: Forward SQL migrations in `db/migrations/` are additive and do not auto-generate down-migrations. If a release included breaking DDL or corrupted financial writes, stop `swiftsweeps-api`, restore the pre-upgrade `pg_dump` into a clean database after human approval, repoint the release symlink, and restart `swiftsweeps-api`.

---

## 8. Staging Deployment Checklist

- [ ] Provision isolated staging VPS/VM with Node `v22.x` LTS, PostgreSQL 15+, Nginx, UFW (`5432` and `4000` denied externally).
- [ ] Run customized `deploy/postgres/setup-roles.sql` on staging Postgres (`swiftsweeps_migrator`, `swiftsweeps_app`, `swiftsweeps_backup`).
- [ ] Create `/etc/swiftsweeps/api.env` (`0640`, `root:swiftsweeps`) with `NODE_ENV=production` (or `development` for non-TLS local testing; prefer HTTPS `production` on staging domain), staging `APP_ORIGIN`, unique `AUTH_SECRET`, staging DB URI, and sandbox email credentials.
- [ ] Build release (`npm ci && npm run build`) and verify `npm run db:migrate:check`.
- [ ] Run `npm run db:migrate:up` and `npm run auth:migrate:up` using `swiftsweeps_migrator`.
- [ ] If testing legacy Supabase import, execute staging dry-run per `db/DATA_MIGRATION_RUNBOOK.md` (`db:data:preflight` -> `export` -> `import` -> `validate`, keeping `MIGRATION_ALLOW_PRODUCTION_TARGET=false`).
- [ ] Install `deploy/nginx/swiftsweeps.conf` with staging domain + TLS cert; verify `sudo nginx -t && sudo systemctl reload nginx`.
- [ ] Install and start `deploy/systemd/swiftsweeps-api.service`; confirm `http://127.0.0.1:4000/api/readyz` and `https://<staging-domain>/api/readyz`.
- [ ] Smoke test over HTTPS: signup + OTP verification, sign-in (`HttpOnly; Secure; SameSite=Lax` cookie), wrong-owner 403, deposit/withdrawal submission + admin approval, SSE `/api/chat/stream` + `/api/realtime/stream` reconnect, `pg_dump` + restore verification.

---

## 9. Production Deployment Checklist

- [ ] Confirm Staging Checklist passed with zero unresolved critical/high defects.
- [ ] Confirm production backups and off-host encrypted storage are operational; run a restore verification test on a non-production database.
- [ ] Provision separate production PostgreSQL credentials (`swiftsweeps_migrator`, `swiftsweeps_app`, `swiftsweeps_backup`) — **never reuse staging secrets or `AUTH_SECRET`**.
- [ ] Verify firewall rules (`ufw status verbose`): ports `5432` and `4000` unreachable from outside; PostgreSQL listening only on `localhost`/private IP.
- [ ] Create `/etc/swiftsweeps/api.env` (`chmod 0640`, `root:swiftsweeps`) with production `APP_ORIGIN=https://<prod-domain>`, fresh `AUTH_SECRET`, `EMAIL_PROVIDER=brevo|smtp` production credentials, and `LOG_LEVEL=info`.
- [ ] Build release (`npm ci && npm run build`), run `npm run db:migrate:check`, `npm run db:migrate:status`, `npm run db:migrate:up`, `npm run auth:migrate:status`, and `npm run auth:migrate:up` as `swiftsweeps_migrator`.
- [ ] Execute approved production data migration window (if cutting over from Supabase) per `db/DATA_MIGRATION_RUNBOOK.md`, followed by `db:data:validate` and financial ledger/wallet reconciliation checks.
- [ ] Deploy Nginx production vhost with valid TLS certs (`sudo nginx -t && sudo systemctl reload nginx`) and enable/start `swiftsweeps-api.service`.
- [ ] Verify `/api/healthz`, `/api/readyz`, clean `journalctl -u swiftsweeps-api`, cookie `Secure` flag over HTTPS, SSE streaming, email OTP/password-reset delivery, and one end-to-end smoke check.
- [ ] Keep legacy Vercel/Supabase files (`api/`, `supabase/`, `vercel.json`) intact until post-cutover observation completes and explicit retirement is approved.
