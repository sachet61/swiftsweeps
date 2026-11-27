import path from 'node:path';
import pg from 'pg';
import type { PgSslMode } from '../config/env.js';
import { loadLocalDotEnv } from '../config/loadDotEnv.js';
import { createLogger } from '../logging/logger.js';
import {
  DataMigrationConfigError,
  DataMigrationIntegrityError,
  type DataMigrationMode,
  type MigrationQueryable,
  loadDataMigrationConfig,
  runDataMigrationImport,
  runDryRunOrValidation,
  runExportSnapshot,
} from '../migration/dataMigrationTool.js';

const { Pool } = pg;

function buildSslOption(
  mode: PgSslMode,
): false | { rejectUnauthorized: boolean } {
  if (mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

interface ParsedCliArgs {
  mode: DataMigrationMode;
  confirmProductionCli: boolean;
  exportDir?: string;
  snapshotDir?: string;
  checkpointPath?: string;
  reportPath?: string;
}

function parseCliArgs(argv: string[]): ParsedCliArgs {
  const modeRaw = (argv[0] ?? '').trim().toLowerCase();
  if (
    modeRaw !== 'preflight' &&
    modeRaw !== 'export' &&
    modeRaw !== 'import' &&
    modeRaw !== 'validate'
  ) {
    throw new DataMigrationConfigError([
      'Usage: tsx server/db/dataMigration.ts <preflight|export|import|validate> [--export-dir <dir>] [--snapshot-dir <dir>] [--checkpoint <file>] [--report <file>] [--confirm-production]',
    ]);
  }

  let confirmProductionCli = false;
  let exportDir: string | undefined;
  let snapshotDir: string | undefined;
  let checkpointPath: string | undefined;
  let reportPath: string | undefined;

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--confirm-production') {
      confirmProductionCli = true;
    } else if (arg === '--export-dir') {
      exportDir = argv[++i];
    } else if (arg === '--snapshot-dir') {
      snapshotDir = argv[++i];
    } else if (arg === '--checkpoint') {
      checkpointPath = argv[++i];
    } else if (arg === '--report') {
      reportPath = argv[++i];
    } else {
      throw new DataMigrationConfigError([`Unknown CLI argument: ${arg}`]);
    }
  }

  return {
    mode: modeRaw,
    confirmProductionCli,
    exportDir,
    snapshotDir,
    checkpointPath,
    reportPath,
  };
}

function createPoolForUrl(
  connectionString: string,
  sslMode: PgSslMode,
  appName: string,
): pg.Pool {
  return new Pool({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 60_000,
    application_name: appName,
    ssl: buildSslOption(sslMode),
  });
}

async function main(): Promise<void> {
  loadLocalDotEnv();
  const parsed = parseCliArgs(process.argv.slice(2));
  const logger = createLogger({ level: 'info' });

  const config = loadDataMigrationConfig({
    mode: parsed.mode,
    env: process.env,
    confirmProductionCli: parsed.confirmProductionCli,
    artifactDir: parsed.exportDir,
    checkpointPath: parsed.checkpointPath,
    reportPath: parsed.reportPath,
    requireSourceUrl: parsed.mode !== 'import' || !parsed.snapshotDir,
    requireTargetUrl: parsed.mode !== 'export',
  });

  const sourcePool = config.sourceDatabaseUrl
    ? createPoolForUrl(
        config.sourceDatabaseUrl,
        config.sourceSslMode,
        'swiftsweeps-data-mig-src',
      )
    : undefined;
  const targetPool = config.targetDatabaseUrl
    ? createPoolForUrl(
        config.targetDatabaseUrl,
        config.targetSslMode,
        'swiftsweeps-data-mig-tgt',
      )
    : undefined;

  const emptyStubDb: MigrationQueryable = {
    async query() {
      return { rows: [], rowCount: 0 };
    },
  };

  try {
    if (config.mode === 'export') {
      if (!sourcePool) {
        throw new DataMigrationConfigError([
          'MIGRATION_SOURCE_DATABASE_URL is required for export.',
        ]);
      }
      const outDir = path.resolve(
        parsed.exportDir ||
          config.artifactDir ||
          path.join('.migration-work', `export_${Date.now()}`),
      );
      const res = await runExportSnapshot({
        sourceDb: sourcePool as unknown as MigrationQueryable,
        config,
        logger,
        exportDir: outDir,
      });
      logger.info('data_migration_cli_export_done', {
        snapshotPath: res.snapshotPath,
        manifestPath: res.manifestPath,
        rowCounts: res.rowCounts,
      });
      return;
    }

    if (config.mode === 'import') {
      if (!targetPool) {
        throw new DataMigrationConfigError([
          'MIGRATION_TARGET_DATABASE_URL is required for import.',
        ]);
      }
      const report = await runDataMigrationImport({
        sourceDb: (sourcePool ?? emptyStubDb) as unknown as MigrationQueryable,
        targetDb: targetPool as unknown as MigrationQueryable,
        config,
        logger,
        snapshotDir: parsed.snapshotDir
          ? path.resolve(parsed.snapshotDir)
          : undefined,
      });
      logger.info('data_migration_cli_import_done', {
        passed: report.passed,
        readyForHumanReview: report.readyForHumanReview,
        discrepancyCount: report.discrepancies.length,
        warningCount: report.warnings.length,
      });
      return;
    }

    if (!sourcePool || !targetPool) {
      throw new DataMigrationConfigError([
        'Both MIGRATION_SOURCE_DATABASE_URL and MIGRATION_TARGET_DATABASE_URL are required.',
      ]);
    }

    const report = await runDryRunOrValidation({
      sourceDb: sourcePool as unknown as MigrationQueryable,
      targetDb: targetPool as unknown as MigrationQueryable,
      config,
      logger,
    });
    logger.info('data_migration_cli_report', {
      mode: report.mode,
      passed: report.passed,
      readyForHumanReview: report.readyForHumanReview,
      discrepancies: report.discrepancies,
      warnings: report.warnings,
      unmappedObjects: report.unmappedObjects,
      financialMatched: report.financialReconciliation.matched,
    });
  } finally {
    await Promise.all([
      sourcePool?.end().catch(() => {}),
      targetPool?.end().catch(() => {}),
    ]);
  }
}

main().catch((err: unknown) => {
  const logger = createLogger({ level: 'error' });
  if (err instanceof DataMigrationConfigError) {
    logger.error('data_migration_config_failed', { issues: err.issues });
  } else if (err instanceof DataMigrationIntegrityError) {
    logger.error('data_migration_integrity_failed', {
      message: err.message,
      discrepancies: err.discrepancies,
    });
  } else {
    logger.error('data_migration_unexpected_failure', { error: err });
  }
  process.exit(1);
});
