import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { memoryAdapter } from 'better-auth/adapters/memory';
import express from 'express';
import { createApiApp } from '../app.js';
import type {
  EmailDeliveryAdapter,
  SendOtpEmailPayload,
  SendPasswordResetEmailPayload,
  SendVerificationEmailPayload,
} from '../auth/emailDelivery.js';
import { parseSseEventCursor } from '../chat/chatEvents.js';
import type { ServerConfig } from '../config/env.js';
import type { DatabaseClient, DatabasePool } from '../db/pool.js';
import { createLogger } from '../logging/logger.js';
import {
  canUserReceiveRealtimeEvent,
  RealtimeEventBroker,
} from '../realtime/realtimeEvents.js';
import { createRealtimeRouter } from '../routes/realtime.js';

interface InMemoryUserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  phone: string | null;
  avatar_url: string | null;
  status: string;
  email_verified: boolean;
  referral_code: string | null;
  referred_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface InMemoryAuthLinkRow {
  app_user_id: string;
  auth_user_id: string | null;
  legacy_supabase_uid: string | null;
  email_normalized: string;
  migration_source: string;
  password_reset_required: boolean;
  linked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface InMemoryWalletRow {
  customer_id: string;
  balance: string;
  referral_bonus_balance: string;
  free_play_balance: string;
  pending_withdrawal: string;
  pending_deposit: string;
  total_deposited: string;
  total_withdrawn: string;
  currency: string;
  updated_at: Date;
}

interface InMemoryTransactionRow {
  id: string;
  customer_id: string;
  amount: string;
  type: string;
  status: string;
  description: string;
  reference_id: string | null;
  game_name: string | null;
  created_at: Date;
}

interface InMemoryTopUpRow {
  id: string;
  customer_id: string;
  customer_name: string;
  amount: string;
  currency: string;
  bonus_amount: string;
  bonus_percentage: string;
  fee_amount: string;
  final_wallet_credit: string;
  payment_method_id: string;
  payment_method_name: string;
  status: string;
  proof_url: string | null;
  receipt_name: string | null;
  target_game_name: string | null;
  target_game_account_id: string | null;
  target_game_username: string | null;
  funding_source: string;
  provider_ref: string | null;
  customer_notes: string | null;
  metadata: Record<string, unknown>;
  reviewer_id: string | null;
  reviewer_name: string | null;
  review_notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface InMemoryAppConfigRow {
  id: string;
  data: Record<string, unknown>;
  updated_at: Date;
}

interface InMemoryAuditLogRow {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string | null;
  timestamp: Date;
}

class InMemoryRealtimeDatabase
  implements Pick<DatabasePool, 'query' | 'connect'>
{
  public readonly users = new Map<string, InMemoryUserRow>();
  public readonly authLinks = new Map<string, InMemoryAuthLinkRow>();
  public wallets = new Map<string, InMemoryWalletRow>();
  public transactions = new Map<string, InMemoryTransactionRow>();
  public topups = new Map<string, InMemoryTopUpRow>();
  public auditLogs: InMemoryAuditLogRow[] = [];
  public appConfigRow: InMemoryAppConfigRow | null = null;
  public failNextDepositQuery = false;

  private txSnapshot: {
    wallets: Map<string, InMemoryWalletRow>;
    transactions: Map<string, InMemoryTransactionRow>;
    topups: Map<string, InMemoryTopUpRow>;
    auditLogs: InMemoryAuditLogRow[];
    appConfigRow: InMemoryAppConfigRow | null;
  } | null = null;

  public async connect(): Promise<DatabaseClient> {
    return {
      query: async (sql: string, values?: unknown[]) => {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        if (normalized === 'BEGIN') {
          this.txSnapshot = {
            wallets: new Map(
              Array.from(this.wallets.entries()).map(([k, v]) => [k, { ...v }]),
            ),
            transactions: new Map(
              Array.from(this.transactions.entries()).map(([k, v]) => [k, { ...v }]),
            ),
            topups: new Map(
              Array.from(this.topups.entries()).map(([k, v]) => [
                k,
                {
                  ...v,
                  metadata: v.metadata
                    ? (JSON.parse(JSON.stringify(v.metadata)) as Record<string, unknown>)
                    : {},
                },
              ]),
            ),
            auditLogs: [...this.auditLogs],
            appConfigRow: this.appConfigRow
              ? {
                  id: this.appConfigRow.id,
                  data: structuredClone(this.appConfigRow.data),
                  updated_at: new Date(this.appConfigRow.updated_at.getTime()),
                }
              : null,
          };
          return { rows: [], rowCount: 0 };
        }
        if (normalized === 'COMMIT') {
          this.txSnapshot = null;
          return { rows: [], rowCount: 0 };
        }
        if (normalized === 'ROLLBACK') {
          if (this.txSnapshot) {
            this.wallets = this.txSnapshot.wallets;
            this.transactions = this.txSnapshot.transactions;
            this.topups = this.txSnapshot.topups;
            this.auditLogs = this.txSnapshot.auditLogs;
            this.appConfigRow = this.txSnapshot.appConfigRow;
            this.txSnapshot = null;
          }
          return { rows: [], rowCount: 0 };
        }
        return this.query(sql, values);
      },
      release: () => {
        this.txSnapshot = null;
      },
    };
  }

  public async query(
    sql: string,
    values: unknown[] = [],
  ): Promise<{ rows: unknown[]; rowCount?: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized === 'SELECT 1 AS ok') {
      return { rows: [{ ok: 1 }] };
    }

    if (
      normalized.includes('FROM public.auth_user_links l INNER JOIN public.users u') &&
      normalized.includes('WHERE l.auth_user_id = $1')
    ) {
      const authUserId = String(values[0] ?? '');
      for (const link of this.authLinks.values()) {
        if (link.auth_user_id === authUserId) {
          const user = this.users.get(link.app_user_id);
          if (user) return { rows: [this.toJoinedRow(user, link)] };
        }
      }
      return { rows: [] };
    }

    if (
      normalized.includes('FROM public.users u LEFT JOIN public.auth_user_links l') &&
      normalized.includes('WHERE u.id = $1')
    ) {
      const appUserId = String(values[0] ?? '');
      const user = this.users.get(appUserId);
      return user ? { rows: [this.toJoinedRow(user, this.authLinks.get(appUserId))] } : { rows: [] };
    }

    if (
      normalized.includes('FROM public.users u LEFT JOIN public.auth_user_links l') &&
      normalized.includes('WHERE lower(u.email) = $1')
    ) {
      const cleanEmail = String(values[0] ?? '').toLowerCase();
      for (const user of this.users.values()) {
        if (user.email.toLowerCase() === cleanEmail) {
          return { rows: [this.toJoinedRow(user, this.authLinks.get(user.id))] };
        }
      }
      return { rows: [] };
    }

    if (normalized.startsWith('INSERT INTO public.users')) {
      const [id, email, displayName, emailVerified, referralCode] = values as [
        string,
        string,
        string,
        boolean,
        string,
      ];
      if (!this.users.has(id)) {
        const now = new Date();
        this.users.set(id, {
          id,
          email,
          display_name: displayName,
          role: 'customer',
          phone: null,
          avatar_url: null,
          status: 'active',
          email_verified: emailVerified,
          referral_code: referralCode,
          referred_by: null,
          created_at: now,
          updated_at: now,
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith('INSERT INTO public.auth_user_links')) {
      const appUserId = String(values[0]);
      const authUserId = String(values[1]);
      const emailNormalized = String(values[2]);
      const now = new Date();
      this.authLinks.set(appUserId, {
        app_user_id: appUserId,
        auth_user_id: authUserId,
        legacy_supabase_uid: null,
        email_normalized: emailNormalized,
        migration_source: 'self_hosted_signup',
        password_reset_required: false,
        linked_at: now,
        created_at: now,
        updated_at: now,
      });
      return { rows: [], rowCount: 1 };
    }

    if (
      this.failNextDepositQuery &&
      (normalized.includes('public.topups') ||
        normalized.includes('public.wallets') ||
        normalized.includes('public.transactions'))
    ) {
      this.failNextDepositQuery = false;
      throw new Error('simulated_pg_deposit_failure');
    }

    if (
      normalized.startsWith(
        "SELECT data, updated_at FROM public.app_config WHERE id = 'main'",
      ) ||
      normalized.startsWith(
        "SELECT data FROM public.app_config WHERE id = 'main'",
      )
    ) {
      if (!this.appConfigRow) return { rows: [] };
      return {
        rows: [
          {
            data: structuredClone(this.appConfigRow.data),
            updated_at: new Date(this.appConfigRow.updated_at.getTime()),
          },
        ],
      };
    }

    if (normalized.startsWith('INSERT INTO public.app_config')) {
      const [rawJson, updatedAtRaw] = values as [string, string];
      const parsed = JSON.parse(rawJson) as Record<string, unknown>;
      const updatedAt = new Date(updatedAtRaw);
      this.appConfigRow = {
        id: 'main',
        data: parsed,
        updated_at: updatedAt,
      };
      return {
        rows: [
          {
            data: structuredClone(parsed),
            updated_at: updatedAt,
          },
        ],
        rowCount: 1,
      };
    }

    if (normalized.startsWith('INSERT INTO public.audit_logs')) {
      if (normalized.includes("'settings'")) {
        const [
          id,
          actorId,
          actorName,
          actorRole,
          action,
          entityId,
          details,
          ts,
        ] = values as [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ];
        this.auditLogs.push({
          id,
          actor_id: actorId,
          actor_name: actorName,
          actor_role: actorRole,
          action,
          entity_type: 'settings',
          entity_id: entityId,
          details,
          timestamp: new Date(ts),
        });
      } else {
        const [id, actorId, actorName, actorRole, action, entityType, entityId, details, ts] =
          values as [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string | null,
            string,
          ];
        this.auditLogs.push({
          id,
          actor_id: actorId,
          actor_name: actorName,
          actor_role: actorRole,
          action,
          entity_type: entityType,
          entity_id: entityId,
          details,
          timestamp: ts ? new Date(ts) : new Date(),
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (
      normalized.startsWith('INSERT INTO public.wallets') &&
      normalized.includes('ON CONFLICT (customer_id) DO NOTHING')
    ) {
      const customerId = String(values[0] ?? '');
      if (!this.wallets.has(customerId)) {
        this.wallets.set(customerId, {
          customer_id: customerId,
          balance: '0.00',
          referral_bonus_balance: '0.00',
          free_play_balance: '0.00',
          pending_withdrawal: '0.00',
          pending_deposit: '0.00',
          total_deposited: '0.00',
          total_withdrawn: '0.00',
          currency: 'USD',
          updated_at: new Date(),
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (
      normalized.startsWith('SELECT customer_id, balance, referral_bonus_balance') &&
      normalized.includes('FROM public.wallets WHERE customer_id = $1 FOR UPDATE')
    ) {
      const customerId = String(values[0] ?? '');
      const row = this.wallets.get(customerId);
      return { rows: row ? [{ ...row }] : [] };
    }

    if (normalized.startsWith('UPDATE public.wallets SET pending_deposit = $2, updated_at = $3')) {
      const [customerId, pendingDeposit, updatedAt] = values as [string, string, string];
      const w = this.wallets.get(customerId);
      if (!w) return { rows: [] };
      w.pending_deposit = Number(pendingDeposit).toFixed(2);
      w.updated_at = new Date(updatedAt);
      return { rows: [{ ...w }], rowCount: 1 };
    }

    if (normalized.startsWith('INSERT INTO public.transactions')) {
      const [id, customerId, amount, type, status, description, referenceId, gameName, createdAt] =
        values as [
          string,
          string,
          string,
          string,
          string,
          string,
          string | null,
          string | null,
          string,
        ];
      if (!this.transactions.has(id)) {
        this.transactions.set(id, {
          id,
          customer_id: customerId,
          amount: Number(amount).toFixed(2),
          type,
          status,
          description,
          reference_id: referenceId,
          game_name: gameName,
          created_at: new Date(createdAt),
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith('INSERT INTO public.topups')) {
      const [
        id,
        customerId,
        customerName,
        amount,
        currency,
        bonusAmount,
        bonusPercentage,
        feeAmount,
        finalWalletCredit,
        paymentMethodId,
        paymentMethodName,
        status,
        proofUrl,
        receiptName,
        targetGameName,
        targetGameCatalogId,
        targetGameUsername,
        providerRef,
        customerNotes,
        metadataJson,
        ts,
      ] = values as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string,
        string,
      ];
      const row: InMemoryTopUpRow = {
        id,
        customer_id: customerId,
        customer_name: customerName,
        amount: Number(amount).toFixed(2),
        currency,
        bonus_amount: Number(bonusAmount).toFixed(2),
        bonus_percentage: Number(bonusPercentage).toFixed(2),
        fee_amount: Number(feeAmount).toFixed(2),
        final_wallet_credit: Number(finalWalletCredit).toFixed(2),
        payment_method_id: paymentMethodId,
        payment_method_name: paymentMethodName,
        status,
        proof_url: proofUrl,
        receipt_name: receiptName,
        target_game_name: targetGameName,
        target_game_account_id: targetGameCatalogId,
        target_game_username: targetGameUsername,
        funding_source: 'payment_method',
        provider_ref: providerRef,
        customer_notes: customerNotes,
        metadata: JSON.parse(metadataJson) as Record<string, unknown>,
        reviewer_id: null,
        reviewer_name: null,
        review_notes: null,
        created_at: new Date(ts),
        updated_at: new Date(ts),
      };
      this.topups.set(id, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    return { rows: [] };
  }

  private toJoinedRow(user: InMemoryUserRow, link?: InMemoryAuthLinkRow) {
    return {
      app_user_id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      phone: user.phone,
      avatar_url: user.avatar_url,
      status: user.status,
      email_verified: user.email_verified,
      referral_code: user.referral_code,
      referred_by: user.referred_by,
      created_at: user.created_at,
      updated_at: user.updated_at,
      auth_user_id: link?.auth_user_id ?? null,
      password_reset_required: link?.password_reset_required ?? false,
    };
  }
}

class RecordingEmailDelivery implements EmailDeliveryAdapter {
  public readonly providerName = 'test-capture';
  public isConfigured(): boolean {
    return true;
  }
  public async sendVerificationEmail(_payload: SendVerificationEmailPayload) {}
  public async sendOtpEmail(_payload: SendOtpEmailPayload) {}
  public async sendPasswordResetEmail(_payload: SendPasswordResetEmailPayload) {}
}

function createTestConfig(): ServerConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 4000,
    appOrigin: 'http://localhost:3000',
    trustedOrigins: ['http://localhost:3000'],
    trustProxy: 'loopback',
    databaseUrl: 'postgresql://app:pass@127.0.0.1:5432/swiftsweeps_test',
    pgPoolMax: 5,
    pgPoolMin: 0,
    pgIdleTimeoutMs: 30_000,
    pgConnectionTimeoutMs: 5_000,
    pgStatementTimeoutMs: 15_000,
    pgSslMode: 'disable',
    requestBodyLimit: '1mb',
    requestBodyLimitBytes: 1024 * 1024,
    logLevel: 'error',
    shutdownTimeoutMs: 5_000,
    authSecret: 'test-only-auth-secret-with-more-than-32-chars',
    authCookiePrefix: 'swiftsweeps_auth',
    authSessionExpiresInSec: 604_800,
    authSessionUpdateAgeSec: 86_400,
    authSessionFreshAgeSec: 900,
    authRequireEmailVerification: false,
    authRateLimitEnabled: false,
    authRateLimitWindowSec: 60,
    authRateLimitMax: 30,
    emailProvider: 'disabled',
    smtpPort: 587,
    smtpSecure: false,
    emailFromName: 'SwiftSweeps',
    vapidSubject: 'mailto:support@swiftsweeps.com',
  };
}

class TestSessionCookieJar {
  private readonly cookies = new Map<string, string>();

  public capture(setCookieHeaders: string | string[] | undefined): void {
    if (!setCookieHeaders) return;
    const list = Array.isArray(setCookieHeaders)
      ? setCookieHeaders
      : [setCookieHeaders];
    for (const raw of list) {
      const pair = raw.split(';', 1)[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const val = pair.slice(eq + 1).trim();
      if (val) this.cookies.set(name, val);
      else this.cookies.delete(name);
    }
  }

  public header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

async function httpRequest(
  baseUrl: string,
  method: string,
  path: string,
  options?: {
    body?: unknown;
    jar?: TestSessionCookieJar;
  },
): Promise<{
  status: number;
  json: any;
  headers: http.IncomingHttpHeaders;
}> {
  const url = new URL(path, baseUrl);
  const bodyStr =
    options?.body !== undefined ? JSON.stringify(options.body) : undefined;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (bodyStr !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = String(Buffer.byteLength(bodyStr));
  }
  const cookieHeader = options?.jar?.header();
  if (cookieHeader) headers.Cookie = cookieHeader;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers.Origin = 'http://localhost:3000';
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => {
          options?.jar?.capture(res.headers['set-cookie']);
          const text = Buffer.concat(chunks).toString('utf8');
          let json: any = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          resolve({
            status: res.statusCode || 0,
            json,
            headers: res.headers,
          });
        });
      },
    );
    req.on('error', reject);
    if (bodyStr !== undefined) req.write(bodyStr);
    req.end();
  });
}

interface ParsedSseEvent {
  id?: string;
  event: string;
  data: any;
}

async function openRealtimeStream(
  baseUrl: string,
  jar?: TestSessionCookieJar,
  options?: {
    path?: string;
    lastEventIdHeader?: string;
    queryLastEventId?: string;
  },
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  events: ParsedSseEvent[];
  retryMs: number | null;
  close: () => void;
}> {
  const basePath = options?.path ?? '/api/realtime/stream';
  const url = new URL(basePath, baseUrl);
  if (options?.queryLastEventId) {
    url.searchParams.set('lastEventId', options.queryLastEventId);
  }
  const events: ParsedSseEvent[] = [];
  let retryMs: number | null = null;

  return new Promise((resolve, reject) => {
    let buffer = '';
    const reqHeaders: Record<string, string> = {
      Accept: 'text/event-stream',
    };
    const cookie = jar?.header();
    if (cookie) reqHeaders.Cookie = cookie;
    if (options?.lastEventIdHeader) {
      reqHeaders['Last-Event-ID'] = options.lastEventIdHeader;
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: reqHeaders,
      },
      (res) => {
        let settled = false;
        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          let sepIdx: number;
          while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            if (!block.trim() || block.startsWith(':')) continue;
            let eventName = 'message';
            let eventId: string | undefined;
            const dataLines: string[] = [];
            for (const line of block.split('\n')) {
              if (line.startsWith('retry:')) {
                const parsedRetry = Number.parseInt(line.slice(6).trim(), 10);
                if (Number.isFinite(parsedRetry)) retryMs = parsedRetry;
              } else if (line.startsWith('id:')) {
                eventId = line.slice(3).trim();
              } else if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim());
              }
            }
            if (dataLines.length > 0) {
              const rawData = dataLines.join('\n');
              try {
                events.push({
                  ...(eventId ? { id: eventId } : {}),
                  event: eventName,
                  data: JSON.parse(rawData),
                });
              } catch {
                events.push({
                  ...(eventId ? { id: eventId } : {}),
                  event: eventName,
                  data: rawData,
                });
              }
            }
            if (!settled && events.some((e) => e.event === 'ready')) {
              settled = true;
              resolve({
                status: res.statusCode || 0,
                headers: res.headers,
                events,
                retryMs,
                close: () => {
                  res.destroy();
                  req.destroy();
                },
              });
            }
          }
        });
        res.on('error', (err) => {
          if (!settled) reject(err);
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function createTestServer() {
  const db = new InMemoryRealtimeDatabase();
  const authMemoryStore = {
    ba_user: [],
    ba_session: [],
    ba_account: [],
    ba_verification: [],
    ba_rate_limit: [],
  };
  const logger = createLogger({
    level: 'error',
    writeStdout: () => {},
    writeStderr: () => {},
  });
  let capturedBroker: RealtimeEventBroker | null = null;
  const app = createApiApp({
    config: createTestConfig(),
    logger,
    pool: db,
    authDatabaseOverride: memoryAdapter(authMemoryStore),
    emailDeliveryOverride: new RecordingEmailDelivery(),
    extraRoutes: (expressApp, deps) => {
      capturedBroker = deps.realtimeEvents;
      expressApp.post('/api/test/emit-audit', deps.requireAuth, (req, res) => {
        const actor = req.authContext!.user;
        if (actor.role !== 'admin') {
          res.status(403).json({ error: 'admin_only' });
          return;
        }
        const meta = deps.realtimeEvents.emitAuditLog({
          id: `aud_test_${Date.now()}`,
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
          action: 'TEST_AUDIT_EVENT',
          entityType: 'system',
          entityId: 'test_1',
          details: 'Admin audit verification event',
          timestamp: new Date().toISOString(),
        });
        res.status(200).json({ ok: true, meta });
      });
    },
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    db,
    baseUrl,
    broker: capturedBroker!,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections?.();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function signupAndSignIn(
  baseUrl: string,
  db: InMemoryRealtimeDatabase,
  params: {
    email: string;
    name: string;
    role: 'customer' | 'agent' | 'admin';
    status?: string;
  },
): Promise<{ appUserId: string; jar: TestSessionCookieJar }> {
  const jar = new TestSessionCookieJar();
  const signUp = await httpRequest(baseUrl, 'POST', '/api/auth/sign-up/email', {
    jar,
    body: {
      email: params.email,
      password: 'StrongPassword#2026!',
      name: params.name,
    },
  });
  assert.equal(signUp.status, 200);

  const signIn = await httpRequest(baseUrl, 'POST', '/api/auth/sign-in/email', {
    jar,
    body: {
      email: params.email,
      password: 'StrongPassword#2026!',
    },
  });
  assert.equal(signIn.status, 200);

  let appUserId = '';
  for (const user of db.users.values()) {
    if (user.email.toLowerCase() === params.email.toLowerCase()) {
      user.role = params.role;
      if (params.status) user.status = params.status;
      appUserId = user.id;
      break;
    }
  }
  assert.ok(appUserId);
  return { appUserId, jar };
}

test('canUserReceiveRealtimeEvent enforces strict role and customer ownership isolation', () => {
  const admin = { appUserId: 'usr_admin', role: 'admin' as const };
  const agent = { appUserId: 'usr_agent', role: 'agent' as const };
  const custA = { appUserId: 'usr_a', role: 'customer' as const };
  const custB = { appUserId: 'usr_b', role: 'customer' as const };

  assert.equal(canUserReceiveRealtimeEvent({ scope: 'admin' }, admin), true);
  assert.equal(canUserReceiveRealtimeEvent({ scope: 'admin' }, agent), false);
  assert.equal(canUserReceiveRealtimeEvent({ scope: 'admin' }, custA), false);

  assert.equal(canUserReceiveRealtimeEvent({ scope: 'staff' }, admin), true);
  assert.equal(canUserReceiveRealtimeEvent({ scope: 'staff' }, agent), true);
  assert.equal(canUserReceiveRealtimeEvent({ scope: 'staff' }, custA), false);

  assert.equal(
    canUserReceiveRealtimeEvent({ scope: 'user', customerId: 'usr_a' }, custA),
    true,
  );
  assert.equal(
    canUserReceiveRealtimeEvent({ scope: 'user', customerId: 'usr_a' }, custB),
    false,
  );
  assert.equal(
    canUserReceiveRealtimeEvent({ scope: 'user', customerId: 'usr_a' }, admin),
    false,
  );

  assert.equal(
    canUserReceiveRealtimeEvent(
      { scope: 'user_and_staff', customerId: 'usr_a' },
      custA,
    ),
    true,
  );
  assert.equal(
    canUserReceiveRealtimeEvent(
      { scope: 'user_and_staff', customerId: 'usr_a' },
      custB,
    ),
    false,
  );
  assert.equal(
    canUserReceiveRealtimeEvent(
      { scope: 'user_and_staff', customerId: 'usr_a' },
      agent,
    ),
    true,
  );
  assert.equal(
    canUserReceiveRealtimeEvent(
      { scope: 'user_and_staff', customerId: 'usr_a' },
      admin,
    ),
    true,
  );

  assert.equal(canUserReceiveRealtimeEvent({ scope: 'authenticated' }, custA), true);
  assert.equal(canUserReceiveRealtimeEvent({ scope: 'authenticated' }, null), false);
  assert.equal(
    canUserReceiveRealtimeEvent({ scope: 'authenticated' }, { appUserId: '', role: 'customer' }),
    false,
  );
});

test('RealtimeEventBroker manages cursors, bounded replay, buffer eviction, and subscriber errors', () => {
  assert.deepEqual(parseSseEventCursor('re_abcd1234:42'), {
    epoch: 're_abcd1234',
    seq: 42,
  });
  assert.equal(parseSseEventCursor('invalid_cursor'), null);
  assert.equal(parseSseEventCursor('re_abcd1234:-1'), null);

  const broker = new RealtimeEventBroker({ maxHistory: 3, epoch: 're_test01' });
  assert.equal(broker.latestEventId, 're_test01:0');

  const received: string[] = [];
  const unsubThrowing = broker.subscribe(() => {
    throw new Error('broken_listener');
  });
  const unsubGood = broker.subscribe((env) => {
    received.push(env.eventId);
  });

  const m1 = broker.emitDomainInvalidation({ scope: 'authenticated' }, ['app_config']);
  const m2 = broker.emitDomainInvalidation({ scope: 'staff' }, ['users']);
  assert.deepEqual(received, [m1.eventId, m2.eventId]);
  assert.equal(broker.getReplaySince(undefined).status, 'none');

  const replaySince1 = broker.getReplaySince(m1.eventId);
  assert.equal(replaySince1.status, 'replay');
  if (replaySince1.status === 'replay') {
    assert.deepEqual(
      replaySince1.events.map((e) => e.eventId),
      [m2.eventId],
    );
  }

  // Emit 3 more events so seq=1 is evicted from maxHistory=3 ([3,4,5])
  broker.emitDomainInvalidation({ scope: 'authenticated' }, ['game_catalog']);
  broker.emitDomainInvalidation({ scope: 'authenticated' }, ['faked_cashouts']);
  const m5 = broker.emitDomainInvalidation({ scope: 'authenticated' }, ['official_partners']);

  const evictedReplay = broker.getReplaySince(m1.eventId);
  assert.deepEqual(evictedReplay, {
    status: 'resync_required',
    reason: 'buffer_evicted',
  });

  assert.deepEqual(broker.getReplaySince('re_other:1'), {
    status: 'resync_required',
    reason: 'epoch_mismatch',
  });
  assert.deepEqual(broker.getReplaySince('re_test01:999'), {
    status: 'resync_required',
    reason: 'future_cursor',
  });
  assert.deepEqual(broker.getReplaySince('malformed'), {
    status: 'resync_required',
    reason: 'invalid_cursor',
  });

  const exactHead = broker.getReplaySince(m5.eventId);
  assert.deepEqual(exactHead, { status: 'replay', events: [] });

  unsubThrowing();
  unsubGood();
  assert.equal(broker.subscriberCount, 0);
});

test('GET /api/realtime/stream rejects anonymous and suspended users fail-closed', async () => {
  const srv = await createTestServer();
  try {
    const anonRes = await httpRequest(srv.baseUrl, 'GET', '/api/realtime/stream');
    assert.equal(anonRes.status, 401);

    const suspended = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'rt-suspended@example.com',
      name: 'Suspended User',
      role: 'customer',
      status: 'suspended',
    });
    const suspendedRes = await httpRequest(srv.baseUrl, 'GET', '/api/realtime/stream', {
      jar: suspended.jar,
    });
    assert.equal(suspendedRes.status, 403);
  } finally {
    await srv.close();
  }
});

test('SSE /api/realtime/stream enforces scoping, emits metadata-only invalidations after commit, and skips failed writes', async () => {
  const srv = await createTestServer();
  try {
    const custA = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'rt-cust-a@example.com',
      name: 'Customer A',
      role: 'customer',
    });
    const custB = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'rt-cust-b@example.com',
      name: 'Customer B',
      role: 'customer',
    });
    const agent = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'rt-agent@example.com',
      name: 'Support Agent',
      role: 'agent',
    });
    const admin = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'rt-admin@example.com',
      name: 'Master Admin',
      role: 'admin',
    });

    const streamA = await openRealtimeStream(srv.baseUrl, custA.jar);
    const streamB = await openRealtimeStream(srv.baseUrl, custB.jar);
    const streamAgent = await openRealtimeStream(srv.baseUrl, agent.jar);
    const streamAdmin = await openRealtimeStream(srv.baseUrl, admin.jar);

    try {
      assert.equal(streamA.status, 200);
      assert.equal(streamA.retryMs, 3000);
      assert.equal(
        streamA.headers['content-type'],
        'text/event-stream; charset=utf-8',
      );
      assert.equal(streamA.headers['cache-control'], 'no-cache, no-transform');
      assert.equal(streamA.headers['x-accel-buffering'], 'no');

      // 1. Failed validation and simulated DB rollback MUST NOT emit realtime events
      const badDeposit = await httpRequest(srv.baseUrl, 'POST', '/api/deposits', {
        jar: custA.jar,
        body: { amount: -10 },
      });
      assert.equal(badDeposit.status, 400);

      srv.db.failNextDepositQuery = true;
      const failedDbDeposit = await httpRequest(srv.baseUrl, 'POST', '/api/deposits', {
        jar: custA.jar,
        body: {
          amount: 50,
          method: 'chime',
          receiptUrl: 'https://example.com/receipt.png',
        },
      });
      assert.equal(failedDbDeposit.status, 500);

      await new Promise((r) => setTimeout(r, 60));
      assert.equal(
        streamA.events.filter((e) => e.event !== 'ready').length,
        0,
      );
      assert.equal(
        streamAdmin.events.filter((e) => e.event !== 'ready').length,
        0,
      );

      // 2. Customer A submits valid deposit -> A, Agent, Admin get domain_invalidation; B gets NOTHING
      const okDeposit = await httpRequest(srv.baseUrl, 'POST', '/api/deposits', {
        jar: custA.jar,
        body: {
          amount: 75,
          method: 'chime',
          receiptUrl: 'https://example.com/receipt-ok.png',
        },
      });
      assert.equal(okDeposit.status, 201);

      // 3. Admin-only audit_log event -> ONLY Admin gets audit_log; Agent, A, B get NOTHING
      const auditEmit = await httpRequest(srv.baseUrl, 'POST', '/api/test/emit-audit', {
        jar: admin.jar,
        body: {},
      });
      assert.equal(auditEmit.status, 200);

      // 4. Global CMS policy update -> All authenticated roles receive app_config invalidation
      const policyUpdate = await httpRequest(
        srv.baseUrl,
        'PATCH',
        '/api/admin/app-config/policies',
        {
          jar: admin.jar,
          body: { termsPolicyHtml: '<p>Updated platform terms</p>' },
        },
      );
      assert.equal(policyUpdate.status, 200);

      await new Promise((r) => setTimeout(r, 80));

      const aDomainEvents = streamA.events.filter(
        (e) => e.event === 'domain_invalidation',
      );
      const bDomainEvents = streamB.events.filter(
        (e) => e.event === 'domain_invalidation',
      );
      const agentDomainEvents = streamAgent.events.filter(
        (e) => e.event === 'domain_invalidation',
      );

      assert.equal(aDomainEvents.length, 2);
      assert.deepEqual(aDomainEvents[0].data.tables, [
        'topups',
        'wallets',
        'audit_logs',
      ]);
      // Metadata-only invalidation: never carry balances or ledger amounts in SSE
      assert.equal('availableBalance' in aDomainEvents[0].data, false);
      assert.equal('amount' in aDomainEvents[0].data, false);

      // Customer B did NOT receive Customer A's deposit invalidation, only global app_config
      assert.equal(bDomainEvents.length, 1);
      assert.deepEqual(bDomainEvents[0].data.tables, ['app_config', 'audit_logs']);

      // Staff received both A's deposit invalidation and global app_config
      assert.equal(agentDomainEvents.length, 2);

      // Admin audit_log event strictly admin-only
      assert.equal(
        streamAdmin.events.filter((e) => e.event === 'audit_log').length,
        1,
      );
      assert.equal(
        streamAgent.events.filter((e) => e.event === 'audit_log').length,
        0,
      );
      assert.equal(
        streamA.events.filter((e) => e.event === 'audit_log').length,
        0,
      );
      assert.equal(
        streamB.events.filter((e) => e.event === 'audit_log').length,
        0,
      );
    } finally {
      streamA.close();
      streamB.close();
      streamAgent.close();
      streamAdmin.close();
    }
  } finally {
    await srv.close();
  }
});

test('SSE /api/realtime/stream supports authorized Last-Event-ID replay and emits resync_required when stale', async () => {
  const app = express();
  const broker = new RealtimeEventBroker({ maxHistory: 2, epoch: 're_replay01' });
  let currentRole: 'customer' | 'agent' | 'admin' = 'customer';
  let currentUserId = 'usr_a';

  app.use(
    '/api',
    createRealtimeRouter({
      realtimeEvents: broker,
      requireAuth: (req, _res, next) => {
        req.authContext = {
          user: {
            appUserId: currentUserId,
            authUserId: 'ba_1',
            email: 'user@example.com',
            displayName: 'Test User',
            role: currentRole,
            status: 'active',
            emailVerified: true,
            passwordResetRequired: false,
            isParentAdmin: false,
            referralCode: null,
            referredBy: null,
            phone: null,
            avatarUrl: null,
            createdAt: '2026-11-26T00:00:00.000Z',
            updatedAt: '2026-11-26T00:00:00.000Z',
          },
          session: {
            id: 'sess_1',
            userId: currentUserId,
            expiresAt: '2026-12-31T00:00:00.000Z',
          },
        };
        next();
      },
    }),
  );

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    const e1 = broker.emitDomainInvalidation(
      { scope: 'user_and_staff', customerId: 'usr_a' },
      ['topups'],
      'cust_a_req',
    );
    // Emit one admin-only audit log and one Customer B invalidation while Customer A is offline
    broker.emitAuditLog({
      id: 'aud_secret',
      actorId: 'usr_admin',
      actorName: 'Admin',
      actorRole: 'admin',
      action: 'SECRET_ACTION',
      entityType: 'system',
      entityId: '1',
      details: 'Admin only',
      timestamp: new Date().toISOString(),
    });
    broker.emitDomainInvalidation(
      { scope: 'user_and_staff', customerId: 'usr_b' },
      ['withdrawals'],
      'cust_b_req',
    );
    broker.emitDomainInvalidation(
      { scope: 'user_and_staff', customerId: 'usr_b' },
      ['withdrawals'],
      'cust_b_req_2',
    );

    // With maxHistory=2, seq=2 is now evicted (history holds [3, 4]), so e1 (seq=1) triggers resync_required:
    currentRole = 'customer';
    currentUserId = 'usr_a';
    const staleStream = await openRealtimeStream(baseUrl, undefined, {
      lastEventIdHeader: e1.eventId,
    });
    await new Promise((r) => setTimeout(r, 40));
    const resyncEvt = staleStream.events.find((e) => e.event === 'resync_required');
    assert.ok(resyncEvt);
    assert.equal(resyncEvt.data.reason, 'buffer_evicted');
    staleStream.close();

    // Now test fresh replay inside maxHistory=2 where admin event + usr_a event exist
    const b2 = broker.emitAuditLog({
      id: 'aud_only_admin_2',
      actorId: 'usr_admin',
      actorName: 'Admin',
      actorRole: 'admin',
      action: 'ADMIN_ONLY_2',
      entityType: 'system',
      entityId: '2',
      details: 'Private',
      timestamp: new Date().toISOString(),
    });
    const b3 = broker.emitDomainInvalidation(
      { scope: 'user_and_staff', customerId: 'usr_a' },
      ['wallets'],
      'cust_a_wallet',
    );

    // Cursor at b2.seq - 1 is invalid/evicted, wait: cursor at b2.eventId replays only b3
    const replayStreamA = await openRealtimeStream(baseUrl, undefined, {
      queryLastEventId: b2.eventId,
    });
    await new Promise((r) => setTimeout(r, 40));
    assert.deepEqual(
      replayStreamA.events
        .filter((e) => e.event === 'domain_invalidation')
        .map((e) => ({ id: e.id, tables: e.data.tables })),
      [{ id: b3.eventId, tables: ['wallets'] }],
    );
    assert.equal(
      replayStreamA.events.filter((e) => e.event === 'audit_log').length,
      0,
    );
    replayStreamA.close();

    // Epoch mismatch emits resync_required
    const epochStream = await openRealtimeStream(baseUrl, undefined, {
      lastEventIdHeader: 're_old_server:12',
    });
    await new Promise((r) => setTimeout(r, 40));
    const epochResync = epochStream.events.find(
      (e) => e.event === 'resync_required',
    );
    assert.ok(epochResync);
    assert.equal(epochResync.data.reason, 'epoch_mismatch');
    epochStream.close();
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.closeAllConnections?.();
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
