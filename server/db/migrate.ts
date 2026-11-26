import path from 'node:path';
import pg from 'pg';
import type { PgSslMode } from '../config/env.js';
import { loadLocalDotEnv } from '../config/loadDotEnv.js';
import { createLogger } from '../logging/logger.js';
import {
  MigrationValidationError,
  applyPendingMigrations,
  getMigrationStatus,
  loadAndValidateMigrationFiles,
} from './migrations.js';

const { Pool } = pg;

type CliCommand = 'check' | 'status' | 'up';

const VALID_SSL_MODES = new Set<PgSslMode>(['disable', 'require', 'verify-full']);

function resolveMigrationsDir(): string {
  return path.resolve(process.cwd(), 'db', 'migrations');
}

function resolveDatabaseCliConfig(
  envSource: Record<string, string | undefined> = process.env,
): { databaseUrl: string; sslMode: PgSslMode } {
  const databaseUrl = envSource.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for database migration commands.');
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URI.');
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use postgres:// or postgresql://.');
  }

  const rawSsl = (envSource.PG_SSL_MODE?.trim() || 'disable') as PgSslMode;
  if (!VALID_SSL_MODES.has(rawSsl)) {
    throw new Error('PG_SSL_MODE must be disable, require, or verify-full.');
  }

  return { databaseUrl, sslMode: rawSsl };
}

function buildSslOption(
  mode: PgSslMode,
): false | { rejectUnauthorized: boolean } {
  if (mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

async function runCli(): Promise<void> {
  loadLocalDotEnv();
  const command = (process.argv[2]?.trim().toLowerCase() || 'check') as CliCommand;
  if (command !== 'check' && command !== 'status' && command !== 'up') {
    process.stderr.write(
      'Usage: tsx server/db/migrate.ts <check|status|up>\n',
    );
    process.exit(1);
  }

  const logger = createLogger({ level: 'info' });
  const migrationsDir = resolveMigrationsDir();

  if (command === 'check') {
    const files = await loadAndValidateMigrationFiles(migrationsDir);
    logger.info('db_migrations_check_passed', {
      count: files.length,
      migrations: files.map((f) => ({
        version: f.version,
        filename: f.filename,
        checksumSha256: f.checksumSha256,
      })),
    });
    return;
  }

  const { databaseUrl, sslMode } = resolveDatabaseCliConfig(process.env);
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    application_name: 'swiftsweeps-migrate',
    ssl: buildSslOption(sslMode),
  });

  const client = await pool.connect();
  try {
    if (command === 'status') {
      const entries = await getMigrationStatus(client, migrationsDir);
      const hasMismatch = entries.some((e) => e.state === 'checksum_mismatch');
      logger.info('db_migrations_status', { entries });
      if (hasMismatch) {
        process.exitCode = 1;
      }
      return;
    }

    const summary = await applyPendingMigrations(client, migrationsDir, logger);
    logger.info('db_migrations_up_completed', { ...summary });
  } finally {
    client.release();
    await pool.end();
  }
}

runCli().catch((err: unknown) => {
  const logger = createLogger({ level: 'error' });
  if (err instanceof MigrationValidationError) {
    logger.error('db_migrations_validation_failed', { issues: err.issues });
  } else {
    logger.error('db_migrations_cli_failed', { error: err });
  }
  process.exit(1);
});
