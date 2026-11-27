import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createApiApp } from '../app.js';
import type {
  EmailDeliveryAdapter,
  SendOtpEmailPayload,
  SendPasswordResetEmailPayload,
  SendVerificationEmailPayload,
} from '../auth/emailDelivery.js';
import {
  ConfigValidationError,
  loadServerConfig,
  type ServerConfig,
} from '../config/env.js';
import type { DatabasePool } from '../db/pool.js';
import { createLogger } from '../logging/logger.js';
import type {
  WebPushSender,
  WebPushSendOptions,
  WebPushSubscriptionTarget,
} from '../notifications/webPushSender.js';

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

interface InMemoryNotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link_tab: string | null;
  link_request_id: string | null;
  created_at: Date;
}

interface InMemoryPushSubscriptionRow {
  id: string;
  endpoint: string;
  user_id: string;
  user_email: string | null;
  user_role: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
  platform: string | null;
  browser: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

class InMemoryNotificationsDatabase implements Pick<DatabasePool, 'query'> {
  public readonly users = new Map<string, InMemoryUserRow>();
  public readonly authLinks = new Map<string, InMemoryAuthLinkRow>();
  public readonly notifications = new Map<string, InMemoryNotificationRow>();
  public readonly pushSubscriptions = new Map<string, InMemoryPushSubscriptionRow>();
  public failNextQuery = false;

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
          if (user) {
            return { rows: [this.toJoinedRow(user, link)] };
          }
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
      if (!user) return { rows: [] };
      return { rows: [this.toJoinedRow(user, this.authLinks.get(appUserId))] };
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

    if (normalized.startsWith('UPDATE public.users SET email_verified = true')) {
      const id = String(values[0]);
      const user = this.users.get(id);
      if (user) {
        user.email_verified = true;
        user.updated_at = new Date();
      }
      return { rows: [], rowCount: user ? 1 : 0 };
    }

    if (this.failNextQuery) {
      this.failNextQuery = false;
      throw new Error('Simulated PostgreSQL query failure');
    }

    // Notifications queries
    if (normalized === 'SELECT id FROM public.users WHERE id = $1 LIMIT 1') {
      const userId = String(values[0] ?? '');
      const u = this.users.get(userId);
      return { rows: u ? [{ id: u.id }] : [] };
    }

    if (normalized.includes('FROM public.notifications')) {
      if (normalized.includes('WHERE user_id = $1 AND type = $2 AND title = $3 AND link_request_id = $4')) {
        const [userId, type, title, linkReqId] = values as [string, string, string, string];
        const match = [...this.notifications.values()]
          .filter(
            (n) =>
              n.user_id === userId &&
              n.type === type &&
              n.title === title &&
              n.link_request_id === linkReqId,
          )
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];
        return { rows: match ? [{ ...match }] : [] };
      }

      if (normalized.includes('AND message = $4')) {
        const [userId, type, title, message] = values as [string, string, string, string];
        const cutoff = Date.now() - 15_000;
        const match = [...this.notifications.values()]
          .filter(
            (n) =>
              n.user_id === userId &&
              n.type === type &&
              n.title === title &&
              n.message === message &&
              n.created_at.getTime() >= cutoff,
          )
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];
        return { rows: match ? [{ ...match }] : [] };
      }

      if (normalized.startsWith('SELECT id, user_id FROM public.notifications WHERE id = $1')) {
        const id = String(values[0] ?? '');
        const item = this.notifications.get(id);
        return { rows: item ? [{ id: item.id, user_id: item.user_id }] : [] };
      }

      if (normalized.startsWith('SELECT COUNT(*)::int AS unread_count FROM public.notifications')) {
        const userId = String(values[0] ?? '');
        const unread = [...this.notifications.values()].filter(
          (n) => n.user_id === userId && !n.is_read,
        ).length;
        return { rows: [{ unread_count: unread }] };
      }

      if (normalized.startsWith('SELECT COUNT(*)::int AS total FROM public.notifications')) {
        const filtered = this.filterNotifications(normalized, values);
        return { rows: [{ total: filtered.length }] };
      }

