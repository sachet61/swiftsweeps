import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { UserDirectoryRepo } from '../auth/userDirectoryRepo.js';
import {
  GameAccountCatalogNotFoundError,
  GameAccountConflictError,
  GameAccountCustomerNotFoundError,
  GameAccountForbiddenError,
  GameAccountNotFoundError,
  GameAccountValidationError,
  type GameAccountRecord,
  type GameAccountRepo,
  type GameAccountSortField,
  type GameAccountSortOrder,
  type GameAccountStatusValue,
} from '../gameAccounts/gameAccountRepo.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';
import type { RealtimeEventBroker } from '../realtime/realtimeEvents.js';

export interface GameAccountRouterDeps {
  gameAccountRepo: GameAccountRepo;
  userRepo: UserDirectoryRepo;
  requireAuth: RequestHandler;
  realtimeEvents?: RealtimeEventBroker;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,120}$/;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;
const MULTILINE_CONTROL_CHAR_REGEX =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const RESERVED_ACCOUNT_IDS = new Set(['requests', 'provision', 'transfer']);

const ALLOWED_LIST_QUERY_KEYS = new Set([
  'customerId',
  'customerIds',
  'status',
  'gameCatalogId',
  'q',
  'sortBy',
  'sortOrder',
  'limit',
  'offset',
]);

const ALLOWED_STATUS_VALUES = new Set<GameAccountStatusValue>([
  'active',
  'pending_assignment',
  'pending_reset',
  'suspended',
]);

const ALLOWED_SORT_FIELDS = new Set<GameAccountSortField>([
  'createdAt',
  'updatedAt',
  'gameName',
  'status',
]);

const PRIVILEGED_BODY_FIELDS = new Set([
  'actorId',
  'actorName',
  'actorRole',
  'role',
  'reviewerId',
  'reviewerName',
  'balance',
  'freePlayBalance',
  'free_play_balance',
  'assignedByAgentId',
  'assignedByAgentName',
  'assigned_by_agent_id',
  'assigned_by_agent_name',
]);

const ALLOWED_CUSTOMER_REQUEST_KEYS = new Set([
  'gameCatalogId',
  'gameId',
  'gameTitle',
  'gameName',
  'platformName',
]);

const ALLOWED_RESET_REQUEST_KEYS = new Set<string>([]);

const ALLOWED_STAFF_PROVISION_KEYS = new Set([
  'customerId',
  'gameCatalogId',
  'gameId',
  'gameTitle',
  'gameName',
  'platformName',
  'username',
  'password',
  'notes',
  'pin',
  'status',
]);

const ALLOWED_STAFF_UPDATE_KEYS = new Set([
  'username',
  'password',
  'notes',
  'pin',
  'status',
]);

export interface ValidatedListGameAccountsQuery {
  customerId?: string;
  customerIds?: string[];
  status?: GameAccountStatusValue;
  gameCatalogId?: string;
  search?: string;
  sortBy: GameAccountSortField;
  sortOrder: GameAccountSortOrder;
  limit: number;
  offset: number;
}

export interface ValidatedCustomerGameRequestBody {
  gameCatalogId: string;
  fallbackGameTitle?: string;
  fallbackPlatformName?: string;
}

export interface ValidatedProvisionGameAccountBody {
  customerId: string;
  gameCatalogId: string;
  fallbackGameTitle?: string;
  fallbackPlatformName?: string;
  username: string;
  password?: string;
  notes?: string | null;
  status: 'active' | 'suspended';
}

