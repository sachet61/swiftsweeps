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
import type { ServerConfig } from '../config/env.js';
import type { DatabaseClient, DatabasePool } from '../db/pool.js';
import { createLogger } from '../logging/logger.js';
import type { TelegramFetchFn } from '../routes/appConfig.js';

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

interface InMemoryAuditRow {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  timestamp: Date;
}

interface InMemoryAppConfigRow {
  id: string;
  data: Record<string, unknown>;
  updated_at: Date;
}

interface InMemoryFakedCashoutRow {
  id: string;
  customer_name: string;
  amount: string;
  currency: string;
  method_name: string;
  game_name: string;
  is_fake: boolean;
  timestamp: Date;
}

interface InMemoryMessageRow {
  id: string;
  conversation_id: string;
  sender_role: string;
  is_internal_note: boolean;
  delivery_status: string;
  created_at: Date;
  sent_at: Date | string | null;
}

class InMemoryAppConfigDatabase
  implements Pick<DatabasePool, 'query' | 'connect'>
{
  public readonly users = new Map<string, InMemoryUserRow>();
  public readonly authLinks = new Map<string, InMemoryAuthLinkRow>();
  public auditLogs: InMemoryAuditRow[] = [];
  public appConfigRow: InMemoryAppConfigRow | null = null;
  public fakedCashouts = new Map<string, InMemoryFakedCashoutRow>();
  public messages: InMemoryMessageRow[] = [];
  public failNextQueryOn: 'app_config' | 'faked_cashouts' | 'audit_logs' | null =
    null;

  private txSnapshot: {
    appConfigRow: InMemoryAppConfigRow | null;
    fakedCashouts: Map<string, InMemoryFakedCashoutRow>;
    auditLogs: InMemoryAuditRow[];
  } | null = null;

  public async connect(): Promise<DatabaseClient> {
    return {
      query: (text: string, values?: unknown[]) => this.query(text, values),
      release: () => {},
    };
  }

  public async query(
    sql: string,
    values: unknown[] = [],
  ): Promise<{ rows: unknown[]; rowCount?: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized === 'BEGIN') {
      this.txSnapshot = {
        appConfigRow: this.appConfigRow
          ? {
              id: this.appConfigRow.id,
              data: structuredClone(this.appConfigRow.data),
              updated_at: new Date(this.appConfigRow.updated_at.getTime()),
            }
          : null,
        fakedCashouts: new Map(
          Array.from(this.fakedCashouts.entries()).map(([k, v]) => [
            k,
            { ...v, timestamp: new Date(v.timestamp.getTime()) },
          ]),
        ),
        auditLogs: [...this.auditLogs],
      };
      return { rows: [] };
    }

    if (normalized === 'COMMIT') {
      this.txSnapshot = null;
      return { rows: [] };
    }

    if (normalized === 'ROLLBACK') {
      if (this.txSnapshot) {
        this.appConfigRow = this.txSnapshot.appConfigRow;
        this.fakedCashouts = this.txSnapshot.fakedCashouts;
        this.auditLogs = this.txSnapshot.auditLogs;
        this.txSnapshot = null;
      }
      return { rows: [] };
    }

    if (normalized === 'SELECT 1 AS ok') {
      return { rows: [{ ok: 1 }] };
    }

    if (normalized === "SELECT to_regclass('public.messages')::text AS reg") {
      return { rows: [{ reg: 'public.messages' }] };
    }

    if (normalized.startsWith('SELECT MAX(sent_at) AS last_sent_at FROM public.messages')) {
      const convIds = new Set(
        (Array.isArray(values[0]) ? values[0] : []).map((c) =>
          String(c).toLowerCase(),
        ),
      );
      let maxMs = 0;
      let maxVal: Date | string | null = null;
      for (const m of this.messages) {
        if (!convIds.has(m.conversation_id.toLowerCase())) continue;
        if (
          m.sender_role !== 'agent' &&
          m.sender_role !== 'admin' &&
          m.sender_role !== 'system'
        ) {
          continue;
        }
        if (m.is_internal_note) continue;
        if (m.delivery_status !== 'sent') continue;
        if (!m.sent_at) continue;
        const ms =
          m.sent_at instanceof Date
            ? m.sent_at.getTime()
            : Date.parse(String(m.sent_at));
        if (Number.isFinite(ms) && ms > maxMs) {
          maxMs = ms;
          maxVal = m.sent_at;
        }
      }
      return { rows: [{ last_sent_at: maxVal }] };
    }

    if (
      normalized.includes(
        'FROM public.auth_user_links l INNER JOIN public.users u',
      ) &&
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

    if (normalized.startsWith('INSERT INTO public.audit_logs')) {
      if (this.failNextQueryOn === 'audit_logs') {
        this.failNextQueryOn = null;
        throw new Error('pg_audit_error: simulated write failure');
      }

      if (normalized.includes("'settings'")) {
        const [
          id,
          actor_id,
          actor_name,
          actor_role,
          action,
          entity_id,
          details,
          timestampRaw,
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
          actor_id,
          actor_name,
          actor_role,
          action,
          entity_type: 'settings',
          entity_id,
          details,
          timestamp: new Date(timestampRaw),
        });
      } else {
        const [
          id,
          actor_id,
          actor_name,
          actor_role,
          action,
          entity_type,
          entity_id,
          details,
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
          actor_id,
          actor_name,
          actor_role,
          action,
          entity_type,
          entity_id,
          details,
          timestamp: new Date(),
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (
      normalized.includes('public.app_config') &&
      this.failNextQueryOn === 'app_config'
    ) {
      this.failNextQueryOn = null;
      throw new Error('pg_app_config_error: simulated database failure');
    }

    if (
      normalized.includes('public.faked_cashouts') &&
      this.failNextQueryOn === 'faked_cashouts'
    ) {
      this.failNextQueryOn = null;
      throw new Error('pg_faked_cashouts_error: simulated database failure');
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

    if (
      normalized ===
      'SELECT COUNT(*)::int AS total FROM public.faked_cashouts'
    ) {
      return { rows: [{ total: this.fakedCashouts.size }] };
    }

    if (
      normalized.startsWith(
        'SELECT id, customer_name, amount, currency, method_name, game_name, is_fake, timestamp FROM public.faked_cashouts',
      )
    ) {
      const limit = Number(values[0] ?? 25);
      const offset = Number(values[1] ?? 0);
      const sorted = Array.from(this.fakedCashouts.values()).sort(
        (a, b) =>
          b.timestamp.getTime() - a.timestamp.getTime() ||
          b.id.localeCompare(a.id),
      );
      return {
        rows: sorted.slice(offset, offset + limit).map((r) => ({ ...r })),
      };
    }

    if (normalized === 'DELETE FROM public.faked_cashouts') {
      const count = this.fakedCashouts.size;
      this.fakedCashouts.clear();
      return { rows: [], rowCount: count };
    }

    if (
      normalized.startsWith(
        'DELETE FROM public.faked_cashouts WHERE id = $1 RETURNING',
      )
    ) {
      const id = String(values[0] ?? '');
      const existing = this.fakedCashouts.get(id);
      if (!existing) return { rows: [], rowCount: 0 };
      this.fakedCashouts.delete(id);
      return { rows: [{ ...existing }], rowCount: 1 };
    }

    if (normalized.startsWith('INSERT INTO public.faked_cashouts')) {
      const [
        id,
        customerName,
        amountStr,
        currency,
        methodName,
        gameName,
        isFake,
        timestampRaw,
      ] = values as [
        string,
        string,
        string,
        string,
        string,
        string,
        boolean,
        string,
      ];
      const row: InMemoryFakedCashoutRow = {
        id,
        customer_name: customerName,
        amount: Number(amountStr).toFixed(2),
        currency,
        method_name: methodName,
        game_name: gameName,
        is_fake: isFake,
        timestamp: new Date(timestampRaw),
      };
      this.fakedCashouts.set(row.id, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    throw new Error(
      `Unexpected SQL in InMemoryAppConfigDatabase: ${normalized}`,
    );
  }

  private toJoinedRow(
    user: InMemoryUserRow,
    link: InMemoryAuthLinkRow | undefined,
  ) {
    return {
      app_user_id: user.id,
      auth_user_id: link?.auth_user_id ?? null,
      email: user.email,
      display_name: user.display_name,
      phone: user.phone,
      avatar_url: user.avatar_url,
      role: user.role,
      status: user.status,
      email_verified: user.email_verified,
      referral_code: user.referral_code,
      referred_by: user.referred_by,
      password_reset_required: link?.password_reset_required ?? false,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }
}

function createCaptureEmailAdapter(): {
  adapter: EmailDeliveryAdapter;
  otps: SendOtpEmailPayload[];
} {
  const otps: SendOtpEmailPayload[] = [];
  return {
    otps,
    adapter: {
      providerName: 'test-capture',
      isConfigured: () => true,
      async sendVerificationEmail(_payload: SendVerificationEmailPayload) {},
      async sendOtpEmail(payload: SendOtpEmailPayload) {
        otps.push(payload);
      },
      async sendPasswordResetEmail(_payload: SendPasswordResetEmailPayload) {},
    },
  };
}

function createTestConfig(): ServerConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 0,
    appOrigin: 'https://swiftsweeps.example.com',
    trustProxy: 'loopback',
    databaseUrl:
      'postgres://staging_user:not_a_real_secret@127.0.0.1:5432/staging_db',
    pgPoolMax: 5,
    pgPoolMin: 0,
    pgIdleTimeoutMs: 10_000,
    pgConnectionTimeoutMs: 2_000,
    pgStatementTimeoutMs: 5_000,
    pgSslMode: 'disable',
    requestBodyLimit: '1mb',
    requestBodyLimitBytes: 1024 * 1024,
    logLevel: 'error',
    shutdownTimeoutMs: 2_000,
    authSecret: 'test-auth-secret-value-at-least-32-chars-9988',
    authCookiePrefix: 'swiftsweeps_auth',
    authSessionExpiresInSec: 604_800,
    authSessionUpdateAgeSec: 86_400,
    authSessionFreshAgeSec: 900,
    authRequireEmailVerification: true,
    authRateLimitEnabled: false,
    authRateLimitWindowSec: 60,
    authRateLimitMax: 100,
    emailProvider: 'smtp',
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'smtp-user',
    smtpPass: 'smtp-pass',
    emailFromAddress: 'no-reply@swiftsweeps.example.com',
    emailFromName: 'SwiftSweeps',
  };
}

interface TelegramCallLog {
  url: string;
  body?: Record<string, unknown>;
}

async function withAppConfigServer(
  run: (ctx: {
    baseUrl: string;
    db: InMemoryAppConfigDatabase;
    otps: SendOtpEmailPayload[];
    telegramCalls: TelegramCallLog[];
    infoLogs: Array<Record<string, unknown>>;
    getNowMs: () => number;
    setNowMs: (ms: number) => void;
    setTelegramResponder: (
      fn: (
        url: string,
        body?: Record<string, unknown>,
      ) => Promise<Record<string, unknown>> | Record<string, unknown>,
    ) => void;
  }) => Promise<void>,
): Promise<void> {
  const db = new InMemoryAppConfigDatabase();
  const { adapter, otps } = createCaptureEmailAdapter();
  const telegramCalls: TelegramCallLog[] = [];
  const infoLogs: Array<Record<string, unknown>> = [];
  let currentNowMs = Date.parse('2026-11-27T12:00:00.000Z');
  let responder: (
    url: string,
    body?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>> | Record<string, unknown> = (url) => {
    if (url.endsWith('/getMe')) {
      return { ok: true, result: { username: 'swiftsweeps_support_bot' } };
    }
    return { ok: true, result: { message_id: 1 } };
  };

  const telegramFetchOverride: TelegramFetchFn = async (url, init) => {
    const parsedBody =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    telegramCalls.push({ url, body: parsedBody });
    const payload = await responder(url, parsedBody);
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    };
  };

  const authMemoryDb = {
    ba_user: [],
    ba_session: [],
    ba_account: [],
    ba_verification: [],
    ba_rate_limit: [],
  };

  const app = createApiApp({
    config: createTestConfig(),
    logger: createLogger({
      level: 'info',
      writeStdout: (line) => {
        try {
          infoLogs.push(JSON.parse(line) as Record<string, unknown>);
        } catch {
          // ignore non-json
        }
      },
      writeStderr: () => {},
    }),
    pool: db,
    authDatabaseOverride: memoryAdapter(authMemoryDb),
    emailDeliveryOverride: adapter,
    telegramFetchOverride,
    telegramNowFnOverride: () => currentNowMs,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    await run({
      baseUrl,
      db,
      otps,
      telegramCalls,
      infoLogs,
      getNowMs: () => currentNowMs,
      setNowMs: (ms: number) => {
        currentNowMs = ms;
      },
      setTelegramResponder: (fn) => {
        responder = fn;
      },
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function extractCookies(res: Response): string {
  const getSetCookie = (
    res.headers as unknown as { getSetCookie?: () => string[] }
  ).getSetCookie;
  const raw =
    typeof getSetCookie === 'function' ? getSetCookie.call(res.headers) : [];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

async function signupAndSignIn(
  baseUrl: string,
  otps: SendOtpEmailPayload[],
  params: { name: string; email: string; password: string },
): Promise<{ cookie: string; userId: string }> {
  const signUpRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      Origin: 'https://swiftsweeps.example.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  assert.equal(signUpRes.status, 200);

  const otpEntry = [...otps]
    .reverse()
    .find((o) => o.to === params.email.toLowerCase());
  assert.ok(otpEntry?.otp, 'Expected OTP email for signup');

  const verifyRes = await fetch(`${baseUrl}/api/auth/email-otp/verify-email`, {
    method: 'POST',
    headers: {
      Origin: 'https://swiftsweeps.example.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email.toLowerCase(),
      otp: otpEntry.otp,
    }),
  });
  assert.equal(verifyRes.status, 200);

  const signInRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      Origin: 'https://swiftsweeps.example.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email.toLowerCase(),
      password: params.password,
    }),
  });
  assert.equal(signInRes.status, 200);
  const cookie = extractCookies(signInRes);
  assert.ok(cookie.length > 0);

  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  assert.equal(meRes.status, 200);
  const meJson = (await meRes.json()) as { user: { id: string } };
  return { cookie, userId: meJson.user.id };
}

function seedConfiguredAppConfig(db: InMemoryAppConfigDatabase): void {
  db.appConfigRow = {
    id: 'main',
    updated_at: new Date('2026-11-20T12:00:00.000Z'),
    data: {
      currency: 'USD',
      paymentMethods: [
        {
          id: 'pm_cashapp',
          name: 'Direct CashApp',
          type: 'cashapp',
          enabled: true,
          feePercentage: 0,
          bonusPercentage: 15,
          instructions: 'Send to $SwiftCash',
          forwardUrl: 'https://cash.app/$SwiftCash',
        },
      ],
      withdrawalMethods: [
        {
          id: 'wm_cashapp',
          name: 'CashApp Payout',
          type: 'cashapp',
          enabled: true,
          minAmount: 30,
          maxAmount: 2500,
          feeFlat: 0,
          feePercentage: 0,
          processingTimeHours: 1,
        },
      ],
      cashoutFeed: {
        enabled: true,
        minAmount: 50,
        maxAmount: 250,
        intervalSeconds: 6,
        timeWindowHours: 2,
        probableAmounts: [50, 100, 150, 200],
        namesPool: ['Apex_Player', 'Lucky_Ace'],
        displayLocations: {
          customerHome: true,
          withdrawalPage: true,
          walletPage: true,
        },
      },
      platformRules: {
        depositTerms: 'Verify before upload.',
      },
      policies: {
        cashoutPolicyHtml: '<p>24/7 payouts.</p>',
        supportedPartners: [{ name: 'ShouldNotLeakHere' }],
      },
      wheelOfLuck: {
        enabled: true,
        dailyFreeSpins: 1,
      },
      referralProgram: {
        enabled: true,
        referrerRewardValue: 25,
      },
      push_subscriptions: {
        stale: true,
      },
      supportedPartners: [{ name: 'LegacyRoot' }],
      telegram: {
        botToken: '7123456789:AAHkSecretTokenValue998877',
        channelId: '-1004339845768',
        enabled: true,
        mode: 'zero-egress-notification',
        updatedAt: '2026-11-20T12:00:00.000Z',
        lastNotifiedByConv: { conv_old: 1000 },
      },
    },
  };
}

test('app-config: public GET handles empty config and strips telegram, push_subscriptions, and supportedPartners when populated', async () => {
  await withAppConfigServer(async ({ baseUrl, db }) => {
    // 1. Empty state
    const emptyRes = await fetch(`${baseUrl}/api/app-config`);
    assert.equal(emptyRes.status, 200);
    const emptyJson = (await emptyRes.json()) as {
      success: boolean;
      config: Record<string, unknown> | null;
      updatedAt: string | null;
    };
    assert.equal(emptyJson.success, true);
    assert.equal(emptyJson.config, null);
    assert.equal(emptyJson.updatedAt, null);

    // 2. Populated state must never leak telegram secrets or deprecated root keys
    seedConfiguredAppConfig(db);
    const res = await fetch(`${baseUrl}/api/app-config`);
    assert.equal(res.status, 200);
    const bodyText = await res.text();
    assert.ok(!bodyText.includes('7123456789:AAHkSecretTokenValue998877'));
    assert.ok(!bodyText.includes('-1004339845768'));

    const json = JSON.parse(bodyText) as {
      success: boolean;
      config: Record<string, unknown>;
    };
    assert.equal(json.success, true);
    assert.equal(json.config.currency, 'USD');
    assert.equal(json.config.telegram, undefined);
    assert.equal(json.config.push_subscriptions, undefined);
    assert.equal(json.config.supportedPartners, undefined);
    assert.equal(
      (json.config.policies as Record<string, unknown>).supportedPartners,
      undefined,
    );
  });
});

test('app-config: GET /api/admin/app-config enforces auth/role and returns only masked telegram metadata', async () => {
  await withAppConfigServer(async ({ baseUrl, db, otps }) => {
    seedConfiguredAppConfig(db);

    const anonRes = await fetch(`${baseUrl}/api/admin/app-config`);
    assert.equal(anonRes.status, 401);

    const customer = await signupAndSignIn(baseUrl, otps, {
      name: 'Customer Viewer',
      email: 'cust-cfg@example.com',
      password: 'Password!123',
    });
    const custRes = await fetch(`${baseUrl}/api/admin/app-config`, {
      headers: { Cookie: customer.cookie },
    });
    assert.equal(custRes.status, 403);

    const agent = await signupAndSignIn(baseUrl, otps, {
      name: 'Agent Viewer',
      email: 'agent-cfg@example.com',
      password: 'Password!123',
    });
    db.users.get(agent.userId)!.role = 'agent';
    const agentRes = await fetch(`${baseUrl}/api/admin/app-config`, {
      headers: { Cookie: agent.cookie },
    });
    assert.equal(agentRes.status, 403);

    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Admin Viewer',
      email: 'admin-cfg@example.com',
      password: 'Password!123',
    });
    db.users.get(admin.userId)!.role = 'admin';

    const adminRes = await fetch(`${baseUrl}/api/admin/app-config`, {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(adminRes.status, 200);
    const raw = await adminRes.text();
    assert.ok(!raw.includes('7123456789:AAHkSecretTokenValue998877'));

    const json = JSON.parse(raw) as {
      success: boolean;
      config: { telegram?: Record<string, unknown> };
    };
    assert.equal(json.success, true);
    assert.equal(json.config.telegram?.tokenConfigured, true);
    assert.equal(json.config.telegram?.channelId, '-1004339845768');
    assert.equal(json.config.telegram?.maskedToken, '71234...998877');
    assert.equal(json.config.telegram?.botToken, undefined);
  });
});

const TRUSTED_ORIGIN = 'https://swiftsweeps.example.com';

test('app-config: PUT /api/admin/app-config enforces RBAC, CSRF Origin, rejects privileged/invalid payloads, preserves domain slices, and audits writes', async () => {
  await withAppConfigServer(async ({ baseUrl, db, otps }) => {
    seedConfiguredAppConfig(db);

    const customer = await signupAndSignIn(baseUrl, otps, {
      name: 'Customer Writer',
      email: 'cust-write@example.com',
      password: 'Password!123',
    });
    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Super Admin',
      email: 'admin-write@example.com',
      password: 'Password!123',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // 0. Cookie-authenticated mutation without Origin is blocked by CSRF guard
    const csrfRes = await fetch(`${baseUrl}/api/admin/app-config`, {
      method: 'PUT',
      headers: {
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ currency: 'USD' }),
    });
    assert.equal(csrfRes.status, 403);

    // 1. Anonymous & non-admin blocked
    const anonPut = await fetch(`${baseUrl}/api/admin/app-config`, {
      method: 'PUT',
      headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency: 'USD' }),
    });
    assert.equal(anonPut.status, 401);

    const custPut = await fetch(`${baseUrl}/api/admin/app-config`, {
      method: 'PUT',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: customer.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ currency: 'USD' }),
    });
    assert.equal(custPut.status, 403);

    // 2. Rejects privileged keys (telegram, wheelOfLuck, referralProgram, actorRole) with 403
    for (const forbidden of ['telegram', 'wheelOfLuck', 'referralProgram', 'actorRole']) {
      const forbidRes = await fetch(`${baseUrl}/api/admin/app-config`, {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currency: 'USD',
          [forbidden]: { tampered: true },
        }),
      });
      assert.equal(forbidRes.status, 403, `Expected 403 for ${forbidden}`);
    }

    // 3. Rejects invalid cashoutFeed bounds & invalid javascript: forwardUrl
    const badRangeRes = await fetch(`${baseUrl}/api/admin/app-config`, {
      method: 'PUT',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cashoutFeed: { minAmount: 300, maxAmount: 100, intervalSeconds: 6 },
      }),
    });
    assert.equal(badRangeRes.status, 400);

    const badUrlRes = await fetch(`${baseUrl}/api/admin/app-config`, {
      method: 'PUT',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentMethods: [
          {
            id: 'pm_link',
            name: 'Link',
            type: 'payment_link',
            enabled: true,
            bonusPercentage: 10,
            forwardUrl: 'javascript:alert(1)',
          },
        ],
      }),
    });
    assert.equal(badUrlRes.status, 400);

    // 4. Valid update persists changes, preserves telegram/wheelOfLuck/referralProgram, and records audit log
    const okRes = await fetch(`${baseUrl}/api/admin/app-config`, {
      method: 'PUT',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        currency: 'usd',
        paymentMethods: [
          {
            id: 'pm_cashapp',
            name: 'Direct CashApp VIP',
            type: 'cashapp',
            enabled: true,
            bonusPercentage: 25,
            feePercentage: 0,
            forwardUrl: 'https://cash.app/$SwiftVip',
          },
        ],
        cashoutFeed: {
          enabled: true,
          minAmount: 60,
          maxAmount: 240,
          intervalSeconds: 8,
          probableAmounts: [60, 120, 180],
          namesPool: ['VIP_One', 'VIP_Two'],
        },
        platformRules: {
          depositTerms: 'Updated verified rules.',
        },
      }),
    });
    assert.equal(okRes.status, 200);
    const okJson = (await okRes.json()) as {
      success: boolean;
      config: Record<string, unknown>;
    };
    assert.equal(okJson.success, true);
    assert.equal(okJson.config.currency, 'USD');

    // Stored DB still retains telegram, wheelOfLuck, referralProgram
    assert.equal(
      (db.appConfigRow?.data.telegram as Record<string, unknown>).botToken,
      '7123456789:AAHkSecretTokenValue998877',
    );
    assert.equal(
      (db.appConfigRow?.data.wheelOfLuck as Record<string, unknown>).enabled,
      true,
    );
    assert.equal(
      (db.appConfigRow?.data.referralProgram as Record<string, unknown>)
        .referrerRewardValue,
      25,
    );
    assert.ok(
      db.auditLogs.some(
        (a) =>
          a.action === 'APP_CONFIG_UPDATED' &&
          a.actor_id === admin.userId &&
          a.entity_type === 'settings',
      ),
    );
  });
});