      if (normalized.startsWith('SELECT id, user_id, title, message, type, is_read, link_tab, link_request_id, created_at FROM public.notifications')) {
        const hasType = normalized.includes('type = $2');
        const filterValues = hasType ? values.slice(0, 2) : values.slice(0, 1);
        const limit = Number(values[hasType ? 2 : 1] ?? 50);
        const offset = Number(values[hasType ? 3 : 2] ?? 0);
        const filtered = this.filterNotifications(normalized, filterValues)
          .sort((a, b) => {
            const dt = b.created_at.getTime() - a.created_at.getTime();
            return dt !== 0 ? dt : b.id.localeCompare(a.id);
          })
          .slice(offset, offset + limit)
          .map((n) => ({ ...n }));
        return { rows: filtered };
      }
    }

    if (normalized.startsWith('INSERT INTO public.notifications')) {
      const [id, userId, title, message, type, linkTab, linkRequestId] = values as [
        string,
        string,
        string,
        string,
        string,
        string | null,
        string | null,
      ];
      const row: InMemoryNotificationRow = {
        id,
        user_id: userId,
        title,
        message,
        type,
        is_read: false,
        link_tab: linkTab,
        link_request_id: linkRequestId,
        created_at: new Date(),
      };
      this.notifications.set(id, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    if (normalized.startsWith('UPDATE public.notifications SET is_read = true WHERE id = $1 AND user_id = $2')) {
      const [id, userId] = values as [string, string];
      const row = this.notifications.get(id);
      if (!row || row.user_id !== userId) {
        return { rows: [], rowCount: 0 };
      }
      row.is_read = true;
      return { rows: [{ ...row }], rowCount: 1 };
    }

    if (normalized.startsWith('UPDATE public.notifications SET is_read = true WHERE user_id = $1 AND is_read = false')) {
      const userId = String(values[0] ?? '');
      let count = 0;
      for (const row of this.notifications.values()) {
        if (row.user_id === userId && !row.is_read) {
          row.is_read = true;
          count += 1;
        }
      }
      return { rows: [], rowCount: count };
    }

    // Push subscription queries
    if (normalized.startsWith('INSERT INTO public.push_subscriptions')) {
      const [
        id,
        endpoint,
        userId,
        userEmail,
        userRole,
        p256dh,
        auth,
        expirationTime,
        platform,
        browser,
      ] = values as [
        string,
        string,
        string,
        string | null,
        string,
        string,
        string,
        number | null,
        string | null,
        string | null,
      ];
      const existing = this.pushSubscriptions.get(endpoint);
      const now = new Date();
      const row: InMemoryPushSubscriptionRow = {
        id,
        endpoint,
        user_id: userId,
        user_email: userEmail,
        user_role: userRole,
        p256dh,
        auth,
        expiration_time: expirationTime,
        platform,
        browser,
        active: true,
        created_at:
          existing && existing.user_id === userId ? existing.created_at : now,
        updated_at: now,
      };
      this.pushSubscriptions.set(endpoint, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    if (normalized.startsWith('DELETE FROM public.push_subscriptions WHERE endpoint = $1 AND user_id = $2')) {
      const [endpoint, userId] = values as [string, string];
      const existing = this.pushSubscriptions.get(endpoint);
      if (existing && existing.user_id === userId) {
        this.pushSubscriptions.delete(endpoint);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('DELETE FROM public.push_subscriptions WHERE user_id = $1')) {
      const userId = String(values[0] ?? '');
      let count = 0;
      for (const [ep, row] of this.pushSubscriptions.entries()) {
        if (row.user_id === userId) {
          this.pushSubscriptions.delete(ep);
          count += 1;
        }
      }
      return { rows: [], rowCount: count };
    }

    if (normalized.startsWith('DELETE FROM public.push_subscriptions WHERE endpoint = ANY($1::text[])')) {
      const endpoints = Array.isArray(values[0]) ? (values[0] as string[]) : [];
      let count = 0;
      for (const ep of endpoints) {
        if (this.pushSubscriptions.delete(ep)) {
          count += 1;
        }
      }
      return { rows: [], rowCount: count };
    }

    if (normalized.startsWith('SELECT id, endpoint FROM public.push_subscriptions WHERE user_id = $1 AND active = true')) {
      const userId = String(values[0] ?? '');
      const rows = [...this.pushSubscriptions.values()]
        .filter((r) => r.user_id === userId && r.active)
        .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())
        .slice(0, 50)
        .map((r) => ({ id: r.id, endpoint: r.endpoint }));
      return { rows };
    }

    if (normalized.includes('FROM public.push_subscriptions WHERE active = true AND user_role IN')) {
      const excludeSenderId = values[0] ? String(values[0]) : null;
      const rows = [...this.pushSubscriptions.values()]
        .filter(
          (r) =>
            r.active &&
            (r.user_role === 'agent' || r.user_role === 'admin') &&
            (!excludeSenderId || r.user_id !== excludeSenderId),
        )
        .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())
        .slice(0, 100)
        .map((r) => ({ ...r }));
      return { rows };
    }

    if (normalized.includes('FROM public.push_subscriptions WHERE active = true AND user_id = $1')) {
      const targetUserId = String(values[0] ?? '');
      const excludeSenderId = values[1] ? String(values[1]) : null;
      const rows = [...this.pushSubscriptions.values()]
        .filter(
          (r) =>
            r.active &&
            r.user_id === targetUserId &&
            (!excludeSenderId || r.user_id !== excludeSenderId),
        )
        .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())
        .slice(0, 50)
        .map((r) => ({ ...r }));
      return { rows };
    }

    return { rows: [] };
  }

  private filterNotifications(
    normalizedSql: string,
    values: unknown[],
  ): InMemoryNotificationRow[] {
    const userId = String(values[0] ?? '');
    const unreadOnly = normalizedSql.includes('is_read = false');
    const typeFilter = normalizedSql.includes('type = $2')
      ? String(values[1] ?? '')
      : undefined;

    return [...this.notifications.values()].filter((n) => {
      if (n.user_id !== userId) return false;
      if (unreadOnly && n.is_read) return false;
      if (typeFilter && n.type !== typeFilter) return false;
      return true;
    });
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
  public readonly otps: SendOtpEmailPayload[] = [];
  public readonly resets: SendPasswordResetEmailPayload[] = [];
  public readonly verifications: SendVerificationEmailPayload[] = [];

  public isConfigured(): boolean {
    return true;
  }

  public async sendVerificationEmail(
    payload: SendVerificationEmailPayload,
  ): Promise<void> {
    this.verifications.push(payload);
  }
  public async sendOtpEmail(payload: SendOtpEmailPayload): Promise<void> {
    this.otps.push(payload);
  }
  public async sendPasswordResetEmail(
    payload: SendPasswordResetEmailPayload,
  ): Promise<void> {
    this.resets.push(payload);
  }
}

class MockWebPushSender implements WebPushSender {
  public isConfigured = true;
  public readonly deliveries: Array<{
    subscription: WebPushSubscriptionTarget;
    payload: Record<string, unknown>;
    options?: WebPushSendOptions;
  }> = [];
  public failStatusByEndpoint = new Map<string, number>();

  public async sendNotification(
    subscription: WebPushSubscriptionTarget,
    payload: string,
    options?: WebPushSendOptions,
  ): Promise<void> {
    const forcedStatus = this.failStatusByEndpoint.get(subscription.endpoint);
    if (forcedStatus) {
      const err = new Error(`Push gateway returned ${forcedStatus}`) as Error & {
        statusCode: number;
      };
      err.statusCode = forcedStatus;
      throw err;
    }
    this.deliveries.push({
      subscription,
      payload: JSON.parse(payload) as Record<string, unknown>,
      options,
    });
  }
}

function createTestConfig(overrides?: Partial<ServerConfig>): ServerConfig {
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
    vapidPublicKey: 'BTestPublicVapidKey1234567890',
    vapidPrivateKey: 'TestPrivateVapidKey1234567890',
    vapidSubject: 'mailto:support@swiftsweeps.com',
    ...overrides,
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
      if (val) {
        this.cookies.set(name, val);
      } else {
        this.cookies.delete(name);
      }
    }
  }

  public header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

