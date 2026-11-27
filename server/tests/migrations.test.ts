import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  MigrationValidationError,
  applyPendingMigrations,
  computeSha256,
  getMigrationStatus,
  loadAndValidateMigrationFiles,
  validateMigrationSqlContent,
  type MigrationClient,
} from '../db/migrations.js';
import { createLogger } from '../logging/logger.js';

function createSilentLogger() {
  return createLogger({
    level: 'debug',
    writeStdout: () => {},
    writeStderr: () => {},
  });
}

test('repository db/migrations files pass ordering, precision, and separation checks', async () => {
  const migrationsDir = path.resolve(process.cwd(), 'db', 'migrations');
  const files = await loadAndValidateMigrationFiles(migrationsDir);

  assert.equal(files.length, 9);
  assert.equal(files[0]!.version, '0001');
  assert.equal(files[1]!.version, '0002');
  assert.equal(files[2]!.version, '0003');
  assert.equal(files[3]!.version, '0004');
  assert.equal(files[4]!.version, '0005');
  assert.equal(files[5]!.version, '0006');
  assert.equal(files[6]!.version, '0007');
  assert.equal(files[7]!.version, '0008');
  assert.equal(files[8]!.version, '0009');

  const combinedSql = files.map((file) => file.sql).join('\n');
  // Preserve financial precision and primary key / FK semantics
  assert.match(combinedSql, /NUMERIC\(12,\s*2\)/);
  assert.match(combinedSql, /NUMERIC\(5,\s*2\)/);
  assert.match(combinedSql, /id TEXT PRIMARY KEY/);
  assert.match(combinedSql, /REFERENCES public\.users\(id\) ON DELETE CASCADE/);
  assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS public\.auth_user_links/);
  assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS public\.wallets/);
  assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS public\.transactions/);
  assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS public\.topups/);
  assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS public\.withdrawals/);
  assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS public\.game_catalog/);
  assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS public\.game_accounts/);
  assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS public\.referral_awards/);
  assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS public\.wheel_spins/);
  assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS public\.official_partners/);
  assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS public\.official_partner_icons/);
  assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS public\.notifications/);
  assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS public\.push_subscriptions/);
  assert.match(combinedSql, /ADD CONSTRAINT topups_amount_check CHECK \(amount >= 0\)/);
});

test('validateMigrationSqlContent rejects floating-point money, Supabase auth/storage, and destructive drops', () => {
  const floatIssues = validateMigrationSqlContent(
    '0003_bad_float.sql',
    'CREATE TABLE public.bad (amount DOUBLE PRECISION NOT NULL);',
  );
  assert.ok(floatIssues.some((msg) => msg.includes('floating-point')));

  const authIssues = validateMigrationSqlContent(
    '0003_bad_auth.sql',
    'CREATE POLICY p ON public.users USING (auth.uid()::text = id);',
  );
  assert.ok(authIssues.some((msg) => msg.includes('Supabase auth')));

  const dropIssues = validateMigrationSqlContent(
    '0003_bad_drop.sql',
    'DROP TABLE public.wallets;',
  );
  assert.ok(dropIssues.some((msg) => msg.includes('DROP TABLE')));

  const internalAuthTableIssues = validateMigrationSqlContent(
    '0003_bad_ba.sql',
    'CREATE TABLE public.session (id TEXT PRIMARY KEY);',
  );
  assert.ok(
    internalAuthTableIssues.some((msg) => msg.includes('auth-library internal')),
  );
});

