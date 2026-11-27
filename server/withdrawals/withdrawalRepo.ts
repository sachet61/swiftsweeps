import crypto from 'node:crypto';
import type { DatabaseClient, DatabasePool } from '../db/pool.js';
import type { AppUserRole } from '../auth/userDirectoryRepo.js';
import type { WalletRecord } from '../wallet/walletRepo.js';

export type WithdrawalStatusValue =
  | 'pending'
  | 'pending_verification'
  | 'submitted'
  | 'processing'
  | 'approved'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export interface WithdrawalTimelineEntry {
  status: string;
  note: string;
  timestamp: string;
  actorName: string;
}

export interface WithdrawalRecord {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  currency: string;
  feeAmount: number;
  netPayout: number;
  reservedAmount: number;
  method: string;
  methodName: string;
  sourceGameCatalogId: string | null;
  sourceGameName: string | null;
  sourceGameUsername: string | null;
  playerNotes: string | null;
  payoutDetails: Record<string, unknown>;
  status: WithdrawalStatusValue;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewNotes: string | null;
  payoutReference: string | null;
  timeline: WithdrawalTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ListWithdrawalsOptions {
  customerId?: string;
  status?: WithdrawalStatusValue;
  beforeCreatedAt?: string;
  search?: string;
  limit: number;
  offset: number;
}

export interface ListWithdrawalsResult {
  items: WithdrawalRecord[];
  total: number;
}

export interface CreateCustomerWithdrawalInput {
  customerId: string;
  customerName: string;
  actorRole: AppUserRole;
  amount: number;
  method: string;
  methodName: string;
  sourceGameCatalogId?: string;
  sourceGameName?: string;
  sourceGameUsername?: string;
  playerNotes?: string;
  payoutDetails?: Record<string, unknown>;
}

export interface CreateStaffWithdrawalInput {
  customerId: string;
  customerName: string;
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
  amount: number;
  feeAmount: number;
  method: string;
  methodName: string;
  payoutHandle?: string;
  payoutReference?: string;
  sourceGameCatalogId?: string;
  sourceGameName?: string;
  sourceGameUsername?: string;
  notes?: string;
  status: 'completed' | 'submitted';
}

export interface TransitionWithdrawalStatusInput {
  requestId: string;
  newStatus: WithdrawalStatusValue;
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
  note?: string;
  payoutReference?: string;
}

export class WithdrawalNotFoundError extends Error {
  constructor(message = 'Withdrawal request not found.') {
    super(message);
    this.name = 'WithdrawalNotFoundError';
  }
}

export class WithdrawalForbiddenError extends Error {
  constructor(message = 'You do not have permission to modify this withdrawal.') {
    super(message);
    this.name = 'WithdrawalForbiddenError';
  }
}

export class WithdrawalConflictError extends Error {
  constructor(message = 'Withdrawal request cannot transition from its current status.') {
    super(message);
    this.name = 'WithdrawalConflictError';
  }
}

interface RawWithdrawalRow {
  id: string;
  customer_id: string;
  customer_name: string;
  amount: string | number;
  fee: string | number;
  net_amount: string | number;
  payout_method_id: string;
  payout_method_name: string;
  payout_details: Record<string, unknown> | null;
  status: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  review_notes: string | null;
  transaction_hash: string | null;
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

const VALID_WITHDRAWAL_STATUSES = new Set<WithdrawalStatusValue>([
  'pending',
  'pending_verification',
  'submitted',
  'processing',
  'approved',
  'completed',
  'rejected',
  'cancelled',
]);

const TERMINAL_STATUSES = new Set<WithdrawalStatusValue>([
  'completed',
  'rejected',
  'cancelled',
]);

const CUSTOMER_CANCELLABLE_STATUSES = new Set<WithdrawalStatusValue>([
  'pending',
  'pending_verification',
  'submitted',
]);

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

function normalizeWithdrawalStatus(raw: string): WithdrawalStatusValue {
  if (VALID_WITHDRAWAL_STATUSES.has(raw as WithdrawalStatusValue)) {
    return raw as WithdrawalStatusValue;
  }
  return 'submitted';
}

function readOptionalString(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key];
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readTimeline(
  details: Record<string, unknown>,
): WithdrawalTimelineEntry[] {
  const raw = details.timeline;
  if (!Array.isArray(raw)) {
    return [];
  }
  const entries: WithdrawalTimelineEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    entries.push({
      status: typeof obj.status === 'string' ? obj.status : 'submitted',
      note: typeof obj.note === 'string' ? obj.note : '',
      timestamp:
        typeof obj.timestamp === 'string'
          ? obj.timestamp
          : new Date().toISOString(),
      actorName: typeof obj.actorName === 'string' ? obj.actorName : 'System',
    });
  }
  return entries;
}

function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function mapWithdrawalRow(row: RawWithdrawalRow): WithdrawalRecord {
  const payoutDetails =
    row.payout_details &&
    typeof row.payout_details === 'object' &&
    !Array.isArray(row.payout_details)
      ? { ...row.payout_details }
      : {};
  const amount = toFixedMoneyNumber(row.amount);
  const feeAmount = toFixedMoneyNumber(row.fee);
  const netPayout = toFixedMoneyNumber(row.net_amount);
  const reservedRaw = payoutDetails.reservedAmount;
  const reservedAmount =
    typeof reservedRaw === 'number' && Number.isFinite(reservedRaw) && reservedRaw >= 0
      ? toFixedMoneyNumber(reservedRaw)
      : amount;

  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    customerName: String(row.customer_name || 'Customer'),
    amount,
    currency: 'USD',
    feeAmount,
    netPayout,
    reservedAmount,
    method: String(row.payout_method_id || 'manual_support'),
    methodName: String(row.payout_method_name || 'Customer Support Manual Payout'),
    sourceGameCatalogId: readOptionalString(payoutDetails, 'sourceGameCatalogId'),
    sourceGameName: readOptionalString(payoutDetails, 'sourceGameName'),
    sourceGameUsername: readOptionalString(payoutDetails, 'sourceGameUsername'),
    playerNotes: readOptionalString(payoutDetails, 'playerNotes'),
    payoutDetails,
    status: normalizeWithdrawalStatus(String(row.status || 'submitted')),
    reviewerId: row.reviewer_id ?? null,
    reviewerName: row.reviewer_name ?? null,
    reviewNotes: row.review_notes ?? null,
    payoutReference: row.transaction_hash ?? null,
    timeline: readTimeline(payoutDetails),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
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

export class WithdrawalRepo {
  constructor(
    private readonly pool: Pick<DatabasePool, 'query'> &
      Pick<DatabasePool, 'connect'>,
  ) {}

  private async query<T = Record<string, unknown>>(
    sql: string,
    values: unknown[] = [],
  ): Promise<QueryResultLike<T>> {
    return (await this.pool.query(sql, values)) as QueryResultLike<T>;
  }

  private async withTransaction<T>(
    fn: (executor: Pick<DatabaseClient, 'query'>) => Promise<T>,
  ): Promise<T> {
    if (typeof this.pool.connect !== 'function') {
      return fn(this.pool);
    }

    const client = await this.pool.connect();
    let failed = false;
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      failed = true;
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release(failed);
    }
  }

  public async findWithdrawalById(id: string): Promise<WithdrawalRecord | null> {
    const res = await this.query<RawWithdrawalRow>(
      `
      SELECT
        id,
        customer_id,
        customer_name,
        amount,
        fee,
        net_amount,
        payout_method_id,
        payout_method_name,
        payout_details,
        status,
        reviewer_id,
        reviewer_name,
        review_notes,
        transaction_hash,
        created_at,
        updated_at
      FROM public.withdrawals
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    const row = res.rows[0];
    return row ? mapWithdrawalRow(row) : null;
  }

  public async listWithdrawals(
    options: ListWithdrawalsOptions,
  ): Promise<ListWithdrawalsResult> {
    const safeLimit = Math.min(Math.max(1, Math.trunc(options.limit)), 100);
    const safeOffset = Math.max(0, Math.trunc(options.offset));

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
        `(id ILIKE ${p} ESCAPE '\\' OR customer_name ILIKE ${p} ESCAPE '\\' OR payout_method_name ILIKE ${p} ESCAPE '\\' OR COALESCE(transaction_hash, '') ILIKE ${p} ESCAPE '\\' OR COALESCE(payout_details->>'sourceGameName', '') ILIKE ${p} ESCAPE '\\')`,
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.query<{ total: string | number }>(
      `SELECT COUNT(*)::int AS total FROM public.withdrawals ${whereClause}`,
      params,
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const listParams = [...params, safeLimit, safeOffset];
    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;

    const rowsRes = await this.query<RawWithdrawalRow>(
      `
      SELECT
        id,
        customer_id,
        customer_name,
        amount,
        fee,
        net_amount,
        payout_method_id,
        payout_method_name,
        payout_details,
        status,
        reviewer_id,
        reviewer_name,
        review_notes,
        transaction_hash,
        created_at,
        updated_at
      FROM public.withdrawals
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      listParams,
    );

    return {
      items: rowsRes.rows.map(mapWithdrawalRow),
      total,
    };
  }

  public async createCustomerWithdrawal(
    input: CreateCustomerWithdrawalInput,
  ): Promise<{ withdrawal: WithdrawalRecord }> {
    const amount = toFixedMoneyNumber(input.amount);
    const nowIso = new Date().toISOString();
    const requestId = `req_wdr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const timeline: WithdrawalTimelineEntry[] = [
      {
        status: 'submitted',
        note: `Player requested $${amount.toFixed(2)} from ${input.sourceGameName || 'Game'}. Support will manually review game balance and request payout info in chat.`,
        timestamp: nowIso,
        actorName: input.customerName,
      },
    ];

    const payoutDetails: Record<string, unknown> = {
      ...(input.payoutDetails || {}),
      collectedBySupport: Boolean(input.payoutDetails?.collectedBySupport ?? false),
      reservedAmount: amount,
      ...(input.sourceGameCatalogId
        ? { sourceGameCatalogId: input.sourceGameCatalogId }
        : {}),
      ...(input.sourceGameName ? { sourceGameName: input.sourceGameName } : {}),
      ...(input.sourceGameUsername
        ? { sourceGameUsername: input.sourceGameUsername }
        : {}),
      ...(input.playerNotes ? { playerNotes: input.playerNotes } : {}),
      timeline,
    };

    return this.withTransaction(async (db) => {
      const insertRes = (await db.query(
        `
        INSERT INTO public.withdrawals (
          id,
          customer_id,
          customer_name,
          amount,
          fee,
          net_amount,
          payout_method_id,
          payout_method_name,
          payout_details,
          status,
          reviewer_id,
          reviewer_name,
          review_notes,
          transaction_hash,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, 0.00, $4, $5, $6, $7::jsonb, 'submitted',
          NULL, NULL, NULL, NULL, $8::timestamptz, $8::timestamptz
        )
        RETURNING
          id,
          customer_id,
          customer_name,
          amount,
          fee,
          net_amount,
          payout_method_id,
          payout_method_name,
          payout_details,
          status,
          reviewer_id,
          reviewer_name,
          review_notes,
          transaction_hash,
          created_at,
          updated_at
        `,
        [
          requestId,
          input.customerId,
          input.customerName,
          amount.toFixed(2),
          input.method,
          input.methodName,
          JSON.stringify(payoutDetails),
          nowIso,
        ],
      )) as QueryResultLike<RawWithdrawalRow>;

      const inserted = insertRes.rows[0];
      if (!inserted) {
        throw new Error('Failed to persist withdrawal request.');
      }

      await db.query(
        `
        INSERT INTO public.wallets (
          customer_id,
          currency,
          updated_at
        )
        VALUES ($1, 'USD', $2::timestamptz)
        ON CONFLICT (customer_id) DO NOTHING
        `,
        [input.customerId, nowIso],
      );

      await db.query(
        `
        INSERT INTO public.transactions (
          id,
          customer_id,
          amount,
          type,
          status,
          description,
          reference_id,
          game_name,
          created_at
        )
        VALUES ($1, $2, $3, 'withdrawal_hold', 'pending', $4, $5, $6, $7::timestamptz)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          `tx_wdr_hold_${requestId}`,
          input.customerId,
          amount.toFixed(2),
          `Manual Cashout Request #${requestId} from ${input.sourceGameName || 'Game'} under Support Review`,
          requestId,
          input.sourceGameName ?? null,
          nowIso,
        ],
      );

