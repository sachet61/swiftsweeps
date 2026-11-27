import type { BetterAuthOptions } from 'better-auth';
import { toNodeHandler } from 'better-auth/node';
import express, { type Express, type RequestHandler } from 'express';
import { createAuthInstance } from './auth/authInstance.js';
import {
  createEmailDeliveryAdapter,
  type EmailDeliveryAdapter,
} from './auth/emailDelivery.js';
import { UserDirectoryRepo } from './auth/userDirectoryRepo.js';
import { AppConfigRepo } from './appConfig/appConfigRepo.js';
import { AuditLogRepo } from './auditLogs/auditLogRepo.js';
import { GameCatalogRepo } from './catalog/gameCatalogRepo.js';
import { ChatEventBroker } from './chat/chatEvents.js';
import { ChatRepo } from './chat/chatRepo.js';
import { DepositRepo } from './deposits/depositRepo.js';
import { GameAccountRepo } from './gameAccounts/gameAccountRepo.js';
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
import {
  createAppConfigRouter,
  type TelegramFetchFn,
} from './routes/appConfig.js';
import { createAuditLogRouter } from './routes/auditLogs.js';
import { createAuthProfileRouter } from './routes/authProfile.js';
import { createChatRouter } from './routes/chat.js';
import { createDepositRouter } from './routes/deposits.js';
import { createGameAccountRouter } from './routes/gameAccounts.js';
import { createGameCatalogRouter } from './routes/gameCatalog.js';
import { createHealthRouter } from './routes/health.js';
import { createNotificationRouter } from './routes/notifications.js';
import { createOfficialPartnerRouter } from './routes/officialPartners.js';
import { createProfileRouter } from './routes/profile.js';
import { createRealtimeRouter } from './routes/realtime.js';
import { createReferralRouter } from './routes/referrals.js';
import { createWalletRouter } from './routes/wallet.js';
import { createWheelRouter } from './routes/wheel.js';
import { createWithdrawalRouter } from './routes/withdrawals.js';
import { NotificationRepo } from './notifications/notificationRepo.js';
import {
  createWebPushSender,
  type WebPushSender,
} from './notifications/webPushSender.js';
import { OfficialPartnerRepo } from './officialPartners/officialPartnerRepo.js';
import { RealtimeEventBroker } from './realtime/realtimeEvents.js';
import { ReferralRepo } from './referrals/referralRepo.js';
import { createStorageRouter } from './routes/storage.js';
import { StorageRepo } from './storage/storageRepo.js';
import { WalletRepo } from './wallet/walletRepo.js';
import { WheelRepo } from './wheel/wheelRepo.js';
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
  webPushSenderOverride?: WebPushSender;
  telegramFetchOverride?: TelegramFetchFn;
  telegramNowFnOverride?: () => number;
  wheelNowFnOverride?: () => number;
  wheelRandomUnitOverride?: () => number;
  extraRoutes?: (
    app: Express,
    deps: {
      userRepo: UserDirectoryRepo;
      pool: Pick<DatabasePool, 'query'>;
      requireAuth: RequestHandler;
      optionalAuth: RequestHandler;
      realtimeEvents: RealtimeEventBroker;
    },
  ) => void;
}