test('getMigrationStatus reports pending, applied, and checksum_mismatch accurately', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swiftsweeps-mig-'));
  try {
    const sql1 = 'CREATE TABLE IF NOT EXISTS public.sample_one (id TEXT PRIMARY KEY);';
    const sql2 = 'CREATE TABLE IF NOT EXISTS public.sample_two (id TEXT PRIMARY KEY);';
    await fs.writeFile(path.join(tmpDir, '0001_one.sql'), sql1, 'utf8');
    await fs.writeFile(path.join(tmpDir, '0002_two.sql'), sql2, 'utf8');

    const mockClient: MigrationClient = {
      async query<T extends Record<string, unknown>>(text: string) {
        if (text.includes('to_regclass')) {
          return { rows: [{ reg: 'public.schema_migrations' } as unknown as T] };
        }
        if (text.includes('FROM public.schema_migrations')) {
          return {
            rows: [
              {
                version: '0001',
                name: 'one',
                checksum_sha256: computeSha256(sql1),
                applied_at: '2026-11-24T00:00:00.000Z',
              } as unknown as T,
            ],
          };
        }
        return { rows: [] };
      },
    };

    const status = await getMigrationStatus(mockClient, tmpDir);
    assert.equal(status.length, 2);
    assert.equal(status[0]!.state, 'applied');
    assert.equal(status[1]!.state, 'pending');

    await fs.writeFile(
      path.join(tmpDir, '0001_one.sql'),
      `${sql1}\n-- modified`,
      'utf8',
    );
    const driftStatus = await getMigrationStatus(mockClient, tmpDir);
    assert.equal(driftStatus[0]!.state, 'checksum_mismatch');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('applyPendingMigrations acquires advisory lock, runs in transaction, and rolls back on failure', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swiftsweeps-apply-'));
  try {
    const sql1 = 'CREATE TABLE IF NOT EXISTS public.alpha (id TEXT PRIMARY KEY);';
    const sql2 = 'CREATE TABLE IF NOT EXISTS public.beta (id TEXT PRIMARY KEY);';
    await fs.writeFile(path.join(tmpDir, '0001_alpha.sql'), sql1, 'utf8');
    await fs.writeFile(path.join(tmpDir, '0002_beta.sql'), sql2, 'utf8');

    const executed: string[] = [];
    const appliedRows: Array<{
      version: string;
      name: string;
      checksum_sha256: string;
      applied_at: string;
    }> = [];
    let failSecond = false;

    const fakeClient: MigrationClient = {
      async query<T extends Record<string, unknown>>(
        text: string,
        values?: unknown[],
      ) {
        executed.push(text.trim().split('\n')[0]!);
        if (text.includes('FROM public.schema_migrations')) {
          return { rows: appliedRows as unknown as T[] };
        }
        if (failSecond && text.includes('public.beta')) {
          throw new Error('simulated SQL failure');
        }
        if (text.startsWith('INSERT INTO public.schema_migrations')) {
          appliedRows.push({
            version: String(values?.[0]),
            name: String(values?.[1]),
            checksum_sha256: String(values?.[2]),
            applied_at: new Date().toISOString(),
          });
        }
        return { rows: [] };
      },
    };

    const summary = await applyPendingMigrations(
      fakeClient,
      tmpDir,
      createSilentLogger(),
    );
    assert.deepEqual(summary.appliedVersions, ['0001', '0002']);
    assert.deepEqual(summary.skippedVersions, []);
    assert.ok(executed.some((s) => s.includes('pg_advisory_lock')));
    assert.ok(executed.some((s) => s.includes('pg_advisory_unlock')));
    assert.ok(executed.includes('BEGIN'));
    assert.ok(executed.includes('COMMIT'));

    // Re-running is idempotent
    const secondRun = await applyPendingMigrations(
      fakeClient,
      tmpDir,
      createSilentLogger(),
    );
    assert.deepEqual(secondRun.appliedVersions, []);
    assert.deepEqual(secondRun.skippedVersions, ['0001', '0002']);

    // Failure on pending migration rolls back and still unlocks advisory lock
    appliedRows.pop();
    failSecond = true;
    executed.length = 0;

    await assert.rejects(
      () => applyPendingMigrations(fakeClient, tmpDir, createSilentLogger()),
      /simulated SQL failure/,
    );
    assert.ok(executed.includes('ROLLBACK'));
    assert.ok(executed.some((s) => s.includes('pg_advisory_unlock')));

    // Checksum mismatch blocks apply
    await fs.writeFile(
      path.join(tmpDir, '0001_alpha.sql'),
      `${sql1}\nSELECT 1;`,
      'utf8',
    );
    await assert.rejects(
      () => applyPendingMigrations(fakeClient, tmpDir, createSilentLogger()),
      MigrationValidationError,
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