      await db.query(
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
        VALUES ($1, $2, $3, $4, 'WITHDRAWAL_SUBMITTED', 'withdrawal', $5, $6, $7::timestamptz)
        `,
        [
          `aud_wdr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          input.customerId,
          input.customerName,
          input.actorRole,
          requestId,
          `Submitted manual cashout request for $${amount.toFixed(2)} from ${input.sourceGameName || 'Game'}. Dispatched to Support Chat.`,
          nowIso,
        ],
      );

      return {
        withdrawal: mapWithdrawalRow(inserted),
      };
    });
  }

  public async createStaffWithdrawal(
    input: CreateStaffWithdrawalInput,
  ): Promise<{ withdrawal: WithdrawalRecord; wallet: WalletRecord }> {
    const amount = toFixedMoneyNumber(input.amount);
    const feeAmount = toFixedMoneyNumber(input.feeAmount);
    const netPayout = toFixedMoneyNumber(amount - feeAmount);
    const isCompleted = input.status === 'completed';
    const nowIso = new Date().toISOString();
    const requestId = `req_wdr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const payoutRef =
      input.payoutReference?.trim() ||
      (isCompleted
        ? `STAFF_PAY_${Date.now().toString(36).toUpperCase()}`
        : null);
    const reviewNotes =
      input.notes?.trim() ||
      (isCompleted
        ? 'Emergency cashout logged & completed by support specialist.'
        : 'Emergency cashout request created by support specialist.');

    const timeline: WithdrawalTimelineEntry[] = [
      {
        status: 'submitted',
        note: `Created by ${input.actorName} via Admin Support Chat (${input.methodName}${input.payoutHandle ? ` • ${input.payoutHandle}` : ''}).`,
        timestamp: nowIso,
        actorName: input.actorName,
      },
      ...(isCompleted
        ? [
            {
              status: 'completed',
              note: reviewNotes,
              timestamp: nowIso,
              actorName: input.actorName,
            },
          ]
        : []),
    ];

    const payoutDetails: Record<string, unknown> = {
      methodType: input.method,
      collectedBySupport: true,
      createdByStaff: true,
      bypassedDepositLock: true,
      reservedAmount: amount,
      ...(input.payoutHandle ? { payoutHandle: input.payoutHandle } : {}),
      ...(input.method === 'cashapp' && input.payoutHandle
        ? { cashtag: input.payoutHandle }
        : {}),
      ...(input.method === 'chime' && input.payoutHandle
        ? { chimeHandle: input.payoutHandle }
        : {}),
      ...(input.method === 'crypto' && input.payoutHandle
        ? { cryptoAddress: input.payoutHandle }
        : {}),
      ...(input.method === 'payment_link' && input.payoutHandle
        ? { linkAccountRef: input.payoutHandle }
        : {}),
      ...(input.sourceGameCatalogId
        ? { sourceGameCatalogId: input.sourceGameCatalogId }
        : {}),
      ...(input.sourceGameName
        ? { sourceGameName: input.sourceGameName }
        : {}),
      ...(input.sourceGameUsername
        ? { sourceGameUsername: input.sourceGameUsername }
        : {}),
      playerNotes: reviewNotes,
      timeline,
    };

    return this.withTransaction(async (db) => {
      const insertRes = (await db.query(
        `
        INSERT INTO public.withdrawals (
          id,
          customer_id,
          customer_name,
          amount,
          fee,
          net_amount,
          payout_method_id,
          payout_method_name,
          payout_details,
          status,
          reviewer_id,
          reviewer_name,
          review_notes,
          transaction_hash,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10,
          $11, $12, $13, $14, $15::timestamptz, $15::timestamptz
        )
        RETURNING
          id,
          customer_id,
          customer_name,
          amount,
          fee,
          net_amount,
          payout_method_id,
          payout_method_name,
          payout_details,
          status,
          reviewer_id,
          reviewer_name,
          review_notes,
          transaction_hash,
          created_at,
          updated_at
        `,
        [
          requestId,
          input.customerId,
          input.customerName,
          amount.toFixed(2),
          feeAmount.toFixed(2),
          netPayout.toFixed(2),
          input.method,
          input.methodName,
          JSON.stringify(payoutDetails),
          input.status,
          isCompleted ? input.actorId : null,
          isCompleted ? input.actorName : null,
          reviewNotes,
          payoutRef,
          nowIso,
        ],
      )) as QueryResultLike<RawWithdrawalRow>;

      const inserted = insertRes.rows[0];
      if (!inserted) {
        throw new Error('Failed to create staff withdrawal.');
      }

      await db.query(
        `
        INSERT INTO public.wallets (
          customer_id,
          currency,
          updated_at
        )
        VALUES ($1, 'USD', $2::timestamptz)
        ON CONFLICT (customer_id) DO NOTHING
        `,
        [input.customerId, nowIso],
      );

      const lockedWalletRes = (await db.query(
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
        [input.customerId],
      )) as QueryResultLike<RawWalletRow>;

      const lockedWallet = lockedWalletRes.rows[0];
      if (!lockedWallet) {
        throw new Error('Failed to lock customer wallet.');
      }

      let updatedWallet = mapWalletRow(lockedWallet);
      if (isCompleted) {
        const sumRes = (await db.query(
          `
          SELECT COALESCE(SUM(amount), 0) AS total_completed
          FROM public.withdrawals
          WHERE customer_id = $1 AND status = 'completed'
          `,
          [input.customerId],
        )) as QueryResultLike<{ total_completed: string | number }>;
        const computedTotalWithdrawn = toFixedMoneyNumber(
          sumRes.rows[0]?.total_completed ?? 0,
        );
        const targetTotalWithdrawn = Math.max(
          updatedWallet.totalWithdrawn,
          computedTotalWithdrawn,
        );

        const walletUpdRes = (await db.query(
          `
          UPDATE public.wallets
          SET total_withdrawn = $2,
              updated_at = $3::timestamptz
          WHERE customer_id = $1
          RETURNING
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
          `,
          [input.customerId, targetTotalWithdrawn.toFixed(2), nowIso],
        )) as QueryResultLike<RawWalletRow>;

        if (walletUpdRes.rows[0]) {
          updatedWallet = mapWalletRow(walletUpdRes.rows[0]);
        }
      }

      await db.query(
        `
        INSERT INTO public.transactions (
          id,
          customer_id,
          amount,
          type,
          status,
          description,
          reference_id,
          game_name,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          `tx_wdr_${requestId}`,
          input.customerId,
          amount.toFixed(2),
          isCompleted ? 'withdrawal' : 'withdrawal_hold',
          isCompleted ? 'completed' : 'pending',
          isCompleted
            ? `Staff Logged Cashout Paid Out via ${input.methodName}${payoutRef ? ` (${payoutRef})` : ''}`
            : `Staff Created Cashout Request #${requestId.slice(-6)}${input.sourceGameName ? ` from ${input.sourceGameName}` : ''}`,
          requestId,
          input.sourceGameName ?? null,
          nowIso,
        ],
      );

      await db.query(
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
        VALUES ($1, $2, $3, $4, $5, 'withdrawal', $6, $7, $8::timestamptz)
        `,
        [
          `aud_wdr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          input.actorId,
          input.actorName,
          input.actorRole,
          isCompleted
            ? 'STAFF_WITHDRAWAL_LOGGED_COMPLETED'
            : 'STAFF_WITHDRAWAL_LOGGED_PENDING',
          requestId,
          `${isCompleted ? 'Logged completed' : 'Created pending'} emergency cashout of $${amount.toFixed(2)} (Net $${netPayout.toFixed(2)}) via ${input.methodName} for ${input.customerName}. Bypassed deposit lock. Note: ${reviewNotes}`,
          nowIso,
        ],
      );

      return {
        withdrawal: mapWithdrawalRow(inserted),
        wallet: updatedWallet,
      };
    });
  }

  public async transitionWithdrawalStatus(
    input: TransitionWithdrawalStatusInput,
  ): Promise<{ withdrawal: WithdrawalRecord; wallet: WalletRecord }> {
    const nowIso = new Date().toISOString();

    return this.withTransaction(async (db) => {
      const lockRes = (await db.query(
        `
        SELECT
          id,
          customer_id,
          customer_name,
          amount,
          fee,
          net_amount,
          payout_method_id,
          payout_method_name,
          payout_details,
          status,
          reviewer_id,
          reviewer_name,
          review_notes,
          transaction_hash,
          created_at,
          updated_at
        FROM public.withdrawals
        WHERE id = $1
        FOR UPDATE
        `,
        [input.requestId],
      )) as QueryResultLike<RawWithdrawalRow>;

      const existingRow = lockRes.rows[0];
      if (!existingRow) {
        throw new WithdrawalNotFoundError('Withdrawal request not found.');
      }

      const existing = mapWithdrawalRow(existingRow);
      const isStaff =
        input.actorRole === 'admin' || input.actorRole === 'agent';

      if (!isStaff) {
        if (existing.customerId !== input.actorId) {
          throw new WithdrawalForbiddenError(
            'You can only cancel your own withdrawal requests.',
          );
        }
        if (input.newStatus !== 'cancelled') {
          throw new WithdrawalForbiddenError(
            'Customers may only cancel their own submitted withdrawal requests.',
          );
        }
        if (TERMINAL_STATUSES.has(existing.status)) {
          throw new WithdrawalConflictError(
            `Cannot change status of an already ${existing.status} withdrawal.`,
          );
        }
        if (!CUSTOMER_CANCELLABLE_STATUSES.has(existing.status)) {
          throw new WithdrawalConflictError(
            `Cannot cancel cashout once status is ${existing.status}. Please contact support.`,
          );
        }
      } else {
        if (TERMINAL_STATUSES.has(existing.status)) {
          throw new WithdrawalConflictError(
            `Cannot change status of an already ${existing.status} withdrawal.`,
          );
        }
        if (existing.status === input.newStatus) {
          throw new WithdrawalConflictError(
            `Withdrawal is already in ${existing.status} status.`,
          );
        }
      }

      const noteText =
        input.note?.trim() || `Status updated to ${input.newStatus}.`;
      const nextPayoutDetails: Record<string, unknown> = {
        ...existing.payoutDetails,
        timeline: [
          ...existing.timeline,
          {
            status: input.newStatus,
            note: noteText,
            timestamp: nowIso,
            actorName: input.actorName,
          },
        ],
      };

      const nextReviewNotes = input.note?.trim()
        ? input.note.trim()
        : existing.reviewNotes;
      const nextPayoutRef = input.payoutReference?.trim()
        ? input.payoutReference.trim()
        : existing.payoutReference;

      const updatedWdrRes = (await db.query(
        `
        UPDATE public.withdrawals
        SET status = $2,
            reviewer_id = $3,
            reviewer_name = $4,
            review_notes = $5,
            transaction_hash = $6,
            payout_details = $7::jsonb,
            updated_at = $8::timestamptz
        WHERE id = $1
        RETURNING
          id,
          customer_id,
          customer_name,
          amount,
          fee,
          net_amount,
          payout_method_id,
          payout_method_name,
          payout_details,
          status,
          reviewer_id,
          reviewer_name,
          review_notes,
          transaction_hash,
          created_at,
          updated_at
        `,
        [
          existing.id,
          input.newStatus,
          input.actorId,
          input.actorName,
          nextReviewNotes,
          nextPayoutRef,
          JSON.stringify(nextPayoutDetails),
          nowIso,
        ],
      )) as QueryResultLike<RawWithdrawalRow>;

      const updatedRow = updatedWdrRes.rows[0];
      if (!updatedRow) {
        throw new Error('Failed to update withdrawal status.');
      }
      const updatedWithdrawal = mapWithdrawalRow(updatedRow);

      await db.query(
        `
        INSERT INTO public.wallets (
          customer_id,
          currency,
          updated_at
        )
        VALUES ($1, 'USD', $2::timestamptz)
        ON CONFLICT (customer_id) DO NOTHING
        `,
        [existing.customerId, nowIso],
      );

      const walletLockRes = (await db.query(
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
        [existing.customerId],
      )) as QueryResultLike<RawWalletRow>;

      const walletRow = walletLockRes.rows[0];
      if (!walletRow) {
        throw new Error('Failed to lock customer wallet.');
      }
      let wallet = mapWalletRow(walletRow);

      const releasedReserve = toFixedMoneyNumber(
        Math.min(
          wallet.reservedBalance,
          Math.max(0, existing.reservedAmount),
        ),
      );

      if (input.newStatus === 'completed') {
        const nextPendingWithdrawal = toFixedMoneyNumber(
          Math.max(0, wallet.reservedBalance - releasedReserve),
        );

        const sumRes = (await db.query(
          `
          SELECT COALESCE(SUM(amount), 0) AS total_completed
          FROM public.withdrawals
          WHERE customer_id = $1 AND status = 'completed'
          `,
          [existing.customerId],
        )) as QueryResultLike<{ total_completed: string | number }>;
        const computedTotalWithdrawn = toFixedMoneyNumber(
          sumRes.rows[0]?.total_completed ?? 0,
        );
        const nextTotalWithdrawn = Math.max(
          wallet.totalWithdrawn,
          computedTotalWithdrawn,
        );

        const walletUpdRes = (await db.query(
          `
          UPDATE public.wallets
          SET pending_withdrawal = $2,
              total_withdrawn = $3,
              updated_at = $4::timestamptz
          WHERE customer_id = $1
          RETURNING
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
          `,
          [
            existing.customerId,
            nextPendingWithdrawal.toFixed(2),
            nextTotalWithdrawn.toFixed(2),
            nowIso,
          ],
        )) as QueryResultLike<RawWalletRow>;

        if (walletUpdRes.rows[0]) {
          wallet = mapWalletRow(walletUpdRes.rows[0]);
        }

        await db.query(
          `
          INSERT INTO public.transactions (
            id,
            customer_id,
            amount,
            type,
            status,
            description,
            reference_id,
            game_name,
            created_at
          )
          VALUES ($1, $2, $3, 'withdrawal', 'completed', $4, $5, $6, $7::timestamptz)
          ON CONFLICT (id) DO NOTHING
          `,
          [
            `tx_wdr_final_${existing.id}`,
            existing.customerId,
            existing.amount.toFixed(2),
            `Cashout Paid Out via ${existing.methodName} (${nextPayoutRef || `Ref${existing.id}`})`,
            existing.id,
            existing.sourceGameName ?? null,
            nowIso,
          ],
        );
      } else if (
        input.newStatus === 'rejected' ||
        input.newStatus === 'cancelled'
      ) {
        const nextPendingWithdrawal = toFixedMoneyNumber(
          Math.max(0, wallet.reservedBalance - releasedReserve),
        );
        const nextBalance = toFixedMoneyNumber(
          wallet.availableBalance + releasedReserve,
        );

        const walletUpdRes = (await db.query(
          `
          UPDATE public.wallets
          SET pending_withdrawal = $2,
              balance = $3,
              updated_at = $4::timestamptz
          WHERE customer_id = $1
          RETURNING
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
          `,
          [
            existing.customerId,
            nextPendingWithdrawal.toFixed(2),
            nextBalance.toFixed(2),
            nowIso,
          ],
        )) as QueryResultLike<RawWalletRow>;

        if (walletUpdRes.rows[0]) {
          wallet = mapWalletRow(walletUpdRes.rows[0]);
        }

        await db.query(
          `
          INSERT INTO public.transactions (
            id,
            customer_id,
            amount,
            type,
            status,
            description,
            reference_id,
            game_name,
            created_at
          )
          VALUES ($1, $2, $3, 'withdrawal_release', 'completed', $4, $5, $6, $7::timestamptz)
          ON CONFLICT (id) DO NOTHING
          `,
          [
            `tx_wdr_release_${existing.id}`,
            existing.customerId,
            existing.amount.toFixed(2),
            `Reserved Funds Released for Cancelled/Rejected Cashout #${existing.id}`,
            existing.id,
            existing.sourceGameName ?? null,
            nowIso,
          ],
        );
      }

      await db.query(
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
        VALUES ($1, $2, $3, $4, $5, 'withdrawal', $6, $7, $8::timestamptz)
        `,
        [
          `aud_wdr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          input.actorId,
          input.actorName,
          input.actorRole,
          `WITHDRAWAL_${input.newStatus.toUpperCase()}`,
          existing.id,
          `Status transitioned from ${existing.status} to ${input.newStatus}. Note: ${input.note || 'None'}. Reference: ${nextPayoutRef || 'None'}`,
          nowIso,
        ],
      );

      return {
        withdrawal: updatedWithdrawal,
        wallet,
      };
    });
  }
}
