import { Router } from 'express';
import {
  checkDatabaseConnectivity,
  type DatabasePool,
} from '../db/pool.js';
import type { Logger } from '../logging/logger.js';

export interface HealthRouterDeps {
  pool: Pick<DatabasePool, 'query'>;
  logger: Logger;
  isShuttingDown: () => boolean;
}

export function createHealthRouter({
  pool,
  logger,
  isShuttingDown,
}: HealthRouterDeps): Router {
  const router = Router();

  router.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  router.get('/readyz', async (req, res) => {
    if (isShuttingDown()) {
      res.status(503).json({ status: 'unavailable' });
      return;
    }

    const dbReady = await checkDatabaseConnectivity(pool);
    if (!dbReady) {
      logger.warn('readiness_probe_failed', { requestId: req.requestId });
      res.status(503).json({ status: 'unavailable' });
      return;
    }

    res.status(200).json({ status: 'ready' });
  });

  return router;
}
