import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../logging/logger.js';

export interface MigrationFile {
  version: string;
  name: string;
  filename: string;
  fullPath: string;
  sql: string;
  checksumSha256: string;
}

export interface MigrationClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

export interface MigrationStatusEntry {
  version: string;
  name: string;
  filename: string;
  checksumSha256: string;
  state: 'applied' | 'pending' | 'checksum_mismatch';
  appliedAt?: string;
}

export interface AppliedMigrationSummary {
  appliedVersions: string[];
  skippedVersions: string[];
}

export class MigrationValidationError extends Error {
  public readonly issues: readonly string[];

  constructor(issues: string[]) {
    super(`Migration validation failed: ${issues.join('; ')}`);
    this.name = 'MigrationValidationError';
    this.issues = issues;
  }
}

const MIGRATION_FILENAME_REGEX = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const ADVISORY_LOCK_KEY = 724_019_310;

const FORBIDDEN_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\bauth\s*\.\s*(users|uid|jwt)\b/i,
    reason: 'references Supabase auth schema/helpers',
  },
  {
    pattern: /\bstorage\s*\.\s*(buckets|objects)\b/i,
    reason: 'references Supabase storage schema',
  },
  {
    pattern: /\bsupabase_realtime\b/i,
    reason: 'references Supabase realtime publication',
  },
  {
    pattern: /\b(double\s+precision|real|float4|float8|float(?:\s*\(\s*\d+\s*\))?)\b/i,
    reason: 'uses floating-point type; financial/numeric columns must use NUMERIC',
  },
  {
    pattern: /\bcreate\s+table(?:\s+if\s+not\s+exists)?\s+(?:public\.)?"?(session|account|verification)"?\b/i,
    reason: 'manually creates auth-library internal tables',
  },
  {
    pattern: /\bdrop\s+table\b/i,
    reason: 'contains destructive DROP TABLE statement',
  },
  {
    pattern: /\btruncate\b/i,
    reason: 'contains destructive TRUNCATE statement',
  },
];

export function computeSha256(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

export function validateMigrationSqlContent(
  filename: string,
  sql: string,
): string[] {
  const issues: string[] = [];
  const stripped = stripSqlComments(sql).trim();

  if (!stripped) {
    issues.push(`${filename}: migration SQL is empty`);
    return issues;
  }

  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.pattern.test(stripped)) {
      issues.push(`${filename}: ${rule.reason}`);
    }
  }

  return issues;
}

export async function loadAndValidateMigrationFiles(
  migrationsDir: string,
): Promise<MigrationFile[]> {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const sqlFilenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const issues: string[] = [];
  if (sqlFilenames.length === 0) {
    issues.push('No .sql migration files found');
    throw new MigrationValidationError(issues);
  }

  const parsed: MigrationFile[] = [];
  const seenVersions = new Set<string>();

  for (const filename of sqlFilenames) {
    const match = MIGRATION_FILENAME_REGEX.exec(filename);
    if (!match) {
      issues.push(
        `${filename}: filename must match NNNN_<lowercase_snake_name>.sql`,
      );
      continue;
    }

    const version = match[1]!;
    const name = match[2]!;
    if (seenVersions.has(version)) {
      issues.push(`${filename}: duplicate migration version ${version}`);
      continue;
    }
    seenVersions.add(version);

    const fullPath = path.join(migrationsDir, filename);
    const sql = await fs.readFile(fullPath, 'utf8');
    issues.push(...validateMigrationSqlContent(filename, sql));

    parsed.push({
      version,
      name,
      filename,
      fullPath,
      sql,
      checksumSha256: computeSha256(sql),
    });
  }

  parsed.sort((a, b) => a.version.localeCompare(b.version));
  for (let i = 0; i < parsed.length; i += 1) {
    const expected = String(i + 1).padStart(4, '0');
    if (parsed[i]!.version !== expected) {
      issues.push(
        `${parsed[i]!.filename}: expected sequential version ${expected}, found ${parsed[i]!.version}`,
      );
    }
  }

  if (issues.length > 0) {
    throw new MigrationValidationError(issues);
  }

  return parsed;
}

interface AppliedMigrationRow extends Record<string, unknown> {
  version: string;
  name: string;
  checksum_sha256: string;
  applied_at: Date | string;
}

export async function getMigrationStatus(
  client: MigrationClient,
  migrationsDir: string,
): Promise<MigrationStatusEntry[]> {
  const files = await loadAndValidateMigrationFiles(migrationsDir);

  const existsRes = await client.query<{ reg: string | null }>(
    "SELECT to_regclass('public.schema_migrations')::text AS reg",
  );
  const tableExists = Boolean(existsRes.rows[0]?.reg);

  const appliedMap = new Map<string, AppliedMigrationRow>();
  if (tableExists) {
    const rowsRes = await client.query<AppliedMigrationRow>(
      'SELECT version, name, checksum_sha256, applied_at FROM public.schema_migrations ORDER BY version ASC',
    );
    for (const row of rowsRes.rows) {
      appliedMap.set(String(row.version), row);
    }
  }

  return files.map((file) => {
    const applied = appliedMap.get(file.version);
    if (!applied) {
      return {
        version: file.version,
        name: file.name,
        filename: file.filename,
        checksumSha256: file.checksumSha256,
        state: 'pending',
      };
    }

    const appliedAt =
      applied.applied_at instanceof Date
        ? applied.applied_at.toISOString()
        : String(applied.applied_at);

    if (applied.checksum_sha256 !== file.checksumSha256) {
      return {
        version: file.version,
        name: file.name,
        filename: file.filename,
        checksumSha256: file.checksumSha256,
        state: 'checksum_mismatch',
        appliedAt,
      };
    }

    return {
      version: file.version,
      name: file.name,
      filename: file.filename,
      checksumSha256: file.checksumSha256,
      state: 'applied',
      appliedAt,
    };
  });
}

export async function applyPendingMigrations(
  client: MigrationClient,
  migrationsDir: string,
  logger: Logger,
): Promise<AppliedMigrationSummary> {
  const files = await loadAndValidateMigrationFiles(migrationsDir);
  const appliedVersions: string[] = [];
  const skippedVersions: string[] = [];

  await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        checksum_sha256 TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
      )
    `);

    const existingRes = await client.query<AppliedMigrationRow>(
      'SELECT version, name, checksum_sha256, applied_at FROM public.schema_migrations ORDER BY version ASC',
    );
    const existingByVersion = new Map<string, AppliedMigrationRow>();
    for (const row of existingRes.rows) {
      existingByVersion.set(String(row.version), row);
    }

    for (const file of files) {
      const existing = existingByVersion.get(file.version);
      if (existing) {
        if (existing.checksum_sha256 !== file.checksumSha256) {
          throw new MigrationValidationError([
            `${file.filename}: applied checksum mismatch (database has ${existing.checksum_sha256}, disk has ${file.checksumSha256})`,
          ]);
        }
        skippedVersions.push(file.version);
        continue;
      }

      logger.info('db_migration_applying', {
        version: file.version,
        name: file.name,
      });

      await client.query('BEGIN');
      try {
        await client.query(file.sql);
        await client.query(
          'INSERT INTO public.schema_migrations (version, name, checksum_sha256) VALUES ($1, $2, $3)',
          [file.version, file.name, file.checksumSha256],
        );
        await client.query('COMMIT');
        appliedVersions.push(file.version);
        logger.info('db_migration_applied', {
          version: file.version,
          name: file.name,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
  }

  return { appliedVersions, skippedVersions };
}
