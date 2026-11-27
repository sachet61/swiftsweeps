import type { BetterAuthOptions } from 'better-auth';
import { toNodeHandler } from 'better-auth/node';
import express, { type Express } from 'express';
import { createAuthInstance } from './auth/authInstance.js';
import {
  createEmailDeliveryAdapter,
  type EmailDeliveryAdapter,
} from './auth/emailDelivery.js';
import { UserDirectoryRepo } from './auth/userDirectoryRepo.js';
import { GameCatalogRepo } from './catalog/gameCatalogRepo.js';
import { DepositRepo } from './deposits/depositRepo.js';
import type { ServerConfig } from './config/env.js';
import type { DatabasePool } from './db/pool.js';
import type { Logger } from './logging/logger.js';
import {
  createOptionalAuthMiddleware,
  createRequireAuthMiddleware,
} from './middleware/auth.js';
import {
  createErrorHandler,
  notFoundHandler,
} from './middleware/errorHandler.js';
import { createRequestContextMiddleware } from './middleware/requestContext.js';
import {
  createRequestSizeGuard,
  createSecurityMiddleware,
} from './middleware/security.js';
import { createAdminAuthRouter } from './routes/adminAuth.js';
import { createAuthProfileRouter } from './routes/authProfile.js';
import { createDepositRouter } from './routes/deposits.js';
import { createGameCatalogRouter } from './routes/gameCatalog.js';
import { createHealthRouter } from './routes/health.js';
import { createProfileRouter } from './routes/profile.js';
import { createWalletRouter } from './routes/wallet.js';
import { createWithdrawalRouter } from './routes/withdrawals.js';
import { WalletRepo } from './wallet/walletRepo.js';
import { WithdrawalRepo } from './withdrawals/withdrawalRepo.js';

export interface ApiAppDependencies {
  config: ServerConfig;
  logger: Logger;
  pool: Pick<DatabasePool, 'query'>;
  isShuttingDown?: () => boolean;
  /**
   * Optional overrides strictly for isolated automated testing.
   * Production runtime uses the configured PostgreSQL pool and email provider.
   */
  authDatabaseOverride?: BetterAuthOptions['database'];
  emailDeliveryOverride?: EmailDeliveryAdapter;
}

export function createApiApp({
  config,
  logger,
  pool,
  isShuttingDown = () => false,
  authDatabaseOverride,
  emailDeliveryOverride,
}: ApiAppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');

  // Nginx sits in front of the API on loopback (or a configured fixed proxy hop
  // count) and sets X-Forwarded-For / X-Forwarded-Proto. Never trust arbitrary
  // forwarded headers from untrusted public clients.
  app.set('trust proxy', config.trustProxy);

  const userRepo = new UserDirectoryRepo(pool);
  const gameCatalogRepo = new GameCatalogRepo(pool);
  const depositRepo = new DepositRepo(pool);
  const walletRepo = new WalletRepo(pool);
  const withdrawalRepo = new WithdrawalRepo(pool);
  const emailDelivery =
    emailDeliveryOverride ?? createEmailDeliveryAdapter(config, logger);
  const authRuntime = createAuthInstance({
    config,
    logger,
    pool,
    userRepo,
    emailDelivery,
    authDatabaseOverride,
  });
  const requireAuth = createRequireAuthMiddleware(authRuntime.auth, userRepo);
  const optionalAuth = createOptionalAuthMiddleware(authRuntime.auth, userRepo);
  const authNodeHandler = toNodeHandler(authRuntime.auth);

  app.use(createRequestContextMiddleware(logger));
  app.use(createSecurityMiddleware(config, logger));

  // Mount server-resolved profile endpoint before Better Auth catch-all.
  app.use('/api', createAuthProfileRouter(requireAuth, userRepo));

  // Better Auth reads raw incoming streams directly; mount before express.json().
  app.all(
    '/api/auth/*splat',
    createRequestSizeGuard(config.requestBodyLimitBytes),
    (req, res, next) => {
      void authNodeHandler(req, res).catch(next);
    },
  );

  app.use(express.json({ limit: config.requestBodyLimit }));

  app.use(
    '/api',
    createHealthRouter({
      pool,
      logger,
      isShuttingDown,
    }),
  );
  app.use(
    '/api',
    createAdminAuthRouter({
      authRuntime,
      userRepo,
      requireAuth,
    }),
  );
  app.use(
    '/api',
    createProfileRouter({
      userRepo,
      requireAuth,
    }),
  );
  app.use(
    '/api',
    createGameCatalogRouter({
      gameCatalogRepo,
      userRepo,
      requireAuth,
      optionalAuth,
    }),
  );
  app.use(
    '/api',
    createWalletRouter({
      walletRepo,
      userRepo,
      requireAuth,
    }),
  );
  app.use(
    '/api',
    createWithdrawalRouter({
      withdrawalRepo,
      userRepo,
      requireAuth,
    }),
  );
  app.use(
    '/api',
    createDepositRouter({
      depositRepo,
      userRepo,
      requireAuth,
    }),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
