import crypto from 'node:crypto';
import type { DatabaseClient, DatabasePool } from '../db/pool.js';
import type { AppUserRole } from '../auth/userDirectoryRepo.js';
import type { WalletRecord } from '../wallet/walletRepo.js';

export type DepositStatusValue =
  | 'pending'
  | 'submitted'
  | 'verifying'
  | 'approved'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export type DepositSortField = 'createdAt' | 'updatedAt' | 'amount';
export type DepositSortOrder = 'asc' | 'desc';

export interface DepositRecord {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  currency: string;
  bonusAmount: number;
  bonusPercentage: number;
  feeAmount: number;
  finalWalletCredit: number;
  method: string;
  methodName: string;
  status: DepositStatusValue;
  receiptUrl: string | null;
  receiptName: string | null;
  targetGameName: string | null;
  targetGameCatalogId: string | null;
  targetGameUsername: string | null;
  fundingSource: string;
  providerRef: string | null;
  customerNotes: string | null;
  cryptoNetwork: string | null;
  cryptoTxHash: string | null;
  depositAddress: string | null;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListDepositsOptions {
  customerId?: string;
  status?: DepositStatusValue;
  beforeCreatedAt?: string;
  search?: string;
  sortBy: DepositSortField;
  sortOrder: DepositSortOrder;
  limit: number;
  offset: number;
}

export interface ListDepositsResult {
  items: DepositRecord[];
  total: number;
}

export interface CreateCustomerDepositInput {
  customerId: string;
  customerName: string;
  actorRole: AppUserRole;
  amount: number;
  method: string;
  methodName: string;
  targetGameCatalogId?: string;
  targetGameName?: string;
  targetGameUsername?: string;
  receiptUrl: string;
  receiptName?: string;
  providerRef?: string;
  customerNotes?: string;
  cryptoNetwork?: string;
  cryptoTxHash?: string;
  depositAddress?: string;
}

export interface CreateStaffDepositInput {
  customerId: string;
  customerName: string;
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
  amount: number;
  bonusPercentage?: number;
  method: string;
  methodName: string;
  targetGameCatalogId?: string;
  targetGameName?: string;
  targetGameUsername?: string;
  providerRef?: string;
  receiptUrl?: string;
  receiptName?: string;
  notes?: string;
  status: 'completed' | 'submitted';
}

export interface ApproveDepositInput {
  requestId: string;
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
  verifiedAmount?: number;
  notes?: string;
}

export interface RejectDepositInput {
  requestId: string;
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
  reason: string;
}

export class DepositNotFoundError extends Error {
  constructor(message = 'Deposit request not found.') {
    super(message);
    this.name = 'DepositNotFoundError';
  }
}

export class DepositConflictError extends Error {
  constructor(message = 'Deposit request cannot transition from its current status.') {
    super(message);
    this.name = 'DepositConflictError';
  }
}

export class DepositValidationError extends Error {
  constructor(message = 'Invalid deposit request parameters.') {
    super(message);
    this.name = 'DepositValidationError';
  }
}

interface RawTopUpRow {
  id: string;
  customer_id: string;
  customer_name: string;
  amount: string | number;
  currency?: string | null;
  bonus_amount: string | number;
  bonus_percentage?: string | number | null;
  fee_amount?: string | number | null;
  final_wallet_credit?: string | number | null;
  payment_method_id: string;
  payment_method_name: string;
  status: string;
  proof_url: string | null;
  receipt_name?: string | null;
  target_game_name: string | null;
  target_game_account_id: string | null;
  target_game_username?: string | null;
  funding_source?: string | null;
  provider_ref?: string | null;
  customer_notes: string | null;
  metadata?: Record<string, unknown> | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  review_notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawWalletRow {
  customer_id: string;
  balance: string | number;
  referral_bonus_balance: string | number;
  free_play_balance: string | number;
  pending_withdrawal: string | number;
  pending_deposit: string | number;
  total_deposited: string | number;
  total_withdrawn: string | number;
  currency: string;
  updated_at: Date | string;
}

interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

const VALID_DEPOSIT_STATUSES = new Set<DepositStatusValue>([
  'pending',
  'submitted',
  'verifying',
  'approved',
  'completed',
  'rejected',
  'cancelled',
]);

const TERMINAL_STATUSES = new Set<DepositStatusValue>([
  'approved',
  'completed',
  'rejected',
  'cancelled',
]);

const SORT_COLUMN_MAP: Record<DepositSortField, string> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  amount: 'amount',
};

const DEPOSIT_COLUMNS = `
  id,
  customer_id,
  customer_name,
  amount,
  currency,
  bonus_amount,
  bonus_percentage,
  fee_amount,
  final_wallet_credit,
  payment_method_id,
  payment_method_name,
  status,
  proof_url,
  receipt_name,
  target_game_name,
  target_game_account_id,
  target_game_username,
  funding_source,
  provider_ref,
  customer_notes,
  metadata,
  reviewer_id,
  reviewer_name,
  review_notes,
  created_at,
  updated_at
`;

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toFixedMoneyNumber(value: string | number | null | undefined): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Number(num.toFixed(2));
}