export interface ValidatedUpdateCredentialsBody {
  username: string;
  password?: string;
  notes?: string | null;
  status: 'active' | 'suspended';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertAllowedKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  kind: 'query' | 'body',
  forbidPrivileged = false,
): void {
  for (const key of Object.keys(obj)) {
    if (forbidPrivileged && PRIVILEGED_BODY_FIELDS.has(key)) {
      throw new HttpError(
        403,
        'FORBIDDEN_FIELD_MODIFICATION',
        `Field "${key}" cannot be supplied by client requests.`,
      );
    }
    if (!allowed.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported ${kind} field: "${key}".`,
      );
    }
  }
}

function validateIdValue(
  raw: unknown,
  fieldName: string,
  disallowReserved = false,
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
    (disallowReserved && RESERVED_ACCOUNT_IDS.has(trimmed)) ||
    !ID_REGEX.test(trimmed) ||
    CONTROL_CHAR_REGEX.test(trimmed)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must match ^[a-zA-Z0-9_-]{1,120}$ and cannot be a reserved route name.`,
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

function validateUsernameValue(raw: unknown): string {
  const username = validateOptionalText(raw, 'username', 80);
  if (!username) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'username is required and must be between 1 and 80 characters.',
    );
  }
  if (username.toLowerCase() === 'pending assignment') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'username cannot be the reserved placeholder "Pending Assignment".',
    );
  }
  return username;
}

function validateOptionalPasswordValue(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'password must be a string.',
    );
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > 120 || CONTROL_CHAR_REGEX.test(trimmed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'password contains invalid characters or exceeds 120 characters.',
    );
  }
  return trimmed;
}

function validateNullableNotes(
  body: Record<string, unknown>,
): string | null | undefined {
  const hasNotes = 'notes' in body || 'pin' in body;
  if (!hasNotes) {
    return undefined;
  }
  const raw = body.notes !== undefined ? body.notes : body.pin;
  if (raw === null) {
    return null;
  }
  const cleaned = validateOptionalText(raw, 'notes', 500, true);
  return cleaned ?? null;
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

export function validateListGameAccountsQuery(
  rawQuery: Record<string, unknown>,
): ValidatedListGameAccountsQuery {
  assertAllowedKeys(rawQuery, ALLOWED_LIST_QUERY_KEYS, 'query');

  const customerId =
    rawQuery.customerId !== undefined
      ? validateIdValue(rawQuery.customerId, 'customerId')
      : undefined;

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
      deduped.add(validateIdValue(part, 'customerIds'));
    }
    customerIds = Array.from(deduped);
  }

  let status: GameAccountStatusValue | undefined;
  if (rawQuery.status !== undefined) {
    if (
      typeof rawQuery.status !== 'string' ||
      !ALLOWED_STATUS_VALUES.has(rawQuery.status.trim() as GameAccountStatusValue)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'status must be one of active, pending_assignment, pending_reset, or suspended.',
      );
    }
    status = rawQuery.status.trim() as GameAccountStatusValue;
  }

  const gameCatalogId =
    rawQuery.gameCatalogId !== undefined
      ? validateIdValue(rawQuery.gameCatalogId, 'gameCatalogId')
      : undefined;

  const search = validateOptionalText(rawQuery.q, 'q', 120);

  let sortBy: GameAccountSortField = 'createdAt';
  if (rawQuery.sortBy !== undefined) {
    if (
      typeof rawQuery.sortBy !== 'string' ||
      !ALLOWED_SORT_FIELDS.has(rawQuery.sortBy.trim() as GameAccountSortField)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'sortBy must be one of createdAt, updatedAt, gameName, or status.',
      );
    }
    sortBy = rawQuery.sortBy.trim() as GameAccountSortField;
  }

  let sortOrder: GameAccountSortOrder = 'desc';
  if (rawQuery.sortOrder !== undefined) {
    if (
      typeof rawQuery.sortOrder !== 'string' ||
      (rawQuery.sortOrder.trim() !== 'asc' &&
        rawQuery.sortOrder.trim() !== 'desc')
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'sortOrder must be either "asc" or "desc".',
      );
    }
    sortOrder = rawQuery.sortOrder.trim() as GameAccountSortOrder;
  }

  const limit = parseBoundedInt(rawQuery.limit, 'limit', 50, 1, 100);
  const offset = parseBoundedInt(rawQuery.offset, 'offset', 0, 0, 10_000);

  return {
    customerId,
    customerIds,
    status,
    gameCatalogId,
    search,
    sortBy,
    sortOrder,
    limit,
    offset,
  };
}