test('app-config: PATCH /api/admin/app-config/policies validates XSS payloads, saves CMS policies, and rolls back on DB failure', async () => {
  await withAppConfigServer(async ({ baseUrl, db, otps }) => {
    seedConfiguredAppConfig(db);

    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'CMS Admin',
      email: 'cms-admin@example.com',
      password: 'Password!123',
    });
    db.users.get(admin.userId)!.role = 'admin';

    const xssRes = await fetch(`${baseUrl}/api/admin/app-config/policies`, {
      method: 'PATCH',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cashoutPolicyHtml: '<p>Valid</p><script>alert(1)</script>',
      }),
    });
    assert.equal(xssRes.status, 400);

    // Simulated audit write failure must roll back app_config change
    db.failNextQueryOn = 'audit_logs';
    const failRes = await fetch(`${baseUrl}/api/admin/app-config/policies`, {
      method: 'PATCH',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cashoutPolicyHtml: '<p>Should Rollback</p>',
      }),
    });
    assert.equal(failRes.status, 500);
    assert.equal(
      (db.appConfigRow?.data.policies as Record<string, unknown>)
        .cashoutPolicyHtml,
      '<p>24/7 payouts.</p>',
    );

    // Valid CMS update succeeds and audits
    const okRes = await fetch(`${baseUrl}/api/admin/app-config/policies`, {
      method: 'PATCH',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cashoutPolicyHtml: '<p>Fast 15-minute VIP payouts.</p>',
        termsPolicyHtml: '<p>Must be 21+.</p>',
      }),
    });
    assert.equal(okRes.status, 200);
    const okJson = (await okRes.json()) as {
      success: boolean;
      policies: Record<string, unknown>;
    };
    assert.equal(okJson.success, true);
    assert.equal(
      okJson.policies.cashoutPolicyHtml,
      '<p>Fast 15-minute VIP payouts.</p>',
    );
    assert.ok(
      db.auditLogs.some((a) => a.action === 'CMS_POLICIES_UPDATED'),
    );
  });
});

