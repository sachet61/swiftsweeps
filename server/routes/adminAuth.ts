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
  isParentAdminUser,
  type AppUserRole,
  type AppUserStatus,
  type UserDirectoryRepo,
} from '../auth/userDirectoryRepo.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';

export interface AdminAuthRouterDeps {
  authRuntime: AuthRuntime;
  userRepo: UserDirectoryRepo;
  requireAuth: RequestHandler;
}

const VALID_ROLES = new Set<AppUserRole>(['customer', 'agent', 'admin']);
const VALID_STATUSES = new Set<AppUserStatus>(['active', 'suspended']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function validateCreateAdminUserBody(raw: unknown): CreateAdminUserBody {
  const body = assertRecord(raw);
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const displayName =
    typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const role =
    typeof body.role === 'string' ? (body.role.trim() as AppUserRole) : 'customer';
  const phone =
    typeof body.phone === 'string' && body.phone.trim()
      ? body.phone.trim()
      : undefined;
  const temporaryPassword =
    typeof body.temporaryPassword === 'string' ? body.temporaryPassword : '';

  if (!email || !EMAIL_REGEX.test(email)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A valid email address is required.');
  }
  if (!displayName || displayName.length > 120) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Display name is required and must be 120 characters or fewer.',
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

function parsePaginationQuery(req: Request): { limit: number; offset: number } {
  const rawLimit =
    typeof req.query.limit === 'string' ? req.query.limit.trim() : undefined;
  const rawOffset =
    typeof req.query.offset === 'string' ? req.query.offset.trim() : undefined;

  let limit = 50;
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
  }

  return { limit, offset };
}

function toSafeUserResponse(user: {
  appUserId: string;
  email: string;
  displayName: string;
  role: AppUserRole;
  status: AppUserStatus;
  emailVerified: boolean;
  passwordResetRequired: boolean;
  isParentAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: user.appUserId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    passwordResetRequired: user.passwordResetRequired,
    isParentAdmin: user.isParentAdmin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function createAdminAuthRouter({
  authRuntime,
  userRepo,
  requireAuth,
}: AdminAuthRouterDeps): Router {
  const router = Router();

  router.get(
    '/admin/users',
    requireAuth,
    requireRole('admin', 'agent'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { limit, offset } = parsePaginationQuery(req);
        const users = await userRepo.listUsers({ limit, offset });
        res.status(200).json({
          users: users.map(toSafeUserResponse),
          pagination: { limit, offset },
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

        res.status(201).json({
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
        const actor = req.authContext!.user;
        const userId = String(req.params.userId ?? '').trim();
        const { newRole } = req.body as UpdateRoleBody;

        if (!userId) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'userId is required.');
        }

        const target = await userRepo.findByAppUserId(userId);
        if (!target) {
          throw new HttpError(404, 'USER_NOT_FOUND', 'User not found.');
        }

        if (
          isParentAdminUser({ id: target.appUserId, email: target.email }) &&
          newRole !== 'admin'
        ) {
          throw new HttpError(
            403,
            'PARENT_ADMIN_PROTECTED',
            'Protected parent administrator role cannot be modified.',
          );
        }

        const updated = await userRepo.updateUserRole(target.appUserId, newRole);
        if (!updated) {
          throw new HttpError(404, 'USER_NOT_FOUND', 'User not found.');
        }

        if (target.authUserId && target.role !== newRole) {
          const authCtx = await authRuntime.auth.$context;
          await authCtx.internalAdapter.deleteUserSessions(target.authUserId);
        }

        await userRepo.writeAuditLog({
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
          action: 'USER_ROLE_UPDATED',
          entityType: 'user',
          entityId: updated.appUserId,
          details: `Role updated from ${target.role} to ${updated.role}.`,
        });

        res.status(200).json({
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
        const actor = req.authContext!.user;
        const userId = String(req.params.userId ?? '').trim();
        const { status } = req.body as UpdateStatusBody;

        if (!userId) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'userId is required.');
        }

        const target = await userRepo.findByAppUserId(userId);
        if (!target) {
          throw new HttpError(404, 'USER_NOT_FOUND', 'User not found.');
        }

        if (
          isParentAdminUser({ id: target.appUserId, email: target.email }) &&
          status !== 'active'
        ) {
          throw new HttpError(
            403,
            'PARENT_ADMIN_PROTECTED',
            'Protected parent administrator cannot be suspended.',
          );
        }

        const updated = await userRepo.updateUserStatus(target.appUserId, status);
        if (!updated) {
          throw new HttpError(404, 'USER_NOT_FOUND', 'User not found.');
        }

        if (status !== 'active' && target.authUserId) {
          const authCtx = await authRuntime.auth.$context;
          await authCtx.internalAdapter.deleteUserSessions(target.authUserId);
        }

        await userRepo.writeAuditLog({
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
          action: 'USER_STATUS_UPDATED',
          entityType: 'user',
          entityId: updated.appUserId,
          details: `Status updated from ${target.status} to ${updated.status}.`,
        });

        res.status(200).json({
          user: toSafeUserResponse(updated),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
