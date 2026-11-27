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

class InMemoryAppConfigDatabase
  implements Pick<DatabasePool, 'query' | 'connect'>
{
  public readonly users = new Map<string, InMemoryUserRow>();
  public readonly authLinks = new Map<string, InMemoryAuthLinkRow>();
  public auditLogs: InMemoryAuditRow[] = [];
  public appConfigRow: InMemoryAppConfigRow | null = null;
  public fakedCashouts = new Map<string, InMemoryFakedCashoutRow>();
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
    setTelegramResponder: (
      fn: (url: string, body?: Record<string, unknown>) => Record<string, unknown>,
    ) => void;
  }) => Promise<void>,
): Promise<void> {
  const db = new InMemoryAppConfigDatabase();
  const { adapter, otps } = createCaptureEmailAdapter();
  const telegramCalls: TelegramCallLog[] = [];
  let responder: (
    url: string,
    body?: Record<string, unknown>,
  ) => Record<string, unknown> = (url) => {
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
    const payload = responder(url, parsedBody);
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
      level: 'error',
      writeStdout: () => {},
      writeStderr: () => {},
    }),
    pool: db,
    authDatabaseOverride: memoryAdapter(authMemoryDb),
    emailDeliveryOverride: adapter,
    telegramFetchOverride,
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