async function httpJsonRequest(
  baseUrl: string,
  method: string,
  path: string,
  options?: {
    body?: unknown;
    jar?: TestSessionCookieJar;
    origin?: string | null;
  },
): Promise<{ status: number; json: any; headers: http.IncomingHttpHeaders }> {
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
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }
  if (options?.origin !== null && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers.Origin = options?.origin ?? 'http://localhost:3000';
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
          const raw = Buffer.concat(chunks).toString('utf8');
          let json: any = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = raw;
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
    if (bodyStr !== undefined) {
      req.write(bodyStr);
    }
    req.end();
  });
}

async function createTestServer(overrides?: {
  config?: Partial<ServerConfig>;
  webPushSender?: WebPushSender;
}) {
  const db = new InMemoryNotificationsDatabase();
  const authMemoryStore = {
    ba_user: [],
    ba_session: [],
    ba_account: [],
    ba_verification: [],
    ba_rate_limit: [],
  };
  const emailDelivery = new RecordingEmailDelivery();
  const webPushSender = overrides?.webPushSender ?? new MockWebPushSender();
  const logger = createLogger({
    level: 'error',
    writeStdout: () => {},
    writeStderr: () => {},
  });
  const config = createTestConfig(overrides?.config);
  const app = createApiApp({
    config,
    logger,
    pool: db,
    authDatabaseOverride: memoryAdapter(authMemoryStore),
    emailDeliveryOverride: emailDelivery,
    webPushSenderOverride: webPushSender,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    db,
    webPushSender,
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

async function signupAndSignIn(
  baseUrl: string,
  db: InMemoryNotificationsDatabase,
  params: { email: string; name: string; role: 'customer' | 'agent' | 'admin' },
): Promise<{ appUserId: string; jar: TestSessionCookieJar }> {
  const jar = new TestSessionCookieJar();
  const signUpRes = await httpJsonRequest(baseUrl, 'POST', '/api/auth/sign-up/email', {
    jar,
    body: {
      email: params.email,
      password: 'StrongPassword#2026!',
      name: params.name,
    },
  });
  assert.equal(signUpRes.status, 200, `Signup failed: ${JSON.stringify(signUpRes.json)}`);

  const signInRes = await httpJsonRequest(baseUrl, 'POST', '/api/auth/sign-in/email', {
    jar,
    body: {
      email: params.email,
      password: 'StrongPassword#2026!',
    },
  });
  assert.equal(signInRes.status, 200, `Signin failed: ${JSON.stringify(signInRes.json)}`);
  assert.ok(jar.header().length > 0, 'Session cookie should be captured after sign-in');

  // Promote role in DB when creating staff test fixtures
  let appUserId = '';
  for (const user of db.users.values()) {
    if (user.email.toLowerCase() === params.email.toLowerCase()) {
      user.role = params.role;
      appUserId = user.id;
      break;
    }
  }
  assert.ok(appUserId, 'App user record should exist after signup');

  return { appUserId, jar };
}

test('loadServerConfig validates paired VAPID keys and subject format', () => {
  const baseEnv = {
    DATABASE_URL: 'postgresql://app:pass@127.0.0.1:5432/swiftsweeps',
  };

  assert.throws(
    () =>
      loadServerConfig({
        ...baseEnv,
        VAPID_PUBLIC_KEY: 'BPublicOnly',
      }),
    ConfigValidationError,
  );

  assert.throws(
    () =>
      loadServerConfig({
        ...baseEnv,
        VAPID_PUBLIC_KEY: 'BPublic',
        VAPID_PRIVATE_KEY: 'Private',
        VAPID_SUBJECT: 'invalid-subject',
      }),
    ConfigValidationError,
  );

  const valid = loadServerConfig({
    ...baseEnv,
    VAPID_PUBLIC_KEY: 'BPublicKey123',
    VAPID_PRIVATE_KEY: 'PrivateKey123',
  });
  assert.equal(valid.vapidPublicKey, 'BPublicKey123');
  assert.equal(valid.vapidPrivateKey, 'PrivateKey123');
  assert.equal(valid.vapidSubject, 'mailto:support@swiftsweeps.com');
});

test('VAPID key endpoint fails closed with 503 when unconfigured and serves key with no-store when configured', async () => {
  const unconfiguredPush: WebPushSender = {
    isConfigured: false,
    async sendNotification() {
      throw new Error('unconfigured');
    },
  };
  const unconfSrv = await createTestServer({
    config: { vapidPublicKey: undefined, vapidPrivateKey: undefined },
    webPushSender: unconfiguredPush,
  });
  try {
    const res = await httpJsonRequest(
      unconfSrv.baseUrl,
      'GET',
      '/api/push/vapid-public-key',
    );
    assert.equal(res.status, 503);
    assert.equal(res.json?.error?.code, 'PUSH_NOT_CONFIGURED');

    const cust = await signupAndSignIn(unconfSrv.baseUrl, unconfSrv.db, {
      email: 'unconf-cust@example.com',
      name: 'Unconf Cust',
      role: 'customer',
    });
    const notifyRes = await httpJsonRequest(
      unconfSrv.baseUrl,
      'POST',
      '/api/push/notify',
      {
        jar: cust.jar,
        body: { recipientId: cust.appUserId, title: 'Hi', body: 'Test' },
      },
    );
    assert.equal(notifyRes.status, 503);
    assert.equal(notifyRes.json?.error?.code, 'PUSH_NOT_CONFIGURED');
  } finally {
    await unconfSrv.close();
  }

  const confSrv = await createTestServer();
  try {
    const res = await httpJsonRequest(
      confSrv.baseUrl,
      'GET',
      '/api/push/vapid-public-key',
    );
    assert.equal(res.status, 200);
    assert.equal(res.json.publicKey, 'BTestPublicVapidKey1234567890');
    assert.match(String(res.headers['cache-control'] || ''), /no-store/);
  } finally {
    await confSrv.close();
  }
});

test('Push subscribe, status, unsubscribe enforce auth, CSRF, authoritative DB roles, and 1-to-1 device rebinding', async () => {
  const srv = await createTestServer();
  try {
    // 1. Unauthenticated behavior
    const anonStatus = await httpJsonRequest(srv.baseUrl, 'GET', '/api/push/status');
    assert.equal(anonStatus.status, 200);
    assert.deepEqual(anonStatus.json, {
      linked: false,
      count: 0,
      boundToCurrentUser: false,
    });

    const anonSub = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/subscribe', {
      body: {
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/dev-1',
          keys: { p256dh: 'p256dh_valid_base64_key_1234', auth: 'auth_valid_key_1234' },
        },
      },
    });
    assert.equal(anonSub.status, 401);

    const anonUnsub = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/unsubscribe', {
      body: { endpoint: 'https://fcm.googleapis.com/fcm/send/dev-1' },
    });
    assert.equal(anonUnsub.status, 401);

    // 2. Create users
    const custA = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'cust-a@example.com',
      name: 'Customer A',
      role: 'customer',
    });
    const admin = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'admin-a@example.com',
      name: 'Admin A',
      role: 'admin',
    });

    const sharedEndpoint = 'https://fcm.googleapis.com/fcm/send/shared-device';
    const subPayload = {
      endpoint: sharedEndpoint,
      keys: {
        p256dh: 'p256dh_shared_key_value_123456',
        auth: 'auth_shared_key_value_123456',
      },
    };

    // 3. CSRF / Origin checks for cookie-authenticated mutation
    const evilOriginSub = await httpJsonRequest(
      srv.baseUrl,
      'POST',
      '/api/push/subscribe',
      {
        jar: custA.jar,
        origin: 'https://evil.example',
        body: { subscription: subPayload },
      },
    );
    assert.equal(evilOriginSub.status, 403);
    assert.equal(evilOriginSub.json?.error?.code, 'ORIGIN_FORBIDDEN');

    const missingOriginSub = await httpJsonRequest(
      srv.baseUrl,
      'POST',
      '/api/push/subscribe',
      {
        jar: custA.jar,
        origin: null,
        body: { subscription: subPayload },
      },
    );
    assert.equal(missingOriginSub.status, 403);
    assert.equal(missingOriginSub.json?.error?.code, 'CSRF_ORIGIN_REQUIRED');

    // 4. Reject binding another user's ID and reject insecure http:// endpoint
    const hijackSub = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/subscribe', {
      jar: custA.jar,
      body: { userId: admin.appUserId, subscription: subPayload },
    });
    assert.equal(hijackSub.status, 403);

    const httpSub = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/subscribe', {
      jar: custA.jar,
      body: {
        subscription: {
          endpoint: 'http://insecure.example/push',
          keys: subPayload.keys,
        },
      },
    });
    assert.equal(httpSub.status, 400);

    // 5. Customer attempts to spoof userRole='admin' -> server stores authoritative DB role 'customer'
    const spoofRoleSub = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/subscribe', {
      jar: custA.jar,
      body: {
        userId: custA.appUserId,
        userRole: 'admin',
        userEmail: 'spoofed@admin.com',
        subscription: subPayload,
        platform: 'android',
        browser: 'Chrome',
      },
    });
    assert.equal(spoofRoleSub.status, 200);
    assert.equal(spoofRoleSub.json.boundUserId, custA.appUserId);
    assert.equal(spoofRoleSub.json.boundRole, 'customer');
    assert.equal(srv.db.pushSubscriptions.get(sharedEndpoint)?.user_role, 'customer');
    assert.equal(srv.db.pushSubscriptions.get(sharedEndpoint)?.user_email, 'cust-a@example.com');

    // 6. Account switch on same device endpoint atomically evicts Customer A & binds Admin
    const adminRebind = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/subscribe', {
      jar: admin.jar,
      body: { subscription: subPayload },
    });
    assert.equal(adminRebind.status, 200);
    assert.equal(adminRebind.json.boundUserId, admin.appUserId);
    assert.equal(adminRebind.json.boundRole, 'admin');

    const custStatusAfterSwitch = await httpJsonRequest(
      srv.baseUrl,
      'GET',
      `/api/push/status?endpoint=${encodeURIComponent(sharedEndpoint)}`,
      { jar: custA.jar },
    );
    assert.equal(custStatusAfterSwitch.status, 200);
    assert.deepEqual(custStatusAfterSwitch.json, {
      linked: false,
      count: 0,
      boundToCurrentUser: false,
    });

    const crossStatusRes = await httpJsonRequest(
      srv.baseUrl,
      'GET',
      `/api/push/status?userId=${encodeURIComponent(admin.appUserId)}`,
      { jar: custA.jar },
    );
    assert.equal(crossStatusRes.status, 403);

    const adminStatus = await httpJsonRequest(
      srv.baseUrl,
      'GET',
      `/api/push/status?endpoint=${encodeURIComponent(sharedEndpoint)}`,
      { jar: admin.jar },
    );
    assert.equal(adminStatus.status, 200);
    assert.deepEqual(adminStatus.json, {
      linked: true,
      count: 1,
      boundToCurrentUser: true,
    });

    // 7. Customer A cannot unsubscribe Admin's endpoint; Admin can revoke own endpoint
    const crossUnsub = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/unsubscribe', {
      jar: custA.jar,
      body: { endpoint: sharedEndpoint },
    });
    assert.equal(crossUnsub.status, 200);
    assert.equal(crossUnsub.json.removedCount, 0);
    assert.equal(srv.db.pushSubscriptions.has(sharedEndpoint), true);

    const adminUnsub = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/unsubscribe', {
      jar: admin.jar,
      body: { endpoint: sharedEndpoint },
    });
    assert.equal(adminUnsub.status, 200);
    assert.equal(adminUnsub.json.removedCount, 1);
    assert.equal(srv.db.pushSubscriptions.has(sharedEndpoint), false);
  } finally {
    await srv.close();
  }
});

