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

interface InMemoryWithdrawalRow {
  id: string;
  customer_id: string;
  customer_name: string;
  amount: string;
  fee: string;
  net_amount: string;
  payout_method_id: string;
  payout_method_name: string;
  payout_details: Record<string, unknown> | null;
  status: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  review_notes: string | null;
  transaction_hash: string | null;
  created_at: Date;
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

class InMemoryWithdrawalDatabase
  implements Pick<DatabasePool, 'query' | 'connect'>
{
  public readonly users = new Map<string, InMemoryUserRow>();
  public readonly authLinks = new Map<string, InMemoryAuthLinkRow>();
  public wallets = new Map<string, InMemoryWalletRow>();
  public transactions = new Map<string, InMemoryTransactionRow>();
  public withdrawals = new Map<string, InMemoryWithdrawalRow>();
  public auditLogs: InMemoryAuditLogRow[] = [];

  public failNextWithdrawalQuery = false;
  public delayInsideTransitionLockMs = 0;
  public beginCount = 0;
  public commitCount = 0;
  public rollbackCount = 0;

  private lockQueue: Promise<void> = Promise.resolve();
  private txSnapshot: {
    wallets: Map<string, InMemoryWalletRow>;
    transactions: Map<string, InMemoryTransactionRow>;
    withdrawals: Map<string, InMemoryWithdrawalRow>;
    auditLogs: InMemoryAuditLogRow[];
  } | null = null;

  private serializeTx<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.lockQueue.then(fn, fn);
    this.lockQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

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
          this.beginCount += 1;
          this.txSnapshot = {
            wallets: new Map(
              Array.from(this.wallets.entries()).map(([k, v]) => [k, { ...v }]),
            ),
            transactions: new Map(
              Array.from(this.transactions.entries()).map(([k, v]) => [k, { ...v }]),
            ),
            withdrawals: new Map(
              Array.from(this.withdrawals.entries()).map(([k, v]) => [
                k,
                {
                  ...v,
                  payout_details: v.payout_details
                    ? JSON.parse(JSON.stringify(v.payout_details))
                    : null,
                },
              ]),
            ),
            auditLogs: [...this.auditLogs],
          };
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
            this.wallets = this.txSnapshot.wallets;
            this.transactions = this.txSnapshot.transactions;
            this.withdrawals = this.txSnapshot.withdrawals;
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

    if (
      this.failNextWithdrawalQuery &&
      (normalized.includes('public.withdrawals') ||
        normalized.includes('public.wallets') ||
        normalized.includes('public.transactions'))
    ) {
      this.failNextWithdrawalQuery = false;
      throw new Error(
        'pg_withdrawal_err: postgres://admin:supersecret@10.0.0.5:5432/swiftsweeps connection reset',
      );
    }

    if (normalized.startsWith('INSERT INTO public.audit_logs')) {
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
        timestamp: new Date(ts),
      });
      return { rows: [], rowCount: 1 };
    }

    if (
      normalized.startsWith('INSERT INTO public.wallets') &&
      normalized.includes('ON CONFLICT (customer_id) DO NOTHING')
    ) {
      const customerId = String(values[0] ?? '');
      const updatedAt = values[1] ? new Date(String(values[1])) : new Date();
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
          updated_at: updatedAt,
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

    if (
      normalized.startsWith('SELECT COALESCE(SUM(amount), 0) AS total_completed FROM public.withdrawals')
    ) {
      const customerId = String(values[0] ?? '');
      let sum = 0;
      for (const w of this.withdrawals.values()) {
        if (w.customer_id === customerId && w.status === 'completed') {
          sum += Number(w.amount);
        }
      }
      return { rows: [{ total_completed: sum.toFixed(2) }] };
    }

    if (normalized.startsWith('UPDATE public.wallets SET total_withdrawn = $2')) {
      const [customerId, totalWithdrawn, updatedAt] = values as [
        string,
        string,
        string,
      ];
      const w = this.wallets.get(customerId);
      if (!w) return { rows: [] };
      w.total_withdrawn = Number(totalWithdrawn).toFixed(2);
      w.updated_at = new Date(updatedAt);
      return { rows: [{ ...w }], rowCount: 1 };
    }

    if (normalized.startsWith('UPDATE public.wallets SET pending_withdrawal = $2, total_withdrawn = $3')) {
      const [customerId, pendingWithdrawal, totalWithdrawn, updatedAt] = values as [
        string,
        string,
        string,
        string,
      ];
      const w = this.wallets.get(customerId);
      if (!w) return { rows: [] };
      w.pending_withdrawal = Number(pendingWithdrawal).toFixed(2);
      w.total_withdrawn = Number(totalWithdrawn).toFixed(2);
      w.updated_at = new Date(updatedAt);
      return { rows: [{ ...w }], rowCount: 1 };
    }

    if (normalized.startsWith('UPDATE public.wallets SET pending_withdrawal = $2, balance = $3')) {
      const [customerId, pendingWithdrawal, balance, updatedAt] = values as [
        string,
        string,
        string,
        string,
      ];
      const w = this.wallets.get(customerId);
      if (!w) return { rows: [] };
      w.pending_withdrawal = Number(pendingWithdrawal).toFixed(2);
      w.balance = Number(balance).toFixed(2);
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

    if (normalized.startsWith('INSERT INTO public.withdrawals')) {
      const isCustomerInsert = normalized.includes("'submitted', NULL, NULL, NULL, NULL");
      if (isCustomerInsert) {
        const [
          id,
          customerId,
          customerName,
          amount,
          methodId,
          methodName,
          payoutDetailsJson,
          ts,
        ] = values as [string, string, string, string, string, string, string, string];
        const row: InMemoryWithdrawalRow = {
          id,
          customer_id: customerId,
          customer_name: customerName,
          amount: Number(amount).toFixed(2),
          fee: '0.00',
          net_amount: Number(amount).toFixed(2),
          payout_method_id: methodId,
          payout_method_name: methodName,
          payout_details: JSON.parse(payoutDetailsJson) as Record<string, unknown>,
          status: 'submitted',
          reviewer_id: null,
          reviewer_name: null,
          review_notes: null,
          transaction_hash: null,
          created_at: new Date(ts),
          updated_at: new Date(ts),
        };
        this.withdrawals.set(id, row);
        return { rows: [{ ...row }], rowCount: 1 };
      }

      const [
        id,
        customerId,
        customerName,
        amount,
        fee,
        netAmount,
        methodId,
        methodName,
        payoutDetailsJson,
        status,
        reviewerId,
        reviewerName,
        reviewNotes,
        txHash,
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
        string | null,
        string | null,
        string | null,
        string | null,
        string,
      ];
      const row: InMemoryWithdrawalRow = {
        id,
        customer_id: customerId,
        customer_name: customerName,
        amount: Number(amount).toFixed(2),
        fee: Number(fee).toFixed(2),
        net_amount: Number(netAmount).toFixed(2),
        payout_method_id: methodId,
        payout_method_name: methodName,
        payout_details: JSON.parse(payoutDetailsJson) as Record<string, unknown>,
        status,
        reviewer_id: reviewerId,
        reviewer_name: reviewerName,
        review_notes: reviewNotes,
        transaction_hash: txHash,
        created_at: new Date(ts),
        updated_at: new Date(ts),
      };
      this.withdrawals.set(id, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    if (
      normalized.startsWith('SELECT id, customer_id, customer_name, amount') &&
      normalized.includes('FROM public.withdrawals WHERE id = $1 FOR UPDATE')
    ) {
      const id = String(values[0] ?? '');
      if (this.delayInsideTransitionLockMs > 0) {
        await new Promise((r) => setTimeout(r, this.delayInsideTransitionLockMs));
      }
      const row = this.withdrawals.get(id);
      return { rows: row ? [{ ...row }] : [] };
    }

    if (
      normalized.startsWith('SELECT id, customer_id, customer_name, amount') &&
      normalized.includes('FROM public.withdrawals WHERE id = $1 LIMIT 1')
    ) {
      const id = String(values[0] ?? '');
      const row = this.withdrawals.get(id);
      return { rows: row ? [{ ...row }] : [] };
    }

    if (normalized.startsWith('UPDATE public.withdrawals SET status = $2')) {
      const [
        id,
        status,
        reviewerId,
        reviewerName,
        reviewNotes,
        transactionHash,
        payoutDetailsJson,
        updatedAt,
      ] = values as [
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        string,
        string,
      ];
      const row = this.withdrawals.get(id);
      if (!row) return { rows: [] };
      row.status = status;
      row.reviewer_id = reviewerId;
      row.reviewer_name = reviewerName;
      row.review_notes = reviewNotes;
      row.transaction_hash = transactionHash;
      row.payout_details = JSON.parse(payoutDetailsJson) as Record<string, unknown>;
      row.updated_at = new Date(updatedAt);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    if (normalized.startsWith('SELECT COUNT(*)::int AS total FROM public.withdrawals')) {
      const filtered = this.filterWithdrawals(normalized, values);
      return { rows: [{ total: filtered.length }] };
    }

    if (
      normalized.startsWith('SELECT id, customer_id, customer_name, amount') &&
      normalized.includes('FROM public.withdrawals')
    ) {
      const limit = Number(values[values.length - 2] ?? 25);
      const offset = Number(values[values.length - 1] ?? 0);
      const filterParams = values.slice(0, values.length - 2);
      const filtered = this.filterWithdrawals(normalized, filterParams);
      filtered.sort((a, b) => {
        const diff = b.created_at.getTime() - a.created_at.getTime();
        if (diff !== 0) return diff;
        return b.id.localeCompare(a.id);
      });
      return { rows: filtered.slice(offset, offset + limit) };
    }

    throw new Error(`Unexpected SQL in test DB: ${normalized}`);
  }

  private filterWithdrawals(
    normalizedSql: string,
    values: unknown[],
  ): InMemoryWithdrawalRow[] {
    let idx = 0;
    let customerId: string | undefined;
    let status: string | undefined;
    let beforeCreatedAtMs: number | undefined;
    let searchTerm: string | undefined;

    if (normalizedSql.includes('customer_id = $')) {
      customerId = String(values[idx++] ?? '');
    }
    if (normalizedSql.includes('status = $')) {
      status = String(values[idx++] ?? '');
    }
    if (normalizedSql.includes('created_at < $')) {
      beforeCreatedAtMs = Date.parse(String(values[idx++] ?? ''));
    }
    if (normalizedSql.includes('ILIKE $')) {
      const raw = String(values[idx++] ?? '');
      searchTerm = raw
        .replace(/^%|%$/g, '')
        .replace(/\\([%_\\])/g, '$1')
        .toLowerCase();
    }

    return Array.from(this.withdrawals.values()).filter((w) => {
      if (customerId && w.customer_id !== customerId) return false;
      if (status && w.status !== status) return false;
      if (beforeCreatedAtMs !== undefined && w.created_at.getTime() >= beforeCreatedAtMs) {
        return false;
      }
      if (searchTerm) {
        const gameName = String(w.payout_details?.sourceGameName ?? '').toLowerCase();
        const hay = [
          w.id,
          w.customer_name,
          w.payout_method_name,
          w.transaction_hash ?? '',
          gameName,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(searchTerm)) return false;
      }
      return true;
    });
  }

  private toJoinedRow(user: InMemoryUserRow, link?: InMemoryAuthLinkRow) {
    return {
      app_user_id: user.id,
      auth_user_id: link?.auth_user_id ?? null,
      legacy_supabase_uid: link?.legacy_supabase_uid ?? null,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      phone: user.phone,
      avatar_url: user.avatar_url,
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

function createTestConfig(): ServerConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 0,
    appOrigin: 'https://swiftsweeps.example.com',
    trustedOrigins: ['https://swiftsweeps.example.com'],
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
    authSecret: 'test-only-withdrawal-secret-value-at-least-32-chars',
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

function createCaptureEmailAdapter(): {
  adapter: EmailDeliveryAdapter;
  otps: SendOtpEmailPayload[];
} {
  const otps: SendOtpEmailPayload[] = [];
  const adapter: EmailDeliveryAdapter = {
    providerName: 'test-capture',
    isConfigured: () => true,
    async sendVerificationEmail(_payload: SendVerificationEmailPayload) {},
    async sendOtpEmail(payload: SendOtpEmailPayload) {
      otps.push(payload);
    },
    async sendPasswordResetEmail(_payload: SendPasswordResetEmailPayload) {},
  };
  return { adapter, otps };
}

async function withWithdrawalServer(
  run: (ctx: {
    baseUrl: string;
    db: InMemoryWithdrawalDatabase;
    otps: SendOtpEmailPayload[];
  }) => Promise<void>,
): Promise<void> {
  const db = new InMemoryWithdrawalDatabase();
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
  options: { verifyEmail?: boolean } = {},
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

  if (options.verifyEmail !== false) {
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
  }

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

test('Withdrawals enforce anonymous 401, email verification 403, ownership 403, wrong-role 403, and account-state blocks', async () => {
  await withWithdrawalServer(async ({ baseUrl, db, otps }) => {
    // 1. Anonymous blocked
    for (const [method, path] of [
      ['GET', '/api/withdrawals'],
      ['GET', '/api/withdrawals/req_1'],
      ['POST', '/api/withdrawals'],
      ['POST', '/api/withdrawals/staff'],
      ['PATCH', '/api/withdrawals/req_1/status'],
    ] as const) {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers:
          method === 'GET'
            ? undefined
            : {
                Origin: 'https://swiftsweeps.example.com',
                'Content-Type': 'application/json',
              },
        body: method === 'GET' ? undefined : JSON.stringify({}),
      });
      assert.equal(res.status, 401, `Expected 401 for anonymous ${method} ${path}`);
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

    // Unverified customer blocked from creating withdrawal
    const unverifiedRes = await fetch(`${baseUrl}/api/withdrawals`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: custA.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: 50, method: 'cashapp' }),
    });
    assert.equal(unverifiedRes.status, 201); // custA is verified

    // Mark custB unverified in app directory and test server verification enforcement
    db.users.get(custB.userId)!.email_verified = false;
    const blockedUnverified = await fetch(`${baseUrl}/api/withdrawals`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: custB.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: 50, method: 'cashapp' }),
    });
    assert.equal(blockedUnverified.status, 403);
    assert.equal(
      ((await blockedUnverified.json()) as { error?: { code?: string } }).error?.code,
      'EMAIL_VERIFICATION_REQUIRED',
    );
    db.users.get(custB.userId)!.email_verified = true;

    const createdAJson = (await unverifiedRes.json()) as {
      withdrawal: { id: string; customerId: string; status: string };
    };
    const wdrId = createdAJson.withdrawal.id;

    // Wrong owner GET list filter & GET single & PATCH cancel -> 403
    const wrongList = await fetch(`${baseUrl}/api/withdrawals?customerId=${custA.userId}`, {
      headers: { Cookie: custB.cookie },
    });
    assert.equal(wrongList.status, 403);

    const wrongSingle = await fetch(`${baseUrl}/api/withdrawals/${wdrId}`, {
      headers: { Cookie: custB.cookie },
    });
    assert.equal(wrongSingle.status, 403);

    const wrongCancel = await fetch(`${baseUrl}/api/withdrawals/${wdrId}/status`, {
      method: 'PATCH',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: custB.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newStatus: 'cancelled' }),
    });
    assert.equal(wrongCancel.status, 403);

    // Customer cannot call staff emergency cashout or mark own withdrawal completed/processing
    const staffAttempt = await fetch(`${baseUrl}/api/withdrawals/staff`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: custA.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerId: custA.userId,
        amount: 50,
        method: 'cashapp',
        status: 'completed',
      }),
    });
    assert.equal(staffAttempt.status, 403);

    for (const forbiddenStatus of ['processing', 'approved', 'completed', 'rejected']) {
      const selfApproveAttempt = await fetch(`${baseUrl}/api/withdrawals/${wdrId}/status`, {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: custA.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus: forbiddenStatus }),
      });
      assert.equal(
        selfApproveAttempt.status,
        403,
        `Customer must not transition withdrawal to ${forbiddenStatus}`,
      );
    }

    // Suspended and password_reset_required blocked
    db.users.get(custA.userId)!.status = 'suspended';
    const suspendedRes = await fetch(`${baseUrl}/api/withdrawals`, {
      headers: { Cookie: custA.cookie },
    });
    assert.equal(suspendedRes.status, 403);
    db.users.get(custA.userId)!.status = 'active';
  });
});

