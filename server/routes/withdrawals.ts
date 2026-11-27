import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { UserDirectoryRepo } from '../auth/userDirectoryRepo.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';
import {
  WithdrawalConflictError,
  WithdrawalForbiddenError,
  WithdrawalNotFoundError,
  type WithdrawalRecord,
  type WithdrawalRepo,
  type WithdrawalStatusValue,
} from '../withdrawals/withdrawalRepo.js';
import type { RealtimeEventBroker } from '../realtime/realtimeEvents.js';
import type { WalletRecord } from '../wallet/walletRepo.js';

export interface WithdrawalRouterDeps {
  withdrawalRepo: WithdrawalRepo;
  userRepo: UserDirectoryRepo;
  requireAuth: RequestHandler;
  realtimeEvents?: RealtimeEventBroker;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,120}$/;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;
const MULTILINE_CONTROL_CHAR_REGEX =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const MAX_CASHOUT_AMOUNT = 1_000_000;

const ALLOWED_LIST_QUERY_KEYS = new Set([
  'customerId',
  'status',
  'beforeCreatedAt',
  'q',
  'limit',
  'offset',
]);

const ALLOWED_STATUS_VALUES = new Set<WithdrawalStatusValue>([
  'pending',
  'pending_verification',
  'submitted',
  'processing',
  'approved',
  'completed',
  'rejected',
  'cancelled',
]);

const ALLOWED_TRANSITION_TARGET_STATUSES = new Set<WithdrawalStatusValue>([
  'pending_verification',
  'processing',
  'approved',
  'completed',
  'rejected',
  'cancelled',
]);

const ALLOWED_PAYOUT_METHODS = new Set([
  'cashapp',
  'chime',
  'crypto',
  'payment_link',
  'manual_support',
  'bank_transfer',
]);

const ALLOWED_CUSTOMER_BODY_KEYS = new Set([
  'amount',
  'method',
  'methodName',
  'sourceGameCatalogId',
  'sourceGameName',
  'sourceGameUsername',
  'playerNotes',
  'payoutDetails',
]);

const ALLOWED_STAFF_BODY_KEYS = new Set([
  'customerId',
  'amount',
  'feeAmount',
  'method',
  'methodName',
  'payoutHandle',
  'payoutReference',
  'sourceGameCatalogId',
  'sourceGameName',
  'sourceGameUsername',
  'notes',
  'status',
]);

const ALLOWED_STATUS_BODY_KEYS = new Set([
  'newStatus',
  'note',
  'payoutReference',
]);

const ALLOWED_CUSTOMER_PAYOUT_DETAIL_KEYS = new Set([
  'methodType',
  'cashtag',
  'chimeHandle',
  'cryptoAddress',
  'linkAccountRef',
  'payoutHandle',
  'collectedBySupport',
]);

export interface ValidatedListWithdrawalsQuery {
  customerId?: string;
  status?: WithdrawalStatusValue;
  beforeCreatedAt?: string;
  search?: string;
  limit: number;
  offset: number;
}

export interface ValidatedCustomerWithdrawalBody {
  amount: number;
  method: string;
  methodName: string;
  sourceGameCatalogId?: string;
  sourceGameName?: string;
  sourceGameUsername?: string;
  playerNotes?: string;
  payoutDetails: Record<string, unknown>;
}