test('Push notify enforces RBAC isolation, internal note skip, URL validation, and 410 endpoint pruning', async () => {
  const mockSender = new MockWebPushSender();
  const srv = await createTestServer({ webPushSender: mockSender });
  try {
    const custA = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'push-a@example.com',
      name: 'Push A',
      role: 'customer',
    });
    const custB = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'push-b@example.com',
      name: 'Push B',
      role: 'customer',
    });
    const agent = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'push-agent@example.com',
      name: 'Agent One',
      role: 'agent',
    });
    const admin = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'push-admin@example.com',
      name: 'Admin One',
      role: 'admin',
    });

    const epA = 'https://fcm.googleapis.com/fcm/send/ep-a';
    const epB = 'https://fcm.googleapis.com/fcm/send/ep-b';
    const epAgent = 'https://fcm.googleapis.com/fcm/send/ep-agent';
    const epAdminGone = 'https://fcm.googleapis.com/fcm/send/ep-admin-gone';

    for (const [jar, endpoint] of [
      [custA.jar, epA],
      [custB.jar, epB],
      [agent.jar, epAgent],
      [admin.jar, epAdminGone],
    ] as const) {
      const subRes = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/subscribe', {
        jar,
        body: {
          subscription: {
            endpoint,
            keys: { p256dh: 'p256dh_key_value_123456', auth: 'auth_key_value_123456' },
          },
        },
      });
      assert.equal(subRes.status, 200);
    }

    // Customer cannot notify another customer
    const crossCustNotify = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/notify', {
      jar: custA.jar,
      body: { recipientId: custB.appUserId, title: 'Hi', body: 'Secret' },
    });
    assert.equal(crossCustNotify.status, 403);

    // Customer cannot spoof senderId
    const spoofSenderNotify = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/notify', {
      jar: custA.jar,
      body: {
        recipientId: 'staff',
        senderId: custB.appUserId,
        title: 'Hi',
        body: 'Spoof',
      },
    });
    assert.equal(spoofSenderNotify.status, 403);

    // Unsafe push URL rejected
    const unsafeUrlNotify = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/notify', {
      jar: custA.jar,
      body: {
        recipientId: 'staff',
        title: 'Hi',
        body: 'Test',
        url: 'javascript:alert(1)',
      },
    });
    assert.equal(unsafeUrlNotify.status, 400);

    // Internal notes skip cleanly with zero deliveries
    const internalNoteRes = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/notify', {
      jar: agent.jar,
      body: {
        recipientId: custA.appUserId,
        isInternalNote: true,
        title: 'Staff Note',
        body: 'Do not send to customer',
      },
    });
    assert.equal(internalNoteRes.status, 200);
    assert.equal(internalNoteRes.json.skipped, true);
    assert.equal(mockSender.deliveries.length, 0);

    // Customer self-test hits only Customer A
    const selfTestRes = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/notify', {
      jar: custA.jar,
      body: {
        recipientId: custA.appUserId,
        title: 'Test',
        body: 'Ping self',
        url: '/#chat',
      },
    });
    assert.equal(selfTestRes.status, 200);
    assert.equal(selfTestRes.json.sent, 1);
    assert.deepEqual(
      mockSender.deliveries.map((d) => d.subscription.endpoint),
      [epA],
    );

    // Customer -> staff hits staff ONLY, and 410 Gone endpoint is pruned automatically
    mockSender.deliveries.length = 0;
    mockSender.failStatusByEndpoint.set(epAdminGone, 410);
    const toStaffRes = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/notify', {
      jar: custA.jar,
      body: {
        recipientId: 'staff',
        recipientRole: 'agent',
        title: 'Support ping',
        body: 'Need help',
      },
    });
    assert.equal(toStaffRes.status, 200);
    assert.equal(toStaffRes.json.sent, 1);
    assert.equal(toStaffRes.json.failed, 1);
    assert.equal(toStaffRes.json.pruned, 1);
    assert.deepEqual(
      mockSender.deliveries.map((d) => d.subscription.endpoint),
      [epAgent],
    );
    assert.equal(srv.db.pushSubscriptions.has(epAdminGone), false);

    // Staff cannot broadcast to generic 'customer' / 'anonymous'
    const roleBroadcastRes = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/notify', {
      jar: agent.jar,
      body: {
        recipientId: 'customer',
        title: 'Broadcast',
        body: 'Should fail',
      },
    });
    assert.equal(roleBroadcastRes.status, 400);

    // Staff -> explicit customer B hits ONLY customer B
    mockSender.deliveries.length = 0;
    const toCustBRes = await httpJsonRequest(srv.baseUrl, 'POST', '/api/push/notify', {
      jar: agent.jar,
      body: {
        recipientId: custB.appUserId,
        title: 'Deposit Approved',
        body: '$25.00 loaded',
        actionType: 'deposit',
      },
    });
    assert.equal(toCustBRes.status, 200);
    assert.equal(toCustBRes.json.sent, 1);
    assert.deepEqual(
      mockSender.deliveries.map((d) => d.subscription.endpoint),
      [epB],
    );
    assert.equal(
      mockSender.deliveries[0]!.payload.badge,
      '/notification-badge-v2.png',
    );
  } finally {
    await srv.close();
  }
});

