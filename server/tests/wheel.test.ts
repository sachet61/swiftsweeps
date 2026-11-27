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

interface InMemoryWheelSpinRow {
  id: string;
  customer_id: string;
  segment_id: string;
  segment_label: string;
  reward_amount: string;
  simulated_win_amount: string;
  probability_weight: string;
  idempotency_key: string | null;
  tx_id: string | null;
  status: string;
  created_at: Date;
}

interface InMemoryGameAccountRow {
  id: string;
  customer_id: string;
  game_id: string;
  game_title: string;
  username: string;
  status: string;
  balance: string;
  free_play_balance: string;
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

class InMemoryWheelDatabase implements Pick<DatabasePool, 'query' | 'connect'> {
  public users = new Map<string, InMemoryUserRow>();
  public authLinks = new Map<string, InMemoryAuthLinkRow>();
  public wallets = new Map<string, InMemoryWalletRow>();
  public wheelSpins = new Map<string, InMemoryWheelSpinRow>();
  public gameAccounts = new Map<string, InMemoryGameAccountRow>();
  public transactions = new Map<string, InMemoryTransactionRow>();
  public appConfig = new Map<string, Record<string, unknown>>();
  public auditLogs: InMemoryAuditLogRow[] = [];

  public failNextWheelOrTransferQuery = false;
  public delayInsideTxMs = 0;

  private lockQueue: Promise<void> = Promise.resolve();
  private txSnapshot: {
    wallets: Map<string, InMemoryWalletRow>;
    wheelSpins: Map<string, InMemoryWheelSpinRow>;
    gameAccounts: Map<string, InMemoryGameAccountRow>;
    transactions: Map<string, InMemoryTransactionRow>;
    appConfig: Map<string, Record<string, unknown>>;
    auditLogs: InMemoryAuditLogRow[];
  } | null = null;

