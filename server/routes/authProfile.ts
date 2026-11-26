import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { UserDirectoryRepo } from '../auth/userDirectoryRepo.js';
import { HttpError } from '../middleware/errorHandler.js';
import { toSafeProfileResponse } from './profile.js';

export function createAuthProfileRouter(
  requireAuth: RequestHandler,
  userRepo?: UserDirectoryRepo,
): Router {
  const router = Router();

  router.get(
    '/auth/me',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.authContext) {
          throw new HttpError(
            401,
            'UNAUTHENTICATED',
            'Authentication is required.',
          );
        }

        const { user, session } = req.authContext;
        const referrerDisplayName =
          userRepo && user.referredBy
            ? await userRepo.resolveReferrerDisplayName(user.referredBy)
            : null;

        res.status(200).json({
          user: toSafeProfileResponse(user, referrerDisplayName),
          session: {
            expiresAt: session.expiresAt,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