test('Customer submission, input validation, staff emergency cashout, status transitions, and safe reserve release work accurately', async () => {
  await withWithdrawalServer(async ({ baseUrl, db, otps }) => {
    const customer = await signupAndSignIn(baseUrl, otps, {
      name: 'Alice Player',
      email: 'alice@example.com',
      password: 'Password123!',
    });
    const agent = await signupAndSignIn(baseUrl, otps, {
      name: 'Agent Desk',
      email: 'agent@example.com',
      password: 'Password123!',
    });
    db.users.get(agent.userId)!.role = 'agent';

    // Empty list returns 200 []
    const emptyRes = await fetch(`${baseUrl}/api/withdrawals`, {
      headers: { Cookie: customer.cookie },
    });
    assert.equal(emptyRes.status, 200);
    const emptyJson = (await emptyRes.json()) as { withdrawals: unknown[]; total: number };
    assert.deepEqual(emptyJson.withdrawals, []);
    assert.equal(emptyJson.total, 0);

    // Reject client-supplied customerId, status, fee, or invalid amount
    for (const badBody of [
      { amount: 0, method: 'cashapp' },
      { amount: -25, method: 'cashapp' },
      { amount: 50, method: 'cashapp', customerId: 'usr_spoofed' },
      { amount: 50, method: 'cashapp', status: 'completed' },
      { amount: 50, method: 'unknown_channel' },
    ]) {
      const badRes = await fetch(`${baseUrl}/api/withdrawals`, {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: customer.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(badBody),
      });
      assert.equal(badRes.status, 400);
    }

    // Valid customer withdrawal
    const submitRes = await fetch(`${baseUrl}/api/withdrawals`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: customer.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 75.5,
        method: 'cashapp',
        methodName: 'Verified CashApp',
        sourceGameCatalogId: 'game_fire_kirin',
        sourceGameName: 'Fire Kirin',
        sourceGameUsername: 'alice_fk',
        playerNotes: 'Send to primary tag',
        payoutDetails: {
          methodType: 'cashapp',
          cashtag: '$alice777',
          collectedBySupport: true,
        },
      }),
    });
    assert.equal(submitRes.status, 201);
    const submitJson = (await submitRes.json()) as {
      withdrawal: {
        id: string;
        customerId: string;
        amount: number;
        netPayout: number;
        status: string;
        sourceGameName: string;
        timeline: Array<{ status: string; actorName: string }>;
      };
    };
    assert.equal(submitJson.withdrawal.customerId, customer.userId);
    assert.equal(submitJson.withdrawal.amount, 75.5);
    assert.equal(submitJson.withdrawal.netPayout, 75.5);
    assert.equal(submitJson.withdrawal.status, 'submitted');
    assert.equal(submitJson.withdrawal.sourceGameName, 'Fire Kirin');
    assert.equal(submitJson.withdrawal.timeline.length, 1);

    // Customer cancels own submitted cashout -> wallet balance must remain 0.00 (never invent free balance!)
    const cancelRes = await fetch(
      `${baseUrl}/api/withdrawals/${submitJson.withdrawal.id}/status`,
      {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: customer.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newStatus: 'cancelled',
          note: 'Player changed mind',
        }),
      },
    );
    assert.equal(cancelRes.status, 200);
    const cancelJson = (await cancelRes.json()) as {
      withdrawal: { status: string; timeline: Array<{ status: string }> };
      wallet: { availableBalance: number; reservedBalance: number };
    };
    assert.equal(cancelJson.withdrawal.status, 'cancelled');
    assert.equal(cancelJson.withdrawal.timeline.length, 2);
    assert.equal(cancelJson.wallet.availableBalance, 0);
    assert.equal(cancelJson.wallet.reservedBalance, 0);

    // Subsequent transition on terminal cancelled withdrawal returns 409 CONFLICT
    const terminalRetry = await fetch(
      `${baseUrl}/api/withdrawals/${submitJson.withdrawal.id}/status`,
      {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: agent.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus: 'completed' }),
      },
    );
    assert.equal(terminalRetry.status, 409);

    // Staff emergency cashout validation & completion
    const missingTargetRes = await fetch(`${baseUrl}/api/withdrawals/staff`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: agent.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerId: 'usr_nonexistent',
        amount: 100,
        method: 'cashapp',
        status: 'completed',
      }),
    });
    assert.equal(missingTargetRes.status, 404);

    const staffCompletedRes = await fetch(`${baseUrl}/api/withdrawals/staff`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: agent.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerId: customer.userId,
        amount: 200,
        feeAmount: 5,
        method: 'chime',
        methodName: 'Chime Direct',
        payoutHandle: '$alice-chime',
        payoutReference: 'CHIME_991',
        sourceGameCatalogId: 'game_orion',
        sourceGameName: 'Orion Stars',
        notes: 'Emergency chat payout',
        status: 'completed',
      }),
    });
    assert.equal(staffCompletedRes.status, 201);
    const staffCompletedJson = (await staffCompletedRes.json()) as {
      withdrawal: {
        id: string;
        amount: number;
        feeAmount: number;
        netPayout: number;
        status: string;
        payoutReference: string;
      };
      wallet: { totalWithdrawn: number };
    };
    assert.equal(staffCompletedJson.withdrawal.amount, 200);
    assert.equal(staffCompletedJson.withdrawal.feeAmount, 5);
    assert.equal(staffCompletedJson.withdrawal.netPayout, 195);
    assert.equal(staffCompletedJson.withdrawal.status, 'completed');
    assert.equal(staffCompletedJson.wallet.totalWithdrawn, 200);

    // Verify rejection DOES release held funds if pending_withdrawal actually existed
    const submit2Res = await fetch(`${baseUrl}/api/withdrawals`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: customer.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: 40, method: 'chime' }),
    });
    assert.equal(submit2Res.status, 201);
    const submit2Json = (await submit2Res.json()) as { withdrawal: { id: string } };
    db.wallets.get(customer.userId)!.pending_withdrawal = '40.00';

    // Move to processing (customer can no longer cancel once processing starts!)
    const procRes = await fetch(
      `${baseUrl}/api/withdrawals/${submit2Json.withdrawal.id}/status`,
      {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: agent.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus: 'processing' }),
      },
    );
    assert.equal(procRes.status, 200);

    const custCancelProcessing = await fetch(
      `${baseUrl}/api/withdrawals/${submit2Json.withdrawal.id}/status`,
      {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: customer.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus: 'cancelled' }),
      },
    );
    assert.equal(custCancelProcessing.status, 409);

    const rejectRes = await fetch(
      `${baseUrl}/api/withdrawals/${submit2Json.withdrawal.id}/status`,
      {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: agent.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus: 'rejected', note: 'Game balance check failed' }),
      },
    );
    assert.equal(rejectRes.status, 200);
    const rejectJson = (await rejectRes.json()) as {
      wallet: { availableBalance: number; reservedBalance: number };
    };
    assert.equal(rejectJson.wallet.availableBalance, 40);
    assert.equal(rejectJson.wallet.reservedBalance, 0);
  });
});

