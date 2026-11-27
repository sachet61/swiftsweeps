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

class InMemoryWalletDatabase
  implements Pick<DatabasePool, 'query' | 'connect'>
{
  public readonly users = new Map<string, InMemoryUserRow>();
  public readonly authLinks = new Map<string, InMemoryAuthLinkRow>();
  public wallets = new Map<string, InMemoryWalletRow>();
  public readonly transactions = new Map<string, InMemoryTransactionRow>();

  public failNextWalletQuery = false;
  public delayAfterWalletInsertMs = 0;
  public beginCount = 0;
  public commitCount = 0;
  public rollbackCount = 0;
  public insertAttemptCount = 0;

  private txSnapshot: Map<string, InMemoryWalletRow> | null = null;

  public async connect(): Promise<DatabaseClient> {
    return {
      query: async (sql: string, values?: unknown[]) => {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        if (normalized === 'BEGIN') {
          this.beginCount += 1;
          this.txSnapshot = new Map(
            Array.from(this.wallets.entries()).map(([k, v]) => [k, { ...v }]),
          );
          return { rows: [], rowCount: 0 };
        }
        if (normalized === 'COMMIT') {
          this.commitCount += 1;
          this.txSnapshot = null;
          return { rows: [], rowCount: 0 };
        }
        if (normalized === 'ROLLBACK') {
          this.rollbackCount += 1;
          if (this.txSnapshot) {
            this.wallets = this.txSnapshot;
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
      return { rows: [], rowCount: 1 };
    }

    if (
      (normalized.includes('public.wallets') ||
        normalized.includes('public.transactions')) &&
      this.failNextWalletQuery
    ) {
      this.failNextWalletQuery = false;
      throw new Error('pg_wallet_error: secret postgres://user:pass@db/prod relation timeout');
    }

    if (
      normalized.startsWith('INSERT INTO public.wallets') &&
      normalized.includes('ON CONFLICT (customer_id) DO NOTHING')
    ) {
      this.insertAttemptCount += 1;
      const customerId = String(values[0] ?? '');
      let inserted = 0;
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
        inserted = 1;
      }
      if (this.delayAfterWalletInsertMs > 0) {
        await new Promise((r) => setTimeout(r, this.delayAfterWalletInsertMs));
      }
      return { rows: [], rowCount: inserted };
    }

    if (
      normalized.startsWith('SELECT customer_id, balance, referral_bonus_balance') &&
      normalized.includes('FROM public.wallets WHERE customer_id = $1 LIMIT 1')
    ) {
      const customerId = String(values[0] ?? '');
      const row = this.wallets.get(customerId);
      return { rows: row ? [row] : [] };
    }

    if (normalized.startsWith('SELECT COUNT(*)::int AS total FROM public.wallets')) {
      const filtered = this.filterWallets(normalized, values);
      return { rows: [{ total: filtered.length }] };
    }

    if (
      normalized.startsWith('SELECT customer_id, balance, referral_bonus_balance') &&
      normalized.includes('FROM public.wallets')
    ) {
      const limit = Number(values[values.length - 2] ?? 50);
      const offset = Number(values[values.length - 1] ?? 0);
      const filterParams = values.slice(0, values.length - 2);
      const filtered = this.filterWallets(normalized, filterParams);

      filtered.sort((a, b) => {
        const diff = b.updated_at.getTime() - a.updated_at.getTime();
        if (diff !== 0) return diff;
        return a.customer_id.localeCompare(b.customer_id);
      });

      return { rows: filtered.slice(offset, offset + limit) };
    }

    if (normalized.startsWith('SELECT COUNT(*)::int AS total FROM public.transactions')) {
      const filtered = this.filterTransactions(normalized, values);
      return { rows: [{ total: filtered.length }] };
    }

    if (
      normalized.startsWith('SELECT id, customer_id, amount, type, status, description') &&
      normalized.includes('FROM public.transactions')
    ) {
      const limit = Number(values[values.length - 2] ?? 50);
      const offset = Number(values[values.length - 1] ?? 0);
      const filterParams = values.slice(0, values.length - 2);
      const filtered = this.filterTransactions(normalized, filterParams);

      const orderMatch = /ORDER BY (created_at|amount) (ASC|DESC)/.exec(normalized);
      const sortCol = (orderMatch?.[1] ?? 'created_at') as 'created_at' | 'amount';
      const sortDir = orderMatch?.[2] === 'ASC' ? 1 : -1;

      filtered.sort((a, b) => {
        if (sortCol === 'amount') {
          const diff = Number(a.amount) - Number(b.amount);
          if (diff !== 0) return diff * sortDir;
        } else {
          const diff = a.created_at.getTime() - b.created_at.getTime();
          if (diff !== 0) return diff * sortDir;
        }
        return a.id.localeCompare(b.id);
      });

      return { rows: filtered.slice(offset, offset + limit) };
    }

    throw new Error(`Unexpected SQL in InMemoryWalletDatabase: ${normalized}`);
  }

  private filterWallets(
    normalizedSql: string,
    params: unknown[],
  ): InMemoryWalletRow[] {
    let rows = Array.from(this.wallets.values());
    if (normalizedSql.includes('customer_id = ANY(')) {
      const targetIds = new Set(
        Array.isArray(params[0]) ? params[0].map((v) => String(v)) : [],
      );
      rows = rows.filter((w) => targetIds.has(w.customer_id));
    }
    return rows;
  }

  private filterTransactions(
    normalizedSql: string,
    params: unknown[],
  ): InMemoryTransactionRow[] {
    let paramIdx = 0;
    const customerId = String(params[paramIdx++] ?? '');
    let rows = Array.from(this.transactions.values()).filter(
      (tx) => tx.customer_id === customerId,
    );

    if (normalizedSql.includes('lower(type) = lower(')) {
      const targetType = String(params[paramIdx++] ?? '').toLowerCase();
      rows = rows.filter((tx) => tx.type.toLowerCase() === targetType);
    }

    if (normalizedSql.includes('AND status = $')) {
      const targetStatus = String(params[paramIdx++] ?? '');
      rows = rows.filter((tx) => tx.status === targetStatus);
    }

    if (normalizedSql.includes('description ILIKE')) {
      const rawLike = String(params[paramIdx++] ?? '');
      const term = rawLike
        .replace(/^%/, '')
        .replace(/%$/, '')
        .replace(/\\([%_\\])/g, '$1')
        .toLowerCase();
      rows = rows.filter(
        (tx) =>
          tx.id.toLowerCase().includes(term) ||
          tx.description.toLowerCase().includes(term) ||
          (tx.reference_id ?? '').toLowerCase().includes(term) ||
          (tx.game_name ?? '').toLowerCase().includes(term),
      );
    }

    return rows;
  }

  private toJoinedRow(user: InMemoryUserRow, link: InMemoryAuthLinkRow | undefined) {
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

async function withWalletServer(
  run: (ctx: {
    baseUrl: string;
    db: InMemoryWalletDatabase;
    otps: SendOtpEmailPayload[];
  }) => Promise<void>,
): Promise<void> {
  const db = new InMemoryWalletDatabase();
  const { adapter, otps } = createCaptureEmailAdapter();
  const authMemoryDb = {
    ba_user: [],
    ba_session: [],
    ba_account: [],
    ba_verification: [],
    ba_rate_limit: [],
  };

  const app = createApiApp({
    config: createTestConfig(),
    logger: createLogger({ level: 'error', writeStdout: () => {}, writeStderr: () => {} }),
    pool: db,
    authDatabaseOverride: memoryAdapter(authMemoryDb),
    emailDeliveryOverride: adapter,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    await run({ baseUrl, db, otps });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function extractCookies(res: Response): string {
  const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const raw = typeof getSetCookie === 'function' ? getSetCookie.call(res.headers) : [];
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

  const otpEntry = [...otps].reverse().find((o) => o.to === params.email.toLowerCase());
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

test('Wallet endpoints enforce anonymous 401, wrong-owner 403, wrong-role 403, and account-state blocks', async () => {
  await withWalletServer(async ({ baseUrl, db, otps }) => {
    // 1. Anonymous access blocked on all wallet routes
    for (const path of [
      '/api/wallet',
      '/api/wallet/usr_anyone',
      '/api/wallets',
      '/api/wallet/transactions',
    ]) {
      const res = await fetch(`${baseUrl}${path}`);
      assert.equal(res.status, 401, `Expected 401 for anon GET ${path}`);
    }

    const custA = await signupAndSignIn(baseUrl, otps, {
      name: 'Alice Player',
      email: 'alice@example.com',
      password: 'Password123!',
    });
    const custB = await signupAndSignIn(baseUrl, otps, {
      name: 'Bob Player',
      email: 'bob@example.com',
      password: 'Password123!',
    });

    // 2. Customer wrong-owner access blocked (403)
    for (const path of [
      `/api/wallet?customerId=${custB.userId}`,
      `/api/wallet/${custB.userId}`,
      `/api/wallet/transactions?customerId=${custB.userId}`,
    ]) {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { Cookie: custA.cookie },
      });
      assert.equal(res.status, 403, `Expected 403 for wrong-owner GET ${path}`);
      const json = (await res.json()) as { error?: { code?: string } };
      assert.equal(json.error?.code, 'FORBIDDEN');
    }

    // 3. Customer wrong-role access blocked on staff listing (403)
    const listAsCustomer = await fetch(`${baseUrl}/api/wallets`, {
      headers: { Cookie: custA.cookie },
    });
    assert.equal(listAsCustomer.status, 403);
    const listErr = (await listAsCustomer.json()) as { error?: { code?: string } };
    assert.equal(listErr.error?.code, 'FORBIDDEN');

    // 4. Password-reset-required and suspended users blocked (403)
    db.authLinks.get(custA.userId)!.password_reset_required = true;
    const resetBlocked = await fetch(`${baseUrl}/api/wallet`, {
      headers: { Cookie: custA.cookie },
    });
    assert.equal(resetBlocked.status, 403);
    assert.equal(
      ((await resetBlocked.json()) as { error?: { code?: string } }).error?.code,
      'PASSWORD_RESET_REQUIRED',
    );
    db.authLinks.get(custA.userId)!.password_reset_required = false;

    db.users.get(custA.userId)!.status = 'suspended';
    const suspendedBlocked = await fetch(`${baseUrl}/api/wallet`, {
      headers: { Cookie: custA.cookie },
    });
    assert.equal(suspendedBlocked.status, 403);
    assert.equal(
      ((await suspendedBlocked.json()) as { error?: { code?: string } }).error?.code,
      'ACCOUNT_SUSPENDED',
    );
  });
});

test('Customer wallet initializes cleanly inside a transaction, preserves decimal precision, and handles empty transactions', async () => {
  await withWalletServer(async ({ baseUrl, db, otps }) => {
    const cust = await signupAndSignIn(baseUrl, otps, {
      name: 'Precision Player',
      email: 'precision@example.com',
      password: 'Password123!',
    });

    // First read initializes default 0.00 wallet inside a DB transaction
    const initRes = await fetch(`${baseUrl}/api/wallet`, {
      headers: { Cookie: cust.cookie },
    });
    assert.equal(initRes.status, 200);
    const initJson = (await initRes.json()) as {
      wallet: {
        customerId: string;
        currency: string;
        availableBalance: number;
        referralBonusBalance: number;
        freePlayBalance: number;
        reservedBalance: number;
        pendingDepositBalance: number;
        totalDeposited: number;
        totalWithdrawn: number;
        lastUpdatedAt: string;
      };
    };
    assert.equal(initJson.wallet.customerId, cust.userId);
    assert.equal(initJson.wallet.currency, 'USD');
    assert.equal(initJson.wallet.availableBalance, 0);
    assert.equal(initJson.wallet.referralBonusBalance, 0);
    assert.equal(initJson.wallet.freePlayBalance, 0);
    assert.equal(initJson.wallet.reservedBalance, 0);
    assert.equal(initJson.wallet.pendingDepositBalance, 0);
    assert.equal(initJson.wallet.totalDeposited, 0);
    assert.equal(initJson.wallet.totalWithdrawn, 0);
    assert.equal(db.beginCount, 1);
    assert.equal(db.commitCount, 1);
    assert.equal(db.rollbackCount, 0);

    // Update DB row with exact PostgreSQL NUMERIC(12,2) strings and verify precision on read
    db.wallets.set(cust.userId, {
      customer_id: cust.userId,
      balance: '123.45',
      referral_bonus_balance: '18.50',
      free_play_balance: '15.25',
      pending_withdrawal: '40.10',
      pending_deposit: '75.00',
      total_deposited: '500.99',
      total_withdrawn: '120.05',
      currency: 'USD',
      updated_at: new Date('2026-11-20T12:00:00.000Z'),
    });

    const selfByPath = await fetch(`${baseUrl}/api/wallet/${cust.userId}`, {
      headers: { Cookie: cust.cookie },
    });
    assert.equal(selfByPath.status, 200);
    const selfJson = (await selfByPath.json()) as typeof initJson;
    assert.equal(selfJson.wallet.availableBalance, 123.45);
    assert.equal(selfJson.wallet.referralBonusBalance, 18.5);
    assert.equal(selfJson.wallet.freePlayBalance, 15.25);
    assert.equal(selfJson.wallet.reservedBalance, 40.1);
    assert.equal(selfJson.wallet.pendingDepositBalance, 75);
    assert.equal(selfJson.wallet.totalDeposited, 500.99);
    assert.equal(selfJson.wallet.totalWithdrawn, 120.05);
    assert.equal(selfJson.wallet.lastUpdatedAt, '2026-11-20T12:00:00.000Z');

    // Empty transactions result
    const emptyTxRes = await fetch(`${baseUrl}/api/wallet/transactions`, {
      headers: { Cookie: cust.cookie },
    });
    assert.equal(emptyTxRes.status, 200);
    const emptyTxJson = (await emptyTxRes.json()) as {
      transactions: unknown[];
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
    assert.deepEqual(emptyTxJson, {
      transactions: [],
      total: 0,
      limit: 50,
      offset: 0,
      hasMore: false,
    });
  });
});

test('Staff (agent & admin) can query target customer wallets/transactions, get bounded paginated wallet lists, and receive 404 for unknown customers', async () => {
  await withWalletServer(async ({ baseUrl, db, otps }) => {
    const cust1 = await signupAndSignIn(baseUrl, otps, {
      name: 'Customer One',
      email: 'cust1@example.com',
      password: 'Password123!',
    });
    const cust2 = await signupAndSignIn(baseUrl, otps, {
      name: 'Customer Two',
      email: 'cust2@example.com',
      password: 'Password123!',
    });
    const agent = await signupAndSignIn(baseUrl, otps, {
      name: 'Staff Agent',
      email: 'agent-wallet@example.com',
      password: 'Password123!',
    });
    db.users.get(agent.userId)!.role = 'agent';

    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Staff Admin',
      email: 'admin-wallet@example.com',
      password: 'Password123!',
    });
    db.users.get(admin.userId)!.role = 'admin';

    db.wallets.set(cust1.userId, {
      customer_id: cust1.userId,
      balance: '250.00',
      referral_bonus_balance: '10.00',
      free_play_balance: '5.00',
      pending_withdrawal: '0.00',
      pending_deposit: '0.00',
      total_deposited: '300.00',
      total_withdrawn: '50.00',
      currency: 'USD',
      updated_at: new Date('2026-11-22T10:00:00.000Z'),
    });
    db.wallets.set(cust2.userId, {
      customer_id: cust2.userId,
      balance: '85.50',
      referral_bonus_balance: '0.00',
      free_play_balance: '0.00',
      pending_withdrawal: '20.00',
      pending_deposit: '0.00',
      total_deposited: '100.00',
      total_withdrawn: '0.00',
      currency: 'USD',
      updated_at: new Date('2026-11-21T10:00:00.000Z'),
    });

    db.transactions.set('tx_cust1_1', {
      id: 'tx_cust1_1',
      customer_id: cust1.userId,
      amount: '50.00',
      type: 'deposit',
      status: 'completed',
      description: 'CashApp Top-Up',
      reference_id: 'req_topup_1',
      game_name: 'Fire Kirin',
      created_at: new Date('2026-11-22T09:00:00.000Z'),
    });

    for (const staffCookie of [agent.cookie, admin.cookie]) {
      // Targeted ?customerId= read
      const qRes = await fetch(
        `${baseUrl}/api/wallet?customerId=${encodeURIComponent(cust1.userId)}`,
        { headers: { Cookie: staffCookie } },
      );
      assert.equal(qRes.status, 200);
      const qJson = (await qRes.json()) as {
        wallet: { customerId: string; availableBalance: number };
      };
      assert.equal(qJson.wallet.customerId, cust1.userId);
      assert.equal(qJson.wallet.availableBalance, 250);

      // Targeted /:customerId read
      const pRes = await fetch(
        `${baseUrl}/api/wallet/${encodeURIComponent(cust2.userId)}`,
        { headers: { Cookie: staffCookie } },
      );
      assert.equal(pRes.status, 200);
      const pJson = (await pRes.json()) as {
        wallet: { customerId: string; availableBalance: number; reservedBalance: number };
      };
      assert.equal(pJson.wallet.customerId, cust2.userId);
      assert.equal(pJson.wallet.availableBalance, 85.5);
      assert.equal(pJson.wallet.reservedBalance, 20);

      // Targeted transactions read
      const txRes = await fetch(
        `${baseUrl}/api/wallet/transactions?customerId=${encodeURIComponent(cust1.userId)}`,
        { headers: { Cookie: staffCookie } },
      );
      assert.equal(txRes.status, 200);
      const txJson = (await txRes.json()) as {
        transactions: Array<{ id: string; customerId: string; amount: number }>;
        total: number;
      };
      assert.equal(txJson.total, 1);
      assert.equal(txJson.transactions[0]?.id, 'tx_cust1_1');
      assert.equal(txJson.transactions[0]?.amount, 50);
    }

    // Bounded pagination + customerIds filter on GET /api/wallets
    const page1Res = await fetch(
      `${baseUrl}/api/wallets?customerIds=${encodeURIComponent(`${cust1.userId},${cust2.userId},${cust1.userId}`)}&limit=1&offset=0`,
      { headers: { Cookie: admin.cookie } },
    );
    assert.equal(page1Res.status, 200);
    const page1Json = (await page1Res.json()) as {
      wallets: Array<{ customerId: string }>;
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
    assert.equal(page1Json.total, 2);
    assert.equal(page1Json.limit, 1);
    assert.equal(page1Json.offset, 0);
    assert.equal(page1Json.hasMore, true);
    assert.deepEqual(
      page1Json.wallets.map((w) => w.customerId),
      [cust1.userId],
    );

    const page2Res = await fetch(
      `${baseUrl}/api/wallets?customerIds=${encodeURIComponent(`${cust1.userId},${cust2.userId}`)}&limit=1&offset=1`,
      { headers: { Cookie: admin.cookie } },
    );
    assert.equal(page2Res.status, 200);
    const page2Json = (await page2Res.json()) as typeof page1Json;
    assert.equal(page2Json.hasMore, false);
    assert.deepEqual(
      page2Json.wallets.map((w) => w.customerId),
      [cust2.userId],
    );

    // Nonexistent customer returns 404 and never creates an orphan wallet row
    const walletCountBefore = db.wallets.size;
    for (const missingPath of [
      '/api/wallet?customerId=usr_missing_999',
      '/api/wallet/usr_missing_999',
      '/api/wallet/transactions?customerId=usr_missing_999',
    ]) {
      const missingRes = await fetch(`${baseUrl}${missingPath}`, {
        headers: { Cookie: admin.cookie },
      });
      assert.equal(missingRes.status, 404, `Expected 404 for ${missingPath}`);
      const missingJson = (await missingRes.json()) as { error?: { code?: string } };
      assert.equal(missingJson.error?.code, 'USER_NOT_FOUND');
    }
    assert.equal(db.wallets.size, walletCountBefore);
    assert.equal(db.wallets.has('usr_missing_999'), false);
  });
});

test('Transactions endpoint enforces filtering, wildcard-escaped search, sorting, pagination, invalid input rejection, and DB error masking', async () => {
  await withWalletServer(async ({ baseUrl, db, otps }) => {
    const cust = await signupAndSignIn(baseUrl, otps, {
      name: 'Filter Player',
      email: 'filter@example.com',
      password: 'Password123!',
    });
    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Filter Admin',
      email: 'filter-admin@example.com',
      password: 'Password123!',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // Seed transactions including identical timestamps (to verify tie-breaker) and 100% wildcard text
    const sameTs = new Date('2026-11-20T10:00:00.000Z');
    db.transactions.set('tx_b', {
      id: 'tx_b',
      customer_id: cust.userId,
      amount: '30.00',
      type: 'bonus',
      status: 'completed',
      description: '100% Match Promo',
      reference_id: 'req_topup_b',
      game_name: 'Juwa',
      created_at: sameTs,
    });
    db.transactions.set('tx_a', {
      id: 'tx_a',
      customer_id: cust.userId,
      amount: '100.00',
      type: 'deposit',
      status: 'completed',
      description: 'Regular CashApp Deposit',
      reference_id: 'req_topup_a',
      game_name: 'Fire_Kirin',
      created_at: sameTs,
    });
    db.transactions.set('tx_c', {
      id: 'tx_c',
      customer_id: cust.userId,
      amount: '45.50',
      type: 'withdrawal_hold',
      status: 'pending',
      description: 'Pending Cashout Hold',
      reference_id: 'req_wdr_c',
      game_name: 'Orion Stars',
      created_at: new Date('2026-11-21T10:00:00.000Z'),
    });

    // 1. Deterministic pagination across identical timestamps (createdAt DESC, id ASC)
    const p1 = await fetch(`${baseUrl}/api/wallet/transactions?limit=2&offset=0`, {
      headers: { Cookie: cust.cookie },
    });
    assert.equal(p1.status, 200);
    const p1Json = (await p1.json()) as {
      transactions: Array<{ id: string }>;
      total: number;
      hasMore: boolean;
    };
    assert.equal(p1Json.total, 3);
    assert.equal(p1Json.hasMore, true);
    assert.deepEqual(
      p1Json.transactions.map((t) => t.id),
      ['tx_c', 'tx_a'],
    );

    const p2 = await fetch(`${baseUrl}/api/wallet/transactions?limit=2&offset=2`, {
      headers: { Cookie: cust.cookie },
    });
    assert.equal(p2.status, 200);
    const p2Json = (await p2.json()) as typeof p1Json;
    assert.equal(p2Json.hasMore, false);
    assert.deepEqual(
      p2Json.transactions.map((t) => t.id),
      ['tx_b'],
    );

    // 2. Sort by amount ascending
    const amtRes = await fetch(
      `${baseUrl}/api/wallet/transactions?sortBy=amount&sortOrder=asc`,
      { headers: { Cookie: cust.cookie } },
    );
    assert.equal(amtRes.status, 200);
    const amtJson = (await amtRes.json()) as { transactions: Array<{ id: string; amount: number }> };
    assert.deepEqual(
      amtJson.transactions.map((t) => t.id),
      ['tx_b', 'tx_c', 'tx_a'],
    );

    // 3. Filter by status & type
    const statusRes = await fetch(
      `${baseUrl}/api/wallet/transactions?status=pending&type=withdrawal_hold`,
      { headers: { Cookie: cust.cookie } },
    );
    assert.equal(statusRes.status, 200);
    const statusJson = (await statusRes.json()) as { transactions: Array<{ id: string }> };
    assert.deepEqual(
      statusJson.transactions.map((t) => t.id),
      ['tx_c'],
    );

    // 4. Wildcard escaping on % and _
    const pctRes = await fetch(
      `${baseUrl}/api/wallet/transactions?q=${encodeURIComponent('100%')}`,
      { headers: { Cookie: cust.cookie } },
    );
    assert.equal(pctRes.status, 200);
    const pctJson = (await pctRes.json()) as { transactions: Array<{ id: string }> };
    assert.deepEqual(
      pctJson.transactions.map((t) => t.id),
      ['tx_b'],
    );

    const underscoreRes = await fetch(
      `${baseUrl}/api/wallet/transactions?q=${encodeURIComponent('Fire_Kirin')}`,
      { headers: { Cookie: cust.cookie } },
    );
    assert.equal(underscoreRes.status, 200);
    const underscoreJson = (await underscoreRes.json()) as {
      transactions: Array<{ id: string }>;
    };
    assert.deepEqual(
      underscoreJson.transactions.map((t) => t.id),
      ['tx_a'],
    );

    // 5. Validation errors -> 400
    const badRequests = [
      '/api/wallet?unknown=1',
      '/api/wallet?customerId=bad%20id!',
      '/api/wallet/bad%20id!',
      '/api/wallet/transactions?limit=0',
      '/api/wallet/transactions?limit=101',
      '/api/wallet/transactions?limit=abc',
      '/api/wallet/transactions?offset=-1',
      '/api/wallet/transactions?offset=10001',
      '/api/wallet/transactions?status=hacked',
      '/api/wallet/transactions?sortBy=balance',
      '/api/wallet/transactions?sortOrder=random',
      `/api/wallet/transactions?q=${encodeURIComponent('a'.repeat(121))}`,
      `/api/wallet/transactions?q=${encodeURIComponent('bad\nsearch')}`,
      '/api/wallet/transactions?type=bad%20type!',
      '/api/wallet/transactions?unknown=1',
    ];
    for (const url of badRequests) {
      const res = await fetch(`${baseUrl}${url}`, {
        headers: { Cookie: cust.cookie },
      });
      assert.equal(res.status, 400, `Expected 400 for ${url}`);
    }

    const tooManyCustomerIds = Array.from({ length: 101 }, (_, i) => `usr_${i}`).join(',');
    for (const badStaffUrl of [
      '/api/wallets?limit=101',
      '/api/wallets?customerIds=',
      '/api/wallets?customerIds=bad%20id!',
      `/api/wallets?customerIds=${encodeURIComponent(tooManyCustomerIds)}`,
      '/api/wallets?extra=1',
    ]) {
      const res = await fetch(`${baseUrl}${badStaffUrl}`, {
        headers: { Cookie: admin.cookie },
      });
      assert.equal(res.status, 400, `Expected 400 for ${badStaffUrl}`);
    }

    // 6. DB failure masks SQL/connection internals
    db.failNextWalletQuery = true;
    const errRes = await fetch(`${baseUrl}/api/wallet`, {
      headers: { Cookie: cust.cookie },
    });
    assert.equal(errRes.status, 500);
    const errText = await errRes.text();
    assert.equal(errText.includes('pg_wallet_error'), false);
    assert.equal(errText.includes('postgres://'), false);
  });
});

test('Concurrent GET /api/wallet initialization is race-safe and concurrent transaction pagination stays consistent', async () => {
  await withWalletServer(async ({ baseUrl, db, otps }) => {
    const cust = await signupAndSignIn(baseUrl, otps, {
      name: 'Concurrent Player',
      email: 'concurrent@example.com',
      password: 'Password123!',
    });

    db.delayAfterWalletInsertMs = 15;

    // Fire 5 concurrent wallet reads for a brand-new user with no wallet row yet
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${baseUrl}/api/wallet`, {
          headers: { Cookie: cust.cookie },
        }),
      ),
    );

    assert.ok(responses.every((r) => r.status === 200));
    const bodies = (await Promise.all(responses.map((r) => r.json()))) as Array<{
      wallet: { customerId: string; availableBalance: number };
    }>;
    assert.ok(bodies.every((b) => b.wallet.customerId === cust.userId));
    assert.ok(bodies.every((b) => b.wallet.availableBalance === 0));
    assert.equal(db.wallets.size, 1);
    assert.equal(db.beginCount, 5);
    assert.equal(db.commitCount, 5);

    // Transaction rollback verifies atomicity if a DB failure happens inside withTransaction
    db.delayAfterWalletInsertMs = 0;
    db.failNextWalletQuery = true;
    const errRes = await fetch(`${baseUrl}/api/wallet`, {
      headers: { Cookie: cust.cookie },
    });
    assert.equal(errRes.status, 500);
    assert.equal(db.rollbackCount, 1);

    // Concurrent transaction pagination returns stable pages
    for (let i = 1; i <= 4; i += 1) {
      db.transactions.set(`tx_conc_${i}`, {
        id: `tx_conc_${i}`,
        customer_id: cust.userId,
        amount: `${i * 10}.00`,
        type: 'deposit',
        status: 'completed',
        description: `Deposit #${i}`,
        reference_id: null,
        game_name: 'Juwa',
        created_at: new Date(`2026-11-2${i}T10:00:00.000Z`),
      });
    }

    const [pageA, pageB] = await Promise.all([
      fetch(`${baseUrl}/api/wallet/transactions?limit=2&offset=0`, {
        headers: { Cookie: cust.cookie },
      }),
      fetch(`${baseUrl}/api/wallet/transactions?limit=2&offset=2`, {
        headers: { Cookie: cust.cookie },
      }),
    ]);
    assert.equal(pageA.status, 200);
    assert.equal(pageB.status, 200);
    const jsonA = (await pageA.json()) as { transactions: Array<{ id: string }> };
    const jsonB = (await pageB.json()) as { transactions: Array<{ id: string }> };
    assert.deepEqual(
      jsonA.transactions.map((t) => t.id),
      ['tx_conc_4', 'tx_conc_3'],
    );
    assert.deepEqual(
      jsonB.transactions.map((t) => t.id),
      ['tx_conc_2', 'tx_conc_1'],
    );
  });
});