export function createApiApp({
  config,
  logger,
  pool,
  isShuttingDown = () => false,
  authDatabaseOverride,
  emailDeliveryOverride,
  webPushSenderOverride,
  telegramFetchOverride,
  telegramNowFnOverride,
  wheelNowFnOverride,
  wheelRandomUnitOverride,
  extraRoutes,
}: ApiAppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');

  // Nginx sits in front of the API on loopback (or a configured fixed proxy hop
  // count) and sets X-Forwarded-For / X-Forwarded-Proto. Never trust arbitrary
  // forwarded headers from untrusted public clients.
  app.set('trust proxy', config.trustProxy);

  const userRepo = new UserDirectoryRepo(pool);
  const appConfigRepo = new AppConfigRepo(pool);
  const auditLogRepo = new AuditLogRepo(pool);
  const gameCatalogRepo = new GameCatalogRepo(pool);
  const chatRepo = new ChatRepo(pool);
  const chatEvents = new ChatEventBroker();
  const realtimeEvents = new RealtimeEventBroker();
  const gameAccountRepo = new GameAccountRepo(pool);
  const depositRepo = new DepositRepo(pool);
  const notificationRepo = new NotificationRepo(pool);
  const officialPartnerRepo = new OfficialPartnerRepo(pool);
  const referralRepo = new ReferralRepo(pool);
  const storageRepo = new StorageRepo(pool);
  const walletRepo = new WalletRepo(pool);
  const wheelRepo = new WheelRepo(pool);
  const withdrawalRepo = new WithdrawalRepo(pool);
  const emailDelivery =
    emailDeliveryOverride ?? createEmailDeliveryAdapter(config, logger);
  const webPushSender =
    webPushSenderOverride ?? createWebPushSender(config, logger);
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
      res.setHeader(
        'X-Email-Verification-Required',
        String(config.authRequireEmailVerification),
      );
      void authNodeHandler(req, res).catch(next);
    },
  );

  // Allow bounded 3 MB / 4 MB base64 JSON payloads strictly for authenticated attachment/media uploads.
  app.post('/api/chat/attachments', express.json({ limit: '3mb' }));
  app.post('/api/storage/upload', express.json({ limit: '4mb' }));
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
    createRealtimeRouter({
      realtimeEvents,
      requireAuth,
    }),
  );
  app.use(
    '/api',
    createAdminAuthRouter({
      authRuntime,
      userRepo,
      requireAuth,
      realtimeEvents,
    }),
  );
  app.use(
    '/api',
    createProfileRouter({
      userRepo,
      requireAuth,
      realtimeEvents,
    }),
  );
  app.use(
    '/api',
    createGameCatalogRouter({
      gameCatalogRepo,
      userRepo,
      requireAuth,
      optionalAuth,
      realtimeEvents,
    }),
  );
  app.use(
    '/api',
    createGameAccountRouter({
      gameAccountRepo,
      userRepo,
      requireAuth,
      realtimeEvents,
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
      realtimeEvents,
    }),
  );
  app.use(
    '/api',
    createDepositRouter({
      depositRepo,
      userRepo,
      requireAuth,
      realtimeEvents,
    }),
  );
  app.use(
    '/api',
    createReferralRouter({
      referralRepo,
      userRepo,
      requireAuth,
      realtimeEvents,
    }),
  );
  app.use(
    '/api',
    createWheelRouter({
      wheelRepo,
      userRepo,
      requireAuth,
      appConfigRepo,
      telegramFetch: telegramFetchOverride,
      chatEvents,
      realtimeEvents,
      nowFn: wheelNowFnOverride,
      randomUnitFn: wheelRandomUnitOverride,
    }),
  );
  app.use(
    '/api',
    createChatRouter({
      chatRepo,
      chatEvents,
      requireAuth,
      realtimeEvents,
      appConfigRepo,
    }),
  );
  app.use(
    '/api',
    createOfficialPartnerRouter({
      officialPartnerRepo,
      requireAuth,
      realtimeEvents,
    }),
  );
  app.use(
    '/api',
    createNotificationRouter({
      config,
      notificationRepo,
      webPushSender,
      requireAuth,
      optionalAuth,
    }),
  );
  app.use(
    '/api',
    createAppConfigRouter({
      appConfigRepo,
      requireAuth,
      realtimeEvents,
      telegramFetch: telegramFetchOverride,
      logger,
      nowFn: telegramNowFnOverride,
    }),
  );
  app.use(
    '/api',
    createStorageRouter({
      config,
      storageRepo,
      userRepo,
      requireAuth,
      optionalAuth,
    }),
  );
  app.use(
    '/api',
    createAuditLogRouter({
      auditLogRepo,
      requireAuth,
      realtimeEvents,
    }),
  );

  extraRoutes?.(app, {
    userRepo,
    pool,
    requireAuth,
    optionalAuth,
    realtimeEvents,
  });

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