test('faked_cashouts: public GET supports empty state, strict pagination/bounds, ordering, and exact numeric formatting', async () => {
  await withAppConfigServer(async ({ baseUrl, db }) => {
    // 1. Empty state
    const emptyRes = await fetch(`${baseUrl}/api/faked-cashouts`);
    assert.equal(emptyRes.status, 200);
    const emptyJson = (await emptyRes.json()) as {
      success: boolean;
      items: unknown[];
      total: number;
      hasMore: boolean;
    };
    assert.equal(emptyJson.success, true);
    assert.deepEqual(emptyJson.items, []);
    assert.equal(emptyJson.total, 0);
    assert.equal(emptyJson.hasMore, false);

    // 2. Invalid query params rejected
    const badLimitRes = await fetch(`${baseUrl}/api/faked-cashouts?limit=51`);
    assert.equal(badLimitRes.status, 400);
    const badOffsetRes = await fetch(`${baseUrl}/api/faked-cashouts?offset=-1`);
    assert.equal(badOffsetRes.status, 400);
    const unknownParamRes = await fetch(`${baseUrl}/api/faked-cashouts?sort=evil`);
    assert.equal(unknownParamRes.status, 400);

    // 3. Seed 3 entries with explicit timestamps and fractional cents
    db.fakedCashouts.set('fc_1', {
      id: 'fc_1',
      customer_name: 'OldestPlayer',
      amount: '75.25',
      currency: 'USD',
      method_name: 'CashApp',
      game_name: 'Orion Stars',
      is_fake: true,
      timestamp: new Date('2026-11-20T10:00:00.000Z'),
    });
    db.fakedCashouts.set('fc_2', {
      id: 'fc_2',
      customer_name: 'MiddlePlayer',
      amount: '125.50',
      currency: 'USD',
      method_name: 'Chime',
      game_name: 'Fire Kirin',
      is_fake: true,
      timestamp: new Date('2026-11-20T11:00:00.000Z'),
    });
    db.fakedCashouts.set('fc_3', {
      id: 'fc_3',
      customer_name: 'NewestPlayer',
      amount: '240.00',
      currency: 'USD',
      method_name: 'Crypto BTC',
      game_name: 'Game Vault',
      is_fake: true,
      timestamp: new Date('2026-11-20T12:00:00.000Z'),
    });

    const page1Res = await fetch(`${baseUrl}/api/faked-cashouts?limit=2&offset=0`);
    assert.equal(page1Res.status, 200);
    const page1 = (await page1Res.json()) as {
      items: Array<{ id: string; amount: number; methodName: string }>;
      total: number;
      hasMore: boolean;
    };
    assert.equal(page1.total, 3);
    assert.equal(page1.hasMore, true);
    assert.deepEqual(
      page1.items.map((i) => i.id),
      ['fc_3', 'fc_2'],
    );
    assert.equal(page1.items[1]!.amount, 125.5);

    const page2Res = await fetch(`${baseUrl}/api/faked-cashouts?limit=2&offset=2`);
    assert.equal(page2Res.status, 200);
    const page2 = (await page2Res.json()) as {
      items: Array<{ id: string }>;
      total: number;
      hasMore: boolean;
    };
    assert.equal(page2.hasMore, false);
    assert.deepEqual(
      page2.items.map((i) => i.id),
      ['fc_1'],
    );
  });
});

