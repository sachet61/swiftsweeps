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

class InMemoryDepositDatabase
  implements Pick<DatabasePool, 'query' | 'connect'>
{
  public readonly users = new Map<string, InMemoryUserRow>();
  public readonly authLinks = new Map<string, InMemoryAuthLinkRow>();
  public wallets = new Map<string, InMemoryWalletRow>();
  public transactions = new Map<string, InMemoryTransactionRow>();
  public topups = new Map<string, InMemoryTopUpRow>();
  public auditLogs: InMemoryAuditLogRow[] = [];
  public appConfig: Record<string, unknown> | null = null;

  public failNextDepositQuery = false;
  public delayInsideTransitionLockMs = 0;
  public beginCount = 0;
  public commitCount = 0;
  public rollbackCount = 0;

  private lockQueue: Promise<void> = Promise.resolve();
  private txSnapshot: {
    wallets: Map<string, InMemoryWalletRow>;
    transactions: Map<string, InMemoryTransactionRow>;
    topups: Map<string, InMemoryTopUpRow>;
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
          this.beginCount += 1;
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
                    ? JSON.parse(JSON.stringify(v.metadata))
                    : {},
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
            this.topups = this.txSnapshot.topups;
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
      this.failNextDepositQuery &&
      (normalized.includes('public.topups') ||
        normalized.includes('public.wallets') ||
        normalized.includes('public.transactions'))
    ) {
      this.failNextDepositQuery = false;
      throw new Error(
        'pg_deposit_err: postgres://admin:supersecret@10.0.0.5:5432/swiftsweeps connection reset',
      );
    }

    if (normalized === "SELECT data FROM public.app_config WHERE id = 'main' LIMIT 1") {
      return { rows: this.appConfig ? [{ data: this.appConfig }] : [] };
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

    if (
      normalized.startsWith('SELECT COALESCE(SUM(amount), 0) AS total_completed FROM public.topups')
    ) {
      const customerId = String(values[0] ?? '');
      let sum = 0;
      for (const t of this.topups.values()) {
        if (
          t.customer_id === customerId &&
          (t.status === 'completed' || t.status === 'approved') &&
          t.payment_method_id !== 'referral_bonus'
        ) {
          sum += Number(t.amount);
        }
      }
      return { rows: [{ total_completed: sum.toFixed(2) }] };
    }

    if (normalized.startsWith('UPDATE public.wallets SET pending_deposit = $2, total_deposited = $3')) {
      const [customerId, pendingDeposit, totalDeposited, updatedAt] = values as [
        string,
        string,
        string,
        string,
      ];
      const w = this.wallets.get(customerId);
      if (!w) return { rows: [] };
      w.pending_deposit = Number(pendingDeposit).toFixed(2);
      w.total_deposited = Number(totalDeposited).toFixed(2);
      w.updated_at = new Date(updatedAt);
      return { rows: [{ ...w }], rowCount: 1 };
    }

    if (normalized.startsWith('UPDATE public.wallets SET pending_deposit = $2, updated_at = $3')) {
      const [customerId, pendingDeposit, updatedAt] = values as [
        string,
        string,
        string,
      ];
      const w = this.wallets.get(customerId);
      if (!w) return { rows: [] };
      w.pending_deposit = Number(pendingDeposit).toFixed(2);
      w.updated_at = new Date(updatedAt);
      return { rows: [{ ...w }], rowCount: 1 };
    }

    if (normalized.startsWith('UPDATE public.wallets SET total_deposited = $2, updated_at = $3')) {
      const [customerId, totalDeposited, updatedAt] = values as [
        string,
        string,
        string,
      ];
      const w = this.wallets.get(customerId);
      if (!w) return { rows: [] };
      w.total_deposited = Number(totalDeposited).toFixed(2);
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
      const isCustomerInsert = normalized.includes('NULL, NULL, NULL, $21, $21');
      if (isCustomerInsert) {
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
        reviewerId,
        reviewerName,
        reviewNotes,
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
        string | null,
        string | null,
        string | null,
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
        metadata: {},
        reviewer_id: reviewerId,
        reviewer_name: reviewerName,
        review_notes: reviewNotes,
        created_at: new Date(ts),
        updated_at: new Date(ts),
      };
      this.topups.set(id, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    if (
      normalized.startsWith('SELECT id, customer_id, customer_name, amount') &&
      normalized.includes('FROM public.topups WHERE id = $1 FOR UPDATE')
    ) {
      const id = String(values[0] ?? '');
      if (this.delayInsideTransitionLockMs > 0) {
        await new Promise((r) => setTimeout(r, this.delayInsideTransitionLockMs));
      }
      const row = this.topups.get(id);
      return { rows: row ? [{ ...row }] : [] };
    }

    if (
      normalized.startsWith('SELECT id, customer_id, customer_name, amount') &&
      normalized.includes('FROM public.topups WHERE id = $1 LIMIT 1')
    ) {
      const id = String(values[0] ?? '');
      const row = this.topups.get(id);
      return { rows: row ? [{ ...row }] : [] };
    }

    if (normalized.startsWith('UPDATE public.topups SET amount = $2')) {
      const [
        id,
        amount,
        bonusAmount,
        bonusPercentage,
        feeAmount,
        finalWalletCredit,
        reviewerId,
        reviewerName,
        reviewNotes,
        updatedAt,
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
      ];
      const row = this.topups.get(id);
      if (!row) return { rows: [] };
      row.amount = Number(amount).toFixed(2);
      row.bonus_amount = Number(bonusAmount).toFixed(2);
      row.bonus_percentage = Number(bonusPercentage).toFixed(2);
      row.fee_amount = Number(feeAmount).toFixed(2);
      row.final_wallet_credit = Number(finalWalletCredit).toFixed(2);
      row.status = 'completed';
      row.reviewer_id = reviewerId;
      row.reviewer_name = reviewerName;
      row.review_notes = reviewNotes;
      row.updated_at = new Date(updatedAt);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    if (normalized.startsWith("UPDATE public.topups SET status = 'rejected'")) {
      const [id, reviewerId, reviewerName, reason, updatedAt] = values as [
        string,
        string,
        string,
        string,
        string,
      ];
      const row = this.topups.get(id);
      if (!row) return { rows: [] };
      row.status = 'rejected';
      row.reviewer_id = reviewerId;
      row.reviewer_name = reviewerName;
      row.review_notes = reason;
      row.updated_at = new Date(updatedAt);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    if (normalized.startsWith('SELECT COUNT(*)::int AS total FROM public.topups')) {
      const filtered = this.filterTopUps(normalized, values);
      return { rows: [{ total: filtered.length }] };
    }

    if (
      normalized.startsWith('SELECT id, customer_id, customer_name, amount') &&
      normalized.includes('FROM public.topups')
    ) {
      const limit = Number(values[values.length - 2] ?? 25);
      const offset = Number(values[values.length - 1] ?? 0);
      const filterParams = values.slice(0, values.length - 2);
      const filtered = this.filterTopUps(normalized, filterParams);

      const isAsc = normalized.includes('ASC, id ASC');
      const sortByAmount = normalized.includes('ORDER BY amount');
      const sortByUpdated = normalized.includes('ORDER BY updated_at');

      filtered.sort((a, b) => {
        let cmp = 0;
        if (sortByAmount) {
          cmp = Number(a.amount) - Number(b.amount);
        } else if (sortByUpdated) {
          cmp = a.updated_at.getTime() - b.updated_at.getTime();
        } else {
          cmp = a.created_at.getTime() - b.created_at.getTime();
        }
        if (cmp !== 0) return isAsc ? cmp : -cmp;
        return isAsc ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
      });

      return { rows: filtered.slice(offset, offset + limit) };
    }

    throw new Error(`Unexpected SQL in deposit test DB: ${normalized}`);
  }

  private filterTopUps(
    normalizedSql: string,
    values: unknown[],
  ): InMemoryTopUpRow[] {
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

    return Array.from(this.topups.values()).filter((t) => {
      if (customerId && t.customer_id !== customerId) return false;
      if (status && t.status !== status) return false;
      if (beforeCreatedAtMs !== undefined && t.created_at.getTime() >= beforeCreatedAtMs) {
        return false;
      }
      if (searchTerm) {
        const hay = [
          t.id,
          t.customer_name,
          t.payment_method_name,
          t.target_game_name ?? '',
          t.provider_ref ?? '',
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
    authSecret: 'test-only-deposit-secret-value-at-least-32-chars',
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

async function withDepositServer(
  run: (ctx: {
    baseUrl: string;
    db: InMemoryDepositDatabase;
    otps: SendOtpEmailPayload[];
  }) => Promise<void>,
): Promise<void> {
  const db = new InMemoryDepositDatabase();
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

  const sendOtpRes = await fetch(`${baseUrl}/api/auth/email-otp/send-verification-otp`, {
    method: 'POST',
    headers: {
      Origin: 'https://swiftsweeps.example.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email,
      type: 'email-verification',
    }),
  });
  assert.equal(sendOtpRes.status, 200);

  const otpPayload = [...otps].reverse().find((o) => o.to === params.email);
  assert.ok(otpPayload?.otp, `Expected OTP for ${params.email}`);

  const verifyRes = await fetch(`${baseUrl}/api/auth/email-otp/verify-email`, {
    method: 'POST',
    headers: {
      Origin: 'https://swiftsweeps.example.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email,
      otp: otpPayload.otp,
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
      email: params.email,
      password: params.password,
    }),
  });
  assert.equal(signInRes.status, 200);

  const cookie = extractCookies(signInRes);
  assert.ok(cookie.length > 0);

  const profileRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  assert.equal(profileRes.status, 200);
  const profileBody = (await profileRes.json()) as { user: { id: string } };
  return { cookie, userId: profileBody.user.id };
}

test('unauthenticated requests to /api/deposits* fail closed with 401', async () => {
  await withDepositServer(async ({ baseUrl }) => {
    const endpoints: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'GET', path: '/api/deposits' },
      { method: 'GET', path: '/api/deposits/req_topup_1' },
      {
        method: 'POST',
        path: '/api/deposits',
        body: { amount: 0, method: 'cashapp', receiptUrl: '/api/storage/file?bucket=receipts&path=a.png' },
      },
      {
        method: 'POST',
        path: '/api/deposits/staff',
        body: { customerId: 'usr_1', amount: 50, status: 'completed' },
      },
      {
        method: 'PATCH',
        path: '/api/deposits/req_topup_1/approve',
        body: { verifiedAmount: 50 },
      },
      {
        method: 'PATCH',
        path: '/api/deposits/req_topup_1/reject',
        body: { reason: 'Invalid proof' },
      },
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: ep.body ? { 'Content-Type': 'application/json' } : undefined,
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      assert.equal(res.status, 401, `Expected 401 for ${ep.method} ${ep.path}`);
    }
  });
});

test('deposit input validation rejects unsupported keys, unsafe URLs, invalid amounts, and bad query params', async () => {
  await withDepositServer(async ({ baseUrl, otps }) => {
    const alice = await signupAndSignIn(baseUrl, otps, {
      name: 'Alice Validator',
      email: 'alice-val@swiftsweeps.example.com',
      password: 'DepositPassword!123',
    });

    // 1. Rejects client-supplied status/customerId/bonusPercentage spoofing on POST /api/deposits
    const spoofRes = await fetch(`${baseUrl}/api/deposits`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: alice.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerId: 'someone_else',
        status: 'completed',
        method: 'cashapp',
        receiptUrl: '/api/storage/file?bucket=receipts&path=ok.png',
      }),
    });
    assert.equal(spoofRes.status, 400);

    // 2. Rejects javascript: XSS URL in receiptUrl
    const xssRes = await fetch(`${baseUrl}/api/deposits`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: alice.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 0,
        method: 'cashapp',
        receiptUrl: 'javascript:alert(1)',
      }),
    });
    assert.equal(xssRes.status, 400);

    // 3. Rejects missing receiptUrl on customer proof-first submission
    const missingProofRes = await fetch(`${baseUrl}/api/deposits`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: alice.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 50,
        method: 'cashapp',
      }),
    });
    assert.equal(missingProofRes.status, 400);

    // 4. Rejects unsupported query parameters / sort fields / out-of-range limit
    const badQuery1 = await fetch(`${baseUrl}/api/deposits?unknown=1`, {
      headers: { Cookie: alice.cookie },
    });
    assert.equal(badQuery1.status, 400);

    const badQuery2 = await fetch(`${baseUrl}/api/deposits?sortBy=status`, {
      headers: { Cookie: alice.cookie },
    });
    assert.equal(badQuery2.status, 400);

    const badQuery3 = await fetch(`${baseUrl}/api/deposits?limit=500`, {
      headers: { Cookie: alice.cookie },
    });
    assert.equal(badQuery3.status, 400);
  });
});