export interface ValidatedStaffWithdrawalBody {
  customerId: string;
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

export interface ValidatedTransitionStatusBody {
  newStatus: WithdrawalStatusValue;
  note?: string;
  payoutReference?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertAllowedKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  kind: 'query' | 'body' | 'payoutDetails',
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
    if (rounded < 0 || rounded > MAX_CASHOUT_AMOUNT) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `${fieldName} must be between 0 and ${MAX_CASHOUT_AMOUNT}.`,
      );
    }
    return rounded;
  }
  if (rounded <= 0 || rounded > MAX_CASHOUT_AMOUNT) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be greater than $0.00 and at most $${MAX_CASHOUT_AMOUNT}.`,
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
    case 'bank_transfer':
      return 'Bank Transfer';
    default:
      return 'Customer Support Manual Payout';
  }
}

export function validateListWithdrawalsQuery(
  rawQuery: Record<string, unknown>,
): ValidatedListWithdrawalsQuery {
  assertAllowedKeys(rawQuery, ALLOWED_LIST_QUERY_KEYS, 'query');

  const customerId =
    rawQuery.customerId !== undefined
      ? validateIdParam(rawQuery.customerId, 'customerId')
      : undefined;

  let status: WithdrawalStatusValue | undefined;
  if (rawQuery.status !== undefined) {
    if (
      typeof rawQuery.status !== 'string' ||
      !ALLOWED_STATUS_VALUES.has(rawQuery.status.trim() as WithdrawalStatusValue)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid withdrawal status filter.',
      );
    }
    status = rawQuery.status.trim() as WithdrawalStatusValue;
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

  const search = validateOptionalText(rawQuery.q, 'q', 120);
  const limit = parseBoundedInt(rawQuery.limit, 'limit', 25, 1, 100);
  const offset = parseBoundedInt(rawQuery.offset, 'offset', 0, 0, 10_000);

  return {
    customerId,
    status,
    beforeCreatedAt,
    search,
    limit,
    offset,
  };
}

export function validateCustomerWithdrawalBody(
  body: unknown,
): ValidatedCustomerWithdrawalBody {
  if (!isPlainObject(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  }
  assertAllowedKeys(body, ALLOWED_CUSTOMER_BODY_KEYS, 'body');

  const amount = parseMoneyAmount(body.amount, 'amount');
  const rawMethod =
    validateOptionalText(body.method, 'method', 60) ?? 'manual_support';
  if (!ALLOWED_PAYOUT_METHODS.has(rawMethod)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Unsupported payout method.',
    );
  }
  const methodName =
    validateOptionalText(body.methodName, 'methodName', 100) ??
    defaultMethodNameFor(rawMethod);

  const sourceGameCatalogId =
    body.sourceGameCatalogId !== undefined && body.sourceGameCatalogId !== null
      ? validateIdParam(body.sourceGameCatalogId, 'sourceGameCatalogId')
      : undefined;
  const sourceGameName = validateOptionalText(
    body.sourceGameName,
    'sourceGameName',
    120,
  );
  const sourceGameUsername = validateOptionalText(
    body.sourceGameUsername,
    'sourceGameUsername',
    120,
  );
  const playerNotes = validateOptionalText(
    body.playerNotes,
    'playerNotes',
    1000,
    true,
  );

  const sanitizedPayoutDetails: Record<string, unknown> = {
    methodType: rawMethod,
    collectedBySupport: false,
  };

  if (body.payoutDetails !== undefined && body.payoutDetails !== null) {
    if (!isPlainObject(body.payoutDetails)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'payoutDetails must be a JSON object.',
      );
    }
    assertAllowedKeys(
      body.payoutDetails,
      ALLOWED_CUSTOMER_PAYOUT_DETAIL_KEYS,
      'payoutDetails',
    );
    for (const key of [
      'cashtag',
      'chimeHandle',
      'cryptoAddress',
      'linkAccountRef',
      'payoutHandle',
    ] as const) {
      const val = validateOptionalText(body.payoutDetails[key], key, 160);
      if (val) {
        sanitizedPayoutDetails[key] = val;
      }
    }
    if (body.payoutDetails.collectedBySupport !== undefined) {
      if (typeof body.payoutDetails.collectedBySupport !== 'boolean') {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'payoutDetails.collectedBySupport must be a boolean.',
        );
      }
      sanitizedPayoutDetails.collectedBySupport =
        body.payoutDetails.collectedBySupport;
    }
  }

  return {
    amount,
    method: rawMethod,
    methodName,
    sourceGameCatalogId,
    sourceGameName,
    sourceGameUsername,
    playerNotes,
    payoutDetails: sanitizedPayoutDetails,
  };
}

export function validateStaffWithdrawalBody(
  body: unknown,
): ValidatedStaffWithdrawalBody {
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
  const feeAmount =
    body.feeAmount === undefined || body.feeAmount === null
      ? 0
      : parseMoneyAmount(body.feeAmount, 'feeAmount', { allowZero: true });

  if (feeAmount >= amount) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Fee amount cannot equal or exceed the gross cashout amount.',
    );
  }

  const rawMethod =
    validateOptionalText(body.method, 'method', 60) ?? 'manual_support';
  if (!ALLOWED_PAYOUT_METHODS.has(rawMethod)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Unsupported payout method.',
    );
  }

  const methodName =
    validateOptionalText(body.methodName, 'methodName', 100) ??
    defaultMethodNameFor(rawMethod);
  const payoutHandle = validateOptionalText(
    body.payoutHandle,
    'payoutHandle',
    160,
  );
  const payoutReference = validateOptionalText(
    body.payoutReference,
    'payoutReference',
    160,
  );
  const sourceGameCatalogId =
    body.sourceGameCatalogId !== undefined && body.sourceGameCatalogId !== null
      ? validateIdParam(body.sourceGameCatalogId, 'sourceGameCatalogId')
      : undefined;
  const sourceGameName = validateOptionalText(
    body.sourceGameName,
    'sourceGameName',
    120,
  );
  const sourceGameUsername = validateOptionalText(
    body.sourceGameUsername,
    'sourceGameUsername',
    120,
  );
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
    feeAmount,
    method: rawMethod,
    methodName,
    payoutHandle,
    payoutReference,
    sourceGameCatalogId,
    sourceGameName,
    sourceGameUsername,
    notes,
    status: body.status,
  };
}

export function validateTransitionStatusBody(
  body: unknown,
): ValidatedTransitionStatusBody {
  if (!isPlainObject(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  }
  assertAllowedKeys(body, ALLOWED_STATUS_BODY_KEYS, 'body');

  if (
    typeof body.newStatus !== 'string' ||
    !ALLOWED_TRANSITION_TARGET_STATUSES.has(
      body.newStatus.trim() as WithdrawalStatusValue,
    )
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'newStatus must be one of pending_verification, processing, approved, completed, rejected, or cancelled.',
    );
  }

  const note = validateOptionalText(body.note, 'note', 1000, true);
  const payoutReference = validateOptionalText(
    body.payoutReference,
    'payoutReference',
    160,
  );

  return {
    newStatus: body.newStatus.trim() as WithdrawalStatusValue,
    note,
    payoutReference,
  };
}

function toWithdrawalDto(w: WithdrawalRecord) {
  return {
    id: w.id,
    customerId: w.customerId,
    customerName: w.customerName,
    amount: w.amount,
    currency: w.currency,
    feeAmount: w.feeAmount,
    fee: w.feeAmount,
    netPayout: w.netPayout,
    netAmount: w.netPayout,
    reservedAmount: w.reservedAmount,
    method: w.method,
    methodName: w.methodName,
    payoutMethodId: w.method,
    payoutMethodName: w.methodName,
    sourceGameCatalogId: w.sourceGameCatalogId ?? undefined,
    sourceGameName: w.sourceGameName ?? undefined,
    sourceGameUsername: w.sourceGameUsername ?? undefined,
    playerNotes: w.playerNotes ?? undefined,
    payoutDetails: w.payoutDetails,
    status: w.status,
    reviewerId: w.reviewerId ?? undefined,
    reviewerName: w.reviewerName ?? undefined,
    reviewNotes: w.reviewNotes ?? undefined,
    payoutReference: w.payoutReference ?? undefined,
    transactionHash: w.payoutReference ?? undefined,
    timeline: w.timeline,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
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

export function createWithdrawalRouter({
  withdrawalRepo,
  userRepo,
  requireAuth,
  realtimeEvents,
}: WithdrawalRouterDeps): Router {
  const router = Router();
  const requireStaff = requireRole('admin', 'agent');

  // List withdrawal requests (customer strictly scoped to self; staff bounded listing)
  router.get(
    '/withdrawals',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const query = validateListWithdrawalsQuery(
          req.query as Record<string, unknown>,
        );
        const isStaff = actor.role === 'admin' || actor.role === 'agent';

        if (!isStaff && query.customerId && query.customerId !== actor.appUserId) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'You can only access your own withdrawal requests.',
          );
        }

        const effectiveCustomerId = isStaff
          ? query.customerId
          : actor.appUserId;

        const result = await withdrawalRepo.listWithdrawals({
          customerId: effectiveCustomerId,
          status: query.status,
          beforeCreatedAt: query.beforeCreatedAt,
          search: query.search,
          limit: query.limit,
          offset: query.offset,
        });

        res.status(200).json({
          withdrawals: result.items.map(toWithdrawalDto),
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

  // Customer self-service cashout request creation
  router.post(
    '/withdrawals',
    requireAuth,
    validateRequestBody(validateCustomerWithdrawalBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        if (!actor.emailVerified) {
          throw new HttpError(
            403,
            'EMAIL_VERIFICATION_REQUIRED',
            'Email verification is required before requesting cashouts. Please verify your email address to unlock withdrawals.',
          );
        }

        const body = req.body as ValidatedCustomerWithdrawalBody;
        const { withdrawal } = await withdrawalRepo.createCustomerWithdrawal({
          customerId: actor.appUserId,
          customerName: actor.displayName,
          actorRole: actor.role,
          amount: body.amount,
          method: body.method,
          methodName: body.methodName,
          sourceGameCatalogId: body.sourceGameCatalogId,
          sourceGameName: body.sourceGameName,
          sourceGameUsername: body.sourceGameUsername,
          playerNotes: body.playerNotes,
          payoutDetails: body.payoutDetails,
        });

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'user_and_staff', customerId: actor.appUserId },
          ['withdrawals', 'wallets', 'audit_logs'],
          'withdrawal_created',
          actor.appUserId,
        );

        res.status(201).json({
          withdrawal: toWithdrawalDto(withdrawal),
          message:
            'Withdrawal request created! Customer Support is reviewing your request.',
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Staff emergency cashout creation (registered before /withdrawals/:id)
  router.post(
    '/withdrawals/staff',
    requireAuth,
    requireStaff,
    validateRequestBody(validateStaffWithdrawalBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const body = req.body as ValidatedStaffWithdrawalBody;

        const targetUser = await userRepo.findByAppUserId(body.customerId);
        if (!targetUser) {
          throw new HttpError(
            404,
            'USER_NOT_FOUND',
            'Customer account not found.',
          );
        }

        const { withdrawal, wallet } =
          await withdrawalRepo.createStaffWithdrawal({
            customerId: targetUser.appUserId,
            customerName: targetUser.displayName,
            actorId: actor.appUserId,
            actorName: actor.displayName,
            actorRole: actor.role,
            amount: body.amount,
            feeAmount: body.feeAmount,
            method: body.method,
            methodName: body.methodName,
            payoutHandle: body.payoutHandle,
            payoutReference: body.payoutReference,
            sourceGameCatalogId: body.sourceGameCatalogId,
            sourceGameName: body.sourceGameName,
            sourceGameUsername: body.sourceGameUsername,
            notes: body.notes,
            status: body.status,
          });

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'user_and_staff', customerId: targetUser.appUserId },
          ['withdrawals', 'wallets', 'transactions', 'audit_logs'],
          'staff_withdrawal_created',
          targetUser.appUserId,
        );

        const isCompleted = withdrawal.status === 'completed';
        res.status(201).json({
          withdrawal: toWithdrawalDto(withdrawal),
          wallet: toWalletDto(wallet),
          message: isCompleted
            ? `Completed cashout of $${withdrawal.amount.toFixed(2)} logged.`
            : `Pending cashout request of $${withdrawal.amount.toFixed(2)} created.`,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Single withdrawal lookup (owner or staff only)
  router.get(
    '/withdrawals/:id',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const id = validateIdParam(req.params.id, 'id');
        const withdrawal = await withdrawalRepo.findWithdrawalById(id);

        if (!withdrawal) {
          throw new HttpError(
            404,
            'WITHDRAWAL_NOT_FOUND',
            'Withdrawal request not found.',
          );
        }

        const isStaff = actor.role === 'admin' || actor.role === 'agent';
        if (!isStaff && withdrawal.customerId !== actor.appUserId) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'You can only access your own withdrawal requests.',
          );
        }

        res.status(200).json({
          withdrawal: toWithdrawalDto(withdrawal),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Transition withdrawal status (customer cancel on own submitted request, or staff workflow transition)
  router.patch(
    '/withdrawals/:id/status',
    requireAuth,
    validateRequestBody(validateTransitionStatusBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const id = validateIdParam(req.params.id, 'id');
        const body = req.body as ValidatedTransitionStatusBody;

        try {
          const { withdrawal, wallet } =
            await withdrawalRepo.transitionWithdrawalStatus({
              requestId: id,
              newStatus: body.newStatus,
              actorId: actor.appUserId,
              actorName: actor.displayName,
              actorRole: actor.role,
              note: body.note,
              payoutReference: body.payoutReference,
            });

          realtimeEvents?.emitDomainInvalidation(
            { scope: 'user_and_staff', customerId: withdrawal.customerId },
            ['withdrawals', 'wallets', 'transactions', 'audit_logs'],
            'withdrawal_status_updated',
            withdrawal.customerId,
          );

          res.status(200).json({
            withdrawal: toWithdrawalDto(withdrawal),
            wallet: toWalletDto(wallet),
            message: `Withdrawal status updated to ${withdrawal.status}.`,
          });
        } catch (err) {
          if (err instanceof WithdrawalNotFoundError) {
            throw new HttpError(404, 'WITHDRAWAL_NOT_FOUND', err.message);
          }
          if (err instanceof WithdrawalForbiddenError) {
            throw new HttpError(403, 'FORBIDDEN', err.message);
          }
          if (err instanceof WithdrawalConflictError) {
            throw new HttpError(409, 'WITHDRAWAL_CONFLICT', err.message);
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