test('In-app notifications enforce per-user isolation, staff target authorization, idempotency, pagination, and read state', async () => {
  const srv = await createTestServer();
  try {
    // 1. Unauthenticated blocked
    const anonList = await httpJsonRequest(srv.baseUrl, 'GET', '/api/notifications');
    assert.equal(anonList.status, 401);

    const custA = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'notif-a@example.com',
      name: 'Notif A',
      role: 'customer',
    });
    const custB = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'notif-b@example.com',
      name: 'Notif B',
      role: 'customer',
    });
    const staff = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'notif-staff@example.com',
      name: 'Staff One',
      role: 'agent',
    });

    // 2. Customer cannot create notifications for someone else or supply privileged fields
    const crossCreate = await httpJsonRequest(srv.baseUrl, 'POST', '/api/notifications', {
      jar: custA.jar,
      body: {
        userId: custB.appUserId,
        title: 'Spoof',
        message: 'For B',
        type: 'system',
      },
    });
    assert.equal(crossCreate.status, 403);

    const privFieldCreate = await httpJsonRequest(srv.baseUrl, 'POST', '/api/notifications', {
      jar: custA.jar,
      body: {
        title: 'Bypass',
        message: 'Trying to mark read',
        type: 'system',
        isRead: true,
      },
    });
    assert.equal(privFieldCreate.status, 403);
    assert.equal(privFieldCreate.json?.error?.code, 'FORBIDDEN_FIELD_MODIFICATION');

    // 3. Staff creates notification for non-existent user -> 404
    const missingUserCreate = await httpJsonRequest(srv.baseUrl, 'POST', '/api/notifications', {
      jar: staff.jar,
      body: {
        userId: 'usr_does_not_exist',
        title: 'Top-up',
        message: 'Missing user',
        type: 'topup',
      },
    });
    assert.equal(missingUserCreate.status, 404);

    // 4. Customer creates own notification + Staff creates notification for Customer A (with dedup)
    const ownCreate = await httpJsonRequest(srv.baseUrl, 'POST', '/api/notifications', {
      jar: custA.jar,
      body: {
        title: 'Top-Up Submitted',
        message: 'Your top-up is under review.',
        type: 'topup',
        linkTab: 'topup',
        linkRequestId: 'topup_101',
      },
    });
    assert.equal(ownCreate.status, 201);
    assert.equal(ownCreate.json.notification.isRead, false);
    const notifId1 = ownCreate.json.notification.id;

    // Duplicate linkRequestId deduplicates cleanly
    const dupCreate = await httpJsonRequest(srv.baseUrl, 'POST', '/api/notifications', {
      jar: staff.jar,
      body: {
        userId: custA.appUserId,
        title: 'Top-Up Submitted',
        message: 'Duplicate attempt',
        type: 'topup',
        linkTab: 'topup',
        linkRequestId: 'topup_101',
      },
    });
    assert.equal(dupCreate.status, 200);
    assert.equal(dupCreate.json.deduplicated, true);
    assert.equal(dupCreate.json.notification.id, notifId1);

    const staffCreateForA = await httpJsonRequest(srv.baseUrl, 'POST', '/api/notifications', {
      jar: staff.jar,
      body: {
        userId: custA.appUserId,
        title: 'Deposit Approved',
        message: '$50.00 loaded.',
        type: 'topup',
        linkTab: 'wallet',
        linkRequestId: 'topup_102',
      },
    });
    assert.equal(staffCreateForA.status, 201);
    const notifId2 = staffCreateForA.json.notification.id;

    // 5. Isolation: Customer B sees 0 notifications & cannot query ?userId=custA or mark A's notification read
    const bList = await httpJsonRequest(srv.baseUrl, 'GET', '/api/notifications', {
      jar: custB.jar,
    });
    assert.equal(bList.status, 200);
    assert.equal(bList.json.notifications.length, 0);
    assert.equal(bList.json.unreadCount, 0);

    const bProbeA = await httpJsonRequest(
      srv.baseUrl,
      'GET',
      `/api/notifications?userId=${encodeURIComponent(custA.appUserId)}`,
      { jar: custB.jar },
    );
    assert.equal(bProbeA.status, 403);

    const bMarkA = await httpJsonRequest(
      srv.baseUrl,
      'PATCH',
      `/api/notifications/${encodeURIComponent(notifId1)}/read`,
      { jar: custB.jar, body: {} },
    );
    assert.equal(bMarkA.status, 403);

    const missingMark = await httpJsonRequest(
      srv.baseUrl,
      'PATCH',
      '/api/notifications/notif_missing_999/read',
      { jar: custA.jar, body: {} },
    );
    assert.equal(missingMark.status, 404);

    // 6. Pagination & read transitions for Customer A
    const page1 = await httpJsonRequest(
      srv.baseUrl,
      'GET',
      '/api/notifications?limit=1&offset=0',
      { jar: custA.jar },
    );
    assert.equal(page1.status, 200);
    assert.equal(page1.json.notifications.length, 1);
    assert.equal(page1.json.total, 2);
    assert.equal(page1.json.unreadCount, 2);
    assert.equal(page1.json.hasMore, true);

    const markOne = await httpJsonRequest(
      srv.baseUrl,
      'PATCH',
      `/api/notifications/${encodeURIComponent(notifId1)}/read`,
      { jar: custA.jar, body: {} },
    );
    assert.equal(markOne.status, 200);
    assert.equal(markOne.json.notification.isRead, true);

    const unreadOnlyList = await httpJsonRequest(
      srv.baseUrl,
      'GET',
      '/api/notifications?unreadOnly=true',
      { jar: custA.jar },
    );
    assert.equal(unreadOnlyList.status, 200);
    assert.equal(unreadOnlyList.json.notifications.length, 1);
    assert.equal(unreadOnlyList.json.notifications[0].id, notifId2);
    assert.equal(unreadOnlyList.json.unreadCount, 1);

    const markAll = await httpJsonRequest(
      srv.baseUrl,
      'POST',
      '/api/notifications/read-all',
      { jar: custA.jar, body: {} },
    );
    assert.equal(markAll.status, 200);
    assert.equal(markAll.json.updatedCount, 1);

    // 7. Database error returns sanitized 500 without leaking raw error text
    srv.db.failNextQuery = true;
    const dbErrRes = await httpJsonRequest(srv.baseUrl, 'GET', '/api/notifications', {
      jar: custA.jar,
    });
    assert.equal(dbErrRes.status, 500);
    assert.equal(dbErrRes.json?.error?.code, 'INTERNAL_SERVER_ERROR');
    assert.doesNotMatch(JSON.stringify(dbErrRes.json), /Simulated PostgreSQL/);
  } finally {
    await srv.close();
  }
});
