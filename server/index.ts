import http from 'node:http';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createApiApp } from './app.js';
import {
  ConfigValidationError,
  loadServerConfig,
  type ServerConfig,
} from './config/env.js';
import { loadLocalDotEnv } from './config/loadDotEnv.js';
import { closePgPool, createPgPool, type DatabasePool } from './db/pool.js';
import { createLogger, type Logger } from './logging/logger.js';

export interface StartedApiServer {
  server: http.Server;
  pool: DatabasePool;
  config: ServerConfig;
  logger: Logger;
  shutdown: (signal: string) => Promise<void>;
}

export async function startApiServer(
  envSource: Record<string, string | undefined> = process.env,
): Promise<StartedApiServer> {
  const config = loadServerConfig(envSource);
  const logger = createLogger({ level: config.logLevel });
  const pool = createPgPool(config, logger);

  let shuttingDown = false;
  let shutdownPromise: Promise<void> | undefined;

  const app = createApiApp({
    config,
    logger,
    pool,
    isShuttingDown: () => shuttingDown,
  });

  const server = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(config.port, config.host);
  });

  logger.info('api_server_started', {
    nodeEnv: config.nodeEnv,
    host: config.host,
    port: config.port,
  });

  const shutdown = (signal: string): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shuttingDown = true;
    logger.info('api_server_shutdown_started', { signal });

    shutdownPromise = new Promise<void>((resolve, reject) => {
      const forceTimer = setTimeout(() => {
        logger.error('api_server_shutdown_timed_out', {
          timeoutMs: config.shutdownTimeoutMs,
        });
        reject(new Error('Graceful shutdown timed out'));
      }, config.shutdownTimeoutMs);
      forceTimer.unref();

      server.close((closeErr) => {
        void closePgPool(pool, logger)
          .then(() => {
            clearTimeout(forceTimer);
            if (closeErr) {
              reject(closeErr);
              return;
            }
            logger.info('api_server_stopped');
            resolve();
          })
          .catch((poolErr) => {
            clearTimeout(forceTimer);
            reject(poolErr);
          });
      });
    });

    return shutdownPromise;
  };

  return { server, pool, config, logger, shutdown };
}

function isMainEntrypoint(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  try {
    loadLocalDotEnv();
    const runtime = await startApiServer(process.env);

    const handleSignal = (signal: string): void => {
      void runtime
        .shutdown(signal)
        .then(() => {
          process.exit(0);
        })
        .catch(() => {
          process.exit(1);
        });
    };

    process.on('SIGINT', () => handleSignal('SIGINT'));
    process.on('SIGTERM', () => handleSignal('SIGTERM'));
  } catch (err) {
    const fallbackLogger = createLogger({ level: 'error' });
    if (err instanceof ConfigValidationError) {
      fallbackLogger.error('api_config_invalid', {
        issues: err.issues,
      });
    } else {
      fallbackLogger.error('api_startup_failed', { error: err });
    }
    process.exit(1);
  }
}

if (isMainEntrypoint()) {
  void main();
}
