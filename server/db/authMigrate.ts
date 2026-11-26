import { getMigrations } from 'better-auth/db/migration';
import { createAuthInstance } from '../auth/authInstance.js';
import { createEmailDeliveryAdapter } from '../auth/emailDelivery.js';
import { UserDirectoryRepo } from '../auth/userDirectoryRepo.js';
import { ConfigValidationError, loadServerConfig } from '../config/env.js';
import { loadLocalDotEnv } from '../config/loadDotEnv.js';
import { closePgPool, createPgPool } from './pool.js';
import { createLogger } from '../logging/logger.js';

type AuthMigrateCommand = 'status' | 'up' | 'sql';

async function run(): Promise<void> {
  loadLocalDotEnv();
  const command = (process.argv[2]?.trim().toLowerCase() || 'status') as AuthMigrateCommand;
  if (command !== 'status' && command !== 'up' && command !== 'sql') {
    process.stderr.write(
      'Usage: tsx server/db/authMigrate.ts <status|up|sql>\n',
    );
    process.exit(1);
  }

  const config = loadServerConfig(process.env);
  const logger = createLogger({ level: config.logLevel });
  const pool = createPgPool(config, logger);

  try {
    const userRepo = new UserDirectoryRepo(pool);
    const emailDelivery = createEmailDeliveryAdapter(config, logger);
    const { auth } = createAuthInstance({
      config,
      logger,
      pool,
      userRepo,
      emailDelivery,
    });

    const plan = await getMigrations(auth.options, { throwOnUnsafe: false });

    if (command === 'sql') {
      const compiledSql = await plan.compileMigrations();
      process.stdout.write(
        compiledSql.trim().length > 0
          ? `${compiledSql.trim()}\n`
          : '-- No pending Better Auth schema migrations.\n',
      );
      return;
    }

    if (command === 'status') {
      logger.info('auth_migrations_status', {
        tablesToCreate: plan.toBeCreated.map((entry) => entry.table),
        columnsToAdd: plan.toBeAdded.map((entry) => ({
          table: entry.table,
          fields: Object.keys(entry.fields),
        })),
        indexesToAdd: plan.toBeAddedIndexes.map((entry) => ({
          table: entry.table,
          name: entry.name,
        })),
        unsafeChangesCount: plan.unsafeChanges.length,
        schemaProblemsCount: plan.schemaProblems.length,
      });

      if (plan.unsafeChanges.length > 0 || plan.schemaProblems.length > 0) {
        process.exitCode = 1;
      }
      return;
    }

    if (plan.unsafeChanges.length > 0) {
      logger.error('auth_migrations_blocked_unsafe_changes', {
        unsafeChanges: plan.unsafeChanges,
      });
      process.exitCode = 1;
      return;
    }

    await plan.runMigrations();
    logger.info('auth_migrations_up_completed', {
      createdTables: plan.toBeCreated.map((entry) => entry.table),
      alteredTables: plan.toBeAdded.map((entry) => entry.table),
      addedIndexes: plan.toBeAddedIndexes.map((entry) => entry.name),
    });
  } finally {
    await closePgPool(pool, logger);
  }
}

run().catch((err: unknown) => {
  const logger = createLogger({ level: 'error' });
  if (err instanceof ConfigValidationError) {
    logger.error('auth_migrations_config_invalid', { issues: err.issues });
  } else {
    logger.error('auth_migrations_cli_failed', { error: err });
  }
  process.exit(1);
});
