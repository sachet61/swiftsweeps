import crypto from 'node:crypto';
import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { AuthRuntime } from '../auth/authInstance.js';
import {
  AdminUserForbiddenError,
  AdminUserNotFoundError,
  type AdminDirectoryUserRecord,
  type AdminUserSortField,
  type AdminUserSortOrder,
  type AppUserRole,
  type AppUserStatus,
  type ResolvedAppUser,
  type UserDirectoryRepo,
} from '../auth/userDirectoryRepo.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';
import type { RealtimeEventBroker } from '../realtime/realtimeEvents.js';

export interface AdminAuthRouterDeps {
  authRuntime: AuthRuntime;
  userRepo: UserDirectoryRepo;
  requireAuth: RequestHandler;
  realtimeEvents?: RealtimeEventBroker;
}

const VALID_ROLES = new Set<AppUserRole>(['customer', 'agent', 'admin']);
const VALID_STATUSES = new Set<AppUserStatus>(['active', 'suspended']);
const VALID_FILTER_STATUSES = new Set<AppUserStatus>([
  'active',
  'suspended',
  'pending',
]);
const VALID_SORT_FIELDS = new Set<AdminUserSortField>([
  'createdAt',
  'updatedAt',
  'displayName',
  'email',
  'role',
  'status',
]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;
const USER_ID_PARAM_REGEX = /^[a-zA-Z0-9._:@-]{1,120}$/;
const PHONE_CHAR_REGEX = /^[+0-9()\-\s.]{5,32}$/;

const SPOOFED_PRIVILEGE_KEYS = new Set([
  'actorId',
  'actorName',
  'actorRole',
  'actingUserId',
  'actingUserRole',
  'isAdmin',
  'isParentAdmin',
  'is_parent_admin',
]);

const BASE_PRIVILEGED_BODY_KEYS = new Set([
  'id',
  'appUserId',
  'userId',
  'actorId',
  'actorName',
  'actorRole',
  'actingUserId',
  'actingUserRole',
  'isAdmin',
  'isParentAdmin',
  'is_parent_admin',
  'emailVerified',
  'email_verified',
  'passwordResetRequired',
  'password_reset_required',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
]);

const ALLOWED_LIST_QUERY_KEYS = new Set([
  'limit',
  'offset',
  'search',
  'q',
  'role',
  'status',
  'sortBy',
  'sortOrder',
]);
const EMPTY_QUERY_KEYS = new Set<string>();

const ALLOWED_CREATE_BODY_KEYS = new Set([
  'email',
  'displayName',
  'role',
  'phone',
  'temporaryPassword',
]);
const ALLOWED_ROLE_BODY_KEYS = new Set(['newRole']);
const ALLOWED_STATUS_BODY_KEYS = new Set(['status']);

interface CreateAdminUserBody {
  email: string;
  displayName: string;
  role: AppUserRole;
  phone?: string;
  temporaryPassword: string;
}

interface UpdateRoleBody {
  newRole: AppUserRole;
}

interface UpdateStatusBody {
  status: AppUserStatus;
}

function assertRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

function assertAllowedBodyKeys(
  body: Record<string, unknown>,
  allowedKeys: Set<string>,
  extraPrivilegedKeys: readonly string[] = [],
): void {
  const privileged = new Set([
    ...BASE_PRIVILEGED_BODY_KEYS,
    ...extraPrivilegedKeys,
  ]);
  for (const key of Object.keys(body)) {
    if (allowedKeys.has(key)) {
      continue;
    }
    if (privileged.has(key)) {
      throw new HttpError(
        403,
        'FORBIDDEN_FIELD_MODIFICATION',
        `Field "${key}" cannot be supplied by client requests.`,
      );
    }
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Unsupported request field: "${key}".`,
    );
  }
}

function assertAllowedQueryKeys(req: Request, allowed: Set<string>): void {
  for (const key of Object.keys(req.query)) {
    if (allowed.has(key)) {
      continue;
    }
    if (SPOOFED_PRIVILEGE_KEYS.has(key)) {
      throw new HttpError(
        403,
        'FORBIDDEN',
        `Query parameter "${key}" is not allowed.`,
      );
    }
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Unsupported query parameter "${key}".`,
    );
  }
}

function validateUserIdParam(raw: unknown): string {
  const userId = typeof raw === 'string' ? raw.trim() : '';
  if (
    !userId ||
    CONTROL_CHAR_REGEX.test(userId) ||
    !USER_ID_PARAM_REGEX.test(userId)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'A valid userId path parameter is required.',
    );
  }
  return userId;
}