test('faked_cashouts: admin create, reseed, delete enforce RBAC, validation, 404, atomic rollback, and audit logs', async () => {
  await withAppConfigServer(async ({ baseUrl, db, otps }) => {
    const customer = await signupAndSignIn(baseUrl, otps, {
      name: 'Customer Feed',
      email: 'cust-feed@example.com',
      password: 'Password!123',
    });
    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Admin Feed',
      email: 'admin-feed@example.com',
      password: 'Password!123',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // 1. Anonymous & non-admin blocked
    assert.equal(
      (
        await fetch(`${baseUrl}/api/admin/faked-cashouts`, {
          method: 'POST',
          headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: 'AnonAttempt',
            amount: 100,
            methodName: 'CashApp',
            gameName: 'Fire Kirin',
          }),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/admin/faked-cashouts`, {
          method: 'POST',
          headers: {
            Origin: TRUSTED_ORIGIN,
            Cookie: customer.cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customerName: 'CustAttempt',
            amount: 100,
            methodName: 'CashApp',
            gameName: 'Fire Kirin',
          }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/admin/faked-cashouts/reseed`, {
          method: 'POST',
          headers: {
            Origin: TRUSTED_ORIGIN,
            Cookie: customer.cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ items: [] }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/admin/faked-cashouts/fc_missing`, {
          method: 'DELETE',
          headers: { Origin: TRUSTED_ORIGIN, Cookie: customer.cookie },
        })
      ).status,
      403,
    );

    // 2. Invalid create / reseed payloads rejected with 400
    assert.equal(
      (
        await fetch(`${baseUrl}/api/admin/faked-cashouts`, {
          method: 'POST',
          headers: {
            Origin: TRUSTED_ORIGIN,
            Cookie: admin.cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customerName: 'BadAmount',
            amount: -10,
            methodName: 'CashApp',
            gameName: 'Fire Kirin',
          }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/admin/faked-cashouts/reseed`, {
          method: 'POST',
          headers: {
            Origin: TRUSTED_ORIGIN,
            Cookie: admin.cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ items: [] }),
        })
      ).status,
      400,
    );

    // 3. Create single entry
    const createRes = await fetch(`${baseUrl}/api/admin/faked-cashouts`, {
      method: 'POST',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerName: 'LuckyPlayer_1',
        amount: 149.95,
        currency: 'USD',
        methodName: 'Verified CashApp',
        gameName: 'Orion Stars Elite',
        isFake: true,
      }),
    });
    assert.equal(createRes.status, 201);
    const createdJson = (await createRes.json()) as {
      success: boolean;
      item: { id: string; amount: number };
    };
    assert.equal(createdJson.success, true);
    assert.equal(createdJson.item.amount, 149.95);

    // 4. Atomic rollback on reseed if audit insert fails (prior entry must survive)
    db.failNextQueryOn = 'audit_logs';
    const failedReseed = await fetch(
      `${baseUrl}/api/admin/faked-cashouts/reseed`,
      {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              customerName: 'ShouldRollback',
              amount: 200,
              currency: 'USD',
              methodName: 'Chime',
              gameName: 'Fire Kirin',
              isFake: true,
            },
          ],
        }),
      },
    );
    assert.equal(failedReseed.status, 500);
    assert.equal(db.fakedCashouts.size, 1);
    assert.ok(db.fakedCashouts.has(createdJson.item.id));

    // 5. Reseed succeeds cleanly and replaces old rows
    const reseedRes = await fetch(
      `${baseUrl}/api/admin/faked-cashouts/reseed`,
      {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              customerName: 'SeedOne',
              amount: 120,
              currency: 'USD',
              methodName: 'Chime Direct',
              gameName: 'Game Vault 999',
              isFake: true,
              timestamp: '2026-11-21T09:00:00.000Z',
            },
            {
              customerName: 'SeedTwo',
              amount: 185.5,
              currency: 'USD',
              methodName: 'Crypto USDT',
              gameName: 'Panda Master Pro',
              isFake: true,
              timestamp: '2026-11-21T10:00:00.000Z',
            },
          ],
        }),
      },
    );
    assert.equal(reseedRes.status, 200);
    const reseedJson = (await reseedRes.json()) as {
      success: boolean;
      items: Array<{ id: string }>;
      total: number;
    };
    assert.equal(reseedJson.success, true);
    assert.equal(reseedJson.total, 2);
    assert.equal(db.fakedCashouts.size, 2);

    // 6. Delete existing + 404 on missing
    const targetId = reseedJson.items[0]!.id;
    const delRes = await fetch(
      `${baseUrl}/api/admin/faked-cashouts/${targetId}`,
      {
        method: 'DELETE',
        headers: { Origin: TRUSTED_ORIGIN, Cookie: admin.cookie },
      },
    );
    assert.equal(delRes.status, 200);
    assert.equal(db.fakedCashouts.size, 1);

    const delMissing = await fetch(
      `${baseUrl}/api/admin/faked-cashouts/${targetId}`,
      {
        method: 'DELETE',
        headers: { Origin: TRUSTED_ORIGIN, Cookie: admin.cookie },
      },
    );
    assert.equal(delMissing.status, 404);
    assert.ok(db.auditLogs.some((a) => a.action === 'FAKED_CASHOUT_CREATED'));
    assert.ok(db.auditLogs.some((a) => a.action === 'FAKED_CASHOUT_RESEEDED'));
    assert.ok(db.auditLogs.some((a) => a.action === 'FAKED_CASHOUT_DELETED'));
  });
});