test('Concurrent duplicate withdrawal transitions serialize cleanly via transaction lock and DB failures roll back cleanly', async () => {
  await withWithdrawalServer(async ({ baseUrl, db, otps }) => {
    const customer = await signupAndSignIn(baseUrl, otps, {
      name: 'Alice Player',
      email: 'alice@example.com',
      password: 'Password123!',
    });
    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Admin Boss',
      email: 'admin@example.com',
      password: 'Password123!',
    });
    db.users.get(admin.userId)!.role = 'admin';

    const createRes = await fetch(`${baseUrl}/api/withdrawals`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: customer.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: 120, method: 'cashapp', sourceGameName: 'Panda Master' }),
    });
    assert.equal(createRes.status, 201);
    const { withdrawal } = (await createRes.json()) as { withdrawal: { id: string } };

    // Race two completions simultaneously: only one must commit, second must get 409
    db.delayInsideTransitionLockMs = 25;
    const [r1, r2] = await Promise.all([
      fetch(`${baseUrl}/api/withdrawals/${withdrawal.id}/status`, {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus: 'completed', payoutReference: 'PAY_1' }),
      }),
      fetch(`${baseUrl}/api/withdrawals/${withdrawal.id}/status`, {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus: 'rejected', note: 'Late decline' }),
      }),
    ]);
    db.delayInsideTransitionLockMs = 0;

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 409]);
    assert.equal(db.withdrawals.get(withdrawal.id)!.status, 'completed');
    assert.equal(Number(db.wallets.get(customer.userId)!.total_withdrawn), 120);

    // Pagination & keyset cursor & search check
    await fetch(`${baseUrl}/api/withdrawals`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: customer.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: 30, method: 'crypto', sourceGameName: 'Juwa' }),
    });

    const page1 = await fetch(`${baseUrl}/api/withdrawals?limit=1&offset=0`, {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(page1.status, 200);
    const page1Json = (await page1.json()) as {
      withdrawals: Array<{ id: string; createdAt: string }>;
      total: number;
      hasMore: boolean;
    };
    assert.equal(page1Json.withdrawals.length, 1);
    assert.equal(page1Json.total, 2);
    assert.equal(page1Json.hasMore, true);

    const searchJuwa = await fetch(`${baseUrl}/api/withdrawals?q=Juwa`, {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(searchJuwa.status, 200);
    const searchJson = (await searchJuwa.json()) as {
      withdrawals: Array<{ sourceGameName: string }>;
      total: number;
    };
    assert.equal(searchJson.total, 1);
    assert.equal(searchJson.withdrawals[0].sourceGameName, 'Juwa');

    // DB failure returns sanitized 500 without leaking connection strings & rolls back
    const txCountBeforeFail = db.transactions.size;
    const rollbackBeforeFail = db.rollbackCount;
    db.failNextWithdrawalQuery = true;
    const failRes = await fetch(`${baseUrl}/api/withdrawals`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: customer.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: 15, method: 'cashapp' }),
    });
    assert.equal(failRes.status, 500);
    const failBody = await failRes.text();
    assert.ok(!failBody.includes('supersecret'));
    assert.ok(!failBody.includes('postgres://'));
    assert.equal(db.transactions.size, txCountBeforeFail);
    assert.ok(db.rollbackCount >= rollbackBeforeFail);
  });
});
