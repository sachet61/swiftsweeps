import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { UserDirectoryRepo } from '../auth/userDirectoryRepo.js';
import {
  DepositConflictError,
  DepositNotFoundError,
  DepositValidationError,
  type DepositRecord,
  type DepositRepo,
  type DepositSortField,
  type DepositSortOrder,
  type DepositStatusValue,
} from '../deposits/depositRepo.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';
import type { WalletRecord } from '../wallet/walletRepo.js';

export interface DepositRouterDeps {
  depositRepo: DepositRepo;
  userRepo: UserDirectoryRepo;
  requireAuth: RequestHandler;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,120}$/;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;
const MULTILINE_CONTROL_CHAR_REGEX =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const MAX_DEPOSIT_AMOUNT = 1_000_000;

const ALLOWED_LIST_QUERY_KEYS = new Set([
  'customerId',
  'status',
  'beforeCreatedAt',
  'q',
  'sortBy',
  'sortOrder',
  'limit',
  'offset',
]);

const ALLOWED_STATUS_VALUES = new Set<DepositStatusValue>([
  'pending',
  'submitted',
  'verifying',
  'approved',
  'completed',
  'rejected',
  'cancelled',
]);

const ALLOWED_SORT_FIELDS = new Set<DepositSortField>([
  'createdAt',
  'updatedAt',
  'amount',
]);

const ALLOWED_DEPOSIT_METHODS = new Set([
  'cashapp',
  'chime',
  'crypto',
  'payment_link',
  'manual_receipt',
]);

const ALLOWED_CUSTOMER_BODY_KEYS = new Set([
  'amount',
  'method',
  'methodName',
  'targetGameCatalogId',
  'targetGameName',
  'targetGameUsername',
  'receiptUrl',
  'receiptName',
  'providerRef',
  'customerNotes',
  'cryptoNetwork',
  'cryptoTxHash',
  'depositAddress',
]);

const ALLOWED_STAFF_BODY_KEYS = new Set([
  'customerId',
  'amount',
  'bonusPercentage',
  'method',
  'methodName',
  'targetGameCatalogId',
  'targetGameName',
  'targetGameUsername',
  'providerRef',
  'receiptUrl',
  'receiptName',
  'notes',
  'status',
]);

const ALLOWED_APPROVE_BODY_KEYS = new Set(['verifiedAmount', 'notes']);
const ALLOWED_REJECT_BODY_KEYS = new Set(['reason']);

export interface ValidatedListDepositsQuery {
  customerId?: string;
  status?: DepositStatusValue;
  beforeCreatedAt?: string;
  search?: string;
  sortBy: DepositSortField;
  sortOrder: DepositSortOrder;
  limit: number;
  offset: number;
}

export interface ValidatedCustomerDepositBody {
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

export interface ValidatedStaffDepositBody {
  customerId: string;
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

export interface ValidatedApproveDepositBody {
  verifiedAmount?: number;
  notes?: string;
}

export interface ValidatedRejectDepositBody {
  reason: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertAllowedKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  kind: 'query' | 'body',
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported ${kind} field: "${key}".`,
      );
    }
  }
}

function validateIdParam(raw: unknown, fieldName: string): string {
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
    trimmed === 'staff' ||
    !ID_REGEX.test(trimmed) ||
    CONTROL_CHAR_REGEX.test(trimmed)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must match ^[a-zA-Z0-9_-]{1,120}$ and cannot be reserved.`,
    );
  }
  return trimmed;
}

function validateOptionalText(
  raw: unknown,
  fieldName: string,
  maxLen: number,
  allowNewlines = false,
): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be a string.`,
    );
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const ctrlRegex = allowNewlines
    ? MULTILINE_CONTROL_CHAR_REGEX
    : CONTROL_CHAR_REGEX;
  if (trimmed.length > maxLen || ctrlRegex.test(trimmed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} contains invalid characters or exceeds ${maxLen} characters.`,
    );
  }
  return trimmed;
}

function validateSafeReceiptUrl(
  raw: unknown,
  required: boolean,
): string | undefined {
  const cleaned = validateOptionalText(raw, 'receiptUrl', 2048);
  if (!cleaned) {
    if (required) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Please upload a screenshot of your payment receipt before submitting.',
      );
    }
    return undefined;
  }

  // Allow relative storage proxy or upload routes, or explicit https/http URLs.
  if (cleaned.startsWith('/')) {
    if (cleaned.startsWith('//')) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'receiptUrl cannot be a protocol-relative URL.',
      );
    }
    return cleaned;
  }

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'receiptUrl must be a valid storage path or https URL.',
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'receiptUrl scheme is not allowed.',
    );
  }

  return cleaned;
}