  public async connect(): Promise<DatabaseClient> {
    let releaseQueue: (() => void) | null = null;
    await new Promise<void>((resolve) => {
      this.lockQueue = this.lockQueue.then(
        () =>
          new Promise<void>((done) => {
            releaseQueue = done;
            resolve();
          }),
      );
    });

    return {
      query: async (sql: string, values?: unknown[]) => {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        if (normalized === 'BEGIN') {
          this.txSnapshot = {
            wallets: new Map(
              Array.from(this.wallets.entries()).map(([k, v]) => [k, { ...v }]),
            ),
            wheelSpins: new Map(
              Array.from(this.wheelSpins.entries()).map(([k, v]) => [k, { ...v }]),
            ),
            gameAccounts: new Map(
              Array.from(this.gameAccounts.entries()).map(([k, v]) => [k, { ...v }]),
            ),
            transactions: new Map(
              Array.from(this.transactions.entries()).map(([k, v]) => [k, { ...v }]),
            ),
            appConfig: new Map(
              Array.from(this.appConfig.entries()).map(([k, v]) => [
                k,
                structuredClone(v),
              ]),
            ),
            auditLogs: [...this.auditLogs],
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
            this.wheelSpins = this.txSnapshot.wheelSpins;
            this.gameAccounts = this.txSnapshot.gameAccounts;
            this.transactions = this.txSnapshot.transactions;
            this.appConfig = this.txSnapshot.appConfig;
            this.auditLogs = this.txSnapshot.auditLogs;
            this.txSnapshot = null;
          }
          return { rows: [], rowCount: 0 };
        }
        return this.query(sql, values);
      },
      release: () => {
        this.txSnapshot = null;
        if (releaseQueue) {
          const done = releaseQueue;
          releaseQueue = null;
          done();
        }
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

    if (normalized.includes("to_regclass('public.notifications')")) {
      return { rows: [{ reg: null }] };
    }

    if (
      normalized.includes("to_regclass('public.conversations')") &&
      normalized.includes("to_regclass('public.messages')")
    ) {
      return { rows: [{ conv_reg: null, msg_reg: null }] };
    }

    // UserDirectoryRepo lookups
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

    if (
      this.failNextWheelOrTransferQuery &&
      (normalized.includes('public.wheel_spins') ||
        normalized.includes('public.game_accounts'))
    ) {
      this.failNextWheelOrTransferQuery = false;
      throw new Error('pg_wheel_error: simulated database timeout');
    }

    // app_config
    if (normalized.startsWith("SELECT data FROM public.app_config WHERE id = 'main'")) {
      const data = this.appConfig.get('main');
      return { rows: data ? [{ data: structuredClone(data) }] : [] };
    }

    if (normalized.startsWith('INSERT INTO public.app_config')) {
      const parsed = JSON.parse(String(values[0] ?? '{}'));
      this.appConfig.set('main', parsed);
      return { rows: [], rowCount: 1 };
    }

    // audit_logs
    if (normalized.startsWith('INSERT INTO public.audit_logs')) {
      const [id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details] =
        values as [string, string, string, string, string, string, string, string | null];
      this.auditLogs.push({
        id,
        actor_id,
        actor_name,
        actor_role,
        action,
        entity_type,
        entity_id,
        details: details ?? null,
        timestamp: new Date(),
      });
      return { rows: [], rowCount: 1 };
    }

    // users lookups inside WheelRepo
    if (
      normalized.includes('FROM public.users') &&
      normalized.includes('WHERE id = $1') &&
      !normalized.includes('LEFT JOIN')
    ) {
      if (this.delayInsideTxMs > 0 && normalized.includes('FOR UPDATE')) {
        await new Promise((r) => setTimeout(r, this.delayInsideTxMs));
      }
      const u = this.users.get(String(values[0] ?? ''));
      return { rows: u ? [{ ...u }] : [] };
    }

    // wallets
    if (normalized.startsWith('INSERT INTO public.wallets')) {
      const cid = String(values[0]);
      if (!this.wallets.has(cid)) {
        this.wallets.set(cid, {
          customer_id: cid,
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
      normalized.includes('FROM public.wallets') &&
      normalized.includes('WHERE customer_id = $1')
    ) {
      const w = this.wallets.get(String(values[0] ?? ''));
      return { rows: w ? [{ ...w }] : [] };
    }

    if (
      normalized.startsWith(
        'UPDATE public.wallets SET free_play_balance = free_play_balance + $2',
      )
    ) {
      const [cid, amt, nowIso] = values as [string, number, string];
      const w = this.wallets.get(cid);
      if (!w) return { rows: [], rowCount: 0 };
      w.free_play_balance = (Number(w.free_play_balance) + Number(amt)).toFixed(2);
      w.updated_at = new Date(nowIso);
      return { rows: [{ ...w }], rowCount: 1 };
    }

    if (
      normalized.startsWith(
        'UPDATE public.wallets SET balance = $2, referral_bonus_balance = $3, free_play_balance = $4',
      )
    ) {
      const [cid, bal, refBal, fpBal, nowIso] = values as [
        string,
        number,
        number,
        number,
        string,
      ];
      const w = this.wallets.get(cid);
      if (!w) return { rows: [], rowCount: 0 };
      w.balance = Number(bal).toFixed(2);
      w.referral_bonus_balance = Number(refBal).toFixed(2);
      w.free_play_balance = Number(fpBal).toFixed(2);
      w.updated_at = new Date(nowIso);
      return { rows: [{ ...w }], rowCount: 1 };
    }

    // wheel_spins
    if (
      normalized.includes('FROM public.wheel_spins') &&
      normalized.includes('WHERE customer_id = $1 AND idempotency_key = $2')
    ) {
      const [cid, key] = values as [string, string];
      const found = Array.from(this.wheelSpins.values()).find(
        (s) => s.customer_id === cid && s.idempotency_key === key,
      );
      return { rows: found ? [{ ...found }] : [] };
    }

    if (
      normalized.includes('FROM public.wheel_spins') &&
      normalized.includes("WHERE customer_id = $1 AND status = 'completed'")
    ) {
      const cid = String(values[0] ?? '');
      const latest = Array.from(this.wheelSpins.values())
        .filter((s) => s.customer_id === cid && s.status === 'completed')
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];
      return { rows: latest ? [{ ...latest }] : [] };
    }

    if (
      normalized.includes('FROM public.wheel_spins') &&
      normalized.includes('WHERE customer_id = $1') &&
      normalized.includes('LIMIT 10')
    ) {
      const cid = String(values[0] ?? '');
      const rows = Array.from(this.wheelSpins.values())
        .filter((s) => s.customer_id === cid)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(0, 10)
        .map((s) => ({ ...s }));
      return { rows };
    }

    if (normalized.startsWith('INSERT INTO public.wheel_spins')) {
      const [
        id,
        customer_id,
        segment_id,
        segment_label,
        reward_amount,
        simulated_win_amount,
        probability_weight,
        idempotency_key,
        tx_id,
        nowIso,
      ] = values as [
        string,
        string,
        string,
        string,
        number,
        number,
        number,
        string | null,
        string | null,
        string,
      ];
      if (idempotency_key) {
        const dup = Array.from(this.wheelSpins.values()).find(
          (s) =>
            s.customer_id === customer_id && s.idempotency_key === idempotency_key,
        );
        if (dup) {
          throw new Error(
            'duplicate key value violates unique constraint "idx_wheel_spins_customer_idempotency"',
          );
        }
      }
      const row: InMemoryWheelSpinRow = {
        id,
        customer_id,
        segment_id,
        segment_label,
        reward_amount: Number(reward_amount).toFixed(2),
        simulated_win_amount: Number(simulated_win_amount).toFixed(2),
        probability_weight: Number(probability_weight).toFixed(4),
        idempotency_key,
        tx_id,
        status: 'completed',
        created_at: new Date(nowIso),
      };
      this.wheelSpins.set(id, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    // game_accounts
    if (
      normalized.includes('FROM public.game_accounts') &&
      normalized.includes('WHERE id = $1')
    ) {
      const acc = this.gameAccounts.get(String(values[0] ?? ''));
      return { rows: acc ? [{ ...acc }] : [] };
    }

    if (
      normalized.includes('FROM public.game_accounts') &&
      normalized.includes('WHERE customer_id = $1 AND game_id = $2')
    ) {
      const [cid, gameId] = values as [string, string];
      const found = Array.from(this.gameAccounts.values()).find(
        (a) => a.customer_id === cid && a.game_id === gameId,
      );
      return { rows: found ? [{ ...found }] : [] };
    }

    if (
      normalized.startsWith(
        'UPDATE public.game_accounts SET balance = $2, free_play_balance = $3',
      )
    ) {
      const [id, bal, fpBal, nowIso] = values as [string, number, number, string];
      const acc = this.gameAccounts.get(id);
      if (!acc) return { rows: [], rowCount: 0 };
      acc.balance = Number(bal).toFixed(2);
      acc.free_play_balance = Number(fpBal).toFixed(2);
      acc.updated_at = new Date(nowIso);
      return { rows: [{ ...acc }], rowCount: 1 };
    }

    // transactions
    if (normalized.startsWith('INSERT INTO public.transactions')) {
      if (normalized.includes("'free_play_bonus'")) {
        const [id, customer_id, amount, description, reference_id, nowIso] =
          values as [string, string, number, string, string, string];
        this.transactions.set(id, {
          id,
          customer_id,
          amount: Number(amount).toFixed(2),
          type: 'free_play_bonus',
          status: 'completed',
          description,
          reference_id,
          game_name: null,
          created_at: new Date(nowIso),
        });
        return { rows: [], rowCount: 1 };
      }

      const [
        id,
        customer_id,
        amount,
        type,
        description,
        reference_id,
        game_name,
        nowIso,
      ] = values as [string, string, number, string, string, string, string, string];
      this.transactions.set(id, {
        id,
        customer_id,
        amount: Number(amount).toFixed(2),
        type,
        status: 'completed',
        description,
        reference_id,
        game_name,
        created_at: new Date(nowIso),
      });
      return { rows: [], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }

  private toJoinedRow(user: InMemoryUserRow, link: InMemoryAuthLinkRow | undefined) {
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
      auth_user_id: link?.auth_user_id ?? null,
      legacy_supabase_uid: link?.legacy_supabase_uid ?? null,
      migration_source: link?.migration_source ?? 'self_hosted_signup',
      password_reset_required: link?.password_reset_required ?? false,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }
}

function createTestConfig(port = 0): ServerConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port,
    appOrigin: 'https://swiftsweeps.example.com',
    trustProxy: 'loopback',
    databaseUrl: 'postgres://staging_user:not_a_real_secret@127.0.0.1:5432/staging_db',
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
    authSecret: 'test-only-auth-secret-with-more-than-thirty-two-chars-1234',
    authCookiePrefix: 'swiftsweeps_auth',
    authSessionExpiresInSec: 604_800,
    authSessionUpdateAgeSec: 86_400,
    authSessionFreshAgeSec: 900,
    authRequireEmailVerification: true,
    authRateLimitEnabled: false,
    authRateLimitWindowSec: 60,
    authRateLimitMax: 1000,
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

function createSilentLogger() {
  return createLogger({
    level: 'error',
    writeStdout: () => {},
    writeStderr: () => {},
  });
}

function createCaptureEmailAdapter(otps: SendOtpEmailPayload[]): EmailDeliveryAdapter {
  return {
    providerName: 'test-capture',
    isConfigured: () => true,
    sendVerificationEmail: async (_p: SendVerificationEmailPayload) => {},
    sendPasswordResetEmail: async (_p: SendPasswordResetEmailPayload) => {},
    sendOtpEmail: async (p: SendOtpEmailPayload) => {
      otps.push(p);
    },
  };
}

const serverOtpsByBaseUrl = new Map<string, SendOtpEmailPayload[]>();

async function startTestServer(
  db: InMemoryWheelDatabase,
  options: {
    nowFn?: () => number;
    randomUnitFn?: () => number;
  } = {},
) {
  const otps: SendOtpEmailPayload[] = [];
  const authMemDb: Record<string, unknown[]> = {
    ba_user: [],
    ba_session: [],
    ba_account: [],
    ba_verification: [],
    ba_rate_limit: [],
  };
  const app = createApiApp({
    config: createTestConfig(),
    logger: createSilentLogger(),
    pool: db,
    authDatabaseOverride: memoryAdapter(authMemDb),
    emailDeliveryOverride: createCaptureEmailAdapter(otps),
    wheelNowFnOverride: options.nowFn,
    wheelRandomUnitOverride: options.randomUnitFn,
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  serverOtpsByBaseUrl.set(baseUrl, otps);
  return { server, baseUrl };
}

async function requestJson(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    cookie?: string;
    body?: unknown;
  } = {},
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Origin: 'https://swiftsweeps.example.com',
      'Content-Type': 'application/json',
      ...(options.cookie ? { Cookie: options.cookie } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, json };
}

async function signUpAndCookie(
  baseUrl: string,
  email: string,
  name: string,
  password = 'StrongPassword!2026',
) {
  const signup = await requestJson(baseUrl, '/api/auth/sign-up/email', {
    method: 'POST',
    body: { email, password, name },
  });
  assert.equal(signup.status, 200);

  const otps = serverOtpsByBaseUrl.get(baseUrl) ?? [];
  const otpEntry = [...otps]
    .reverse()
    .find((o) => o.to === email.toLowerCase());
  assert.ok(otpEntry?.otp, 'Expected verification OTP for signup');

  const verify = await requestJson(baseUrl, '/api/auth/email-otp/verify-email', {
    method: 'POST',
    body: { email: email.toLowerCase(), otp: otpEntry.otp },
  });
  assert.equal(verify.status, 200);

  const signIn = await requestJson(baseUrl, '/api/auth/sign-in/email', {
    method: 'POST',
    body: { email: email.toLowerCase(), password },
  });
  assert.equal(signIn.status, 200);

  const setCookie = signIn.headers.getSetCookie();
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie);
  const profile = await requestJson(baseUrl, '/api/auth/me', { cookie });
  assert.equal(profile.status, 200);
  return {
    cookie,
    appUserId: String(profile.json.user.id),
  };
}

test('wheel and transfer endpoints reject anonymous and suspended accounts', async (t) => {
  const db = new InMemoryWheelDatabase();
  const { server, baseUrl } = await startTestServer(db);
  t.after(() => server.close());

  assert.equal((await requestJson(baseUrl, '/api/wheel/status')).status, 401);
  assert.equal(
    (await requestJson(baseUrl, '/api/wheel/spin', { method: 'POST', body: {} })).status,
    401,
  );
  assert.equal(
    (
      await requestJson(baseUrl, '/api/admin/wheel-config', {
        method: 'POST',
        body: { wheelOfLuck: {} },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await requestJson(baseUrl, '/api/game-accounts/transfer', {
        method: 'POST',
        body: {
          gameAccountId: 'ga_1',
          direction: 'load',
          source: 'wallet_cash',
          amount: 10,
        },
      })
    ).status,
    401,
  );

  const suspended = await signUpAndCookie(baseUrl, 'susp_wheel@example.test', 'Suspended');
  db.users.get(suspended.appUserId)!.status = 'suspended';

  assert.equal(
    (await requestJson(baseUrl, '/api/wheel/status', { cookie: suspended.cookie })).status,
    403,
  );
  assert.equal(
    (
      await requestJson(baseUrl, '/api/wheel/spin', {
        method: 'POST',
        cookie: suspended.cookie,
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await requestJson(baseUrl, '/api/game-accounts/transfer', {
        method: 'POST',
        cookie: suspended.cookie,
        body: {
          gameAccountId: 'ga_1',
          direction: 'load',
          source: 'wallet_cash',
          amount: 10,
        },
      })
    ).status,
    403,
  );
});

test('wheel status isolation, spin reward vs simulated showcase separation, idempotency, cooldown, and concurrency', async (t) => {
  const db = new InMemoryWheelDatabase();
  let mockNowMs = Date.parse('2026-11-26T10:00:00.000Z');
  // 0.60 selects '$5 Free Play' in DEFAULT_WHEEL_SEGMENTS (25+25=50, +20=70 => 60 falls in $5)
  const { server, baseUrl } = await startTestServer(db, {
    nowFn: () => mockNowMs,
    randomUnitFn: () => 0.6,
  });
  t.after(() => server.close());

  const player = await signUpAndCookie(baseUrl, 'player_w@example.test', 'Player W');
  const other = await signUpAndCookie(baseUrl, 'other_w@example.test', 'Other W');
  const staff = await signUpAndCookie(baseUrl, 'agent_w@example.test', 'Agent W');
  db.users.get(staff.appUserId)!.role = 'agent';

  // Unknown query parameter rejected
  const badQuery = await requestJson(baseUrl, '/api/wheel/status?extra=1', {
    cookie: player.cookie,
  });
  assert.equal(badQuery.status, 400);

  // Customer cannot inspect another player's wheel status
  const wrongOwnerStatus = await requestJson(
    baseUrl,
    `/api/wheel/status?userId=${player.appUserId}`,
    { cookie: other.cookie },
  );
  assert.equal(wrongOwnerStatus.status, 403);

  // Staff can inspect target player's wheel status
  const staffStatus = await requestJson(
    baseUrl,
    `/api/wheel/status?userId=${player.appUserId}`,
    { cookie: staff.cookie },
  );
  assert.equal(staffStatus.status, 200);
  assert.equal(staffStatus.json.eligibility.eligible, true);
  assert.equal(staffStatus.json.recentSpins.length, 0);

  // Privileged client-supplied reward/balance fields are strictly rejected with 403
  const privSpin = await requestJson(baseUrl, '/api/wheel/spin', {
    method: 'POST',
    cookie: player.cookie,
    body: { rewardAmount: 500 },
  });
  assert.equal(privSpin.status, 403);

  // Customer cannot spin on behalf of another user
  const otherUserSpin = await requestJson(baseUrl, '/api/wheel/spin', {
    method: 'POST',
    cookie: other.cookie,
    body: { userId: player.appUserId },
  });
  assert.equal(otherUserSpin.status, 403);

  // Disabled wheel check
  db.appConfig.set('main', {
    wheelOfLuck: {
      enabled: false,
      title: 'Off',
      subtitle: 'Paused',
      segments: [{ id: 's1', label: '$5 Free Play', rewardAmount: 5, probabilityWeight: 10, color: '#059669', enabled: true }],
      simulatedWinDisplay: { enabled: true, amount: 250, label: 'Demo' },
    },
  });
  const disabledRes = await requestJson(baseUrl, '/api/wheel/spin', {
    method: 'POST',
    cookie: player.cookie,
    body: { idempotencyKey: 'key_disabled' },
  });
  assert.equal(disabledRes.status, 403);
  assert.equal(disabledRes.json.error.code, 'WHEEL_DISABLED');

  // No active segments (all weights 0 / disabled) -> 409 NO_ACTIVE_SEGMENTS
  db.appConfig.set('main', {
    wheelOfLuck: {
      enabled: true,
      title: 'Empty',
      subtitle: 'No weights',
      segments: [{ id: 's1', label: 'Zero', rewardAmount: 5, probabilityWeight: 0, color: '#059669', enabled: false }],
      simulatedWinDisplay: { enabled: false, amount: 0, label: 'Off' },
    },
  });
  const noSegRes = await requestJson(baseUrl, '/api/wheel/spin', {
    method: 'POST',
    cookie: player.cookie,
    body: { idempotencyKey: 'key_noseg' },
  });
  assert.equal(noSegRes.status, 409);
  assert.equal(noSegRes.json.error.code, 'NO_ACTIVE_SEGMENTS');

  // Reset to default wheel (rewardAmount = 5 at unit 0.60, simulatedWinDisplay = 250)
  db.appConfig.delete('main');

  // Happy spin: credits ONLY rewardAmount ($5) to free_play_balance, NEVER simulatedWinAmount ($250)
  const spin1 = await requestJson(baseUrl, '/api/wheel/spin', {
    method: 'POST',
    cookie: player.cookie,
    body: { idempotencyKey: 'spin_req_1' },
  });
  assert.equal(spin1.status, 200);
  assert.equal(spin1.json.idempotentReplay, false);
  assert.equal(spin1.json.rewardAmount, 5);
  assert.equal(spin1.json.simulatedWinAmount, 250);
  assert.equal(spin1.json.freePlayBalance, 5);
  assert.equal(spin1.json.availableBalance, 0);
  assert.equal(spin1.json.referralBonusBalance, 0);
  assert.equal(spin1.json.eligibility.eligible, false);
  assert.equal(db.wallets.get(player.appUserId)!.free_play_balance, '5.00');
  assert.equal(db.wallets.get(player.appUserId)!.balance, '0.00');
  assert.equal(db.transactions.size, 1);
  const spinTx = Array.from(db.transactions.values())[0]!;
  assert.equal(spinTx.type, 'free_play_bonus');
  assert.equal(spinTx.amount, '5.00');

  // Same idempotencyKey replay returns exact same spin without double-crediting
  const replay = await requestJson(baseUrl, '/api/wheel/spin', {
    method: 'POST',
    cookie: player.cookie,
    body: { idempotencyKey: 'spin_req_1' },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.idempotentReplay, true);
  assert.equal(replay.json.spin.id, spin1.json.spin.id);
  assert.equal(db.wallets.get(player.appUserId)!.free_play_balance, '5.00');
  assert.equal(db.wheelSpins.size, 1);

  // Cooldown active 23 hours later -> 429 COOLDOWN_ACTIVE
  mockNowMs += 23 * 60 * 60 * 1000;
  const duringCooldown = await requestJson(baseUrl, '/api/wheel/spin', {
    method: 'POST',
    cookie: player.cookie,
    body: { idempotencyKey: 'spin_req_2_early' },
  });
  assert.equal(duringCooldown.status, 429);
  assert.equal(duringCooldown.json.code, 'COOLDOWN_ACTIVE');
  assert.equal(duringCooldown.json.error.code, 'COOLDOWN_ACTIVE');
  assert.equal(duringCooldown.json.eligibility.eligible, false);

  // Concurrent spins right after 24h cooldown unlocks: strictly ONE succeeds, ONE gets 429
  mockNowMs += 2 * 60 * 60 * 1000; // +25h total since first spin
  db.delayInsideTxMs = 25;
  const [raceA, raceB] = await Promise.all([
    requestJson(baseUrl, '/api/wheel/spin', {
      method: 'POST',
      cookie: player.cookie,
      body: { idempotencyKey: 'race_key_a' },
    }),
    requestJson(baseUrl, '/api/wheel/spin', {
      method: 'POST',
      cookie: player.cookie,
      body: { idempotencyKey: 'race_key_b' },
    }),
  ]);
  db.delayInsideTxMs = 0;

  const statuses = [raceA.status, raceB.status].sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 429]);
  assert.equal(db.wallets.get(player.appUserId)!.free_play_balance, '10.00');
  assert.equal(db.wheelSpins.size, 2);

  // Status now reflects active cooldown & recentSpins
  const afterStatus = await requestJson(baseUrl, '/api/wheel/status', {
    cookie: player.cookie,
  });
  assert.equal(afterStatus.status, 200);
  assert.equal(afterStatus.json.eligibility.eligible, false);
  assert.equal(afterStatus.json.recentSpins.length, 2);
  assert.equal(afterStatus.json.freePlayBalance, 10);
});

test('admin wheel-config enforces RBAC, validates weights/segments, and persists config', async (t) => {
  const db = new InMemoryWheelDatabase();
  const { server, baseUrl } = await startTestServer(db);
  t.after(() => server.close());

  const customer = await signUpAndCookie(baseUrl, 'cust_cfg@example.test', 'Cust Cfg');
  const agent = await signUpAndCookie(baseUrl, 'agent_cfg@example.test', 'Agent Cfg');
  const admin = await signUpAndCookie(baseUrl, 'admin_cfg@example.test', 'Admin Cfg');
  db.users.get(agent.appUserId)!.role = 'agent';
  db.users.get(admin.appUserId)!.role = 'admin';

  const validConfig = {
    enabled: true,
    title: 'VIP Wheel',
    subtitle: 'Guaranteed Rewards',
    segments: [
      {
        id: 'vip_5',
        label: '$5 Free Play',
        rewardAmount: 5,
        probabilityWeight: 80,
        color: '#059669',
        enabled: true,
      },
      {
        id: 'vip_15',
        label: '$15 Free Play',
        rewardAmount: 15,
        probabilityWeight: 20,
        color: '#4F46E5',
        enabled: true,
      },
    ],
    simulatedWinDisplay: {
      enabled: true,
      amount: 500,
      label: 'Showcase Demo Banner',
    },
  };

  assert.equal(
    (
      await requestJson(baseUrl, '/api/admin/wheel-config', {
        method: 'POST',
        cookie: customer.cookie,
        body: { wheelOfLuck: validConfig },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await requestJson(baseUrl, '/api/admin/wheel-config', {
        method: 'POST',
        cookie: agent.cookie,
        body: { wheelOfLuck: validConfig },
      })
    ).status,
    403,
  );

  // Invalid config (all weights 0 while enabled) -> 400
  const invalidRes = await requestJson(baseUrl, '/api/admin/wheel-config', {
    method: 'POST',
    cookie: admin.cookie,
    body: {
      wheelOfLuck: {
        ...validConfig,
        segments: validConfig.segments.map((s) => ({ ...s, probabilityWeight: 0 })),
      },
    },
  });
  assert.equal(invalidRes.status, 400);

  // Admin saves valid config -> 200 + audit log
  const okRes = await requestJson(baseUrl, '/api/admin/wheel-config', {
    method: 'POST',
    cookie: admin.cookie,
    body: { wheelOfLuck: validConfig },
  });
  assert.equal(okRes.status, 200);
  assert.equal(okRes.json.success, true);
  assert.equal(okRes.json.wheelOfLuck.title, 'VIP Wheel');
  assert.equal(okRes.json.wheelOfLuck.segments.length, 2);
  assert.ok(
    db.auditLogs.some((a) => a.action === 'WHEEL_CONFIG_UPDATED'),
  );
});

test('game-accounts transfer enforces ownership, status, funding sources, unload free-play-first split, and error masking', async (t) => {
  const db = new InMemoryWheelDatabase();
  const { server, baseUrl } = await startTestServer(db);
  t.after(() => server.close());

  const owner = await signUpAndCookie(baseUrl, 'owner_gx@example.test', 'Owner GX');
  const other = await signUpAndCookie(baseUrl, 'other_gx@example.test', 'Other GX');
  const staff = await signUpAndCookie(baseUrl, 'staff_gx@example.test', 'Staff GX');
  db.users.get(staff.appUserId)!.role = 'agent';

  db.wallets.set(owner.appUserId, {
    customer_id: owner.appUserId,
    balance: '50.00',
    referral_bonus_balance: '20.00',
    free_play_balance: '15.00',
    pending_withdrawal: '0.00',
    pending_deposit: '0.00',
    total_deposited: '50.00',
    total_withdrawn: '0.00',
    currency: 'USD',
    updated_at: new Date(),
  });

  db.gameAccounts.set('ga_active', {
    id: 'ga_active',
    customer_id: owner.appUserId,
    game_id: 'game_firekirin',
    game_title: 'Fire Kirin',
    username: 'fk_owner_01',
    status: 'active',
    balance: '0.00',
    free_play_balance: '0.00',
    updated_at: new Date(),
  });

  db.gameAccounts.set('ga_pending', {
    id: 'ga_pending',
    customer_id: owner.appUserId,
    game_id: 'game_juwa',
    game_title: 'Juwa',
    username: 'jw_owner_01',
    status: 'pending',
    balance: '0.00',
    free_play_balance: '0.00',
    updated_at: new Date(),
  });

  // Validation errors
  assert.equal(
    (
      await requestJson(baseUrl, '/api/game-accounts/transfer', {
        method: 'POST',
        cookie: owner.cookie,
        body: { gameAccountId: 'ga_active', direction: 'sideways', amount: 10 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await requestJson(baseUrl, '/api/game-accounts/transfer', {
        method: 'POST',
        cookie: owner.cookie,
        body: { gameAccountId: 'ga_active', direction: 'load', source: 'magic', amount: 10 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await requestJson(baseUrl, '/api/game-accounts/transfer', {
        method: 'POST',
        cookie: owner.cookie,
        body: { gameAccountId: 'ga_active', direction: 'load', source: 'wallet_cash', amount: 0 },
      })
    ).status,
    400,
  );

  // Privileged field injection -> 403
  assert.equal(
    (
      await requestJson(baseUrl, '/api/game-accounts/transfer', {
        method: 'POST',
        cookie: owner.cookie,
        body: {
          gameAccountId: 'ga_active',
          direction: 'load',
          source: 'free_play',
          amount: 5,
          freePlayReturn: 99,
        },
      })
    ).status,
    403,
  );

  // Wrong owner -> 403
  assert.equal(
    (
      await requestJson(baseUrl, '/api/game-accounts/transfer', {
        method: 'POST',
        cookie: other.cookie,
        body: {
          gameAccountId: 'ga_active',
          direction: 'load',
          source: 'wallet_cash',
          amount: 10,
        },
      })
    ).status,
    403,
  );

  // Inactive account -> 400
  assert.equal(
    (
      await requestJson(baseUrl, '/api/game-accounts/transfer', {
        method: 'POST',
        cookie: owner.cookie,
        body: {
          gameAccountId: 'ga_pending',
          direction: 'load',
          source: 'wallet_cash',
          amount: 10,
        },
      })
    ).status,
    400,
  );

  // Insufficient funds -> 400
  assert.equal(
    (
      await requestJson(baseUrl, '/api/game-accounts/transfer', {
        method: 'POST',
        cookie: owner.cookie,
        body: {
          gameAccountId: 'ga_active',
          direction: 'load',
          source: 'free_play',
          amount: 99,
        },
      })
    ).status,
    400,
  );

  // 1) Load $10 from free_play -> emits staffMessage DTO, tracks freePlayBalance on game account
  const loadFp = await requestJson(baseUrl, '/api/game-accounts/transfer', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      gameAccountId: 'ga_active',
      direction: 'load',
      source: 'free_play',
      amount: 10,
    },
  });
  assert.equal(loadFp.status, 200);
  assert.equal(loadFp.json.wallet.freePlayBalance, 5);
  assert.equal(loadFp.json.gameAccount.balance, 10);
  assert.equal(loadFp.json.gameAccount.freePlayBalance, 10);
  assert.ok(loadFp.json.staffMessage);
  assert.match(String(loadFp.json.staffMessage.content), /Free-Play/i);

  // 2) Load $5 from referral_bonus -> emits staffMessage DTO, adds to tracked freePlayBalance (winnings/locked promo)
  const loadRef = await requestJson(baseUrl, '/api/game-accounts/transfer', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      gameAccountId: 'ga_active',
      direction: 'load',
      source: 'referral_bonus',
      amount: 5,
    },
  });
  assert.equal(loadRef.status, 200);
  assert.equal(loadRef.json.wallet.referralBonusBalance, 15);
  assert.equal(loadRef.json.gameAccount.balance, 15);
  assert.equal(loadRef.json.gameAccount.freePlayBalance, 15);
  assert.ok(loadRef.json.staffMessage);

  // 3) Load $25 from wallet_cash -> NO staffMessage DTO, only game balance increases (freePlayBalance stays 15)
  const loadCash = await requestJson(baseUrl, '/api/game-accounts/transfer', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      gameCatalogId: 'game_firekirin',
      direction: 'load',
      source: 'wallet_cash',
      amount: 25,
    },
  });
  assert.equal(loadCash.status, 200);
  assert.equal(loadCash.json.wallet.availableBalance, 25);
  assert.equal(loadCash.json.gameAccount.balance, 40);
  assert.equal(loadCash.json.gameAccount.freePlayBalance, 15);
  assert.equal(loadCash.json.staffMessage, null);

  // 4) Unload $20 -> MUST return $15 freePlayReturn first and only $5 cashReturn!
  const unloadSplit = await requestJson(baseUrl, '/api/game-accounts/transfer', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      gameAccountId: 'ga_active',
      direction: 'unload',
      amount: 20,
    },
  });
  assert.equal(unloadSplit.status, 200);
  assert.equal(unloadSplit.json.freePlayReturn, 15);
  assert.equal(unloadSplit.json.cashReturn, 5);
  assert.equal(unloadSplit.json.wallet.freePlayBalance, 20); // 5 + 15
  assert.equal(unloadSplit.json.wallet.availableBalance, 30); // 25 + 5
  assert.equal(unloadSplit.json.gameAccount.balance, 20);
  assert.equal(unloadSplit.json.gameAccount.freePlayBalance, 0);

  // 5) Insufficient game balance on unload -> 400
  const unloadTooMuch = await requestJson(baseUrl, '/api/game-accounts/transfer', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      gameAccountId: 'ga_active',
      direction: 'unload',
      amount: 50,
    },
  });
  assert.equal(unloadTooMuch.status, 400);

  // 6) Staff can transfer by gameCatalogId + customerId on behalf of customer
  const staffUnload = await requestJson(baseUrl, '/api/game-accounts/transfer', {
    method: 'POST',
    cookie: staff.cookie,
    body: {
      gameCatalogId: 'game_firekirin',
      customerId: owner.appUserId,
      direction: 'unload',
      amount: 10,
    },
  });
  assert.equal(staffUnload.status, 200);
  assert.equal(staffUnload.json.freePlayReturn, 0);
  assert.equal(staffUnload.json.cashReturn, 10);
  assert.equal(staffUnload.json.wallet.availableBalance, 40);
  assert.equal(staffUnload.json.gameAccount.balance, 10);

  // 7) DB failure returns masked 500 without leaking pg error strings
  db.failNextWheelOrTransferQuery = true;
  const dbFail = await requestJson(baseUrl, '/api/wheel/status', {
    cookie: owner.cookie,
  });
  assert.equal(dbFail.status, 500);
  assert.equal(dbFail.json.error.code, 'INTERNAL_SERVER_ERROR');
  assert.ok(!JSON.stringify(dbFail.json).includes('pg_wheel_error'));
});
