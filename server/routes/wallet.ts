import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { UserDirectoryRepo } from '../auth/userDirectoryRepo.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';
import type {
  WalletRecord,
  WalletRepo,
  WalletTransactionRecord,
  WalletTransactionSortField,
  WalletTransactionSortOrder,
  WalletTransactionStatus,
} from '../wallet/walletRepo.js';

export interface WalletRouterDeps {
  walletRepo: WalletRepo;
  userRepo: UserDirectoryRepo;
  requireAuth: RequestHandler;
}

const CUSTOMER_ID_REGEX = /^[a-zA-Z0-9_-]{1,120}$/;
const TX_TYPE_REGEX = /^[a-zA-Z0-9_-]{1,60}$/;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

const ALLOWED_SINGLE_WALLET_QUERY_KEYS = new Set(['customerId']);
const ALLOWED_WALLETS_LIST_QUERY_KEYS = new Set([
  'limit',
  'offset',
  'customerIds',
]);
const ALLOWED_TX_QUERY_KEYS = new Set([
  'customerId',
  'type',
  'status',
  'q',
  'sortBy',
  'sortOrder',
  'limit',
  'offset',
]);

const ALLOWED_TX_STATUSES = new Set<WalletTransactionStatus>([
  'completed',
  'pending',
  'processing',
  'failed',
  'cancelled',
  'reversed',
]);

const ALLOWED_TX_SORT_FIELDS = new Set<WalletTransactionSortField>([
  'createdAt',
  'amount',
]);

export interface ValidatedWalletsListQuery {
  customerIds?: string[];
  limit: number;
  offset: number;
}

export interface ValidatedWalletTransactionsQuery {
  customerId?: string;
  type?: string;
  status?: WalletTransactionStatus;
  search?: string;
  sortBy: WalletTransactionSortField;
  sortOrder: WalletTransactionSortOrder;
  limit: number;
  offset: number;
}

function validateCustomerIdValue(
  raw: unknown,
  fieldName = 'customerId',
): string {
  if (typeof raw !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be a non-empty string.`,
    );
  }
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed === 'transactions' ||
    !CUSTOMER_ID_REGEX.test(trimmed) ||
    CONTROL_CHAR_REGEX.test(trimmed)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must match ^[a-zA-Z0-9_-]{1,120}$ and cannot be "transactions".`,
    );
  }
  return trimmed;
}

function parseBoundedInt(
  raw: unknown,
  fieldName: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (raw === undefined) {
    return defaultValue;
  }
  if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be an integer between ${min} and ${max}.`,
    );
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be an integer between ${min} and ${max}.`,
    );
  }
  return parsed;
}