function parseMoneyAmount(
  raw: unknown,
  fieldName: string,
  options: { allowZero?: boolean } = {},
): number {
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be a valid number.`,
    );
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be a finite number.`,
    );
  }
  const rounded = Number(parsed.toFixed(2));
  if (options.allowZero) {
    if (rounded < 0 || rounded > MAX_DEPOSIT_AMOUNT) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `${fieldName} must be between 0 and ${MAX_DEPOSIT_AMOUNT}.`,
      );
    }
    return rounded;
  }
  if (rounded <= 0 || rounded > MAX_DEPOSIT_AMOUNT) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be greater than $0.00 and at most $${MAX_DEPOSIT_AMOUNT}.`,
    );
  }
  return rounded;
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

function defaultMethodNameFor(method: string): string {
  switch (method) {
    case 'cashapp':
      return 'CashApp';
    case 'chime':
      return 'Chime Direct';
    case 'crypto':
      return 'Crypto';
    case 'payment_link':
      return 'Payment via Link';
    default:
      return 'Direct Support Desk';
  }
}

export function validateListDepositsQuery(
  rawQuery: Record<string, unknown>,
): ValidatedListDepositsQuery {
  assertAllowedKeys(rawQuery, ALLOWED_LIST_QUERY_KEYS, 'query');

  const customerId =
    rawQuery.customerId !== undefined
      ? validateIdParam(rawQuery.customerId, 'customerId')
      : undefined;

  let status: DepositStatusValue | undefined;
  if (rawQuery.status !== undefined) {
    if (
      typeof rawQuery.status !== 'string' ||
      !ALLOWED_STATUS_VALUES.has(rawQuery.status.trim() as DepositStatusValue)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid deposit status filter.',
      );
    }
    status = rawQuery.status.trim() as DepositStatusValue;
  }

  let beforeCreatedAt: string | undefined;
  if (rawQuery.beforeCreatedAt !== undefined) {
    if (typeof rawQuery.beforeCreatedAt !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'beforeCreatedAt must be an ISO-8601 timestamp string.',
      );
    }
    const trimmed = rawQuery.beforeCreatedAt.trim();
    const parsedMs = Date.parse(trimmed);
    if (!trimmed || !Number.isFinite(parsedMs)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'beforeCreatedAt must be a valid ISO-8601 timestamp.',
      );
    }
    beforeCreatedAt = new Date(parsedMs).toISOString();
  }

  let sortBy: DepositSortField = 'createdAt';
  if (rawQuery.sortBy !== undefined) {
    if (
      typeof rawQuery.sortBy !== 'string' ||
      !ALLOWED_SORT_FIELDS.has(rawQuery.sortBy.trim() as DepositSortField)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'sortBy must be one of createdAt, updatedAt, or amount.',
      );
    }
    sortBy = rawQuery.sortBy.trim() as DepositSortField;
  }

  let sortOrder: DepositSortOrder = 'desc';
  if (rawQuery.sortOrder !== undefined) {
    if (
      typeof rawQuery.sortOrder !== 'string' ||
      (rawQuery.sortOrder.trim() !== 'asc' && rawQuery.sortOrder.trim() !== 'desc')
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'sortOrder must be either "asc" or "desc".',
      );
    }
    sortOrder = rawQuery.sortOrder.trim() as DepositSortOrder;
  }

  const search = validateOptionalText(rawQuery.q, 'q', 120);
  const limit = parseBoundedInt(rawQuery.limit, 'limit', 25, 1, 100);
  const offset = parseBoundedInt(rawQuery.offset, 'offset', 0, 0, 10_000);

  return {
    customerId,
    status,
    beforeCreatedAt,
    search,
    sortBy,
    sortOrder,
    limit,
    offset,
  };
}

export function validateCustomerDepositBody(
  body: unknown,
): ValidatedCustomerDepositBody {
  if (!isPlainObject(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  }
  assertAllowedKeys(body, ALLOWED_CUSTOMER_BODY_KEYS, 'body');

  // Proof-first customer submissions send amount: 0; reject negative or malformed amounts.
  const amount =
    body.amount === undefined || body.amount === null
      ? 0
      : parseMoneyAmount(body.amount, 'amount', { allowZero: true });

  const rawMethod = validateOptionalText(body.method, 'method', 60);
  if (!rawMethod || !ALLOWED_DEPOSIT_METHODS.has(rawMethod)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Unsupported payment method.',
    );
  }
  const methodName =
    validateOptionalText(body.methodName, 'methodName', 100) ??
    defaultMethodNameFor(rawMethod);

  const receiptUrl = validateSafeReceiptUrl(body.receiptUrl, true)!;
  const receiptName = validateOptionalText(body.receiptName, 'receiptName', 200);
  const targetGameCatalogId =
    body.targetGameCatalogId !== undefined && body.targetGameCatalogId !== null
      ? validateIdParam(body.targetGameCatalogId, 'targetGameCatalogId')
      : undefined;
  const targetGameName = validateOptionalText(
    body.targetGameName,
    'targetGameName',
    120,
  );
  const targetGameUsername = validateOptionalText(
    body.targetGameUsername,
    'targetGameUsername',
    120,
  );
  const providerRef = validateOptionalText(body.providerRef, 'providerRef', 200);
  const customerNotes = validateOptionalText(
    body.customerNotes,
    'customerNotes',
    1000,
    true,
  );
  const cryptoNetwork = validateOptionalText(
    body.cryptoNetwork,
    'cryptoNetwork',
    60,
  );
  const cryptoTxHash = validateOptionalText(
    body.cryptoTxHash,
    'cryptoTxHash',
    200,
  );
  const depositAddress = validateOptionalText(
    body.depositAddress,
    'depositAddress',
    200,
  );

  return {
    amount,
    method: rawMethod,
    methodName,
    targetGameCatalogId,
    targetGameName,
    targetGameUsername,
    receiptUrl,
    receiptName,
    providerRef,
    customerNotes,
    cryptoNetwork,
    cryptoTxHash,
    depositAddress,
  };
}

export function validateStaffDepositBody(
  body: unknown,
): ValidatedStaffDepositBody {
  if (!isPlainObject(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  }
  assertAllowedKeys(body, ALLOWED_STAFF_BODY_KEYS, 'body');

  const customerId = validateIdParam(body.customerId, 'customerId');
  const amount = parseMoneyAmount(body.amount, 'amount');

  let bonusPercentage: number | undefined;
  if (body.bonusPercentage !== undefined && body.bonusPercentage !== null) {
    const parsedBonus = Number(body.bonusPercentage);
    if (!Number.isFinite(parsedBonus) || parsedBonus < 0 || parsedBonus > 500) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'bonusPercentage must be a finite number between 0 and 500.',
      );
    }
    bonusPercentage = Number(parsedBonus.toFixed(2));
  }

  const rawMethod =
    validateOptionalText(body.method, 'method', 60) ?? 'manual_receipt';
  if (!ALLOWED_DEPOSIT_METHODS.has(rawMethod)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Unsupported payment method.',
    );
  }
  const methodName =
    validateOptionalText(body.methodName, 'methodName', 100) ??
    defaultMethodNameFor(rawMethod);

  const targetGameCatalogId =
    body.targetGameCatalogId !== undefined && body.targetGameCatalogId !== null
      ? validateIdParam(body.targetGameCatalogId, 'targetGameCatalogId')
      : undefined;
  const targetGameName = validateOptionalText(
    body.targetGameName,
    'targetGameName',
    120,
  );
  const targetGameUsername = validateOptionalText(
    body.targetGameUsername,
    'targetGameUsername',
    120,
  );
  const providerRef = validateOptionalText(body.providerRef, 'providerRef', 200);
  const receiptUrl = validateSafeReceiptUrl(body.receiptUrl, false);
  const receiptName = validateOptionalText(body.receiptName, 'receiptName', 200);
  const notes = validateOptionalText(body.notes, 'notes', 1000, true);

  if (body.status !== 'completed' && body.status !== 'submitted') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'status must be either "completed" or "submitted".',
    );
  }

  return {
    customerId,
    amount,
    bonusPercentage,
    method: rawMethod,
    methodName,
    targetGameCatalogId,
    targetGameName,
    targetGameUsername,
    providerRef,
    receiptUrl,
    receiptName,
    notes,
    status: body.status,
  };
}

export function validateApproveDepositBody(
  body: unknown,
): ValidatedApproveDepositBody {
  if (!isPlainObject(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  }
  assertAllowedKeys(body, ALLOWED_APPROVE_BODY_KEYS, 'body');

  const verifiedAmount =
    body.verifiedAmount !== undefined && body.verifiedAmount !== null
      ? parseMoneyAmount(body.verifiedAmount, 'verifiedAmount')
      : undefined;
  const notes = validateOptionalText(body.notes, 'notes', 1000, true);

  return {
    verifiedAmount,
    notes,
  };
}

export function validateRejectDepositBody(
  body: unknown,
): ValidatedRejectDepositBody {
  if (!isPlainObject(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  }
  assertAllowedKeys(body, ALLOWED_REJECT_BODY_KEYS, 'body');

  const reason = validateOptionalText(body.reason, 'reason', 1000, true);
  if (!reason) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Please enter a rejection reason.',
    );
  }

  return { reason };
}

function toDepositDto(d: DepositRecord) {
  return {
    id: d.id,
    customerId: d.customerId,
    customerName: d.customerName,
    amount: d.amount,
    currency: d.currency,
    bonusAmount: d.bonusAmount,
    bonusPercentage: d.bonusPercentage,
    feeAmount: d.feeAmount,
    finalWalletCredit: d.finalWalletCredit,
    method: d.method,
    methodName: d.methodName,
    paymentMethodId: d.method,
    paymentMethodName: d.methodName,
    status: d.status,
    receiptUrl: d.receiptUrl ?? undefined,
    proofUrl: d.receiptUrl ?? undefined,
    receiptName: d.receiptName ?? undefined,
    targetGameName: d.targetGameName ?? undefined,
    targetGameCatalogId: d.targetGameCatalogId ?? undefined,
    targetGameUsername: d.targetGameUsername ?? undefined,
    fundingSource: d.fundingSource,
    providerRef: d.providerRef ?? undefined,
    customerNotes: d.customerNotes ?? undefined,
    cryptoNetwork: d.cryptoNetwork ?? undefined,
    cryptoTxHash: d.cryptoTxHash ?? undefined,
    depositAddress: d.depositAddress ?? undefined,
    reviewerId: d.reviewerId ?? undefined,
    reviewerName: d.reviewerName ?? undefined,
    reviewNotes: d.reviewNotes ?? undefined,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
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

export function createDepositRouter({
  depositRepo,
  userRepo,
  requireAuth,
}: DepositRouterDeps): Router {
  const router = Router();
  const requireStaff = requireRole('admin', 'agent');

  // List deposit requests (customer strictly scoped to self; staff bounded listing)
  router.get(
    '/deposits',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const query = validateListDepositsQuery(
          req.query as Record<string, unknown>,
        );
        const isStaff = actor.role === 'admin' || actor.role === 'agent';

        if (!isStaff && query.customerId && query.customerId !== actor.appUserId) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'You can only access your own deposit requests.',
          );
        }

        const effectiveCustomerId = isStaff
          ? query.customerId
          : actor.appUserId;

        const result = await depositRepo.listDeposits({
          customerId: effectiveCustomerId,
          status: query.status,
          beforeCreatedAt: query.beforeCreatedAt,
          search: query.search,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
          limit: query.limit,
          offset: query.offset,
        });

        res.status(200).json({
          deposits: result.items.map(toDepositDto),
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

  // Customer proof-first deposit submission
  router.post(
    '/deposits',
    requireAuth,
    validateRequestBody(validateCustomerDepositBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const body = req.body as ValidatedCustomerDepositBody;

        const { deposit, wallet } = await depositRepo.createCustomerDeposit({
          customerId: actor.appUserId,
          customerName: actor.displayName,
          actorRole: actor.role,
          amount: body.amount,
          method: body.method,
          methodName: body.methodName,
          targetGameCatalogId: body.targetGameCatalogId,
          targetGameName: body.targetGameName,
          targetGameUsername: body.targetGameUsername,
          receiptUrl: body.receiptUrl,
          receiptName: body.receiptName,
          providerRef: body.providerRef,
          customerNotes: body.customerNotes,
          cryptoNetwork: body.cryptoNetwork,
          cryptoTxHash: body.cryptoTxHash,
          depositAddress: body.depositAddress,
        });

        res.status(201).json({
          deposit: toDepositDto(deposit),
          wallet: toWalletDto(wallet),
          message:
            'Payment proof submitted! Customer Support is reviewing your deposit.',
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Staff direct deposit logging / creation (registered before /deposits/:id)
  router.post(
    '/deposits/staff',
    requireAuth,
    requireStaff,
    validateRequestBody(validateStaffDepositBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const body = req.body as ValidatedStaffDepositBody;

        const targetUser = await userRepo.findByAppUserId(body.customerId);
        if (!targetUser) {
          throw new HttpError(
            404,
            'USER_NOT_FOUND',
            'Customer account not found.',
          );
        }

        const { deposit, wallet } = await depositRepo.createStaffDeposit({
          customerId: targetUser.appUserId,
          customerName: targetUser.displayName,
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
          amount: body.amount,
          bonusPercentage: body.bonusPercentage,
          method: body.method,
          methodName: body.methodName,
          targetGameCatalogId: body.targetGameCatalogId,
          targetGameName: body.targetGameName,
          targetGameUsername: body.targetGameUsername,
          providerRef: body.providerRef,
          receiptUrl: body.receiptUrl,
          receiptName: body.receiptName,
          notes: body.notes,
          status: body.status,
        });

        const isCompleted = deposit.status === 'completed';
        res.status(201).json({
          deposit: toDepositDto(deposit),
          wallet: toWalletDto(wallet),
          message: isCompleted
            ? `Completed deposit of $${deposit.finalWalletCredit.toFixed(2)} saved.`
            : `Pending deposit request of $${deposit.amount.toFixed(2)} created.`,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Single deposit lookup (owner or staff only)
  router.get(
    '/deposits/:id',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const id = validateIdParam(req.params.id, 'id');
        const deposit = await depositRepo.findDepositById(id);

        if (!deposit) {
          throw new HttpError(
            404,
            'DEPOSIT_NOT_FOUND',
            'Deposit request not found.',
          );
        }

        const isStaff = actor.role === 'admin' || actor.role === 'agent';
        if (!isStaff && deposit.customerId !== actor.appUserId) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'You can only access your own deposit requests.',
          );
        }

        res.status(200).json({
          deposit: toDepositDto(deposit),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Staff approve & finalize deposit
  router.patch(
    '/deposits/:id/approve',
    requireAuth,
    requireStaff,
    validateRequestBody(validateApproveDepositBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const id = validateIdParam(req.params.id, 'id');
        const body = req.body as ValidatedApproveDepositBody;

        try {
          const { deposit, wallet } = await depositRepo.approveDeposit({
            requestId: id,
            actorId: actor.appUserId,
            actorName: actor.displayName,
            actorRole: actor.role,
            verifiedAmount: body.verifiedAmount,
            notes: body.notes,
          });

          res.status(200).json({
            deposit: toDepositDto(deposit),
            wallet: toWalletDto(wallet),
            message: 'Deposit successfully approved and credited.',
          });
        } catch (err) {
          if (err instanceof DepositNotFoundError) {
            throw new HttpError(404, 'DEPOSIT_NOT_FOUND', err.message);
          }
          if (err instanceof DepositConflictError) {
            throw new HttpError(409, 'DEPOSIT_CONFLICT', err.message);
          }
          if (err instanceof DepositValidationError) {
            throw new HttpError(400, 'VALIDATION_ERROR', err.message);
          }
          throw err;
        }
      } catch (err) {
        next(err);
      }
    },
  );

  // Staff reject deposit
  router.patch(
    '/deposits/:id/reject',
    requireAuth,
    requireStaff,
    validateRequestBody(validateRejectDepositBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const id = validateIdParam(req.params.id, 'id');
        const body = req.body as ValidatedRejectDepositBody;

        try {
          const { deposit, wallet } = await depositRepo.rejectDeposit({
            requestId: id,
            actorId: actor.appUserId,
            actorName: actor.displayName,
            actorRole: actor.role,
            reason: body.reason,
          });

          res.status(200).json({
            deposit: toDepositDto(deposit),
            wallet: toWalletDto(wallet),
            message: 'Deposit rejected.',
          });
        } catch (err) {
          if (err instanceof DepositNotFoundError) {
            throw new HttpError(404, 'DEPOSIT_NOT_FOUND', err.message);
          }
          if (err instanceof DepositConflictError) {
            throw new HttpError(409, 'DEPOSIT_CONFLICT', err.message);
          }
          throw err;
        }
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
