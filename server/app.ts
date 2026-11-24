import express, { type Express } from 'express';
import type { ServerConfig } from './config/env.js';
import type { DatabasePool } from './db/pool.js';
import type { Logger } from './logging/logger.js';
import {
  createErrorHandler,
  notFoundHandler,
} from './middleware/errorHandler.js';
import { createRequestContextMiddleware } from './middleware/requestContext.js';
import { createSecurityMiddleware } from './middleware/security.js';
import { createHealthRouter } from './routes/health.js';

export interface ApiAppDependencies {
  config: ServerConfig;
  logger: Logger;
  pool: Pick<DatabasePool, 'query'>;
  isShuttingDown?: () => boolean;
}

export function createApiApp({
  config,
  logger,
  pool,
  isShuttingDown = () => false,
}: ApiAppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');

  // Nginx sits in front of the API on loopback (or a configured fixed proxy hop
  // count) and sets X-Forwarded-For / X-Forwarded-Proto. Never trust arbitrary
  // forwarded headers from untrusted public clients.
  app.set('trust proxy', config.trustProxy);

  app.use(createRequestContextMiddleware(logger));
  app.use(createSecurityMiddleware(config));
  app.use(express.json({ limit: config.requestBodyLimit }));

  app.use(
    '/api',
    createHealthRouter({
      pool,
      logger,
      isShuttingDown,
    }),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
