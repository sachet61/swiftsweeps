import type { DatabaseClient, DatabasePool } from '../db/pool.js';

export type WalletTransactionStatus =
  | 'completed'
  | 'pending'
  | 'processing'
  | 'failed'
  | 'cancelled'
  | 'reversed';

export type WalletTransactionSortField = 'createdAt' | 'amount';
export type WalletTransactionSortOrder = 'asc' | 'desc';

export interface WalletRecord {
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
}

export interface WalletTransactionRecord {
  id: string;
  customerId: string;
  amount: number;
  fee: number;
  netAmount: number;
  currency: string;
  type: string;
  status: WalletTransactionStatus;
  description: string;
  referenceId: string | null;
  gameName: string | null;
  createdAt: string;
}

export interface ListWalletsOptions {
  customerIds?: string[];
  limit: number;
  offset: number;
}

export interface ListWalletsResult {
  items: WalletRecord[];
  total: number;
}

export interface ListWalletTransactionsOptions {
  customerId: string;
  type?: string;
  status?: WalletTransactionStatus;
  search?: string;
  sortBy: WalletTransactionSortField;
  sortOrder: WalletTransactionSortOrder;
  limit: number;
  offset: number;
}

export interface ListWalletTransactionsResult {
  items: WalletTransactionRecord[];
  total: number;
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

interface RawTransactionRow {
  id: string;
  customer_id: string;
  amount: string | number;
  type: string;
  status: string;
  description: string;
  reference_id: string | null;
  game_name: string | null;
  created_at: Date | string;
}

interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

const VALID_TX_STATUSES = new Set<WalletTransactionStatus>([
  'completed',
  'pending',
  'processing',
  'failed',
  'cancelled',
  'reversed',
]);

const TX_SORT_COLUMN_MAP: Record<WalletTransactionSortField, string> = {
  createdAt: 'created_at',
  amount: 'amount',
};

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

function normalizeTxStatus(raw: string): WalletTransactionStatus {
  if (VALID_TX_STATUSES.has(raw as WalletTransactionStatus)) {
    return raw as WalletTransactionStatus;
  }
  return 'completed';
}

function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
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

function mapTransactionRow(row: RawTransactionRow): WalletTransactionRecord {
  const amount = toFixedMoneyNumber(row.amount);
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    amount,
    fee: 0,
    netAmount: amount,
    currency: 'USD',
    type: String(row.type || 'adjustment'),
    status: normalizeTxStatus(String(row.status || 'completed')),
    description: String(row.description ?? ''),
    referenceId: row.reference_id ?? null,
    gameName: row.game_name ?? null,
    createdAt: toIsoString(row.created_at),
  };
}

export class WalletRepo {
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

  public async findWalletByCustomerId(
    customerId: string,
  ): Promise<WalletRecord | null> {
    const res = await this.query<RawWalletRow>(
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
      LIMIT 1
      `,
      [customerId],
    );

    const row = res.rows[0];
    return row ? mapWalletRow(row) : null;
  }

  public async getOrInitializeWallet(customerId: string): Promise<WalletRecord> {
    return this.withTransaction(async (db) => {
      await db.query(
        `
        INSERT INTO public.wallets (
          customer_id,
          currency,
          updated_at
        )
        VALUES ($1, 'USD', timezone('utc'::text, now()))
        ON CONFLICT (customer_id) DO NOTHING
        `,
        [customerId],
      );

      const res = (await db.query(
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
        LIMIT 1
        `,
        [customerId],
      )) as QueryResultLike<RawWalletRow>;

      const row = res.rows[0];
      if (!row) {
        throw new Error('Failed to load or initialize customer wallet.');
      }
      return mapWalletRow(row);
    });
  }

  public async listWallets(
    options: ListWalletsOptions,
  ): Promise<ListWalletsResult> {
    const safeLimit = Math.min(Math.max(1, Math.trunc(options.limit)), 100);
    const safeOffset = Math.max(0, Math.trunc(options.offset));

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.customerIds && options.customerIds.length > 0) {
      params.push(options.customerIds);
      conditions.push(`customer_id = ANY($${params.length}::text[])`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.query<{ total: string | number }>(
      `SELECT COUNT(*)::int AS total FROM public.wallets ${whereClause}`,
      params,
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const listParams = [...params, safeLimit, safeOffset];
    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;

    const rowsRes = await this.query<RawWalletRow>(
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
      ${whereClause}
      ORDER BY updated_at DESC, customer_id ASC
      LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      listParams,
    );

    return {
      items: rowsRes.rows.map(mapWalletRow),
      total,
    };
  }

  public async listTransactions(
    options: ListWalletTransactionsOptions,
  ): Promise<ListWalletTransactionsResult> {
    const safeLimit = Math.min(Math.max(1, Math.trunc(options.limit)), 100);
    const safeOffset = Math.max(0, Math.trunc(options.offset));

    const conditions: string[] = ['customer_id = $1'];
    const params: unknown[] = [options.customerId];

    if (options.type) {
      params.push(options.type);
      conditions.push(`lower(type) = lower($${params.length})`);
    }

    if (options.status) {
      params.push(options.status);
      conditions.push(`status = $${params.length}`);
    }

    if (options.search) {
      params.push(`%${escapeIlikePattern(options.search)}%`);
      const p = `$${params.length}`;
      conditions.push(
        `(id ILIKE ${p} ESCAPE '\\' OR description ILIKE ${p} ESCAPE '\\' OR COALESCE(reference_id, '') ILIKE ${p} ESCAPE '\\' OR COALESCE(game_name, '') ILIKE ${p} ESCAPE '\\')`,
      );
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countRes = await this.query<{ total: string | number }>(
      `SELECT COUNT(*)::int AS total FROM public.transactions ${whereClause}`,
      params,
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const sortColumn = TX_SORT_COLUMN_MAP[options.sortBy] ?? 'created_at';
    const sortDir = options.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const listParams = [...params, safeLimit, safeOffset];
    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;

    const rowsRes = await this.query<RawTransactionRow>(
      `
      SELECT
        id,
        customer_id,
        amount,
        type,
        status,
        description,
        reference_id,
        game_name,
        created_at
      FROM public.transactions
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDir}, id ASC
      LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      listParams,
    );

    return {
      items: rowsRes.rows.map(mapTransactionRow),
      total,
    };
  }
}