function validateCreateAdminUserBody(raw: unknown): CreateAdminUserBody {
  const body = assertRecord(raw);
  assertAllowedBodyKeys(body, ALLOWED_CREATE_BODY_KEYS, ['status']);

  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const displayName =
    typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const role =
    typeof body.role === 'string' ? (body.role.trim() as AppUserRole) : 'customer';

  let phone: string | undefined;
  if ('phone' in body && body.phone !== undefined && body.phone !== null) {
    if (typeof body.phone !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'phone must be a string.');
    }
    const trimmedPhone = body.phone.trim();
    if (trimmedPhone) {
      const digitsCount = trimmedPhone.replace(/\D/g, '').length;
      if (
        CONTROL_CHAR_REGEX.test(trimmedPhone) ||
        !PHONE_CHAR_REGEX.test(trimmedPhone) ||
        digitsCount < 5
      ) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'phone must be between 5 and 32 valid characters.',
        );
      }
      phone = trimmedPhone;
    }
  }

  const temporaryPassword =
    typeof body.temporaryPassword === 'string' ? body.temporaryPassword : '';

  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A valid email address is required.');
  }
  if (
    !displayName ||
    displayName.length > 120 ||
    CONTROL_CHAR_REGEX.test(displayName)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Display name is required and must be 120 valid characters or fewer.',
    );
  }
  if (!VALID_ROLES.has(role)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Role must be customer, agent, or admin.',
    );
  }
  if (
    temporaryPassword.length < 8 ||
    temporaryPassword.length > 128 ||
    temporaryPassword.trim().length === 0
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Temporary password must be between 8 and 128 non-blank characters.',
    );
  }

  return {
    email,
    displayName,
    role,
    phone,
    temporaryPassword,
  };
}

function validateUpdateRoleBody(raw: unknown): UpdateRoleBody {
  const body = assertRecord(raw);
  assertAllowedBodyKeys(body, ALLOWED_ROLE_BODY_KEYS, ['role', 'status']);
  const newRole =
    typeof body.newRole === 'string'
      ? (body.newRole.trim() as AppUserRole)
      : undefined;
  if (!newRole || !VALID_ROLES.has(newRole)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'newRole must be customer, agent, or admin.',
    );
  }
  return { newRole };
}

function validateUpdateStatusBody(raw: unknown): UpdateStatusBody {
  const body = assertRecord(raw);
  assertAllowedBodyKeys(body, ALLOWED_STATUS_BODY_KEYS, ['role', 'newRole']);
  const status =
    typeof body.status === 'string'
      ? (body.status.trim() as AppUserStatus)
      : undefined;
  if (!status || !VALID_STATUSES.has(status)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'status must be active or suspended.',
    );
  }
  return { status };
}