test('telegram: admin config/status/test protect botToken and authenticated alerts derive actor identity & enforce cooldown', async () => {
  await withAppConfigServer(async ({ baseUrl, db, otps, telegramCalls }) => {
    const customer = await signupAndSignIn(baseUrl, otps, {
      name: 'Alice Player',
      email: 'alice-tg@example.com',
      password: 'Password!123',
    });
    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Telegram Admin',
      email: 'admin-tg@example.com',
      password: 'Password!123',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // 1. Anonymous and customer rejected from admin telegram endpoints
    assert.equal((await fetch(`${baseUrl}/api/telegram/status`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/telegram/config`)).status, 401);
    assert.equal(
      (
        await fetch(`${baseUrl}/api/telegram/config`, {
          headers: { Cookie: customer.cookie },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/telegram/test`, {
          method: 'POST',
          headers: {
            Origin: TRUSTED_ORIGIN,
            Cookie: customer.cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ channelId: '-100111' }),
        })
      ).status,
      403,
    );

    // 2. Admin saves telegram config; raw token never echoes back
    const saveRes = await fetch(`${baseUrl}/api/telegram/config`, {
      method: 'POST',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        botToken: '9876543210:AAHiddenSecretToken12345',
        channelId: '-100444555666',
        enabled: true,
      }),
    });
    assert.equal(saveRes.status, 200);
    const saveText = await saveRes.text();
    assert.ok(!saveText.includes('9876543210:AAHiddenSecretToken12345'));
    const saveJson = JSON.parse(saveText) as {
      success: boolean;
      config: { tokenConfigured: boolean; maskedToken: string };
    };
    assert.equal(saveJson.success, true);
    assert.equal(saveJson.config.tokenConfigured, true);
    assert.equal(saveJson.config.maskedToken, '98765...n12345');

    // 3. Admin GET /config & /status redact token, and POST /test succeeds using stored token when omitted
    const cfgRes = await fetch(`${baseUrl}/api/telegram/config`, {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(cfgRes.status, 200);
    const cfgRaw = await cfgRes.text();
    assert.ok(!cfgRaw.includes('9876543210:AAHiddenSecretToken12345'));

    const statusRes = await fetch(`${baseUrl}/api/telegram/status`, {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(statusRes.status, 200);
    const statusJson = (await statusRes.json()) as {
      botUsername: string;
      tokenConfigured: boolean;
    };
    assert.equal(statusJson.botUsername, 'swiftsweeps_support_bot');
    assert.equal(statusJson.tokenConfigured, true);

    const testStoredRes = await fetch(`${baseUrl}/api/telegram/test`, {
      method: 'POST',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channelId: '-100444555666' }),
    });
    assert.equal(testStoredRes.status, 200);
    const testStoredJson = (await testStoredRes.json()) as {
      success: boolean;
    };
    assert.equal(testStoredJson.success, true);

    // 4. Customer notify endpoints reject anonymous and derive actor identity server-side + enforce cooldown
    assert.equal(
      (
        await fetch(`${baseUrl}/api/telegram/notify-message`, {
          method: 'POST',
          headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerName: 'Spoofed' }),
        })
      ).status,
      401,
    );

    const beforeCount = telegramCalls.length;
    const msgRes1 = await fetch(`${baseUrl}/api/telegram/notify-message`, {
      method: 'POST',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: customer.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerName: 'Spoofed Name',
        conversationId: 'conv_other_user',
      }),
    });
    assert.equal(msgRes1.status, 200);
    const msgJson1 = (await msgRes1.json()) as { success: boolean };
    assert.equal(msgJson1.success, true);
    assert.equal(telegramCalls.length, beforeCount + 1);
    assert.equal(
      telegramCalls[telegramCalls.length - 1]!.body?.text,
      '💬 New message from Alice Player',
    );

    // Immediate second notify-message from same customer hits persisted 60s cooldown
    const msgRes2 = await fetch(`${baseUrl}/api/telegram/notify-message`, {
      method: 'POST',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: customer.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customerName: 'Alice Player' }),
    });
    assert.equal(msgRes2.status, 200);
    const msgJson2 = (await msgRes2.json()) as {
      success: boolean;
      debounced?: boolean;
    };
    assert.equal(msgJson2.success, true);
    assert.equal(msgJson2.debounced, true);
    assert.equal(telegramCalls.length, beforeCount + 1);
  });
});

