import { Router, type Request, type RequestHandler, type Response } from 'express';
import { HttpError } from '../middleware/errorHandler.js';

export function createAuthProfileRouter(
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get(
    '/auth/me',
    requireAuth,
    (req: Request, res: Response): void => {
      if (!req.authContext) {
        throw new HttpError(
          401,
          'UNAUTHENTICATED',
          'Authentication is required.',
        );
      }

      const { user, session } = req.authContext;
      res.status(200).json({
        user: {
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
        },
        session: {
          expiresAt: session.expiresAt,
        },
      });
    },
  );

  return router;
}