export function validateCustomerGameRequestBody(
  body: unknown,
): ValidatedCustomerGameRequestBody {
  if (!isPlainObject(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  }
  if (
    'customerId' in body ||
    'customerName' in body ||
    'status' in body ||
    'requestType' in body
  ) {
    throw new HttpError(
      403,
      'FORBIDDEN_FIELD_MODIFICATION',
      'Client requests cannot specify customerId, status, or requestType.',
    );
  }
  assertAllowedKeys(body, ALLOWED_CUSTOMER_REQUEST_KEYS, 'body', true);

  const gameCatalogId = validateIdValue(
    body.gameCatalogId ?? body.gameId,
    'gameCatalogId',
  );
  const fallbackGameTitle = validateOptionalText(
    body.gameTitle ?? body.gameName,
    'gameTitle',
    120,
  );
  const fallbackPlatformName = validateOptionalText(
    body.platformName,
    'platformName',
    80,
  );

  return {
    gameCatalogId,
    fallbackGameTitle,
    fallbackPlatformName,
  };
}

export function validateResetRequestBody(body: unknown): Record<string, never> {
  if (body === undefined) {
    return {};
  }
  if (!isPlainObject(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  }
  if ('customerId' in body || 'status' in body || 'requestType' in body) {
    throw new HttpError(
      403,
      'FORBIDDEN_FIELD_MODIFICATION',
      'Client requests cannot override customerId, status, or requestType.',
    );
  }
  assertAllowedKeys(body, ALLOWED_RESET_REQUEST_KEYS, 'body', true);
  return {};
}

export function validateProvisionGameAccountBody(
  body: unknown,
): ValidatedProvisionGameAccountBody {
  if (!isPlainObject(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  }
  assertAllowedKeys(body, ALLOWED_STAFF_PROVISION_KEYS, 'body', true);

  const customerId = validateIdValue(body.customerId, 'customerId');
  const gameCatalogId = validateIdValue(
    body.gameCatalogId ?? body.gameId,
    'gameCatalogId',
  );
  const fallbackGameTitle = validateOptionalText(
    body.gameTitle ?? body.gameName,
    'gameTitle',
    120,
  );
  const fallbackPlatformName = validateOptionalText(
    body.platformName,
    'platformName',
    80,
  );
  const username = validateUsernameValue(body.username);
  const password = validateOptionalPasswordValue(body.password);
  const notes = validateNullableNotes(body);

  let status: 'active' | 'suspended' = 'active';
  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'suspended') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'status for provisioned accounts must be "active" or "suspended".',
      );
    }
    status = body.status;
  }

  return {
    customerId,
    gameCatalogId,
    fallbackGameTitle,
    fallbackPlatformName,
    username,
    password,
    notes,
    status,
  };
}

export function validateUpdateCredentialsBody(
  body: unknown,
): ValidatedUpdateCredentialsBody {
  if (!isPlainObject(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  }
  assertAllowedKeys(body, ALLOWED_STAFF_UPDATE_KEYS, 'body', true);

  const username = validateUsernameValue(body.username);
  const password = validateOptionalPasswordValue(body.password);
  const notes = validateNullableNotes(body);

  let status: 'active' | 'suspended' = 'active';
  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'suspended') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'status must be "active" or "suspended".',
      );
    }
    status = body.status;
  }

  return {
    username,
    password,
    notes,
    status,
  };
}