test('app-config & telegram: reject XSS bypass vectors in policies/platformRules and scrub botToken from telegram status errors', async () => {
  await withAppConfigServer(
    async ({ baseUrl, db, otps, setTelegramResponder }) => {
      seedConfiguredAppConfig(db);

      const admin = await signupAndSignIn(baseUrl, otps, {
        name: 'Security Admin',
        email: 'sec-admin@example.com',
        password: 'Password!123',
      });
      db.users.get(admin.userId)!.role = 'admin';

      // 1. Disallowed tags / attributes in policies.cashoutPolicyHtml rejected with 400
      for (const badHtml of [
        '<svg/onload=alert(1)>',
        '<p><img src=x onerror=alert(1)></p>',
        '<p onclick="alert(1)">Click</p>',
        '<p>data:text/html,<script>alert(1)</script></p>',
      ]) {
        const res = await fetch(`${baseUrl}/api/admin/app-config/policies`, {
          method: 'PATCH',
          headers: {
            Origin: TRUSTED_ORIGIN,
            Cookie: admin.cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cashoutPolicyHtml: badHtml }),
        });
        assert.equal(res.status, 400, `Expected 400 for ${badHtml}`);
      }

      // 2. Disallowed HTML constructs in platformRules rejected with 400, while plain comparisons and safe formatting pass
      const badRuleRes = await fetch(`${baseUrl}/api/admin/app-config`, {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platformRules: {
            depositTerms: '<p><img src=x onerror=alert(1)></p>',
          },
        }),
      });
      assert.equal(badRuleRes.status, 400);

      const safeRuleRes = await fetch(`${baseUrl}/api/admin/app-config`, {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platformRules: {
            depositTerms: 'Deposits < $50 require verification.',
            withdrawalPolicy: '<p>Processed within <strong>15 minutes</strong>.</p>',
          },
        }),
      });
      assert.equal(safeRuleRes.status, 200);

      // 3. Telegram status redacts botToken even if fetch throws a URL-annotated error
      const tgSecret = '9876543210:AAHiddenSecretToken12345';
      await fetch(`${baseUrl}/api/telegram/config`, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          botToken: tgSecret,
          channelId: '-100444555666',
          enabled: true,
        }),
      });

      setTelegramResponder((url) => {
        throw new Error(`request to ${url} failed, reason: ECONNREFUSED`);
      });

      const statusErrRes = await fetch(`${baseUrl}/api/telegram/status`, {
        headers: { Cookie: admin.cookie },
      });
      assert.equal(statusErrRes.status, 200);
      const rawStatusErr = await statusErrRes.text();
      assert.ok(!rawStatusErr.includes(tgSecret));
      assert.ok(!rawStatusErr.includes('AAHiddenSecretToken12345'));
      const parsedErr = JSON.parse(rawStatusErr) as { lastError?: string };
      assert.match(parsedErr.lastError || '', /\[REDACTED\]/);
    },
  );
});