function assertAllowedQueryKeys(
  rawQuery: Record<string, unknown>,
  allowed: Set<string>,
): void {
  for (const key of Object.keys(rawQuery)) {
    if (!allowed.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported query parameter: "${key}".`,
      );
    }
  }
}

export function validateSingleWalletQuery(rawQuery: Record<string, unknown>): {
  customerId?: string;
} {
  assertAllowedQueryKeys(rawQuery, ALLOWED_SINGLE_WALLET_QUERY_KEYS);
  if (rawQuery.customerId === undefined) {
    return {};
  }
  return {
    customerId: validateCustomerIdValue(rawQuery.customerId, 'customerId'),
  };
}

export function validateWalletsListQuery(
  rawQuery: Record<string, unknown>,
): ValidatedWalletsListQuery {
  assertAllowedQueryKeys(rawQuery, ALLOWED_WALLETS_LIST_QUERY_KEYS);

  const limit = parseBoundedInt(rawQuery.limit, 'limit', 50, 1, 100);
  const offset = parseBoundedInt(rawQuery.offset, 'offset', 0, 0, 10_000);

  let customerIds: string[] | undefined;
  if (rawQuery.customerIds !== undefined) {
    if (typeof rawQuery.customerIds !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'customerIds must be a comma-separated string of customer IDs.',
      );
    }
    const parts = rawQuery.customerIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'customerIds must contain at least one valid customer ID when provided.',
      );
    }
    if (parts.length > 100) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'customerIds cannot exceed 100 IDs per request.',
      );
    }
    const deduped = new Set<string>();
    for (const part of parts) {
      deduped.add(validateCustomerIdValue(part, 'customerIds'));
    }
    customerIds = Array.from(deduped);
  }

  return {
    customerIds,
    limit,
    offset,
  };
}

export function validateWalletTransactionsQuery(
  rawQuery: Record<string, unknown>,
): ValidatedWalletTransactionsQuery {
  assertAllowedQueryKeys(rawQuery, ALLOWED_TX_QUERY_KEYS);

  const customerId =
    rawQuery.customerId !== undefined
      ? validateCustomerIdValue(rawQuery.customerId, 'customerId')
      : undefined;

  let type: string | undefined;
  if (rawQuery.type !== undefined) {
    if (typeof rawQuery.type !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'type must be a string.');
    }
    const trimmed = rawQuery.type.trim();
    if (!trimmed || !TX_TYPE_REGEX.test(trimmed) || CONTROL_CHAR_REGEX.test(trimmed)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'type must match ^[a-zA-Z0-9_-]{1,60}$.',
      );
    }
    type = trimmed;
  }

  let status: WalletTransactionStatus | undefined;
  if (rawQuery.status !== undefined) {
    if (
      typeof rawQuery.status !== 'string' ||
      !ALLOWED_TX_STATUSES.has(rawQuery.status.trim() as WalletTransactionStatus)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'status must be one of completed, pending, processing, failed, cancelled, or reversed.',
      );
    }
    status = rawQuery.status.trim() as WalletTransactionStatus;
  }

  let search: string | undefined;
  if (rawQuery.q !== undefined) {
    if (typeof rawQuery.q !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'q must be a string.');
    }
    const trimmed = rawQuery.q.trim();
    if (trimmed.length > 120 || CONTROL_CHAR_REGEX.test(trimmed)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'q contains invalid characters or exceeds maximum length.',
      );
    }
    if (trimmed) {
      search = trimmed;
    }
  }

  let sortBy: WalletTransactionSortField = 'createdAt';
  if (rawQuery.sortBy !== undefined) {
    if (
      typeof rawQuery.sortBy !== 'string' ||
      !ALLOWED_TX_SORT_FIELDS.has(rawQuery.sortBy as WalletTransactionSortField)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'sortBy must be createdAt or amount.',
      );
    }
    sortBy = rawQuery.sortBy as WalletTransactionSortField;
  }

  let sortOrder: WalletTransactionSortOrder = 'desc';
  if (rawQuery.sortOrder !== undefined) {
    if (rawQuery.sortOrder !== 'asc' && rawQuery.sortOrder !== 'desc') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'sortOrder must be "asc" or "desc".',
      );
    }
    sortOrder = rawQuery.sortOrder;
  }

  const limit = parseBoundedInt(rawQuery.limit, 'limit', 50, 1, 100);
  const offset = parseBoundedInt(rawQuery.offset, 'offset', 0, 0, 10_000);

  return {
    customerId,
    type,
    status,
    search,
    sortBy,
    sortOrder,
    limit,
    offset,
  };
}

function toWalletDto(wallet: WalletRecord) {
  return {
    customerId: wallet.customerId,
    currency: wallet.currency,
    availableBalance: wallet.availableBalance,
    referralBonusBalance: wallet.referralBonusBalance,
    freePlayBalance: wallet.freePlayBalance,
    reservedBalance: wallet.reservedBalance,
    pendingDepositBalance: wallet.pendingDepositBalance,
    totalDeposited: wallet.totalDeposited,
    totalWithdrawn: wallet.totalWithdrawn,
    lastUpdatedAt: wallet.lastUpdatedAt,
  };
}

function toTransactionDto(tx: WalletTransactionRecord) {
  return {
    id: tx.id,
    customerId: tx.customerId,
    amount: tx.amount,
    fee: tx.fee,
    netAmount: tx.netAmount,
    currency: tx.currency,
    type: tx.type,
    status: tx.status,
    description: tx.description,
    referenceId: tx.referenceId ?? undefined,
    relatedRequestId: tx.referenceId ?? undefined,
    gameName: tx.gameName ?? undefined,
    targetGameName: tx.gameName ?? undefined,
    idempotencyKey: tx.id,
    createdAt: tx.createdAt,
  };
}

async function resolveAuthorizedTargetCustomerId(
  req: Request,
  requestedCustomerId: string | undefined,
  userRepo: UserDirectoryRepo,
): Promise<string> {
  const actor = req.authContext!.user;
  const targetId = requestedCustomerId ?? actor.appUserId;

  if (targetId !== actor.appUserId) {
    const isStaff = actor.role === 'admin' || actor.role === 'agent';
    if (!isStaff) {
      throw new HttpError(
        403,
        'FORBIDDEN',
        'You can only access your own wallet and transaction history.',
      );
    }

    const targetUser = await userRepo.findByAppUserId(targetId);
    if (!targetUser) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'Customer account not found.');
    }
  }

  return targetId;
}

export function createWalletRouter({
  walletRepo,
  userRepo,
  requireAuth,
}: WalletRouterDeps): Router {
  const router = Router();
  const requireStaff = requireRole('admin', 'agent');

  // Self-service wallet read (or staff targeted read via ?customerId=)
  router.get(
    '/wallet',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const query = validateSingleWalletQuery(
          req.query as Record<string, unknown>,
        );
        const targetCustomerId = await resolveAuthorizedTargetCustomerId(
          req,
          query.customerId,
          userRepo,
        );

        const wallet =
          await walletRepo.getOrInitializeWallet(targetCustomerId);

        res.status(200).json({
          wallet: toWalletDto(wallet),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Staff bounded wallets listing
  router.get(
    '/wallets',
    requireAuth,
    requireStaff,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const query = validateWalletsListQuery(
          req.query as Record<string, unknown>,
        );

        const result = await walletRepo.listWallets({
          customerIds: query.customerIds,
          limit: query.limit,
          offset: query.offset,
        });

        res.status(200).json({
          wallets: result.items.map(toWalletDto),
          total: result.total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + result.items.length < result.total,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Paginated & filtered wallet ledger transactions (registered before /wallet/:customerId)
  router.get(
    '/wallet/transactions',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const query = validateWalletTransactionsQuery(
          req.query as Record<string, unknown>,
        );
        const targetCustomerId = await resolveAuthorizedTargetCustomerId(
          req,
          query.customerId,
          userRepo,
        );

        const result = await walletRepo.listTransactions({
          customerId: targetCustomerId,
          type: query.type,
          status: query.status,
          search: query.search,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
          limit: query.limit,
          offset: query.offset,
        });

        res.status(200).json({
          transactions: result.items.map(toTransactionDto),
          total: result.total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + result.items.length < result.total,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Explicit customerId wallet lookup (owner or staff only)
  router.get(
    '/wallet/:customerId',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const requestedCustomerId = validateCustomerIdValue(
          req.params.customerId,
          'customerId',
        );
        const targetCustomerId = await resolveAuthorizedTargetCustomerId(
          req,
          requestedCustomerId,
          userRepo,
        );

        const wallet =
          await walletRepo.getOrInitializeWallet(targetCustomerId);

        res.status(200).json({
          wallet: toWalletDto(wallet),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