function toGameAccountDto(account: GameAccountRecord) {
  return {
    id: account.id,
    customerId: account.customerId,
    gameCatalogId: account.gameCatalogId,
    gameName: account.gameName,
    platformName: account.platformName,
    username: account.username,
    password: account.password,
    gameUrl: account.gameUrl,
    status: account.status,
    balance: account.balance,
    freePlayBalance: account.freePlayBalance,
    requestType: account.requestType ?? undefined,
    notes: account.notes ?? undefined,
    assignedByAgentId: account.assignedByAgentId ?? undefined,
    assignedByAgentName: account.assignedByAgentName ?? undefined,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function mapRepoError(err: unknown): never {
  if (err instanceof GameAccountCustomerNotFoundError) {
    throw new HttpError(404, 'USER_NOT_FOUND', err.message);
  }
  if (err instanceof GameAccountCatalogNotFoundError) {
    throw new HttpError(404, 'GAME_NOT_FOUND', err.message);
  }
  if (err instanceof GameAccountNotFoundError) {
    throw new HttpError(404, 'GAME_ACCOUNT_NOT_FOUND', err.message);
  }
  if (err instanceof GameAccountForbiddenError) {
    throw new HttpError(403, 'FORBIDDEN', err.message);
  }
  if (err instanceof GameAccountConflictError) {
    throw new HttpError(409, 'GAME_ACCOUNT_CONFLICT', err.message);
  }
  if (err instanceof GameAccountValidationError) {
    throw new HttpError(400, 'VALIDATION_ERROR', err.message);
  }
  throw err;
}

export function createGameAccountRouter({
  gameAccountRepo,
  userRepo,
  requireAuth,
  realtimeEvents,
}: GameAccountRouterDeps): Router {
  const router = Router();
  const requireStaff = requireRole('admin', 'agent');

  // List gaming IDs (customers strictly scoped to own records; staff bounded paginated)
  router.get(
    '/game-accounts',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const query = validateListGameAccountsQuery(
          req.query as Record<string, unknown>,
        );
        const isStaff = actor.role === 'admin' || actor.role === 'agent';

        if (!isStaff) {
          if (query.customerId && query.customerId !== actor.appUserId) {
            throw new HttpError(
              403,
              'FORBIDDEN',
              'You can only access your own gaming IDs.',
            );
          }
          if (
            query.customerIds &&
            query.customerIds.some((id) => id !== actor.appUserId)
          ) {
            throw new HttpError(
              403,
              'FORBIDDEN',
              'You can only access your own gaming IDs.',
            );
          }
        }

        const result = await gameAccountRepo.listGameAccounts({
          customerId: isStaff ? query.customerId : actor.appUserId,
          customerIds: isStaff ? query.customerIds : undefined,
          status: query.status,
          gameCatalogId: query.gameCatalogId,
          search: query.search,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
          limit: query.limit,
          offset: query.offset,
        });

        res.status(200).json({
          accounts: result.items.map(toGameAccountDto),
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

  // Customer creates a new Game ID request (enforces 1 ID per game per customer)
  router.post(
    '/game-accounts/requests',
    requireAuth,
    validateRequestBody(validateCustomerGameRequestBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const body = req.body as ValidatedCustomerGameRequestBody;

        const { account } = await gameAccountRepo
          .requestNewGameId({
            customerId: actor.appUserId,
            customerName: actor.displayName,
            actorRole: actor.role,
            gameCatalogId: body.gameCatalogId,
            fallbackGameTitle: body.fallbackGameTitle,
            fallbackPlatformName: body.fallbackPlatformName,
          })
          .catch(mapRepoError);

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'user_and_staff', customerId: actor.appUserId },
          ['game_accounts', 'audit_logs'],
          'game_account_requested',
          actor.appUserId,
        );

        res.status(201).json({
          success: true,
          account: toGameAccountDto(account),
          message: 'Request forwarded to Customer Support specialists.',
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Staff creates or updates credentials for a customer + game (admin or agent)
  router.post(
    '/game-accounts/provision',
    requireAuth,
    requireStaff,
    validateRequestBody(validateProvisionGameAccountBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const body = req.body as ValidatedProvisionGameAccountBody;

        const targetUser = await userRepo.findByAppUserId(body.customerId);
        if (!targetUser) {
          throw new HttpError(
            404,
            'USER_NOT_FOUND',
            'Customer account not found.',
          );
        }

        const { account, created } = await gameAccountRepo
          .provisionGameAccount({
            customerId: targetUser.appUserId,
            gameCatalogId: body.gameCatalogId,
            fallbackGameTitle: body.fallbackGameTitle,
            fallbackPlatformName: body.fallbackPlatformName,
            username: body.username,
            password: body.password,
            notes: body.notes,
            status: body.status,
            actorId: actor.appUserId,
            actorName: actor.displayName,
            actorRole: actor.role,
          })
          .catch(mapRepoError);

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'user_and_staff', customerId: targetUser.appUserId },
          ['game_accounts', 'audit_logs'],
          'game_account_provisioned',
          targetUser.appUserId,
        );

        res.status(created ? 201 : 200).json({
          success: true,
          created,
          account: toGameAccountDto(account),
          message: created
            ? `Successfully provisioned credentials for ${account.gameName}.`
            : `Updated credentials for ${account.gameName}. Player's single ID maintained.`,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Single game account lookup (owner or staff only)
  router.get(
    '/game-accounts/:accountId',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const accountId = validateIdValue(req.params.accountId, 'accountId', true);
        const account = await gameAccountRepo.findById(accountId);
        if (!account) {
          throw new HttpError(
            404,
            'GAME_ACCOUNT_NOT_FOUND',
            'Game account not found.',
          );
        }

        const isStaff = actor.role === 'admin' || actor.role === 'agent';
        if (!isStaff && account.customerId !== actor.appUserId) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'You can only access your own gaming IDs.',
          );
        }

        res.status(200).json({
          account: toGameAccountDto(account),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Customer requests password reset for an owned active gaming ID
  router.post(
    '/game-accounts/:accountId/reset-request',
    requireAuth,
    validateRequestBody(validateResetRequestBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const accountId = validateIdValue(req.params.accountId, 'accountId', true);

        const account = await gameAccountRepo
          .requestPasswordReset({
            accountId,
            actorId: actor.appUserId,
            actorName: actor.displayName,
            actorRole: actor.role,
          })
          .catch(mapRepoError);

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'user_and_staff', customerId: account.customerId },
          ['game_accounts', 'audit_logs'],
          'game_account_reset_requested',
          account.customerId,
        );

        res.status(200).json({
          success: true,
          account: toGameAccountDto(account),
          message: 'Password reset request dispatched to customer care.',
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Staff assigns or updates credentials on an existing game account
  router.patch(
    '/game-accounts/:accountId/credentials',
    requireAuth,
    requireStaff,
    validateRequestBody(validateUpdateCredentialsBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const accountId = validateIdValue(req.params.accountId, 'accountId', true);
        const body = req.body as ValidatedUpdateCredentialsBody;

        const account = await gameAccountRepo
          .updateCredentials({
            accountId,
            username: body.username,
            password: body.password,
            notes: body.notes,
            status: body.status,
            actorId: actor.appUserId,
            actorName: actor.displayName,
            actorRole: actor.role,
          })
          .catch(mapRepoError);

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'user_and_staff', customerId: account.customerId },
          ['game_accounts', 'audit_logs'],
          'game_account_credentials_updated',
          account.customerId,
        );

        res.status(200).json({
          success: true,
          account: toGameAccountDto(account),
          message: `Successfully assigned credentials for ${account.gameName}. Player notified.`,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Staff deletes a game account record
  router.delete(
    '/game-accounts/:accountId',
    requireAuth,
    requireStaff,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const accountId = validateIdValue(req.params.accountId, 'accountId', true);

        const deleted = await gameAccountRepo
          .deleteGameAccount({
            accountId,
            actorId: actor.appUserId,
            actorName: actor.displayName,
            actorRole: actor.role,
          })
          .catch(mapRepoError);

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'user_and_staff', customerId: deleted.customerId },
          ['game_accounts', 'audit_logs'],
          'game_account_deleted',
          deleted.customerId,
        );

        res.status(200).json({
          success: true,
          deletedId: deleted.id,
          account: toGameAccountDto(deleted),
          message: `Successfully deleted game account for ${deleted.gameName}.`,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