test('telegram suppression: supports configurable windows, outbound sent_at tracking, failed-send non-suppression, customer isolation, concurrency safety, and non-PII logs', async () => {
  await withAppConfigServer(
    async ({
      baseUrl,
      db,
      otps,
      telegramCalls,
      infoLogs,
      getNowMs,
      setNowMs,
      setTelegramResponder,
    }) => {
      const alice = await signupAndSignIn(baseUrl, otps, {
        name: 'Alice Player',
        email: 'alice-suppress@example.com',
        password: 'Password!123',
      });
      const bob = await signupAndSignIn(baseUrl, otps, {
        name: 'Bob Player',
        email: 'bob-suppress@example.com',
        password: 'Password!123',
      });
      const admin = await signupAndSignIn(baseUrl, otps, {
        name: 'Suppression Admin',
        email: 'admin-suppress@example.com',
        password: 'Password!123',
      });
      db.users.get(admin.userId)!.role = 'admin';

      // 1. Validation rejects out-of-range or non-integer suppressionWindowMinutes
      const invalidWindowRes = await fetch(`${baseUrl}/api/telegram/config`, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          botToken: '1234567890:AATestSuppressionToken999',
          channelId: '-100555666777',
          enabled: true,
          suppressionWindowMinutes: -5,
        }),
      });
      assert.equal(invalidWindowRes.status, 400);

      // 2. Admin saves configurable 10-minute suppression period
      const save10Res = await fetch(`${baseUrl}/api/telegram/config`, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          botToken: '1234567890:AATestSuppressionToken999',
          channelId: '-100555666777',
          enabled: true,
          suppressionWindowMinutes: 10,
        }),
      });
      assert.equal(save10Res.status, 200);
      const save10Json = (await save10Res.json()) as {
        config: { suppressionWindowMinutes: number };
        status: { suppressionWindowMinutes: number };
      };
      assert.equal(save10Json.config.suppressionWindowMinutes, 10);
      assert.equal(save10Json.status.suppressionWindowMinutes, 10);

      // 3. Failed Telegram delivery does NOT count toward suppression
      setTelegramResponder(() => ({
        ok: false,
        description: 'temporary upstream error',
      }));
      const failedRes = await fetch(`${baseUrl}/api/telegram/notify-message`, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: alice.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customerName: 'Alice Player' }),
      });
      assert.equal(failedRes.status, 200);
      assert.equal(((await failedRes.json()) as { success: boolean }).success, false);
      assert.equal(telegramCalls.length, 1);

      // Subsequent attempt for Alice succeeds immediately because failed send was NOT recorded
      // Also advance clock during sendTelegramText to prove recorded timestamp is post-send sentAt, not pre-send processing time
      const tStart = Date.parse('2026-11-27T12:00:00.000Z');
      setNowMs(tStart);
      setTelegramResponder(async () => {
        setNowMs(tStart + 30_000);
        return { ok: true, result: { message_id: 42 } };
      });

      const aliceFirstOk = await fetch(`${baseUrl}/api/telegram/notify-message`, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: alice.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customerName: 'Alice Player' }),
      });
      assert.equal(aliceFirstOk.status, 200);
      assert.equal(((await aliceFirstOk.json()) as { success: boolean }).success, true);
      assert.equal(telegramCalls.length, 2);

      // 4. At tStart + 10m + 5s (which is < 10m after actual sentAt = tStart + 30s, even though > 10m after tStart processing time),
      // Alice is STILL suppressed! (Proves sent_at vs notification-processing timestamp)
      setNowMs(tStart + 10 * 60_000 + 5_000);
      setTelegramResponder(() => ({ ok: true, result: { message_id: 43 } }));
      const aliceSuppressedRes = await fetch(`${baseUrl}/api/telegram/notify-message`, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: alice.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customerName: 'Alice Player' }),
      });
      const aliceSuppressedJson = (await aliceSuppressedRes.json()) as {
        success: boolean;
        suppressed?: boolean;
        debounced?: boolean;
      };
      assert.equal(aliceSuppressedJson.success, true);
      assert.equal(aliceSuppressedJson.suppressed, true);
      assert.equal(aliceSuppressedJson.debounced, true);
      assert.equal(telegramCalls.length, 2);

      // Verify suppression log recorded customerId, reason, and suppressionWindowMinutes WITHOUT PII
      const suppressionLog = infoLogs.find(
        (l) => l.event === 'telegram_notification_suppressed',
      );
      assert.ok(suppressionLog);
      assert.equal(suppressionLog.customerId, alice.userId);
      assert.equal(suppressionLog.suppressionWindowMinutes, 10);
      assert.equal(
        suppressionLog.reason,
        'recent_telegram_notification_sent_within_window',
      );
      assert.ok(!JSON.stringify(suppressionLog).includes('alice-suppress@example.com'));
      assert.ok(!JSON.stringify(suppressionLog).includes('AATestSuppressionToken999'));

      // 5. Independent customer handling: Bob is NOT suppressed by Alice's recent message
      const bobRes = await fetch(`${baseUrl}/api/telegram/notify`, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: bob.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'Submitted cash-in receipt' }),
      });
      assert.equal(bobRes.status, 200);
      assert.equal(((await bobRes.json()) as { success: boolean }).success, true);
      assert.equal(telegramCalls.length, 3);

      // 6. Dynamic config change (10m -> 30m) takes effect without code changes
      await fetch(`${baseUrl}/api/telegram/config`, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: true,
          suppressionWindowMinutes: 30,
        }),
      });
      // Advance to tStart + 20m (past 10m, within 30m) -> Alice STILL suppressed
      setNowMs(tStart + 20 * 60_000);
      const stillSuppressed30 = await fetch(`${baseUrl}/api/telegram/notify`, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: alice.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'Second proof attempt' }),
      });
      assert.equal(((await stillSuppressed30.json()) as { suppressed?: boolean }).suppressed, true);
      assert.equal(telegramCalls.length, 3);

      // Advance to tStart + 31m -> window expired for both Alice & Bob!
      setNowMs(tStart + 31 * 60_000);
      const afterExpireRes = await fetch(`${baseUrl}/api/telegram/notify-message`, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: alice.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customerName: 'Alice Player' }),
      });
      assert.equal(((await afterExpireRes.json()) as { success: boolean; suppressed?: boolean }).suppressed, undefined);
      assert.equal(telegramCalls.length, 4);

      // 7. Reuses existing public.messages outbound sent_at records:
      // Advance far past previous notifications
      const tMsgBase = tStart + 120 * 60_000;
      setNowMs(tMsgBase);
      // Add an old creation timestamp message, plus a failed outbound message, plus a missing sent_at message,
      // and a recent customer-sent message -> NONE of these should suppress!
      db.messages.push(
        {
          id: 'msg_failed_outbound',
          conversation_id: `conv_${bob.userId}`,
          sender_role: 'agent',
          is_internal_note: false,
          delivery_status: 'failed',
          created_at: new Date(tMsgBase - 60_000),
          sent_at: new Date(tMsgBase - 60_000),
        },
        {
          id: 'msg_missing_sent_at',
          conversation_id: `conv_${bob.userId}`,
          sender_role: 'agent',
          is_internal_note: false,
          delivery_status: 'sent',
          created_at: new Date(tMsgBase - 60_000),
          sent_at: null,
        },
        {
          id: 'msg_internal_note',
          conversation_id: `conv_${bob.userId}`,
          sender_role: 'agent',
          is_internal_note: true,
          delivery_status: 'sent',
          created_at: new Date(tMsgBase - 60_000),
          sent_at: new Date(tMsgBase - 60_000),
        },
        {
          id: 'msg_customer_self',
          conversation_id: `conv_${bob.userId}`,
          sender_role: 'customer',
          is_internal_note: false,
          delivery_status: 'sent',
          created_at: new Date(tMsgBase - 60_000),
          sent_at: new Date(tMsgBase - 60_000),
        },
      );

      const bobAllowedRes = await fetch(`${baseUrl}/api/telegram/notify-message`, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: bob.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customerName: 'Bob Player' }),
      });
      assert.equal(((await bobAllowedRes.json()) as { suppressed?: boolean }).suppressed, undefined);
      assert.equal(telegramCalls.length, 5);

      // Now advance 40m and add a successfully sent outbound agent message with old created_at (2h ago)
      // but recent actual sent_at (5m ago, in +05:30 timezone format) -> MUST suppress!
      const tOutboundCheck = tMsgBase + 40 * 60_000;
      setNowMs(tOutboundCheck);
      // 5m before tOutboundCheck expressed as +05:30 offset string
      const fiveMinEarlierMs = tOutboundCheck - 5 * 60_000;
      const offsetDate = new Date(fiveMinEarlierMs + 5.5 * 60 * 60_000);
      const pad2 = (n: number) => String(n).padStart(2, '0');
      const offsetIso = `${offsetDate.getUTCFullYear()}-${pad2(offsetDate.getUTCMonth() + 1)}-${pad2(offsetDate.getUTCDate())}T${pad2(offsetDate.getUTCHours())}:${pad2(offsetDate.getUTCMinutes())}:${pad2(offsetDate.getUTCSeconds())}.000+05:30`;

      db.messages.push({
        id: 'msg_sent_outbound_tz',
        conversation_id: `conv_${bob.userId}`,
        sender_role: 'agent',
        is_internal_note: false,
        delivery_status: 'sent',
        created_at: new Date(tOutboundCheck - 120 * 60_000), // creation time 2h ago
        sent_at: offsetIso, // actual sent time 5m ago
      });

      const bobSuppressedByChatRes = await fetch(`${baseUrl}/api/telegram/notify-message`, {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: bob.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customerName: 'Bob Player' }),
      });
      const bobSuppressedJson = (await bobSuppressedByChatRes.json()) as {
        success: boolean;
        suppressed?: boolean;
      };
      assert.equal(bobSuppressedJson.suppressed, true);
      assert.equal(telegramCalls.length, 5);

      // 8. Concurrency safety: two parallel requests for Alice after window expires send ONLY 1 Telegram message
      const tConcurrent = getNowMs() + 120 * 60_000;
      setNowMs(tConcurrent);
      const beforeConcurrent = telegramCalls.length;
      setTelegramResponder(async () => {
        await new Promise((r) => setTimeout(r, 40));
        return { ok: true, result: { message_id: 99 } };
      });
      const [concA, concB] = await Promise.all([
        fetch(`${baseUrl}/api/telegram/notify-message`, {
          method: 'POST',
          headers: {
            Origin: TRUSTED_ORIGIN,
            Cookie: alice.cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ customerName: 'Alice Player' }),
        }),
        fetch(`${baseUrl}/api/telegram/notify-message`, {
          method: 'POST',
          headers: {
            Origin: TRUSTED_ORIGIN,
            Cookie: alice.cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ customerName: 'Alice Player' }),
        }),
      ]);
      const concJsonA = (await concA.json()) as { success: boolean; suppressed?: boolean };
      const concJsonB = (await concB.json()) as { success: boolean; suppressed?: boolean };
      assert.equal(concJsonA.success, true);
      assert.equal(concJsonB.success, true);
      assert.equal(telegramCalls.length, beforeConcurrent + 1);
      assert.equal(
        [concJsonA.suppressed, concJsonB.suppressed].filter(Boolean).length,
        1,
      );
    },
  );
});