test('customer submits proof-first deposit (amount=0) and admin approves with verifiedAmount, crediting wallet total_deposited & ledger cleanly without double credit', async () => {
  await withDepositServer(async ({ baseUrl, db, otps }) => {
    const alice = await signupAndSignIn(baseUrl, otps, {
      name: 'Alice Player',
      email: 'alice-dep@swiftsweeps.example.com',
      password: 'DepositPassword!123',
    });
    const bob = await signupAndSignIn(baseUrl, otps, {
      name: 'Bob Player',
      email: 'bob-dep@swiftsweeps.example.com',
      password: 'DepositPassword!123',
    });
    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Desk Admin',
      email: 'admin-dep@swiftsweeps.example.com',
      password: 'DepositPassword!123',
    });
    db.users.get(admin.userId)!.role = 'admin';
    db.appConfig = {
      paymentMethods: [
        { type: 'cashapp', bonusPercentage: 30, feePercentage: 0 },
        { type: 'payment_link', bonusPercentage: 25, feePercentage: 0 },
      ],
    };

    // Customer creates proof-first deposit with amount = 0
    const submitRes = await fetch(`${baseUrl}/api/deposits`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: alice.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 0,
        method: 'cashapp',
        methodName: 'CashApp Verified',
        targetGameCatalogId: 'game_fire_kirin',
        targetGameName: 'Fire Kirin',
        targetGameUsername: 'alice_fk',
        receiptUrl: '/api/storage/file?bucket=receipts&path=alice_receipt.png',
        receiptName: 'alice_receipt.png',
        providerRef: 'Payment Screenshot Proof Attached',
      }),
    });
    assert.equal(submitRes.status, 201);
    const submitBody = (await submitRes.json()) as {
      deposit: {
        id: string;
        customerId: string;
        amount: number;
        bonusPercentage: number;
        status: string;
        receiptUrl: string;
      };
      wallet: { pendingDepositBalance: number; totalDeposited: number };
    };
    assert.equal(submitBody.deposit.customerId, alice.userId);
    assert.equal(submitBody.deposit.amount, 0);
    assert.equal(submitBody.deposit.bonusPercentage, 30);
    assert.equal(submitBody.deposit.status, 'submitted');
    assert.equal(submitBody.wallet.pendingDepositBalance, 0);
    assert.equal(submitBody.wallet.totalDeposited, 0);

    const depositId = submitBody.deposit.id;

    // Cross-customer isolation: Bob cannot read Alice's deposit or query customerId=alice
    const bobReadOne = await fetch(`${baseUrl}/api/deposits/${depositId}`, {
      headers: { Cookie: bob.cookie },
    });
    assert.equal(bobReadOne.status, 403);

    const bobQueryAlice = await fetch(
      `${baseUrl}/api/deposits?customerId=${encodeURIComponent(alice.userId)}`,
      { headers: { Cookie: bob.cookie } },
    );
    assert.equal(bobQueryAlice.status, 403);

    // Customer cannot approve or reject their own or anyone's deposit, nor call /staff
    const custApprove = await fetch(`${baseUrl}/api/deposits/${depositId}/approve`, {
      method: 'PATCH',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: alice.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ verifiedAmount: 100 }),
    });
    assert.equal(custApprove.status, 403);

    const custReject = await fetch(`${baseUrl}/api/deposits/${depositId}/reject`, {
      method: 'PATCH',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: alice.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Cannot reject' }),
    });
    assert.equal(custReject.status, 403);

    const custStaff = await fetch(`${baseUrl}/api/deposits/staff`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: alice.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customerId: alice.userId, amount: 50, status: 'completed' }),
    });
    assert.equal(custStaff.status, 403);

    // Approving without verifiedAmount when amount === 0 must fail validation (400)
    const zeroApproveRes = await fetch(`${baseUrl}/api/deposits/${depositId}/approve`, {
      method: 'PATCH',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notes: 'Missing amount' }),
    });
    assert.equal(zeroApproveRes.status, 400);

    // Concurrent double approval race: only 1 succeeds (200), the second fails with 409 CONFLICT
    db.delayInsideTransitionLockMs = 25;
    const [approveRes1, approveRes2] = await Promise.all([
      fetch(`${baseUrl}/api/deposits/${depositId}/approve`, {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ verifiedAmount: 100, notes: 'Screenshot verified $100' }),
      }),
      fetch(`${baseUrl}/api/deposits/${depositId}/approve`, {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ verifiedAmount: 100, notes: 'Duplicate click' }),
      }),
    ]);
    db.delayInsideTransitionLockMs = 0;

    const statuses = [approveRes1.status, approveRes2.status].sort();
    assert.deepEqual(statuses, [200, 409]);

    const winnerBody = (await (approveRes1.status === 200 ? approveRes1 : approveRes2).json()) as {
      deposit: {
        amount: number;
        bonusPercentage: number;
        bonusAmount: number;
        finalWalletCredit: number;
        status: string;
        reviewerId: string;
      };
      wallet: { totalDeposited: number; pendingDepositBalance: number };
    };

    assert.equal(winnerBody.deposit.amount, 100);
    assert.equal(winnerBody.deposit.bonusPercentage, 30);
    assert.equal(winnerBody.deposit.bonusAmount, 30);
    assert.equal(winnerBody.deposit.finalWalletCredit, 130);
    assert.equal(winnerBody.deposit.status, 'completed');
    assert.equal(winnerBody.deposit.reviewerId, admin.userId);
    assert.equal(winnerBody.wallet.totalDeposited, 100);
    assert.equal(winnerBody.wallet.pendingDepositBalance, 0);

    // Reject after completion is also blocked (409)
    const rejectAfterComplete = await fetch(`${baseUrl}/api/deposits/${depositId}/reject`, {
      method: 'PATCH',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Late reject' }),
    });
    assert.equal(rejectAfterComplete.status, 409);

    // Ledger entries written exactly once for deposit & bonus
    const depTx = db.transactions.get(`tx_dep_${depositId}`);
    const bnsTx = db.transactions.get(`tx_bns_${depositId}`);
    assert.ok(depTx);
    assert.equal(depTx.amount, '100.00');
    assert.equal(depTx.type, 'deposit');
    assert.ok(bnsTx);
    assert.equal(bnsTx.amount, '30.00');
    assert.equal(bnsTx.type, 'bonus');
    assert.equal(db.transactions.size, 2);

    // Audit trail captured both TOPUP_SUBMITTED and TOPUP_APPROVED
    assert.ok(db.auditLogs.some((a) => a.action === 'TOPUP_SUBMITTED' && a.entity_id === depositId));
    assert.ok(db.auditLogs.some((a) => a.action === 'TOPUP_APPROVED' && a.entity_id === depositId));
  });
});

