import pg from 'pg';
import type { PgSslMode, ServerConfig } from '../config/env.js';
import type { Logger } from '../logging/logger.js';

const { Pool } = pg;

export interface DatabasePool {
  query(text: string, values?: unknown[]): Promise<unknown>;
  end(): Promise<void>;
  on?(event: 'error', listener: (err: Error) => void): unknown;
}

function resolveSslOption(
  mode: PgSslMode,
): false | { rejectUnauthorized: boolean } {
  if (mode === 'disable') {
    return false;
  }
  if (mode === 'require') {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

export function createPgPool(config: ServerConfig, logger: Logger): pg.Pool {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.pgPoolMax,
    min: config.pgPoolMin,
    idleTimeoutMillis: config.pgIdleTimeoutMs,
    connectionTimeoutMillis: config.pgConnectionTimeoutMs,
    statement_timeout: config.pgStatementTimeoutMs,
    application_name: 'swiftsweeps-api',
    ssl: resolveSslOption(config.pgSslMode),
  });

  pool.on('error', (err: Error) => {
    logger.error('pg_pool_idle_client_error', { error: err });
  });

  return pool;
}

export async function checkDatabaseConnectivity(
  pool: Pick<DatabasePool, 'query'>,
  timeoutMs = 2_000,
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('Database readiness probe timed out'));
      }, timeoutMs);
      timer.unref();
    });

    await Promise.race([pool.query('SELECT 1 AS ok'), timeoutPromise]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export async function closePgPool(
  pool: Pick<DatabasePool, 'end'>,
  logger: Logger,
): Promise<void> {
  try {
    await pool.end();
    logger.info('pg_pool_closed');
  } catch (err) {
    logger.error('pg_pool_close_failed', { error: err });
    throw err;
  }
}