function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function normalizeDepositStatus(raw: string): DepositStatusValue {
  if (VALID_DEPOSIT_STATUSES.has(raw as DepositStatusValue)) {
    return raw as DepositStatusValue;
  }
  return 'submitted';
}

function parseMetadataObject(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

function readOptionalMetadataString(
  meta: Record<string, unknown>,
  key: string,
): string | null {
  const val = meta[key];
  return typeof val === 'string' && val.trim() ? val.trim() : null;
}

export function defaultBonusPctForMethod(method: string): number {
  switch (method.trim().toLowerCase()) {
    case 'cashapp':
      return 30;
    case 'crypto':
      return 30;
    case 'payment_link':
      return 20;
    case 'chime':
      return 15;
    case 'manual_receipt':
    case 'manual_support':
      return 0;
    default:
      return 0;
  }
}

function mapWalletRow(row: RawWalletRow): WalletRecord {
  return {
    customerId: String(row.customer_id),
    currency: String(row.currency || 'USD').trim() || 'USD',
    availableBalance: toFixedMoneyNumber(row.balance),
    referralBonusBalance: toFixedMoneyNumber(row.referral_bonus_balance),
    freePlayBalance: toFixedMoneyNumber(row.free_play_balance),
    reservedBalance: toFixedMoneyNumber(row.pending_withdrawal),
    pendingDepositBalance: toFixedMoneyNumber(row.pending_deposit),
    totalDeposited: toFixedMoneyNumber(row.total_deposited),
    totalWithdrawn: toFixedMoneyNumber(row.total_withdrawn),
    lastUpdatedAt: toIsoString(row.updated_at),
  };
}

function mapTopUpRow(row: RawTopUpRow): DepositRecord {
  const meta = parseMetadataObject(row.metadata);
  const amount = toFixedMoneyNumber(row.amount);
  const bonusAmount = toFixedMoneyNumber(row.bonus_amount);
  const feeAmount = toFixedMoneyNumber(row.fee_amount);
  const explicitFinal = toFixedMoneyNumber(row.final_wallet_credit);
  const finalWalletCredit =
    explicitFinal > 0
      ? explicitFinal
      : Number((amount + bonusAmount).toFixed(2));

  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    customerName: String(row.customer_name || 'Customer'),
    amount,
    currency: String(row.currency || 'USD').trim() || 'USD',
    bonusAmount,
    bonusPercentage: toFixedMoneyNumber(row.bonus_percentage),
    feeAmount,
    finalWalletCredit,
    method: String(row.payment_method_id || 'payment_link'),
    methodName: String(row.payment_method_name || 'Payment Link'),
    status: normalizeDepositStatus(row.status),
    receiptUrl: row.proof_url ?? null,
    receiptName: row.receipt_name ?? null,
    targetGameName: row.target_game_name ?? null,
    targetGameCatalogId: row.target_game_account_id ?? null,
    targetGameUsername: row.target_game_username ?? null,
    fundingSource: String(row.funding_source || 'payment_method'),
    providerRef: row.provider_ref ?? row.customer_notes ?? null,
    customerNotes: row.customer_notes ?? null,
    cryptoNetwork: readOptionalMetadataString(meta, 'cryptoNetwork'),
    cryptoTxHash: readOptionalMetadataString(meta, 'cryptoTxHash'),
    depositAddress: readOptionalMetadataString(meta, 'depositAddress'),
    reviewerId: row.reviewer_id ?? null,
    reviewerName: row.reviewer_name ?? null,
    reviewNotes: row.review_notes ?? null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function runQuery<T extends Record<string, unknown>>(
  executor: Pick<DatabaseClient, 'query'>,
  sql: string,
  params: unknown[],
): Promise<QueryResultLike<T>> {
  return (await executor.query(sql, params)) as QueryResultLike<T>;
}

async function ensureWalletLocked(
  client: DatabaseClient,
  customerId: string,
): Promise<WalletRecord> {
  await runQuery(
    client,
    `INSERT INTO public.wallets (customer_id) VALUES ($1) ON CONFLICT (customer_id) DO NOTHING`,
    [customerId],
  );
  const res = await runQuery<RawWalletRow & Record<string, unknown>>(
    client,
    `
      SELECT
        customer_id,
        balance,
        referral_bonus_balance,
        free_play_balance,
        pending_withdrawal,
        pending_deposit,
        total_deposited,
        total_withdrawn,
        currency,
        updated_at
      FROM public.wallets
      WHERE customer_id = $1
      FOR UPDATE
    `,
    [customerId],
  );
  if (!res.rows[0]) {
    throw new Error('Failed to initialize customer wallet inside deposit transaction.');
  }
  return mapWalletRow(res.rows[0]);
}

async function resolveConfiguredMethodRates(
  client: DatabaseClient,
  method: string,
): Promise<{ bonusPercentage: number; feePercentage: number }> {
  const normalizedMethod = method.trim().toLowerCase();
  const cfgRes = await runQuery<{ data: unknown } & Record<string, unknown>>(
    client,
    `SELECT data FROM public.app_config WHERE id = 'main' LIMIT 1`,
    [],
  );
  const rawData = cfgRes.rows[0]?.data;
  const data =
    typeof rawData === 'string'
      ? (() => {
          try {
            return JSON.parse(rawData) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : rawData && typeof rawData === 'object'
        ? (rawData as Record<string, unknown>)
        : null;

  const methods = Array.isArray(data?.paymentMethods)
    ? (data.paymentMethods as Array<Record<string, unknown>>)
    : [];
  const match = methods.find(
    (m) =>
      typeof m?.type === 'string' &&
      m.type.trim().toLowerCase() === normalizedMethod,
  );

  const bonusFromConfig =
    match && typeof match.bonusPercentage === 'number' && Number.isFinite(match.bonusPercentage)
      ? Math.max(0, Math.min(500, Number(match.bonusPercentage)))
      : null;
  const feeFromConfig =
    match && typeof match.feePercentage === 'number' && Number.isFinite(match.feePercentage)
      ? Math.max(0, Math.min(100, Number(match.feePercentage)))
      : 0;

  return {
    bonusPercentage: bonusFromConfig ?? defaultBonusPctForMethod(normalizedMethod),
    feePercentage: feeFromConfig,
  };
}

async function recomputeCompletedRealCashTotal(
  client: DatabaseClient,
  customerId: string,
): Promise<number> {
  const res = await runQuery<{ total_completed: string | number } & Record<string, unknown>>(
    client,
    `
      SELECT COALESCE(SUM(amount), 0) AS total_completed
      FROM public.topups
      WHERE customer_id = $1
        AND status IN ('completed', 'approved')
        AND payment_method_id <> 'referral_bonus'
    `,
    [customerId],
  );
  return toFixedMoneyNumber(res.rows[0]?.total_completed);
}

async function insertAuditLog(
  client: DatabaseClient,
  params: {
    actorId: string;
    actorName: string;
    actorRole: string;
    action: string;
    entityId: string;
    details: string;
    timestamp: string;
  },
): Promise<void> {
  const auditId = `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  await runQuery(
    client,
    `
      INSERT INTO public.audit_logs (
        id,
        actor_id,
        actor_name,
        actor_role,
        action,
        entity_type,
        entity_id,
        details,
        timestamp
      )
      VALUES ($1, $2, $3, $4, $5, 'topup', $6, $7, $8)
    `,
    [
      auditId,
      params.actorId,
      params.actorName,
      params.actorRole,
      params.action,
      params.entityId,
      params.details,
      params.timestamp,
    ],
  );
}

export class DepositRepo {
  private readonly pool: Pick<DatabasePool, 'query'> &
    Partial<Pick<DatabasePool, 'connect'>>;

  constructor(
    pool: Pick<DatabasePool, 'query'> & Partial<Pick<DatabasePool, 'connect'>>,
  ) {
    this.pool = pool;
  }

  private async withTransaction<T>(
    fn: (client: DatabaseClient) => Promise<T>,
  ): Promise<T> {
    if (typeof this.pool.connect === 'function') {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Ignore secondary rollback failure
        }
        throw err;
      } finally {
        client.release();
      }
    }

    const fallbackClient: DatabaseClient = {
      query: (text, values) => this.pool.query(text, values),
      release: () => {},
    };
    await fallbackClient.query('BEGIN');
    try {
      const result = await fn(fallbackClient);
      await fallbackClient.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await fallbackClient.query('ROLLBACK');
      } catch {
        // Ignore secondary rollback failure
      }
      throw err;
    }
  }

  public async findDepositById(id: string): Promise<DepositRecord | null> {
    const result = await runQuery<RawTopUpRow & Record<string, unknown>>(
      this.pool,
      `
        SELECT ${DEPOSIT_COLUMNS}
        FROM public.topups
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );
    const row = result.rows[0];
    return row ? mapTopUpRow(row) : null;
  }

  public async listDeposits(
    options: ListDepositsOptions,
  ): Promise<ListDepositsResult> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.customerId) {
      params.push(options.customerId);
      conditions.push(`customer_id = $${params.length}`);
    }
    if (options.status) {
      params.push(options.status);
      conditions.push(`status = $${params.length}`);
    }
    if (options.beforeCreatedAt) {
      params.push(options.beforeCreatedAt);
      conditions.push(`created_at < $${params.length}::timestamptz`);
    }
    if (options.search) {
      params.push(`%${escapeIlikePattern(options.search)}%`);
      const p = `$${params.length}`;
      conditions.push(
        `(id ILIKE ${p} ESCAPE '\\' OR customer_name ILIKE ${p} ESCAPE '\\' OR payment_method_name ILIKE ${p} ESCAPE '\\' OR COALESCE(target_game_name, '') ILIKE ${p} ESCAPE '\\' OR COALESCE(provider_ref, '') ILIKE ${p} ESCAPE '\\')`,
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortColumn = SORT_COLUMN_MAP[options.sortBy];
    const sortDir = options.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countResult = await runQuery<{ total: number } & Record<string, unknown>>(
      this.pool,
      `SELECT COUNT(*)::int AS total FROM public.topups ${whereClause}`,
      params,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const listParams = [...params, options.limit, options.offset];
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const rowsResult = await runQuery<RawTopUpRow & Record<string, unknown>>(
      this.pool,
      `
        SELECT ${DEPOSIT_COLUMNS}
        FROM public.topups
        ${whereClause}
        ORDER BY ${sortColumn} ${sortDir}, id ${sortDir}
        LIMIT $${limitIdx}
        OFFSET $${offsetIdx}
      `,
      listParams,
    );

    return {
      items: rowsResult.rows.map(mapTopUpRow),
      total,
    };
  }

  public async createCustomerDeposit(
    input: CreateCustomerDepositInput,
  ): Promise<{ deposit: DepositRecord; wallet: WalletRecord }> {
    return this.withTransaction(async (client) => {
      const wallet = await ensureWalletLocked(client, input.customerId);
      const { bonusPercentage, feePercentage } =
        await resolveConfiguredMethodRates(client, input.method);

      const amount = toFixedMoneyNumber(input.amount);
      const bonusAmount =
        amount > 0
          ? Number(((amount * bonusPercentage) / 100).toFixed(2))
          : 0;
      const feeAmount =
        amount > 0 ? Number(((amount * feePercentage) / 100).toFixed(2)) : 0;
      const finalWalletCredit = Number((amount + bonusAmount).toFixed(2));

      const requestId = `req_topup_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const nowIso = new Date().toISOString();
      const initialStatus: DepositStatusValue =
        input.method === 'manual_receipt' ? 'verifying' : 'submitted';

      const metadata: Record<string, unknown> = {
        ...(input.cryptoNetwork ? { cryptoNetwork: input.cryptoNetwork } : {}),
        ...(input.cryptoTxHash ? { cryptoTxHash: input.cryptoTxHash } : {}),
        ...(input.depositAddress ? { depositAddress: input.depositAddress } : {}),
      };

      const insertRes = await runQuery<RawTopUpRow & Record<string, unknown>>(
        client,
        `
          INSERT INTO public.topups (
            id,
            customer_id,
            customer_name,
            amount,
            currency,
            bonus_amount,
            bonus_percentage,
            fee_amount,
            final_wallet_credit,
            payment_method_id,
            payment_method_name,
            status,
            proof_url,
            receipt_name,
            target_game_name,
            target_game_account_id,
            target_game_username,
            funding_source,
            provider_ref,
            customer_notes,
            metadata,
            reviewer_id,
            reviewer_name,
            review_notes,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16, $17, 'payment_method',
            $18, $19, $20::jsonb, NULL, NULL, NULL, $21, $21
          )
          RETURNING ${DEPOSIT_COLUMNS}
        `,
        [
          requestId,
          input.customerId,
          input.customerName,
          amount.toFixed(2),
          wallet.currency,
          bonusAmount.toFixed(2),
          bonusPercentage.toFixed(2),
          feeAmount.toFixed(2),
          finalWalletCredit.toFixed(2),
          input.method,
          input.methodName,
          initialStatus,
          input.receiptUrl,
          input.receiptName ?? null,
          input.targetGameName ?? null,
          input.targetGameCatalogId ?? null,
          input.targetGameUsername ?? null,
          input.providerRef ?? null,
          input.customerNotes ?? input.providerRef ?? null,
          JSON.stringify(metadata),
          nowIso,
        ],
      );

      let nextWallet = wallet;
      if (amount > 0) {
        const nextPendingDeposit = Number(
          (wallet.pendingDepositBalance + amount).toFixed(2),
        );
        const walletRes = await runQuery<RawWalletRow & Record<string, unknown>>(
          client,
          `
            UPDATE public.wallets
            SET pending_deposit = $2, updated_at = $3
            WHERE customer_id = $1
            RETURNING
              customer_id, balance, referral_bonus_balance, free_play_balance,
              pending_withdrawal, pending_deposit, total_deposited, total_withdrawn,
              currency, updated_at
          `,
          [input.customerId, nextPendingDeposit.toFixed(2), nowIso],
        );
        nextWallet = walletRes.rows[0] ? mapWalletRow(walletRes.rows[0]) : wallet;
      }

      await insertAuditLog(client, {
        actorId: input.customerId,
        actorName: input.customerName,
        actorRole: input.actorRole,
        action: 'TOPUP_SUBMITTED',
        entityId: requestId,
        details: `Submitted ${input.methodName} deposit request${amount > 0 ? ` for $${amount.toFixed(2)}` : ' (proof-first)'} (Status: ${initialStatus}).`,
        timestamp: nowIso,
      });

      const created = insertRes.rows[0];
      if (!created) {
        throw new Error('Failed to create deposit request.');
      }
      return {
        deposit: mapTopUpRow(created),
        wallet: nextWallet,
      };
    });
  }

  public async createStaffDeposit(
    input: CreateStaffDepositInput,
  ): Promise<{ deposit: DepositRecord; wallet: WalletRecord }> {
    return this.withTransaction(async (client) => {
      const wallet = await ensureWalletLocked(client, input.customerId);
      const rates = await resolveConfiguredMethodRates(client, input.method);

      const amount = toFixedMoneyNumber(input.amount);
      const bonusPercentage =
        input.bonusPercentage !== undefined
          ? Number(Math.max(0, Math.min(500, input.bonusPercentage)).toFixed(2))
          : rates.bonusPercentage;
      const bonusAmount = Number(((amount * bonusPercentage) / 100).toFixed(2));
      const feeAmount = Number(((amount * rates.feePercentage) / 100).toFixed(2));
      const finalWalletCredit = Number((amount + bonusAmount).toFixed(2));

      const requestId = `req_topup_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const nowIso = new Date().toISOString();
      const isCompleted = input.status === 'completed';
      const cleanNotes =
        input.notes?.trim() ||
        (isCompleted
          ? 'Direct deposit logged & finalized by support specialist.'
          : 'Pending deposit request created by support specialist.');

      const insertRes = await runQuery<RawTopUpRow & Record<string, unknown>>(
        client,
        `
          INSERT INTO public.topups (
            id,
            customer_id,
            customer_name,
            amount,
            currency,
            bonus_amount,
            bonus_percentage,
            fee_amount,
            final_wallet_credit,
            payment_method_id,
            payment_method_name,
            status,
            proof_url,
            receipt_name,
            target_game_name,
            target_game_account_id,
            target_game_username,
            funding_source,
            provider_ref,
            customer_notes,
            metadata,
            reviewer_id,
            reviewer_name,
            review_notes,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16, $17, 'payment_method',
            $18, $19, '{}'::jsonb, $20, $21, $22, $23, $23
          )
          RETURNING ${DEPOSIT_COLUMNS}
        `,
        [
          requestId,
          input.customerId,
          input.customerName,
          amount.toFixed(2),
          wallet.currency,
          bonusAmount.toFixed(2),
          bonusPercentage.toFixed(2),
          feeAmount.toFixed(2),
          finalWalletCredit.toFixed(2),
          input.method,
          input.methodName,
          input.status,
          input.receiptUrl ?? null,
          input.receiptName ?? null,
          input.targetGameName ?? null,
          input.targetGameCatalogId ?? null,
          input.targetGameUsername ?? null,
          input.providerRef ?? null,
          input.providerRef ?? null,
          isCompleted ? input.actorId : null,
          isCompleted ? input.actorName : null,
          cleanNotes,
          nowIso,
        ],
      );

      let nextWallet = wallet;
      if (isCompleted) {
        const nextTotalDeposited = await recomputeCompletedRealCashTotal(
          client,
          input.customerId,
        );
        const walletRes = await runQuery<RawWalletRow & Record<string, unknown>>(
          client,
          `
            UPDATE public.wallets
            SET total_deposited = $2, updated_at = $3
            WHERE customer_id = $1
            RETURNING
              customer_id, balance, referral_bonus_balance, free_play_balance,
              pending_withdrawal, pending_deposit, total_deposited, total_withdrawn,
              currency, updated_at
          `,
          [input.customerId, nextTotalDeposited.toFixed(2), nowIso],
        );
        nextWallet = walletRes.rows[0] ? mapWalletRow(walletRes.rows[0]) : wallet;

        const depTxDesc = input.targetGameName
          ? `Staff Logged Top-Up to ${input.targetGameName}${input.targetGameUsername ? ` (${input.targetGameUsername})` : ''} via ${input.methodName}`
          : `Staff Logged ${input.methodName} Deposit`;

        await runQuery(
          client,
          `
            INSERT INTO public.transactions (
              id, customer_id, amount, type, status, description, reference_id, game_name, created_at
            )
            VALUES ($1, $2, $3, 'deposit', 'completed', $4, $5, $6, $7)
            ON CONFLICT (id) DO NOTHING
          `,
          [
            `tx_dep_${requestId}`,
            input.customerId,
            amount.toFixed(2),
            depTxDesc,
            requestId,
            input.targetGameName ?? null,
            nowIso,
          ],
        );

        if (bonusAmount > 0) {
          await runQuery(
            client,
            `
              INSERT INTO public.transactions (
                id, customer_id, amount, type, status, description, reference_id, game_name, created_at
              )
              VALUES ($1, $2, $3, 'bonus', 'completed', $4, $5, $6, $7)
              ON CONFLICT (id) DO NOTHING
            `,
            [
              `tx_bns_${requestId}`,
              input.customerId,
              bonusAmount.toFixed(2),
              `Promo Bonus (${bonusPercentage}%) Credited by Staff`,
              requestId,
              input.targetGameName ?? null,
              nowIso,
            ],
          );
        }
      } else {
        const nextPendingDeposit = Number(
          (wallet.pendingDepositBalance + amount).toFixed(2),
        );
        const walletRes = await runQuery<RawWalletRow & Record<string, unknown>>(
          client,
          `
            UPDATE public.wallets
            SET pending_deposit = $2, updated_at = $3
            WHERE customer_id = $1
            RETURNING
              customer_id, balance, referral_bonus_balance, free_play_balance,
              pending_withdrawal, pending_deposit, total_deposited, total_withdrawn,
              currency, updated_at
          `,
          [input.customerId, nextPendingDeposit.toFixed(2), nowIso],
        );
        nextWallet = walletRes.rows[0] ? mapWalletRow(walletRes.rows[0]) : wallet;
      }

      await insertAuditLog(client, {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: isCompleted
          ? 'STAFF_TOPUP_LOGGED_COMPLETED'
          : 'STAFF_TOPUP_LOGGED_PENDING',
        entityId: requestId,
        details: `${isCompleted ? 'Logged completed' : 'Created pending'} top-up of $${amount.toFixed(2)} (+$${bonusAmount.toFixed(2)} bonus) for ${input.customerName}${input.targetGameName ? ` on ${input.targetGameName}` : ''}. Note: ${cleanNotes}`,
        timestamp: nowIso,
      });

      const created = insertRes.rows[0];
      if (!created) {
        throw new Error('Failed to create staff deposit request.');
      }
      return {
        deposit: mapTopUpRow(created),
        wallet: nextWallet,
      };
    });
  }

  public async approveDeposit(
    input: ApproveDepositInput,
  ): Promise<{ deposit: DepositRecord; wallet: WalletRecord }> {
    return this.withTransaction(async (client) => {
      const lockRes = await runQuery<RawTopUpRow & Record<string, unknown>>(
        client,
        `
          SELECT ${DEPOSIT_COLUMNS}
          FROM public.topups
          WHERE id = $1
          FOR UPDATE
        `,
        [input.requestId],
      );

      const raw = lockRes.rows[0];
      if (!raw) {
        throw new DepositNotFoundError();
      }

      const existing = mapTopUpRow(raw);
      if (existing.status === 'completed' || existing.status === 'approved') {
        throw new DepositConflictError(
          'Request is already completed (Double credit prevented).',
        );
      }
      if (TERMINAL_STATUSES.has(existing.status)) {
        throw new DepositConflictError(
          `Deposit request cannot be approved from "${existing.status}" status.`,
        );
      }

      const effectiveAmount =
        input.verifiedAmount !== undefined
          ? toFixedMoneyNumber(input.verifiedAmount)
          : existing.amount;
      if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) {
        throw new DepositValidationError(
          'Verified deposit amount must be greater than $0.00.',
        );
      }

      const rates = await resolveConfiguredMethodRates(client, existing.method);
      const bonusPercentage =
        existing.bonusPercentage > 0
          ? existing.bonusPercentage
          : rates.bonusPercentage;
      const bonusAmount = Number(
        ((effectiveAmount * bonusPercentage) / 100).toFixed(2),
      );
      const feeAmount =
        existing.feeAmount > 0
          ? existing.feeAmount
          : Number(((effectiveAmount * rates.feePercentage) / 100).toFixed(2));
      const finalWalletCredit = Number(
        (effectiveAmount + bonusAmount).toFixed(2),
      );

      const wallet = await ensureWalletLocked(client, existing.customerId);
      const nowIso = new Date().toISOString();
      const reviewNotes =
        input.notes?.trim() || 'Approved by customer care operator.';

      const updateRes = await runQuery<RawTopUpRow & Record<string, unknown>>(
        client,
        `
          UPDATE public.topups
          SET
            amount = $2,
            bonus_amount = $3,
            bonus_percentage = $4,
            fee_amount = $5,
            final_wallet_credit = $6,
            status = 'completed',
            reviewer_id = $7,
            reviewer_name = $8,
            review_notes = $9,
            updated_at = $10
          WHERE id = $1
          RETURNING ${DEPOSIT_COLUMNS}
        `,
        [
          existing.id,
          effectiveAmount.toFixed(2),
          bonusAmount.toFixed(2),
          bonusPercentage.toFixed(2),
          feeAmount.toFixed(2),
          finalWalletCredit.toFixed(2),
          input.actorId,
          input.actorName,
          reviewNotes,
          nowIso,
        ],
      );

      const releasedPending = Math.min(
        wallet.pendingDepositBalance,
        Math.max(0, existing.amount),
      );
      const nextPendingDeposit = Number(
        Math.max(0, wallet.pendingDepositBalance - releasedPending).toFixed(2),
      );
      const nextTotalDeposited = await recomputeCompletedRealCashTotal(
        client,
        existing.customerId,
      );

      const walletRes = await runQuery<RawWalletRow & Record<string, unknown>>(
        client,
        `
          UPDATE public.wallets
          SET
            pending_deposit = $2,
            total_deposited = $3,
            updated_at = $4
          WHERE customer_id = $1
          RETURNING
            customer_id, balance, referral_bonus_balance, free_play_balance,
            pending_withdrawal, pending_deposit, total_deposited, total_withdrawn,
            currency, updated_at
        `,
        [
          existing.customerId,
          nextPendingDeposit.toFixed(2),
          nextTotalDeposited.toFixed(2),
          nowIso,
        ],
      );

      const depDesc = existing.targetGameName
        ? `Direct Game Top-Up to ${existing.targetGameName}${existing.targetGameUsername ? ` (${existing.targetGameUsername})` : ''} Approved`
        : `${existing.methodName} Deposit Approved by Staff`;

      await runQuery(
        client,
        `
          INSERT INTO public.transactions (
            id, customer_id, amount, type, status, description, reference_id, game_name, created_at
          )
          VALUES ($1, $2, $3, 'deposit', 'completed', $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          `tx_dep_${existing.id}`,
          existing.customerId,
          effectiveAmount.toFixed(2),
          depDesc,
          existing.id,
          existing.targetGameName ?? null,
          nowIso,
        ],
      );

      if (bonusAmount > 0) {
        await runQuery(
          client,
          `
            INSERT INTO public.transactions (
              id, customer_id, amount, type, status, description, reference_id, game_name, created_at
            )
            VALUES ($1, $2, $3, 'bonus', 'completed', $4, $5, $6, $7)
            ON CONFLICT (id) DO NOTHING
          `,
          [
            `tx_bns_${existing.id}`,
            existing.customerId,
            bonusAmount.toFixed(2),
            `Promo Bonus (${bonusPercentage}%) Credited`,
            existing.id,
            existing.targetGameName ?? null,
            nowIso,
          ],
        );
      }

      await insertAuditLog(client, {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: 'TOPUP_APPROVED',
        entityId: existing.id,
        details: `Approved $${effectiveAmount.toFixed(2)} deposit + $${bonusAmount.toFixed(2)} bonus for ${existing.customerName}. Note: ${reviewNotes}`,
        timestamp: nowIso,
      });

      const updatedRow = updateRes.rows[0];
      if (!updatedRow) {
        throw new DepositNotFoundError();
      }

      return {
        deposit: mapTopUpRow(updatedRow),
        wallet: walletRes.rows[0] ? mapWalletRow(walletRes.rows[0]) : wallet,
      };
    });
  }

  public async rejectDeposit(
    input: RejectDepositInput,
  ): Promise<{ deposit: DepositRecord; wallet: WalletRecord }> {
    return this.withTransaction(async (client) => {
      const lockRes = await runQuery<RawTopUpRow & Record<string, unknown>>(
        client,
        `
          SELECT ${DEPOSIT_COLUMNS}
          FROM public.topups
          WHERE id = $1
          FOR UPDATE
        `,
        [input.requestId],
      );

      const raw = lockRes.rows[0];
      if (!raw) {
        throw new DepositNotFoundError();
      }

      const existing = mapTopUpRow(raw);
      if (existing.status === 'completed' || existing.status === 'approved') {
        throw new DepositConflictError('Cannot reject completed deposit.');
      }
      if (TERMINAL_STATUSES.has(existing.status)) {
        throw new DepositConflictError(
          `Deposit request is already ${existing.status}.`,
        );
      }

      const wallet = await ensureWalletLocked(client, existing.customerId);
      const nowIso = new Date().toISOString();

      const updateRes = await runQuery<RawTopUpRow & Record<string, unknown>>(
        client,
        `
          UPDATE public.topups
          SET
            status = 'rejected',
            reviewer_id = $2,
            reviewer_name = $3,
            review_notes = $4,
            updated_at = $5
          WHERE id = $1
          RETURNING ${DEPOSIT_COLUMNS}
        `,
        [existing.id, input.actorId, input.actorName, input.reason, nowIso],
      );

      const releasedPending = Math.min(
        wallet.pendingDepositBalance,
        Math.max(0, existing.amount),
      );
      const nextPendingDeposit = Number(
        Math.max(0, wallet.pendingDepositBalance - releasedPending).toFixed(2),
      );

      const walletRes = await runQuery<RawWalletRow & Record<string, unknown>>(
        client,
        `
          UPDATE public.wallets
          SET
            pending_deposit = $2,
            updated_at = $3
          WHERE customer_id = $1
          RETURNING
            customer_id, balance, referral_bonus_balance, free_play_balance,
            pending_withdrawal, pending_deposit, total_deposited, total_withdrawn,
            currency, updated_at
        `,
        [existing.customerId, nextPendingDeposit.toFixed(2), nowIso],
      );

      await insertAuditLog(client, {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: 'TOPUP_REJECTED',
        entityId: existing.id,
        details: `Declined deposit for ${existing.customerName}. Reason: ${input.reason}`,
        timestamp: nowIso,
      });

      const updatedRow = updateRes.rows[0];
      if (!updatedRow) {
        throw new DepositNotFoundError();
      }

      return {
        deposit: mapTopUpRow(updatedRow),
        wallet: walletRes.rows[0] ? mapWalletRow(walletRes.rows[0]) : wallet,
      };
    });
  }
}
