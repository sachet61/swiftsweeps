import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthRuntime } from '../auth/authInstance.js';
import type {
  AppUserRole,
  ResolvedAppUser,
  UserDirectoryRepo,
} from '../auth/userDirectoryRepo.js';
import { HttpError } from './errorHandler.js';

export interface AuthSessionSummary {
  id: string;
  userId: string;
  expiresAt: string;
}

export interface AuthContext {
  session: AuthSessionSummary;
  user: ResolvedAppUser;
}

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
      optionalAuthError?: HttpError;
    }
  }
}

function toIsoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function createRequireAuthMiddleware(
  auth: AuthRuntime['auth'],
  userRepo: UserDirectoryRepo,
): RequestHandler {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sessionResult = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!sessionResult?.session || !sessionResult.user) {
        next(
          new HttpError(
            401,
            'UNAUTHENTICATED',
            'Authentication is required for this resource.',
          ),
        );
        return;
      }

      const appUser = await userRepo.findByAuthUserId(sessionResult.user.id);
      if (!appUser) {
        next(
          new HttpError(
            401,
            'UNAUTHENTICATED',
            'Authenticated user profile could not be verified.',
          ),
        );
        return;
      }

      if (appUser.status !== 'active') {
        next(
          new HttpError(
            403,
            'ACCOUNT_SUSPENDED',
            'Account is suspended or inactive.',
          ),
        );
        return;
      }

      if (appUser.passwordResetRequired) {
        next(
          new HttpError(
            403,
            'PASSWORD_RESET_REQUIRED',
            'Password reset is required before accessing this resource.',
          ),
        );
        return;
      }

      req.authContext = {
        session: {
          id: sessionResult.session.id,
          userId: sessionResult.session.userId,
          expiresAt: toIsoDate(sessionResult.session.expiresAt),
        },
        user: appUser,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function createOptionalAuthMiddleware(
  auth: AuthRuntime['auth'],
  userRepo: UserDirectoryRepo,
): RequestHandler {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sessionResult = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!sessionResult?.session || !sessionResult.user) {
        next();
        return;
      }

      const appUser = await userRepo.findByAuthUserId(sessionResult.user.id);
      if (!appUser) {
        next();
        return;
      }

      if (appUser.status !== 'active') {
        req.optionalAuthError = new HttpError(
          403,
          'ACCOUNT_SUSPENDED',
          'Account is suspended or inactive.',
        );
        next();
        return;
      }

      if (appUser.passwordResetRequired) {
        req.optionalAuthError = new HttpError(
          403,
          'PASSWORD_RESET_REQUIRED',
          'Password reset is required before accessing this resource.',
        );
        next();
        return;
      }

      req.authContext = {
        session: {
          id: sessionResult.session.id,
          userId: sessionResult.session.userId,
          expiresAt: toIsoDate(sessionResult.session.expiresAt),
        },
        user: appUser,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireRole(...allowedRoles: AppUserRole[]): RequestHandler {
  const allowedSet = new Set<AppUserRole>(allowedRoles);

  return (req: Request, _res: Response, next: NextFunction): void => {
    const authContext = req.authContext;
    if (!authContext) {
      next(
        new HttpError(
          401,
          'UNAUTHENTICATED',
          'Authentication is required for this resource.',
        ),
      );
      return;
    }

    if (!allowedSet.has(authContext.user.role)) {
      next(
        new HttpError(
          403,
          'FORBIDDEN',
          'You do not have permission to perform this action.',
        ),
      );
      return;
    }

    next();
  };
}