test('app-config: structured cashoutRules backfill, authoritative save, and validation', async () => {
  await withAppConfigServer(async ({ baseUrl, db, otps }) => {
    seedConfiguredAppConfig(db);

    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Cashout Rules Admin',
      email: 'cashout-admin@example.com',
      password: 'Password!123',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // 1. Existing app_config without cashoutRules backfills authoritative defaults on GET /api/app-config
    const initialRes = await fetch(`${baseUrl}/api/app-config`);
    assert.equal(initialRes.status, 200);
    const initialJson = (await initialRes.json()) as {
      success: boolean;
      config: {
        cashoutRules?: {
          enabled: boolean;
          voidExcessWarning: string;
          categories: Array<{ id: string; category: string; maximumLabel: string }>;
        };
      };
    };
    assert.equal(initialJson.success, true);
    assert.equal(initialJson.config.cashoutRules?.enabled, true);
    assert.equal(initialJson.config.cashoutRules?.categories.length, 5);
    assert.equal(
      initialJson.config.cashoutRules?.categories[0]?.category,
      '$10 or more',
    );
    assert.equal(
      initialJson.config.cashoutRules?.categories[3]?.maximumLabel,
      '$15 game credits OR $10 cash',
    );

    // 2. Reject invalid / empty cashoutRules payloads with 400
    const badEmptyCatsRes = await fetch(`${baseUrl}/api/admin/app-config`, {
      method: 'PUT',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cashoutRules: {
          enabled: true,
          title: 'Cashout Limits',
          subtitle: 'Updated rules',
          voidExcessWarning: 'Any excess will be voided.',
          categories: [],
        },
      }),
    });
    assert.equal(badEmptyCatsRes.status, 400);

    const badKindRes = await fetch(`${baseUrl}/api/admin/app-config`, {
      method: 'PUT',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cashoutRules: {
          enabled: true,
          title: 'Cashout Limits',
          subtitle: 'Updated rules',
          voidExcessWarning: 'Any excess will be voided.',
          categories: [
            {
              id: 'tier_1',
              category: 'Test',
              kind: 'invalid_kind',
              conditionLabel: 'Deposit range',
              minimumLabel: '$10',
              maximumLabel: '$20',
            },
          ],
        },
      }),
    });
    assert.equal(badKindRes.status, 400);

    // 3. Valid update saves custom cashoutRules and returns it publicly
    const validRes = await fetch(`${baseUrl}/api/admin/app-config`, {
      method: 'PUT',
      headers: {
        Origin: TRUSTED_ORIGIN,
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cashoutRules: {
          enabled: true,
          title: 'Cashout & Redemption Limits',
          subtitle: 'Authoritative tier limits.',
          voidExcessWarning:
            'Any amount exceeding the applicable maximum cashout will be voided.',
          categories: [
            {
              id: 'tier_10_or_more',
              category: '$10 or more',
              kind: 'deposit_range',
              conditionLabel: 'Deposit range',
              minimumLabel: '5× (load + bonus)',
              maximumLabel: '15× (load + bonus)',
            },
            {
              id: 'tier_5_to_9',
              category: '$5–$9',
              kind: 'deposit_range',
              conditionLabel: 'Deposit range',
              minimumLabel: '$30',
              maximumLabel: '$65',
            },
          ],
        },
      }),
    });
    assert.equal(validRes.status, 200);

    const publicAfterRes = await fetch(`${baseUrl}/api/app-config`);
    assert.equal(publicAfterRes.status, 200);
    const publicAfterJson = (await publicAfterRes.json()) as {
      config: {
        cashoutRules: {
          categories: Array<{ id: string; maximumLabel: string }>;
        };
      };
    };
    assert.equal(publicAfterJson.config.cashoutRules.categories.length, 2);
    assert.equal(
      publicAfterJson.config.cashoutRules.categories[1]?.maximumLabel,
      '$65',
    );
  });
});