test('admin rejection releases pending_deposit and staff creation handles both completed and submitted deposits, pagination, sorting, search, and DB failure rollback', async () => {
  await withDepositServer(async ({ baseUrl, db, otps }) => {
    const alice = await signupAndSignIn(baseUrl, otps, {
      name: 'Alice Queue',
      email: 'alice-queue@swiftsweeps.example.com',
      password: 'DepositPassword!123',
    });
    const agent = await signupAndSignIn(baseUrl, otps, {
      name: 'Support Agent',
      email: 'agent-dep@swiftsweeps.example.com',
      password: 'DepositPassword!123',
    });
    db.users.get(agent.userId)!.role = 'agent';

    // 1. Staff deposit missing customer -> 404
    const missingCustRes = await fetch(`${baseUrl}/api/deposits/staff`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: agent.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerId: 'usr_does_not_exist',
        amount: 50,
        status: 'completed',
      }),
    });
    assert.equal(missingCustRes.status, 404);

    // 2. Staff creates pending submitted deposit ($40) -> pendingDepositBalance becomes 40
    const staffPendingRes = await fetch(`${baseUrl}/api/deposits/staff`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: agent.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerId: alice.userId,
        amount: 40,
        bonusPercentage: 15,
        method: 'chime',
        methodName: 'Chime Direct',
        targetGameCatalogId: 'game_orion',
        targetGameName: 'Orion Stars',
        status: 'submitted',
        notes: 'Awaiting screenshot',
      }),
    });
    assert.equal(staffPendingRes.status, 201);
    const staffPendingBody = (await staffPendingRes.json()) as {
      deposit: { id: string; amount: number; bonusAmount: number; status: string };
      wallet: { pendingDepositBalance: number; totalDeposited: number };
    };
    assert.equal(staffPendingBody.deposit.status, 'submitted');
    assert.equal(staffPendingBody.wallet.pendingDepositBalance, 40);
    assert.equal(staffPendingBody.wallet.totalDeposited, 0);

    // 3. Agent rejects the pending deposit -> pendingDepositBalance resets to 0
    const rejectRes = await fetch(
      `${baseUrl}/api/deposits/${staffPendingBody.deposit.id}/reject`,
      {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: agent.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Unreadable receipt screenshot' }),
      },
    );
    assert.equal(rejectRes.status, 200);
    const rejectBody = (await rejectRes.json()) as {
      deposit: { status: string; reviewNotes: string };
      wallet: { pendingDepositBalance: number };
    };
    assert.equal(rejectBody.deposit.status, 'rejected');
    assert.equal(rejectBody.deposit.reviewNotes, 'Unreadable receipt screenshot');
    assert.equal(rejectBody.wallet.pendingDepositBalance, 0);

    // 4. Staff creates completed deposit ($80 + 25% = $100 credit)
    const staffCompletedRes = await fetch(`${baseUrl}/api/deposits/staff`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: agent.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerId: alice.userId,
        amount: 80,
        bonusPercentage: 25,
        method: 'payment_link',
        methodName: 'Payment Link',
        targetGameCatalogId: 'game_orion',
        targetGameName: 'Orion Stars',
        status: 'completed',
        notes: 'Settled on desk',
      }),
    });
    assert.equal(staffCompletedRes.status, 201);
    const staffCompletedBody = (await staffCompletedRes.json()) as {
      deposit: { id: string; bonusAmount: number; finalWalletCredit: number };
      wallet: { totalDeposited: number };
    };
    assert.equal(staffCompletedBody.deposit.bonusAmount, 20);
    assert.equal(staffCompletedBody.deposit.finalWalletCredit, 100);
    assert.equal(staffCompletedBody.wallet.totalDeposited, 80);

    // 5. Filtering, sorting, search & pagination on GET /api/deposits
    const listAscRes = await fetch(
      `${baseUrl}/api/deposits?customerId=${encodeURIComponent(alice.userId)}&sortBy=amount&sortOrder=asc&limit=1&offset=0`,
      { headers: { Cookie: alice.cookie } },
    );
    assert.equal(listAscRes.status, 200);
    const listAscBody = (await listAscRes.json()) as {
      deposits: Array<{ amount: number }>;
      total: number;
      hasMore: boolean;
    };
    assert.equal(listAscBody.total, 2);
    assert.equal(listAscBody.hasMore, true);
    assert.equal(listAscBody.deposits[0].amount, 40);

    const searchRes = await fetch(
      `${baseUrl}/api/deposits?q=Payment%20Link&status=completed`,
      { headers: { Cookie: alice.cookie } },
    );
    assert.equal(searchRes.status, 200);
    const searchBody = (await searchRes.json()) as {
      deposits: Array<{ id: string }>;
      total: number;
    };
    assert.equal(searchBody.total, 1);
    assert.equal(searchBody.deposits[0].id, staffCompletedBody.deposit.id);

    // 6. Database failure rolls back cleanly and masks connection details from client response
    db.failNextDepositQuery = true;
    const rollbackCountBefore = db.rollbackCount;
    const dbErrRes = await fetch(`${baseUrl}/api/deposits`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: alice.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 25,
        method: 'cashapp',
        receiptUrl: '/api/storage/file?bucket=receipts&path=fail_rollback.png',
      }),
    });
    assert.equal(dbErrRes.status, 500);
    const dbErrText = await dbErrRes.text();
    assert.ok(!dbErrText.includes('supersecret'));
    assert.ok(!dbErrText.includes('postgres://'));
    assert.ok(db.rollbackCount > rollbackCountBefore);
  });
});

test('suspended customer cannot submit deposits', async () => {
  await withDepositServer(async ({ baseUrl, db, otps }) => {
    const alice = await signupAndSignIn(baseUrl, otps, {
      name: 'Suspended Player',
      email: 'suspended-dep@swiftsweeps.example.com',
      password: 'DepositPassword!123',
    });
    db.users.get(alice.userId)!.status = 'suspended';

    const res = await fetch(`${baseUrl}/api/deposits`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: alice.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 50,
        method: 'cashapp',
        receiptUrl: '/api/storage/file?bucket=receipts&path=blocked.png',
      }),
    });
    assert.equal(res.status, 403);
  });
});