function readSingleQueryString(req: Request, key: string): string | undefined {
  const val = req.query[key];
  if (val === undefined) {
    return undefined;
  }
  if (typeof val !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Query parameter "${key}" must be a single string value.`,
    );
  }
  return val.trim();
}

function parseListUsersQuery(req: Request): {
  search?: string;
  role?: AppUserRole;
  status?: AppUserStatus;
  sortBy: AdminUserSortField;
  sortOrder: AdminUserSortOrder;
  limit: number;
  offset: number;
} {
  assertAllowedQueryKeys(req, ALLOWED_LIST_QUERY_KEYS);

  const rawLimit = readSingleQueryString(req, 'limit');
  const rawOffset = readSingleQueryString(req, 'offset');
  const rawRole = readSingleQueryString(req, 'role');
  const rawStatus = readSingleQueryString(req, 'status');
  const rawSearch = readSingleQueryString(req, 'search');
  const rawQ = readSingleQueryString(req, 'q');
  const rawSortBy = readSingleQueryString(req, 'sortBy');
  const rawSortOrder = readSingleQueryString(req, 'sortOrder');

  let limit = 100;
  if (rawLimit !== undefined) {
    if (!/^\d+$/.test(rawLimit)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'limit must be a positive integer.',
      );
    }
    limit = Number.parseInt(rawLimit, 10);
    if (limit < 1 || limit > 100) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'limit must be between 1 and 100.',
      );
    }
  }

  let offset = 0;
  if (rawOffset !== undefined) {
    if (!/^\d+$/.test(rawOffset)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'offset must be a non-negative integer.',
      );
    }
    offset = Number.parseInt(rawOffset, 10);
    if (offset > 100_000) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'offset exceeds maximum allowed bound.',
      );
    }
  }

  let role: AppUserRole | undefined;
  if (rawRole !== undefined && rawRole !== '' && rawRole !== 'all') {
    if (!VALID_ROLES.has(rawRole as AppUserRole)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'role must be all, customer, agent, or admin.',
      );
    }
    role = rawRole as AppUserRole;
  }

  let status: AppUserStatus | undefined;
  if (rawStatus !== undefined && rawStatus !== '' && rawStatus !== 'all') {
    if (!VALID_FILTER_STATUSES.has(rawStatus as AppUserStatus)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'status must be all, active, suspended, or pending.',
      );
    }
    status = rawStatus as AppUserStatus;
  }

  if (rawSearch !== undefined && rawQ !== undefined) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Provide either search or q, not both.',
    );
  }
  const searchCandidate = rawSearch ?? rawQ;
  let search: string | undefined;
  if (searchCandidate !== undefined && searchCandidate !== '') {
    if (
      searchCandidate.length > 100 ||
      CONTROL_CHAR_REGEX.test(searchCandidate)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'search must be 100 valid characters or fewer.',
      );
    }
    search = searchCandidate;
  }

  let sortBy: AdminUserSortField = 'createdAt';
  if (rawSortBy !== undefined && rawSortBy !== '') {
    if (!VALID_SORT_FIELDS.has(rawSortBy as AdminUserSortField)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'sortBy must be createdAt, updatedAt, displayName, email, role, or status.',
      );
    }
    sortBy = rawSortBy as AdminUserSortField;
  }

  let sortOrder: AdminUserSortOrder =
    sortBy === 'createdAt' || sortBy === 'updatedAt' ? 'desc' : 'asc';
  if (rawSortOrder !== undefined && rawSortOrder !== '') {
    if (rawSortOrder !== 'asc' && rawSortOrder !== 'desc') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'sortOrder must be asc or desc.',
      );
    }
    sortOrder = rawSortOrder;
  }

  return {
    search,
    role,
    status,
    sortBy,
    sortOrder,
    limit,
    offset,
  };
}

function toSafeUserResponse(
  user: ResolvedAppUser | AdminDirectoryUserRecord,
) {
  const base = {
    id: user.appUserId,
    email: user.email,
    displayName: user.displayName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    referralCode: user.referralCode,
    referredBy: user.referredBy,
    passwordResetRequired: user.passwordResetRequired,
    isParentAdmin: user.isParentAdmin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.updatedAt,
  };

  if ('wallet' in user && 'gameAccounts' in user) {
    return {
      ...base,
      wallet: user.wallet,
      gameAccounts: user.gameAccounts,
      gameAccountsCount: user.gameAccountsCount,
    };
  }

  return base;
}

function mapRepoError(err: unknown): never {
  if (err instanceof AdminUserNotFoundError) {
    throw new HttpError(404, 'USER_NOT_FOUND', err.message);
  }
  if (err instanceof AdminUserForbiddenError) {
    throw new HttpError(403, err.code, err.message);
  }
  throw err;
}

export function createAdminAuthRouter({
  authRuntime,
  userRepo,
  requireAuth,
  realtimeEvents,
}: AdminAuthRouterDeps): Router {
  const router = Router();

  router.get(
    '/admin/users',
    requireAuth,
    requireRole('admin', 'agent'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const query = parseListUsersQuery(req);
        const { users, total } = await userRepo.listAdminUsersDirectory(query);
        res.status(200).json({
          success: true,
          users: users.map(toSafeUserResponse),
          total,
          pagination: {
            limit: query.limit,
            offset: query.offset,
            total,
            hasMore: query.offset + users.length < total,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/admin/users/:userId',
    requireAuth,
    requireRole('admin', 'agent'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        assertAllowedQueryKeys(req, EMPTY_QUERY_KEYS);
        const userId = validateUserIdParam(req.params.userId);
        const user = await userRepo.findAdminUserDetailById(userId);
        if (!user) {
          throw new HttpError(404, 'USER_NOT_FOUND', 'User not found.');
        }

        res.status(200).json({
          success: true,
          user: toSafeUserResponse(user),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/admin/users',
    requireAuth,
    requireRole('admin'),
    validateRequestBody(validateCreateAdminUserBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        assertAllowedQueryKeys(req, EMPTY_QUERY_KEYS);
        const actor = req.authContext!.user;
        const payload = req.body as CreateAdminUserBody;
        const authCtx = await authRuntime.auth.$context;

        const existingAppUser = await userRepo.findByEmail(payload.email);
        const existingAuthUser = await authCtx.internalAdapter.findUserByEmail(
          payload.email,
        );
        if (existingAppUser || existingAuthUser) {
          throw new HttpError(
            409,
            'USER_ALREADY_EXISTS',
            'A user with this email already exists.',
          );
        }

        const passwordHash = await authCtx.password.hash(
          payload.temporaryPassword,
        );
        const appUserId = `usr_${payload.role}_${Date.now()}_${crypto
          .randomBytes(3)
          .toString('hex')}`;

        const created = await authRuntime.runWithoutAutoCustomerSignup(
          payload.email,
          async () => {
            const baUser = await authCtx.internalAdapter.createUser(
              {
                email: payload.email,
                name: payload.displayName,
                emailVerified: true,
              },
              { method: 'admin' },
            );

            try {
              await authCtx.internalAdapter.createAccount({
                userId: baUser.id,
                providerId: 'credential',
                accountId: baUser.id,
                password: passwordHash,
              });

              return await userRepo.createAdminProvisionedUser({
                appUserId,
                authUserId: baUser.id,
                email: payload.email,
                displayName: payload.displayName,
                role: payload.role,
                phone: payload.phone,
                emailVerified: true,
                passwordResetRequired: true,
              });
            } catch (provisionErr) {
              await authCtx.internalAdapter.deleteUser(baUser.id).catch(() => {});
              throw provisionErr;
            }
          },
        );

        await userRepo.writeAuditLog({
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
          action: 'ADMIN_USER_PROVISIONED',
          entityType: 'user',
          entityId: created.appUserId,
          details: `Provisioned user with role ${created.role} and password_reset_required=true.`,
        });

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'staff' },
          ['users', 'audit_logs'],
          'admin_user_provisioned',
          created.appUserId,
        );

        res.status(201).json({
          success: true,
          user: toSafeUserResponse(created),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/admin/users/:userId/role',
    requireAuth,
    requireRole('admin'),
    validateRequestBody(validateUpdateRoleBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        assertAllowedQueryKeys(req, EMPTY_QUERY_KEYS);
        const actor = req.authContext!.user;
        const userId = validateUserIdParam(req.params.userId);
        const { newRole } = req.body as UpdateRoleBody;

        const { previousRole, user: updated } = await userRepo
          .updateUserRoleAtomically({
            targetUserId: userId,
            newRole,
            actor,
          })
          .catch(mapRepoError);

        if (updated.authUserId && previousRole !== updated.role) {
          const authCtx = await authRuntime.auth.$context;
          await authCtx.internalAdapter.deleteUserSessions(updated.authUserId);
        }

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'user_and_staff', customerId: updated.appUserId },
          ['users', 'audit_logs'],
          'admin_user_role_updated',
          updated.appUserId,
        );

        res.status(200).json({
          success: true,
          message: `Role successfully updated to ${updated.role.toUpperCase()} for ${updated.displayName}.`,
          user: toSafeUserResponse(updated),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/admin/users/:userId/status',
    requireAuth,
    requireRole('admin'),
    validateRequestBody(validateUpdateStatusBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        assertAllowedQueryKeys(req, EMPTY_QUERY_KEYS);
        const actor = req.authContext!.user;
        const userId = validateUserIdParam(req.params.userId);
        const { status } = req.body as UpdateStatusBody;

        const { user: updated } = await userRepo
          .updateUserStatusAtomically({
            targetUserId: userId,
            newStatus: status,
            actor,
          })
          .catch(mapRepoError);

        if (updated.status !== 'active' && updated.authUserId) {
          const authCtx = await authRuntime.auth.$context;
          await authCtx.internalAdapter.deleteUserSessions(updated.authUserId);
        }

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'user_and_staff', customerId: updated.appUserId },
          ['users', 'audit_logs'],
          'admin_user_status_updated',
          updated.appUserId,
        );

        res.status(200).json({
          success: true,
          message: `Status updated to ${updated.status} for ${updated.displayName}.`,
          user: toSafeUserResponse(updated),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/admin/users/:userId',
    requireAuth,
    requireRole('admin'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        assertAllowedQueryKeys(req, EMPTY_QUERY_KEYS);
        const actor = req.authContext!.user;
        const userId = validateUserIdParam(req.params.userId);

        const deleted = await userRepo
          .deleteUserAtomically({
            targetUserId: userId,
            actor,
          })
          .catch(mapRepoError);

        if (deleted.authUserId) {
          const authCtx = await authRuntime.auth.$context;
          await authCtx.internalAdapter
            .deleteUserSessions(deleted.authUserId)
            .catch(() => {});
          await authCtx.internalAdapter
            .deleteUser(deleted.authUserId)
            .catch(() => {});
        }

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'staff' },
          ['users', 'audit_logs'],
          'admin_user_deleted',
          deleted.appUserId,
        );

        res.status(200).json({
          success: true,
          deletedUserId: deleted.appUserId,
          message: `User ${deleted.appUserId} and all related records deleted completely.`,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
