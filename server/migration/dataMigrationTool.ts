import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PgSslMode } from '../config/env.js';
import type { DatabaseClient, DatabasePool } from '../db/pool.js';
import type { Logger } from '../logging/logger.js';
import { hashPushEndpointId } from '../notifications/notificationRepo.js';

export type MigrationEnvironmentKind = 'local' | 'staging' | 'production';
export type DataMigrationMode = 'preflight' | 'export' | 'import' | 'validate';

export const PRODUCTION_SOURCE_CONFIRM_TOKEN =
  'CONFIRMED_OPERATOR_READONLY_EXPORT';
export const PRODUCTION_TARGET_CONFIRM_TOKEN =
  'CONFIRMED_OPERATOR_PRODUCTION_CUTOVER';

const VALID_ENVS = new Set<MigrationEnvironmentKind>([
  'local',
  'staging',
  'production',
]);
const VALID_SSL_MODES = new Set<PgSslMode>(['disable', 'require', 'verify-full']);

const TRANSIENT_PG_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
]);

const TRANSIENT_NODE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
]);

export interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

export interface MigrationQueryable {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResultLike<T>>;
  connect?(): Promise<MigrationDbClient>;
}

export interface MigrationDbClient {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResultLike<T>>;
  release(err?: Error | boolean): void;
}

export class DataMigrationConfigError extends Error {
  public readonly issues: readonly string[];

  constructor(issues: string[]) {
    super(`Data migration configuration error: ${issues.join('; ')}`);
    this.name = 'DataMigrationConfigError';
    this.issues = issues;
  }
}

export class DataMigrationIntegrityError extends Error {
  public readonly discrepancies: readonly string[];

  constructor(message: string, discrepancies: string[] = []) {
    super(message);
    this.name = 'DataMigrationIntegrityError';
    this.discrepancies = discrepancies;
  }
}

export interface DataMigrationConfig {
  mode: DataMigrationMode;
  sourceEnv: MigrationEnvironmentKind;
  targetEnv: MigrationEnvironmentKind;
  sourceDatabaseUrl: string;
  targetDatabaseUrl: string;
  sourceSslMode: PgSslMode;
  targetSslMode: PgSslMode;
  batchSize: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  confirmProductionCli: boolean;
  allowProductionSource: boolean;
  allowProductionTarget: boolean;
  artifactDir?: string;
  checkpointPath?: string;
  reportPath?: string;
}

export interface EnvValidationInput {
  mode: DataMigrationMode;
  env?: Record<string, string | undefined>;
  confirmProductionCli?: boolean;
  artifactDir?: string;
  checkpointPath?: string;
  reportPath?: string;
  requireTargetUrl?: boolean;
  requireSourceUrl?: boolean;
}

function parsePgUrl(raw: string | undefined, varName: string, issues: string[]): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    issues.push(`${varName} is required.`);
    return '';
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    issues.push(`${varName} must be a valid PostgreSQL connection URI.`);
    return '';
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    issues.push(`${varName} must use postgres:// or postgresql://.`);
    return '';
  }

  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    issues.push(`${varName} must include hostname and database name.`);
    return '';
  }

  return trimmed;
}

function databaseIdentityKey(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  const host = parsed.hostname.toLowerCase();
  const port = parsed.port || '5432';
  const dbName = parsed.pathname.replace(/^\/+/, '');
  const schema = parsed.searchParams.get('schema') ?? 'public';
  return `${host}:${port}/${dbName}?schema=${schema}`;
}

export function sanitizeConnectionIdentity(rawUrl: string): {
  host: string;
  port: string;
  database: string;
} {
  try {
    const parsed = new URL(rawUrl);
    return {
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.replace(/^\/+/, ''),
    };
  } catch {
    return { host: 'invalid', port: '', database: 'invalid' };
  }
}

function parseSslMode(
  raw: string | undefined,
  varName: string,
  issues: string[],
): PgSslMode {
  const value = (raw?.trim() || 'disable') as PgSslMode;
  if (!VALID_SSL_MODES.has(value)) {
    issues.push(`${varName} must be one of: disable, require, verify-full.`);
    return 'disable';
  }
  return value;
}

function parseBoundedInt(
  raw: string | undefined,
  varName: string,
  defaultValue: number,
  min: number,
  max: number,
  issues: string[],
): number {
  if (!raw || raw.trim() === '') {
    return defaultValue;
  }
  if (!/^\d+$/.test(raw.trim())) {
    issues.push(`${varName} must be an integer between ${min} and ${max}.`);
    return defaultValue;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    issues.push(`${varName} must be between ${min} and ${max}.`);
    return defaultValue;
  }
  return parsed;
}

export function loadDataMigrationConfig(
  input: EnvValidationInput,
): DataMigrationConfig {
  const env = input.env ?? process.env;
  const issues: string[] = [];

  const sourceEnvRaw = (env.MIGRATION_SOURCE_ENV ?? '').trim().toLowerCase();
  const targetEnvRaw = (env.MIGRATION_TARGET_ENV ?? '').trim().toLowerCase();

  if (!VALID_ENVS.has(sourceEnvRaw as MigrationEnvironmentKind)) {
    issues.push(
      'MIGRATION_SOURCE_ENV must be explicitly set to local, staging, or production.',
    );
  }
  if (!VALID_ENVS.has(targetEnvRaw as MigrationEnvironmentKind)) {
    issues.push(
      'MIGRATION_TARGET_ENV must be explicitly set to local, staging, or production.',
    );
  }

  const sourceEnv = (sourceEnvRaw || 'staging') as MigrationEnvironmentKind;
  const targetEnv = (targetEnvRaw || 'staging') as MigrationEnvironmentKind;

  const requireSourceUrl = input.requireSourceUrl !== false;
  const requireTargetUrl =
    input.requireTargetUrl ?? input.mode !== 'export';

  const sourceDatabaseUrl = requireSourceUrl
    ? parsePgUrl(
        env.MIGRATION_SOURCE_DATABASE_URL,
        'MIGRATION_SOURCE_DATABASE_URL',
        issues,
      )
    : (env.MIGRATION_SOURCE_DATABASE_URL ?? '').trim();

  const targetDatabaseUrl = requireTargetUrl
    ? parsePgUrl(
        env.MIGRATION_TARGET_DATABASE_URL,
        'MIGRATION_TARGET_DATABASE_URL',
        issues,
      )
    : (env.MIGRATION_TARGET_DATABASE_URL ?? '').trim();

  if (sourceDatabaseUrl && targetDatabaseUrl) {
    try {
      if (
        databaseIdentityKey(sourceDatabaseUrl) ===
        databaseIdentityKey(targetDatabaseUrl)
      ) {
        issues.push(
          'MIGRATION_SOURCE_DATABASE_URL and MIGRATION_TARGET_DATABASE_URL must not point to the same database.',
        );
      }
    } catch {
      // Invalid URL already recorded above
    }
  }

  const allowProductionSource =
    (env.MIGRATION_ALLOW_PRODUCTION_SOURCE ?? '').trim() ===
    PRODUCTION_SOURCE_CONFIRM_TOKEN;
  const allowProductionTarget =
    (env.MIGRATION_ALLOW_PRODUCTION_TARGET ?? '').trim() ===
    PRODUCTION_TARGET_CONFIRM_TOKEN;
  const confirmProductionCli = Boolean(input.confirmProductionCli);

  if (sourceEnv === 'production' && !allowProductionSource) {
    issues.push(
      `Source is marked production; MIGRATION_ALLOW_PRODUCTION_SOURCE=${PRODUCTION_SOURCE_CONFIRM_TOKEN} is required.`,
    );
  }

  if (targetEnv === 'production') {
    if (!allowProductionTarget) {
      issues.push(
        `Target is marked production; MIGRATION_ALLOW_PRODUCTION_TARGET=${PRODUCTION_TARGET_CONFIRM_TOKEN} is required.`,
      );
    }
    if (input.mode === 'import' && !confirmProductionCli) {
      issues.push(
        'Target is marked production; import writes require the explicit --confirm-production operator flag.',
      );
    }
  }

  const sourceSslMode = parseSslMode(
    env.MIGRATION_SOURCE_SSL_MODE,
    'MIGRATION_SOURCE_SSL_MODE',
    issues,
  );
  const targetSslMode = parseSslMode(
    env.MIGRATION_TARGET_SSL_MODE,
    'MIGRATION_TARGET_SSL_MODE',
    issues,
  );

  const batchSize = parseBoundedInt(
    env.MIGRATION_BATCH_SIZE,
    'MIGRATION_BATCH_SIZE',
    500,
    10,
    5000,
    issues,
  );
  const maxRetries = parseBoundedInt(
    env.MIGRATION_MAX_RETRIES,
    'MIGRATION_MAX_RETRIES',
    3,
    0,
    10,
    issues,
  );
  const retryBaseDelayMs = parseBoundedInt(
    env.MIGRATION_RETRY_BASE_DELAY_MS,
    'MIGRATION_RETRY_BASE_DELAY_MS',
    200,
    10,
    10_000,
    issues,
  );

  if (issues.length > 0) {
    throw new DataMigrationConfigError(issues);
  }

  return {
    mode: input.mode,
    sourceEnv,
    targetEnv,
    sourceDatabaseUrl,
    targetDatabaseUrl,
    sourceSslMode,
    targetSslMode,
    batchSize,
    maxRetries,
    retryBaseDelayMs,
    confirmProductionCli,
    allowProductionSource,
    allowProductionTarget,
    artifactDir: input.artifactDir ?? env.MIGRATION_ARTIFACT_DIR?.trim(),
    checkpointPath: input.checkpointPath ?? env.MIGRATION_CHECKPOINT_PATH?.trim(),
    reportPath: input.reportPath ?? env.MIGRATION_REPORT_PATH?.trim(),
  };
}

export function isTransientDatabaseError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const code = String((err as { code?: unknown }).code ?? '');
  if (TRANSIENT_PG_CODES.has(code) || TRANSIENT_NODE_CODES.has(code)) {
    return true;
  }
  const msg = String((err as { message?: unknown }).message ?? '').toLowerCase();
  return (
    msg.includes('connection terminated unexpectedly') ||
    msg.includes('connection reset') ||
    msg.includes('timeout expired')
  );
}

export async function withDeterministicRetry<T>(
  operationName: string,
  maxRetries: number,
  baseDelayMs: number,
  logger: Logger,
  fn: () => Promise<T>,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientDatabaseError(err) || attempt >= maxRetries) {
        throw err;
      }
      attempt += 1;
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      logger.warn('data_migration_transient_retry', {
        operationName,
        attempt,
        maxRetries,
        delayMs,
        error: err,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export function toMoneyCents(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const str = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) {
    const num = Number(str);
    if (!Number.isFinite(num)) {
      throw new DataMigrationIntegrityError(`Invalid numeric monetary value.`);
    }
    return Math.round(num * 100);
  }
  const sign = match[1] === '-' ? -1 : 1;
  const whole = Number.parseInt(match[2]!, 10);
  const fracRaw = (match[3] ?? '').padEnd(2, '0');
  const centsPart = Number.parseInt(fracRaw.slice(0, 2), 10);
  const extraDigit = fracRaw.length > 2 ? Number.parseInt(fracRaw[2]!, 10) : 0;
  let total = whole * 100 + centsPart;
  if (extraDigit >= 5) {
    total += 1;
  }
  return sign * total;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

export function normalizeMoneyString(value: unknown, scale = 2): string {
  if (value === null || value === undefined || value === '') {
    return scale === 4 ? '0.0000' : '0.00';
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new DataMigrationIntegrityError('Invalid decimal column value.');
  }
  if (scale === 2) {
    return formatCents(toMoneyCents(value));
  }
  return num.toFixed(scale);
}

export function normalizeIsoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toISOString();
}

export function canonicalizeJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return canonicalizeJsonValue(JSON.parse(trimmed));
      } catch {
        return value;
      }
    }
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item));
  }
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalizeJsonValue(
        (value as Record<string, unknown>)[key],
      );
    }
    return sorted;
  }
  return value;
}

export type CanonicalTableName =
  | 'users'
  | 'auth_user_links'
  | 'ba_user'
  | 'app_config'
  | 'push_subscriptions'
  | 'audit_logs'
  | 'game_catalog'
  | 'faked_cashouts'
  | 'official_partners'
  | 'official_partner_icons'
  | 'wallets'
  | 'game_accounts'
  | 'topups'
  | 'withdrawals'
  | 'transactions'
  | 'referral_awards'
  | 'wheel_spins'
  | 'notifications'
  | 'conversations'
  | 'messages'
  | 'chat_attachments'
  | 'storage_objects';

export const CANONICAL_IMPORT_ORDER: readonly CanonicalTableName[] = [
  'users',
  'ba_user',
  'auth_user_links',
  'app_config',
  'push_subscriptions',
  'audit_logs',
  'game_catalog',
  'faked_cashouts',
  'official_partners',
  'official_partner_icons',
  'wallets',
  'game_accounts',
  'topups',
  'withdrawals',
  'transactions',
  'referral_awards',
  'wheel_spins',
  'notifications',
  'conversations',
  'messages',
  'chat_attachments',
  'storage_objects',
];

export interface CanonicalRowBundle {
  users: Array<Record<string, unknown>>;
  ba_user: Array<Record<string, unknown>>;
  auth_user_links: Array<Record<string, unknown>>;
  app_config: Array<Record<string, unknown>>;
  push_subscriptions: Array<Record<string, unknown>>;
  audit_logs: Array<Record<string, unknown>>;
  game_catalog: Array<Record<string, unknown>>;
  faked_cashouts: Array<Record<string, unknown>>;
  official_partners: Array<Record<string, unknown>>;
  official_partner_icons: Array<Record<string, unknown>>;
  wallets: Array<Record<string, unknown>>;
  game_accounts: Array<Record<string, unknown>>;
  topups: Array<Record<string, unknown>>;
  withdrawals: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
  referral_awards: Array<Record<string, unknown>>;
  wheel_spins: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  conversations: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  chat_attachments: Array<Record<string, unknown>>;
  storage_objects: Array<Record<string, unknown>>;
}

export interface TableInspectionSummary {
  table: CanonicalTableName;
  sourceExists: boolean;
  targetExists: boolean;
  sourceRows: number;
  targetRows: number;
  checksumMatched: boolean | null;
  sourceChecksumSha256: string | null;
  targetChecksumSha256: string | null;
  minTimestampUtc: string | null;
  maxTimestampUtc: string | null;
  targetMinTimestampUtc: string | null;
  targetMaxTimestampUtc: string | null;
  notes: string[];
}

export interface FinancialAggregateSummary {
  wallets: {
    count: number;
    balance: string;
    referralBonusBalance: string;
    freePlayBalance: string;
    pendingWithdrawal: string;
    pendingDeposit: string;
    totalDeposited: string;
    totalWithdrawn: string;
  };
  transactions: {
    count: number;
    totalAmount: string;
    byTypeStatus: Record<string, { count: number; amount: string }>;
  };
  topups: {
    count: number;
    amount: string;
    bonusAmount: string;
    feeAmount: string;
    finalWalletCredit: string;
    byStatus: Record<string, { count: number; amount: string }>;
  };
  withdrawals: {
    count: number;
    amount: string;
    fee: string;
    netAmount: string;
    byStatus: Record<string, { count: number; amount: string; netAmount: string }>;
  };
  gameAccounts: {
    count: number;
    balance: string;
    freePlayBalance: string;
  };
  referralAwards: {
    count: number;
    referrerRewardAmount: string;
    refereeRewardAmount: string;
    qualifyingDepositAmount: string;
  };
  wheelSpins: {
    count: number;
    rewardAmount: string;
    simulatedWinAmount: string;
  };
  fakedCashouts: {
    count: number;
    amount: string;
  };
}

export interface SequenceStatusEntry {
  table: string;
  column: string;
  sequenceName: string;
  previousValue: string | null;
  maxColumnValue: string | null;
  advancedTo: string | null;
}

export interface DryRunReport {
  generatedAt: string;
  mode: DataMigrationMode;
  source: {
    env: MigrationEnvironmentKind;
    host: string;
    port: string;
    database: string;
  };
  target: {
    env: MigrationEnvironmentKind;
    host: string;
    port: string;
    database: string;
  };
  readyForHumanReview: boolean;
  passed: boolean;
  discrepancies: string[];
  warnings: string[];
  unmappedObjects: {
    supabaseSchemasAndTables: string[];
    unmappedSourceColumns: Array<{
      table: string;
      column: string;
      nonNullCount: number;
    }>;
    supabaseExtensions: string[];
    supabaseTriggersAndRpcs: string[];
    storageObjectsPendingBackfill: number;
    legacyAuthUsersDetected: number;
    legacyPasswordResetTokensCount: number;
  };
  tableSummaries: TableInspectionSummary[];
  financialReconciliation: {
    source: FinancialAggregateSummary;
    target: FinancialAggregateSummary;
    matched: boolean;
    mismatches: string[];
  };
  sequences: SequenceStatusEntry[];
  checksumLimitations: string[];
}

export interface MigrationCheckpoint {
  runId: string;
  mode: DataMigrationMode;
  startedAt: string;
  updatedAt: string;
  completedTables: CanonicalTableName[];
  currentTable: CanonicalTableName | null;
  lastPk: string | null;
  processedRowsByTable: Partial<Record<CanonicalTableName, number>>;
}

interface SourceSchemaMeta {
  tables: Set<string>;
  authUsersExists: boolean;
  storageObjectsExists: boolean;
  columnsByTable: Map<string, Set<string>>;
  extensions: string[];
  triggers: string[];
  functions: string[];
  policiesCount: number;
}

const KNOWN_TARGET_UNMAPPED_USER_COLS = [
  'registered_payment_method',
  'registered_payment_details',
  'is_parent_admin',
  'promoted_by',
  'promoted_by_name',
  'promoted_at',
  'last_login_at',
  'deleted_at',
] as const;

const KNOWN_TARGET_UNMAPPED_TX_COLS = [
  'fee',
  'net_amount',
  'balance_after',
] as const;

const SUPABASE_RPC_NAMES = [
  'credit_referral_award_atomic',
  'claim_wheel_of_luck_spin',
  'transfer_game_credits_atomic',
  'handle_auth_user_sync',
  'audit_official_partners_changes',
];

const CHECKSUM_LIMITATIONS = [
  'JSON/JSONB key ordering and whitespace differ between text/json dumps; canonical checksums normalize object key order recursively.',
  'TIMESTAMPTZ values are normalized to UTC ISO-8601 strings; equivalent instants with different source session offsets hash identically only after UTC normalization.',
  'public.official_partners.updated_at is overwritten on INSERT by trigger trg_official_partners_updated_at on the target schema, so official_partners content checksum excludes updated_at.',
  'public.notifications."read" is renamed to is_read on target; checksum compares logical boolean state rather than column name.',
  'public.app_config["push_subscriptions"] JSON array is normalized into public.push_subscriptions rows; target checksum validates normalized subscription fields (endpoint, user_id, keys, active).',
  'Supabase auth.users password hashes, salts, confirmation/recovery tokens, and active sessions are intentionally excluded (incompatible with Better Auth scrypt + cookie sessions); ba_user + auth_user_links are verified by user ID/email/verified mapping and password_reset_required=true instead of cryptographic hash equality.',
  'Checksums cannot detect semantic bugs shared identically by both source and target (for example historical double-credits already committed before freeze); financial aggregate & ledger reconciliations are always required alongside row checksums.',
];

async function inspectSchemaMeta(
  db: MigrationQueryable,
): Promise<SourceSchemaMeta> {
  const tablesRes = await db.query<{ table_schema: string; table_name: string }>(
    `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('public', 'auth', 'storage')`,
  );
  const tables = new Set<string>();
  let authUsersExists = false;
  let storageObjectsExists = false;
  for (const row of tablesRes.rows) {
    const schema = String(row.table_schema);
    const name = String(row.table_name);
    if (schema === 'public') {
      tables.add(name);
    } else if (schema === 'auth' && name === 'users') {
      authUsersExists = true;
    } else if (schema === 'storage' && name === 'objects') {
      storageObjectsExists = true;
    }
  }

  const colsRes = await db.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
  );
  const columnsByTable = new Map<string, Set<string>>();
  for (const row of colsRes.rows) {
    const tbl = String(row.table_name);
    const col = String(row.column_name);
    let set = columnsByTable.get(tbl);
    if (!set) {
      set = new Set<string>();
      columnsByTable.set(tbl, set);
    }
    set.add(col);
  }

  const extRes = await db
    .query<{ extname: string }>(`SELECT extname FROM pg_extension`)
    .catch(() => ({ rows: [] as Array<{ extname: string }> }));

  const trigRes = await db
    .query<{ trigger_name: string }>(
      `SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = 'public'`,
    )
    .catch(() => ({ rows: [] as Array<{ trigger_name: string }> }));

  const fnRes = await db
    .query<{ proname: string }>(
      `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
    )
    .catch(() => ({ rows: [] as Array<{ proname: string }> }));

  const polRes = await db
    .query<{ count: string | number }>(
      `SELECT COUNT(*)::int AS count FROM pg_policies WHERE schemaname = 'public'`,
    )
    .catch(() => ({ rows: [{ count: 0 }] }));

  return {
    tables,
    authUsersExists,
    storageObjectsExists,
    columnsByTable,
    extensions: extRes.rows.map((r) => String(r.extname)).sort(),
    triggers: Array.from(
      new Set(trigRes.rows.map((r) => String(r.trigger_name))),
    ).sort(),
    functions: Array.from(
      new Set(fnRes.rows.map((r) => String(r.proname))),
    ).sort(),
    policiesCount: Number(polRes.rows[0]?.count ?? 0),
  };
}

async function fetchAllOrderedBatched(
  db: MigrationQueryable,
  table: string,
  selectCols: string[],
  orderByExpr: string,
  batchSize: number,
  maxRetries: number,
  retryBaseDelayMs: number,
  logger: Logger,
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  let offset = 0;
  const colList = selectCols.join(', ');
  for (;;) {
    const batch = await withDeterministicRetry(
      `select_${table}_offset_${offset}`,
      maxRetries,
      retryBaseDelayMs,
      logger,
      async () => {
        const res = await db.query<Record<string, unknown>>(
          `SELECT ${colList} FROM public.${table} ORDER BY ${orderByExpr} LIMIT $1 OFFSET $2`,
          [batchSize, offset],
        );
        return res.rows;
      },
    );
    rows.push(...batch);
    if (batch.length < batchSize) {
      break;
    }
    offset += batch.length;
  }
  return rows;
}

function deterministicBaUserId(appUserId: string): string {
  const hex = crypto
    .createHash('sha256')
    .update(`swiftsweeps-ba-user:${appUserId}`, 'utf8')
    .digest('hex')
    .slice(0, 24);
  return `ba_imp_${hex}`;
}

function normalizePartnerUpdatedBy(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str.length > 0 ? str : null;
}

function buildCanonicalNotificationRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const rawIsRead =
    row.is_read !== undefined ? row.is_read : row.read;
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: String(row.title),
    message: String(row.message),
    type: String(row.type),
    is_read: Boolean(rawIsRead),
    link_tab: row.link_tab === null || row.link_tab === undefined ? null : String(row.link_tab),
    link_request_id:
      row.link_request_id === null || row.link_request_id === undefined
        ? null
        : String(row.link_request_id),
    created_at: normalizeIsoTimestamp(row.created_at),
  };
}

function buildCanonicalAuditLogRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const actorId = String(row.actor_id ?? row.user_id ?? 'system');
  const actorName = String(row.actor_name ?? row.user_email ?? 'System');
  const rawRole = String(row.actor_role ?? 'customer');
  const actorRole = ['customer', 'agent', 'admin', 'system'].includes(rawRole)
    ? rawRole
    : 'customer';
  const ts =
    normalizeIsoTimestamp(row.timestamp ?? row.created_at) ??
    new Date(0).toISOString();
  return {
    id: String(row.id),
    actor_id: actorId,
    actor_name: actorName,
    actor_role: actorRole,
    action: String(row.action),
    entity_type: String(row.entity_type ?? 'settings'),
    entity_id: String(row.entity_id ?? ''),
    details:
      row.details === null || row.details === undefined
        ? null
        : String(row.details),
    timestamp: ts,
  };
}

function unpackPushSubscriptionsFromAppConfig(
  appConfigRows: Array<Record<string, unknown>>,
  validUserIds: Set<string>,
  warnings: string[],
): Array<Record<string, unknown>> {
  const pushRow = appConfigRows.find((r) => String(r.id) === 'push_subscriptions');
  if (!pushRow || !pushRow.data) {
    return [];
  }

  let parsed = pushRow.data;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      warnings.push('app_config.push_subscriptions contained invalid JSON string.');
      return [];
    }
  }

  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' &&
        parsed !== null &&
        Array.isArray((parsed as { subscriptions?: unknown }).subscriptions)
      ? ((parsed as { subscriptions: unknown[] }).subscriptions)
      : [];

  const dedupedByEndpoint = new Map<string, Record<string, unknown>>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const endpoint = String(entry.endpoint ?? '').trim();
    const userId = String(entry.userId ?? entry.user_id ?? '').trim();
    const keys =
      entry.keys && typeof entry.keys === 'object'
        ? (entry.keys as Record<string, unknown>)
        : {};
    const p256dh = String(entry.p256dh ?? keys.p256dh ?? '').trim();
    const auth = String(entry.auth ?? keys.auth ?? '').trim();

    if (!endpoint.startsWith('https://') || !userId || !p256dh || !auth) {
      warnings.push(
        'Skipped malformed push subscription entry in app_config["push_subscriptions"].',
      );
      continue;
    }
    if (!validUserIds.has(userId)) {
      warnings.push(
        `Skipped orphan push subscription referencing unknown user ${userId}.`,
      );
      continue;
    }

    const rawRole = String(entry.userRole ?? entry.user_role ?? 'customer');
    const userRole =
      rawRole === 'admin' || rawRole === 'agent' || rawRole === 'customer'
        ? rawRole
        : 'customer';
    const rawExp = entry.expirationTime ?? entry.expiration_time;
    const expirationTime =
      rawExp === null || rawExp === undefined || rawExp === ''
        ? null
        : Number(rawExp);

    const createdAt =
      normalizeIsoTimestamp(entry.createdAt ?? entry.created_at) ??
      new Date().toISOString();
    const updatedAt =
      normalizeIsoTimestamp(entry.updatedAt ?? entry.updated_at) ?? createdAt;

    dedupedByEndpoint.set(endpoint, {
      id: hashPushEndpointId(endpoint),
      endpoint,
      user_id: userId,
      user_email:
        entry.userEmail ?? entry.user_email
          ? String(entry.userEmail ?? entry.user_email)
          : null,
      user_role: userRole,
      p256dh,
      auth,
      expiration_time: Number.isFinite(expirationTime) ? expirationTime : null,
      platform: entry.platform ? String(entry.platform) : null,
      browser: entry.browser ? String(entry.browser) : null,
      active: entry.active !== false,
      created_at: createdAt,
      updated_at: updatedAt,
    });
  }

  return Array.from(dedupedByEndpoint.values()).sort((a, b) =>
    String(a.id).localeCompare(String(b.id)),
  );
}

export async function extractCanonicalSourceBundle(
  sourceDb: MigrationQueryable,
  batchSize: number,
  maxRetries: number,
  retryBaseDelayMs: number,
  logger: Logger,
): Promise<{
  bundle: CanonicalRowBundle;
  sourceMeta: SourceSchemaMeta;
  legacyAuthUsersDetected: number;
  storageObjectsPendingBackfill: number;
  legacyPasswordResetTokensCount: number;
  unmappedSourceColumns: Array<{
    table: string;
    column: string;
    nonNullCount: number;
  }>;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const sourceMeta = await inspectSchemaMeta(sourceDb);

  const hasCol = (table: string, col: string) =>
    sourceMeta.columnsByTable.get(table)?.has(col) ?? false;

  const emptyBundle: CanonicalRowBundle = {
    users: [],
    ba_user: [],
    auth_user_links: [],
    app_config: [],
    push_subscriptions: [],
    audit_logs: [],
    game_catalog: [],
    faked_cashouts: [],
    official_partners: [],
    official_partner_icons: [],
    wallets: [],
    game_accounts: [],
    topups: [],
    withdrawals: [],
    transactions: [],
    referral_awards: [],
    wheel_spins: [],
    notifications: [],
    conversations: [],
    messages: [],
    chat_attachments: [],
    storage_objects: [],
  };

  // 1. public.users
  if (sourceMeta.tables.has('users')) {
    const userCols = [
      'id',
      'email',
      'display_name',
      'role',
      'phone',
      'avatar_url',
      'status',
      'email_verified',
      hasCol('users', 'referral_code') ? 'referral_code' : 'NULL::text AS referral_code',
      hasCol('users', 'referred_by') ? 'referred_by' : 'NULL::text AS referred_by',
      hasCol('users', 'signup_ip') ? 'signup_ip' : 'NULL::text AS signup_ip',
      hasCol('users', 'device_fingerprint')
        ? 'device_fingerprint'
        : 'NULL::text AS device_fingerprint',
      'created_at',
      'updated_at',
    ];
    const rawUsers = await fetchAllOrderedBatched(
      sourceDb,
      'users',
      userCols,
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.users = rawUsers.map((r) => ({
      id: String(r.id),
      email: String(r.email).trim().toLowerCase(),
      display_name: String(r.display_name),
      role: String(r.role),
      phone: r.phone === null || r.phone === undefined ? null : String(r.phone),
      avatar_url:
        r.avatar_url === null || r.avatar_url === undefined
          ? null
          : String(r.avatar_url),
      status: String(r.status),
      email_verified: Boolean(r.email_verified),
      referral_code:
        r.referral_code === null || r.referral_code === undefined
          ? null
          : String(r.referral_code),
      referred_by:
        r.referred_by === null || r.referred_by === undefined
          ? null
          : String(r.referred_by),
      signup_ip:
        r.signup_ip === null || r.signup_ip === undefined
          ? null
          : String(r.signup_ip),
      device_fingerprint:
        r.device_fingerprint === null || r.device_fingerprint === undefined
          ? null
          : String(r.device_fingerprint),
      created_at: normalizeIsoTimestamp(r.created_at),
      updated_at: normalizeIsoTimestamp(r.updated_at),
    }));
  }

  // 1b. auth.users metadata ONLY (never password hashes, salts, or session tokens!)
  const legacyAuthByEmail = new Map<
    string,
    { legacyUid: string; emailConfirmed: boolean }
  >();
  let legacyAuthUsersDetected = 0;
  if (sourceMeta.authUsersExists) {
    const authRes = await sourceDb
      .query<{
        id: string;
        email: string | null;
        email_confirmed: boolean;
      }>(
        `SELECT id::text AS id, lower(email) AS email, (email_confirmed_at IS NOT NULL) AS email_confirmed FROM auth.users ORDER BY id ASC`,
      )
      .catch(() => {
        warnings.push(
          'Source auth.users exists but could not be queried with current DB role; legacy_supabase_uid will be left null unless exported with auth read privilege.',
        );
        return { rows: [] as Array<{ id: string; email: string | null; email_confirmed: boolean }> };
      });
    legacyAuthUsersDetected = authRes.rows.length;
    for (const row of authRes.rows) {
      if (row.email) {
        legacyAuthByEmail.set(String(row.email).trim().toLowerCase(), {
          legacyUid: String(row.id),
          emailConfirmed: Boolean(row.email_confirmed),
        });
      }
    }
  }

  // Build deterministic ba_user + auth_user_links from public.users (if source does not already have auth_user_links)
  if (sourceMeta.tables.has('auth_user_links')) {
    const existingLinks = await fetchAllOrderedBatched(
      sourceDb,
      'auth_user_links',
      [
        'app_user_id',
        'auth_user_id',
        'legacy_supabase_uid',
        'email_normalized',
        'migration_source',
        'password_reset_required',
        'linked_at',
        'created_at',
        'updated_at',
      ],
      'app_user_id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.auth_user_links = existingLinks.map((r) => ({
      app_user_id: String(r.app_user_id),
      auth_user_id: r.auth_user_id ? String(r.auth_user_id) : null,
      legacy_supabase_uid: r.legacy_supabase_uid
        ? String(r.legacy_supabase_uid)
        : null,
      email_normalized: String(r.email_normalized).trim().toLowerCase(),
      migration_source: String(r.migration_source),
      password_reset_required: Boolean(r.password_reset_required),
      linked_at: normalizeIsoTimestamp(r.linked_at),
      created_at: normalizeIsoTimestamp(r.created_at),
      updated_at: normalizeIsoTimestamp(r.updated_at),
    }));
  } else {
    emptyBundle.auth_user_links = emptyBundle.users.map((u) => {
      const appUserId = String(u.id);
      const emailNorm = String(u.email).trim().toLowerCase();
      const authUserId = deterministicBaUserId(appUserId);
      const authMeta = legacyAuthByEmail.get(emailNorm);
      const looksUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          appUserId,
        );
      return {
        app_user_id: appUserId,
        auth_user_id: authUserId,
        legacy_supabase_uid:
          authMeta?.legacyUid ?? (looksUuid ? appUserId : null),
        email_normalized: emailNorm,
        migration_source: 'supabase_import',
        password_reset_required: true,
        linked_at: normalizeIsoTimestamp(u.created_at),
        created_at: normalizeIsoTimestamp(u.created_at),
        updated_at: normalizeIsoTimestamp(u.updated_at),
      };
    });
  }

  if (sourceMeta.tables.has('ba_user')) {
    const existingBa = await fetchAllOrderedBatched(
      sourceDb,
      'ba_user',
      ['id', 'name', 'email', '"emailVerified"', 'image', '"createdAt"', '"updatedAt"'],
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.ba_user = existingBa.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      email: String(r.email).trim().toLowerCase(),
      emailVerified: Boolean(r.emailVerified),
      image: r.image ? String(r.image) : null,
      createdAt: normalizeIsoTimestamp(r.createdAt),
      updatedAt: normalizeIsoTimestamp(r.updatedAt),
    }));
  } else {
    const linkByAppId = new Map(
      emptyBundle.auth_user_links.map((l) => [String(l.app_user_id), l]),
    );
    emptyBundle.ba_user = emptyBundle.users.map((u) => {
      const link = linkByAppId.get(String(u.id));
      const emailNorm = String(u.email).trim().toLowerCase();
      const authMeta = legacyAuthByEmail.get(emailNorm);
      return {
        id: String(link?.auth_user_id ?? deterministicBaUserId(String(u.id))),
        name: String(u.display_name),
        email: emailNorm,
        emailVerified: Boolean(u.email_verified) || Boolean(authMeta?.emailConfirmed),
        image: u.avatar_url ?? null,
        createdAt: normalizeIsoTimestamp(u.created_at),
        updatedAt: normalizeIsoTimestamp(u.updated_at),
      };
    });
  }

  // 2. app_config
  if (sourceMeta.tables.has('app_config')) {
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'app_config',
      ['id', 'data', 'updated_at'],
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.app_config = rows.map((r) => ({
      id: String(r.id),
      data: canonicalizeJsonValue(r.data),
      updated_at: normalizeIsoTimestamp(r.updated_at),
    }));
  }

  const validUserIds = new Set(emptyBundle.users.map((u) => String(u.id)));

  // 3. push_subscriptions (canonical table or unpacked from app_config['push_subscriptions'])
  if (sourceMeta.tables.has('push_subscriptions')) {
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'push_subscriptions',
      [
        'id',
        'endpoint',
        'user_id',
        'user_email',
        'user_role',
        'p256dh',
        'auth',
        'expiration_time',
        'platform',
        'browser',
        'active',
        'created_at',
        'updated_at',
      ],
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.push_subscriptions = rows.map((r) => ({
      id: String(r.id),
      endpoint: String(r.endpoint),
      user_id: String(r.user_id),
      user_email: r.user_email ? String(r.user_email) : null,
      user_role: String(r.user_role),
      p256dh: String(r.p256dh),
      auth: String(r.auth),
      expiration_time:
        r.expiration_time === null || r.expiration_time === undefined
          ? null
          : Number(r.expiration_time),
      platform: r.platform ? String(r.platform) : null,
      browser: r.browser ? String(r.browser) : null,
      active: Boolean(r.active),
      created_at: normalizeIsoTimestamp(r.created_at),
      updated_at: normalizeIsoTimestamp(r.updated_at),
    }));
  } else {
    emptyBundle.push_subscriptions = unpackPushSubscriptionsFromAppConfig(
      emptyBundle.app_config,
      validUserIds,
      warnings,
    );
  }

  // 4. audit_logs (supports legacy user_id / user_email / created_at fallback)
  if (sourceMeta.tables.has('audit_logs')) {
    const auditCols = [
      'id',
      hasCol('audit_logs', 'actor_id') ? 'actor_id' : 'NULL::text AS actor_id',
      hasCol('audit_logs', 'actor_name') ? 'actor_name' : 'NULL::text AS actor_name',
      hasCol('audit_logs', 'actor_role') ? 'actor_role' : 'NULL::text AS actor_role',
      'action',
      hasCol('audit_logs', 'entity_type') ? 'entity_type' : 'NULL::text AS entity_type',
      hasCol('audit_logs', 'entity_id') ? 'entity_id' : 'NULL::text AS entity_id',
      hasCol('audit_logs', 'details') ? 'details' : 'NULL::text AS details',
      hasCol('audit_logs', 'timestamp') ? 'timestamp' : 'NULL::timestamptz AS timestamp',
      ...(hasCol('audit_logs', 'user_id') ? ['user_id'] : []),
      ...(hasCol('audit_logs', 'user_email') ? ['user_email'] : []),
      ...(hasCol('audit_logs', 'created_at') ? ['created_at'] : []),
    ];
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'audit_logs',
      auditCols,
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.audit_logs = rows.map(buildCanonicalAuditLogRow);
  }

  // 5. game_catalog
  if (sourceMeta.tables.has('game_catalog')) {
    const cols = [
      'id',
      'title',
      'category',
      'description',
      'min_load',
      'bonus_pct',
      'is_active',
      'icon_url',
      'image_url',
      hasCol('game_catalog', 'game_url') ? 'game_url' : 'NULL::text AS game_url',
      hasCol('game_catalog', 'download_url') ? 'download_url' : 'NULL::text AS download_url',
      hasCol('game_catalog', 'links') ? 'links' : "'[]'::jsonb AS links",
      'created_at',
      hasCol('game_catalog', 'updated_at') ? 'updated_at' : 'created_at AS updated_at',
    ];
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'game_catalog',
      cols,
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.game_catalog = rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      category: String(r.category ?? 'General'),
      description: r.description ? String(r.description) : null,
      min_load: normalizeMoneyString(r.min_load),
      bonus_pct: normalizeMoneyString(r.bonus_pct),
      is_active: Boolean(r.is_active),
      icon_url: r.icon_url ? String(r.icon_url) : null,
      image_url: r.image_url ? String(r.image_url) : null,
      game_url: r.game_url ? String(r.game_url) : null,
      download_url: r.download_url ? String(r.download_url) : null,
      links: canonicalizeJsonValue(r.links ?? []),
      created_at: normalizeIsoTimestamp(r.created_at),
      updated_at: normalizeIsoTimestamp(r.updated_at ?? r.created_at),
    }));
  }

  // 6. faked_cashouts
  if (sourceMeta.tables.has('faked_cashouts')) {
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'faked_cashouts',
      [
        'id',
        'customer_name',
        'amount',
        'currency',
        'method_name',
        'game_name',
        'is_fake',
        'timestamp',
      ],
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.faked_cashouts = rows.map((r) => ({
      id: String(r.id),
      customer_name: String(r.customer_name),
      amount: normalizeMoneyString(r.amount),
      currency: String(r.currency ?? 'USD'),
      method_name: String(r.method_name),
      game_name: String(r.game_name),
      is_fake: Boolean(r.is_fake),
      timestamp: normalizeIsoTimestamp(r.timestamp),
    }));
  }

  // 7. official_partners
  if (sourceMeta.tables.has('official_partners')) {
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'official_partners',
      [
        'id::text AS id',
        'name',
        'icon_url',
        'platform',
        'page_url',
        'message_link',
        'game_id',
        'note',
        'is_visible',
        'sort_order',
        'updated_by',
        'updated_at',
      ],
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.official_partners = rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      icon_url: r.icon_url ? String(r.icon_url) : null,
      platform: String(r.platform),
      page_url: String(r.page_url),
      message_link: r.message_link ? String(r.message_link) : null,
      game_id: r.game_id ? String(r.game_id) : null,
      note: r.note ? String(r.note) : null,
      is_visible: Boolean(r.is_visible),
      sort_order: Number(r.sort_order ?? 0),
      updated_by: normalizePartnerUpdatedBy(r.updated_by),
      updated_at: normalizeIsoTimestamp(r.updated_at),
    }));
  }

  // 8. official_partner_icons
  if (sourceMeta.tables.has('official_partner_icons')) {
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'official_partner_icons',
      ['id', 'content_type', 'image_data', 'size_bytes', 'created_by', 'created_at'],
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.official_partner_icons = rows.map((r) => ({
      id: String(r.id),
      content_type: String(r.content_type),
      image_data: Buffer.isBuffer(r.image_data)
        ? Buffer.from(r.image_data)
        : Buffer.from(String(r.image_data ?? ''), 'base64'),
      size_bytes: Number(r.size_bytes),
      created_by: r.created_by ? String(r.created_by) : null,
      created_at: normalizeIsoTimestamp(r.created_at),
    }));
  }

  // 9. wallets
  if (sourceMeta.tables.has('wallets')) {
    const cols = [
      'customer_id',
      'balance',
      hasCol('wallets', 'referral_bonus_balance')
        ? 'referral_bonus_balance'
        : '0.00::numeric AS referral_bonus_balance',
      hasCol('wallets', 'free_play_balance')
        ? 'free_play_balance'
        : '0.00::numeric AS free_play_balance',
      'pending_withdrawal',
      'pending_deposit',
      'total_deposited',
      'total_withdrawn',
      'currency',
      'updated_at',
    ];
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'wallets',
      cols,
      'customer_id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.wallets = rows.map((r) => ({
      customer_id: String(r.customer_id),
      balance: normalizeMoneyString(r.balance),
      referral_bonus_balance: normalizeMoneyString(r.referral_bonus_balance),
      free_play_balance: normalizeMoneyString(r.free_play_balance),
      pending_withdrawal: normalizeMoneyString(r.pending_withdrawal),
      pending_deposit: normalizeMoneyString(r.pending_deposit),
      total_deposited: normalizeMoneyString(r.total_deposited),
      total_withdrawn: normalizeMoneyString(r.total_withdrawn),
      currency: String(r.currency ?? 'USD'),
      updated_at: normalizeIsoTimestamp(r.updated_at),
    }));
  }

  // 10. game_accounts
  if (sourceMeta.tables.has('game_accounts')) {
    const cols = [
      'id',
      'customer_id',
      'game_id',
      'game_title',
      hasCol('game_accounts', 'platform_name')
        ? 'platform_name'
        : "'Sweepstakes'::text AS platform_name",
      'username',
      'password',
      'pin',
      'status',
      hasCol('game_accounts', 'balance') ? 'balance' : '0.00::numeric AS balance',
      hasCol('game_accounts', 'free_play_balance')
        ? 'free_play_balance'
        : '0.00::numeric AS free_play_balance',
      hasCol('game_accounts', 'request_type')
        ? 'request_type'
        : 'NULL::text AS request_type',
      hasCol('game_accounts', 'assigned_by_agent_id')
        ? 'assigned_by_agent_id'
        : 'NULL::text AS assigned_by_agent_id',
      hasCol('game_accounts', 'assigned_by_agent_name')
        ? 'assigned_by_agent_name'
        : 'NULL::text AS assigned_by_agent_name',
      'created_at',
      'updated_at',
    ];
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'game_accounts',
      cols,
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.game_accounts = rows.map((r) => ({
      id: String(r.id),
      customer_id: String(r.customer_id),
      game_id: String(r.game_id),
      game_title: String(r.game_title),
      platform_name: String(r.platform_name ?? 'Sweepstakes'),
      username: String(r.username),
      password: String(r.password ?? ''),
      pin: r.pin === null || r.pin === undefined ? null : String(r.pin),
      status: String(r.status),
      balance: normalizeMoneyString(r.balance),
      free_play_balance: normalizeMoneyString(r.free_play_balance),
      request_type: r.request_type ? String(r.request_type) : null,
      assigned_by_agent_id: r.assigned_by_agent_id
        ? String(r.assigned_by_agent_id)
        : null,
      assigned_by_agent_name: r.assigned_by_agent_name
        ? String(r.assigned_by_agent_name)
        : null,
      created_at: normalizeIsoTimestamp(r.created_at),
      updated_at: normalizeIsoTimestamp(r.updated_at),
    }));
  }

  // 11. topups
  if (sourceMeta.tables.has('topups')) {
    const cols = [
      'id',
      'customer_id',
      'customer_name',
      'amount',
      hasCol('topups', 'currency') ? 'currency' : "'USD'::text AS currency",
      'bonus_amount',
      hasCol('topups', 'bonus_percentage')
        ? 'bonus_percentage'
        : '0.00::numeric AS bonus_percentage',
      hasCol('topups', 'fee_amount') ? 'fee_amount' : '0.00::numeric AS fee_amount',
      hasCol('topups', 'final_wallet_credit')
        ? 'final_wallet_credit'
        : '(amount + bonus_amount)::numeric AS final_wallet_credit',
      'payment_method_id',
      'payment_method_name',
      'status',
      'proof_url',
      hasCol('topups', 'receipt_name') ? 'receipt_name' : 'NULL::text AS receipt_name',
      'target_game_name',
      'target_game_account_id',
      hasCol('topups', 'target_game_username')
        ? 'target_game_username'
        : 'NULL::text AS target_game_username',
      hasCol('topups', 'funding_source')
        ? 'funding_source'
        : "'payment_method'::text AS funding_source",
      hasCol('topups', 'provider_ref') ? 'provider_ref' : 'NULL::text AS provider_ref',
      'customer_notes',
      hasCol('topups', 'metadata') ? 'metadata' : "'{}'::jsonb AS metadata",
      'reviewer_id',
      'reviewer_name',
      'review_notes',
      'created_at',
      'updated_at',
    ];
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'topups',
      cols,
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.topups = rows.map((r) => ({
      id: String(r.id),
      customer_id: String(r.customer_id),
      customer_name: String(r.customer_name),
      amount: normalizeMoneyString(r.amount),
      currency: String(r.currency ?? 'USD'),
      bonus_amount: normalizeMoneyString(r.bonus_amount),
      bonus_percentage: normalizeMoneyString(r.bonus_percentage),
      fee_amount: normalizeMoneyString(r.fee_amount),
      final_wallet_credit: normalizeMoneyString(r.final_wallet_credit),
      payment_method_id: String(r.payment_method_id),
      payment_method_name: String(r.payment_method_name),
      status: String(r.status),
      proof_url: r.proof_url ? String(r.proof_url) : null,
      receipt_name: r.receipt_name ? String(r.receipt_name) : null,
      target_game_name: r.target_game_name ? String(r.target_game_name) : null,
      target_game_account_id: r.target_game_account_id
        ? String(r.target_game_account_id)
        : null,
      target_game_username: r.target_game_username
        ? String(r.target_game_username)
        : null,
      funding_source: String(r.funding_source ?? 'payment_method'),
      provider_ref: r.provider_ref ? String(r.provider_ref) : null,
      customer_notes: r.customer_notes ? String(r.customer_notes) : null,
      metadata: canonicalizeJsonValue(r.metadata ?? {}),
      reviewer_id: r.reviewer_id ? String(r.reviewer_id) : null,
      reviewer_name: r.reviewer_name ? String(r.reviewer_name) : null,
      review_notes: r.review_notes ? String(r.review_notes) : null,
      created_at: normalizeIsoTimestamp(r.created_at),
      updated_at: normalizeIsoTimestamp(r.updated_at),
    }));
  }

  // 12. withdrawals
  if (sourceMeta.tables.has('withdrawals')) {
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'withdrawals',
      [
        'id',
        'customer_id',
        'customer_name',
        'amount',
        'fee',
        'net_amount',
        'payout_method_id',
        'payout_method_name',
        'payout_details',
        'status',
        'reviewer_id',
        'reviewer_name',
        'review_notes',
        'transaction_hash',
        'created_at',
        'updated_at',
      ],
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.withdrawals = rows.map((r) => ({
      id: String(r.id),
      customer_id: String(r.customer_id),
      customer_name: String(r.customer_name),
      amount: normalizeMoneyString(r.amount),
      fee: normalizeMoneyString(r.fee),
      net_amount: normalizeMoneyString(r.net_amount),
      payout_method_id: String(r.payout_method_id),
      payout_method_name: String(r.payout_method_name),
      payout_details:
        r.payout_details === null || r.payout_details === undefined
          ? null
          : canonicalizeJsonValue(r.payout_details),
      status: String(r.status),
      reviewer_id: r.reviewer_id ? String(r.reviewer_id) : null,
      reviewer_name: r.reviewer_name ? String(r.reviewer_name) : null,
      review_notes: r.review_notes ? String(r.review_notes) : null,
      transaction_hash: r.transaction_hash ? String(r.transaction_hash) : null,
      created_at: normalizeIsoTimestamp(r.created_at),
      updated_at: normalizeIsoTimestamp(r.updated_at),
    }));
  }

  // 13. transactions
  if (sourceMeta.tables.has('transactions')) {
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'transactions',
      [
        'id',
        'customer_id',
        'amount',
        'type',
        'status',
        'description',
        'reference_id',
        'game_name',
        'created_at',
      ],
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.transactions = rows.map((r) => ({
      id: String(r.id),
      customer_id: String(r.customer_id),
      amount: normalizeMoneyString(r.amount),
      type: String(r.type),
      status: String(r.status),
      description: String(r.description),
      reference_id: r.reference_id ? String(r.reference_id) : null,
      game_name: r.game_name ? String(r.game_name) : null,
      created_at: normalizeIsoTimestamp(r.created_at),
    }));
  }

  // 14. referral_awards
  if (sourceMeta.tables.has('referral_awards')) {
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'referral_awards',
      [
        'id',
        'referrer_id',
        'referee_id',
        'referral_code_used',
        'source',
        'reward_mode',
        'payout_target',
        'referrer_reward_amount',
        'referee_reward_amount',
        'qualifying_deposit_id',
        'qualifying_deposit_amount',
        'status',
        'fraud_flags',
        'staff_reason',
        'assigned_by',
        'assigned_by_name',
        'reviewed_by',
        'reviewed_by_name',
        'review_notes',
        'rewarded_at',
        'created_at',
        'updated_at',
      ],
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.referral_awards = rows.map((r) => ({
      id: String(r.id),
      referrer_id: String(r.referrer_id),
      referee_id: String(r.referee_id),
      referral_code_used: String(r.referral_code_used),
      source: String(r.source),
      reward_mode: String(r.reward_mode),
      payout_target: String(r.payout_target),
      referrer_reward_amount: normalizeMoneyString(r.referrer_reward_amount),
      referee_reward_amount: normalizeMoneyString(r.referee_reward_amount),
      qualifying_deposit_id: r.qualifying_deposit_id
        ? String(r.qualifying_deposit_id)
        : null,
      qualifying_deposit_amount: normalizeMoneyString(r.qualifying_deposit_amount),
      status: String(r.status),
      fraud_flags: canonicalizeJsonValue(r.fraud_flags ?? []),
      staff_reason: r.staff_reason ? String(r.staff_reason) : null,
      assigned_by: r.assigned_by ? String(r.assigned_by) : null,
      assigned_by_name: r.assigned_by_name ? String(r.assigned_by_name) : null,
      reviewed_by: r.reviewed_by ? String(r.reviewed_by) : null,
      reviewed_by_name: r.reviewed_by_name ? String(r.reviewed_by_name) : null,
      review_notes: r.review_notes ? String(r.review_notes) : null,
      rewarded_at: normalizeIsoTimestamp(r.rewarded_at),
      created_at: normalizeIsoTimestamp(r.created_at),
      updated_at: normalizeIsoTimestamp(r.updated_at),
    }));
  }

  // 15. wheel_spins
  if (sourceMeta.tables.has('wheel_spins')) {
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'wheel_spins',
      [
        'id',
        'customer_id',
        'segment_id',
        'segment_label',
        'reward_amount',
        'simulated_win_amount',
        'probability_weight',
        'idempotency_key',
        'tx_id',
        'status',
        'created_at',
      ],
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.wheel_spins = rows.map((r) => ({
      id: String(r.id),
      customer_id: String(r.customer_id),
      segment_id: String(r.segment_id),
      segment_label: String(r.segment_label),
      reward_amount: normalizeMoneyString(r.reward_amount),
      simulated_win_amount: normalizeMoneyString(r.simulated_win_amount),
      probability_weight: normalizeMoneyString(r.probability_weight, 4),
      idempotency_key: r.idempotency_key ? String(r.idempotency_key) : null,
      tx_id: r.tx_id ? String(r.tx_id) : null,
      status: String(r.status),
      created_at: normalizeIsoTimestamp(r.created_at),
    }));
  }

  // 16. notifications (reconciles legacy "read" -> is_read)
  if (sourceMeta.tables.has('notifications')) {
    const cols = [
      'id',
      'user_id',
      'title',
      'message',
      'type',
      hasCol('notifications', 'is_read')
        ? 'is_read'
        : hasCol('notifications', 'read')
          ? '"read" AS is_read'
          : 'false AS is_read',
      'link_tab',
      'link_request_id',
      'created_at',
    ];
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'notifications',
      cols,
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.notifications = rows.map(buildCanonicalNotificationRow);
  }

  // 17. conversations
  if (sourceMeta.tables.has('conversations')) {
    const cols = [
      'id',
      'customer_id',
      'customer_name',
      'agent_id',
      'agent_name',
      'status',
      'last_message',
      'last_message_at',
      'created_at',
      hasCol('conversations', 'updated_at')
        ? 'updated_at'
        : 'last_message_at AS updated_at',
    ];
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'conversations',
      cols,
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.conversations = rows.map((r) => ({
      id: String(r.id),
      customer_id: String(r.customer_id),
      customer_name: String(r.customer_name),
      agent_id: r.agent_id ? String(r.agent_id) : null,
      agent_name: r.agent_name ? String(r.agent_name) : null,
      status: String(r.status),
      last_message: String(r.last_message ?? ''),
      last_message_at: normalizeIsoTimestamp(r.last_message_at),
      created_at: normalizeIsoTimestamp(r.created_at),
      updated_at: normalizeIsoTimestamp(r.updated_at ?? r.last_message_at),
    }));
  }

  // 18. messages
  if (sourceMeta.tables.has('messages')) {
    const cols = [
      'id',
      'conversation_id',
      'sender_id',
      'sender_name',
      'sender_role',
      'content',
      'attachment_url',
      'attachment_name',
      'transaction_data',
      hasCol('messages', 'is_internal_note')
        ? 'is_internal_note'
        : 'false AS is_internal_note',
      'created_at',
    ];
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'messages',
      cols,
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.messages = rows.map((r) => ({
      id: String(r.id),
      conversation_id: String(r.conversation_id),
      sender_id: String(r.sender_id),
      sender_name: String(r.sender_name),
      sender_role: String(r.sender_role),
      content: String(r.content ?? ''),
      attachment_url: r.attachment_url ? String(r.attachment_url) : null,
      attachment_name: r.attachment_name ? String(r.attachment_name) : null,
      transaction_data:
        r.transaction_data === null || r.transaction_data === undefined
          ? null
          : canonicalizeJsonValue(r.transaction_data),
      is_internal_note: Boolean(r.is_internal_note),
      created_at: normalizeIsoTimestamp(r.created_at),
    }));
  }

  // 19. chat_attachments
  if (sourceMeta.tables.has('chat_attachments')) {
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'chat_attachments',
      [
        'id',
        'conversation_id',
        'customer_id',
        'uploaded_by',
        'content_type',
        'original_name',
        'image_data',
        'size_bytes',
        'created_at',
      ],
      'id ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.chat_attachments = rows.map((r) => ({
      id: String(r.id),
      conversation_id: String(r.conversation_id),
      customer_id: String(r.customer_id),
      uploaded_by: String(r.uploaded_by),
      content_type: String(r.content_type),
      original_name: r.original_name ? String(r.original_name) : null,
      image_data: Buffer.isBuffer(r.image_data)
        ? Buffer.from(r.image_data)
        : Buffer.from(String(r.image_data ?? ''), 'base64'),
      size_bytes: Number(r.size_bytes),
      created_at: normalizeIsoTimestamp(r.created_at),
    }));
  }

  // 20. storage_objects
  if (sourceMeta.tables.has('storage_objects')) {
    const rows = await fetchAllOrderedBatched(
      sourceDb,
      'storage_objects',
      [
        'bucket',
        'object_path',
        'owner_user_id',
        'uploaded_by',
        'is_public',
        'content_type',
        'image_data',
        'size_bytes',
        'created_at',
        'updated_at',
      ],
      'bucket ASC, object_path ASC',
      batchSize,
      maxRetries,
      retryBaseDelayMs,
      logger,
    );
    emptyBundle.storage_objects = rows.map((r) => ({
      bucket: String(r.bucket),
      object_path: String(r.object_path),
      owner_user_id: r.owner_user_id ? String(r.owner_user_id) : null,
      uploaded_by: String(r.uploaded_by),
      is_public: Boolean(r.is_public),
      content_type: String(r.content_type),
      image_data: Buffer.isBuffer(r.image_data)
        ? Buffer.from(r.image_data)
        : Buffer.from(String(r.image_data ?? ''), 'base64'),
      size_bytes: Number(r.size_bytes),
      created_at: normalizeIsoTimestamp(r.created_at),
      updated_at: normalizeIsoTimestamp(r.updated_at),
    }));
  }

  // Check Supabase storage.objects count (cannot migrate binary payloads over SQL alone)
  let storageObjectsPendingBackfill = 0;
  if (sourceMeta.storageObjectsExists) {
    const storageCountRes = await sourceDb
      .query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count FROM storage.objects WHERE bucket_id IN ('chat_attachments', 'avatars', 'partner-icons')`,
      )
      .catch(() => ({ rows: [{ count: 0 }] }));
    storageObjectsPendingBackfill = Number(storageCountRes.rows[0]?.count ?? 0);
  }

  let legacyPasswordResetTokensCount = 0;
  if (sourceMeta.tables.has('password_reset_tokens')) {
    const prtRes = await sourceDb
      .query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count FROM public.password_reset_tokens`,
      )
      .catch(() => ({ rows: [{ count: 0 }] }));
    legacyPasswordResetTokensCount = Number(prtRes.rows[0]?.count ?? 0);
  }

  // Inspect unmapped code-only source columns
  const unmappedSourceColumns: Array<{
    table: string;
    column: string;
    nonNullCount: number;
  }> = [];

  for (const col of KNOWN_TARGET_UNMAPPED_USER_COLS) {
    if (hasCol('users', col)) {
      const cntRes = await sourceDb
        .query<{ count: string | number }>(
          `SELECT COUNT(*)::int AS count FROM public.users WHERE ${col} IS NOT NULL`,
        )
        .catch(() => ({ rows: [{ count: 0 }] }));
      unmappedSourceColumns.push({
        table: 'users',
        column: col,
        nonNullCount: Number(cntRes.rows[0]?.count ?? 0),
      });
    }
  }

  for (const col of KNOWN_TARGET_UNMAPPED_TX_COLS) {
    if (hasCol('transactions', col)) {
      const cntRes = await sourceDb
        .query<{ count: string | number }>(
          `SELECT COUNT(*)::int AS count FROM public.transactions WHERE ${col} IS NOT NULL`,
        )
        .catch(() => ({ rows: [{ count: 0 }] }));
      unmappedSourceColumns.push({
        table: 'transactions',
        column: col,
        nonNullCount: Number(cntRes.rows[0]?.count ?? 0),
      });
    }
  }

  return {
    bundle: emptyBundle,
    sourceMeta,
    legacyAuthUsersDetected,
    storageObjectsPendingBackfill,
    legacyPasswordResetTokensCount,
    unmappedSourceColumns,
    warnings,
  };
}

export function computeTableChecksum(
  table: CanonicalTableName,
  rows: Array<Record<string, unknown>>,
): string {
  const normalizedRows = rows.map((row) => {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      // Trigger trg_official_partners_updated_at updates updated_at on INSERT
      if (table === 'official_partners' && key === 'updated_at') {
        continue;
      }
      copy[key] = canonicalizeJsonValue(value);
    }
    return copy;
  });

  const sorted = [...normalizedRows].sort((a, b) => {
    const keyA =
      table === 'wallets'
        ? String(a.customer_id)
        : table === 'auth_user_links'
          ? String(a.app_user_id)
          : table === 'storage_objects'
            ? `${String(a.bucket)}::${String(a.object_path)}`
            : String(a.id ?? '');
    const keyB =
      table === 'wallets'
        ? String(b.customer_id)
        : table === 'auth_user_links'
          ? String(b.app_user_id)
          : table === 'storage_objects'
            ? `${String(b.bucket)}::${String(b.object_path)}`
            : String(b.id ?? '');
    return keyA.localeCompare(keyB);
  });

  const hash = crypto.createHash('sha256');
  for (const row of sorted) {
    hash.update(JSON.stringify(row));
    hash.update('\n');
  }
  return hash.digest('hex');
}

function getTimestampBounds(
  rows: Array<Record<string, unknown>>,
  columns: string[],
): { minUtc: string | null; maxUtc: string | null } {
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    for (const col of columns) {
      const iso = normalizeIsoTimestamp(row[col]);
      if (!iso) continue;
      const ms = Date.parse(iso);
      if (Number.isNaN(ms)) continue;
      if (ms < minMs) minMs = ms;
      if (ms > maxMs) maxMs = ms;
    }
  }
  return {
    minUtc: Number.isFinite(minMs) ? new Date(minMs).toISOString() : null,
    maxUtc: Number.isFinite(maxMs) ? new Date(maxMs).toISOString() : null,
  };
}

const TABLE_TIMESTAMP_COLUMNS: Record<CanonicalTableName, string[]> = {
  users: ['created_at', 'updated_at'],
  ba_user: ['createdAt', 'updatedAt'],
  auth_user_links: ['created_at', 'updated_at'],
  app_config: ['updated_at'],
  push_subscriptions: ['created_at', 'updated_at'],
  audit_logs: ['timestamp'],
  game_catalog: ['created_at', 'updated_at'],
  faked_cashouts: ['timestamp'],
  official_partners: [], // updated_at overwritten by trg_official_partners_updated_at on insert
  official_partner_icons: ['created_at'],
  wallets: ['updated_at'],
  game_accounts: ['created_at', 'updated_at'],
  topups: ['created_at', 'updated_at'],
  withdrawals: ['created_at', 'updated_at'],
  transactions: ['created_at'],
  referral_awards: ['created_at', 'updated_at', 'rewarded_at'],
  wheel_spins: ['created_at'],
  notifications: ['created_at'],
  conversations: ['created_at', 'last_message_at'],
  messages: ['created_at'],
  chat_attachments: ['created_at'],
  storage_objects: ['created_at', 'updated_at'],
};

export function computeFinancialAggregates(
  bundle: CanonicalRowBundle,
): FinancialAggregateSummary {
  let wBalance = 0;
  let wRefBonus = 0;
  let wFreePlay = 0;
  let wPendWithdrawal = 0;
  let wPendDeposit = 0;
  let wTotDeposited = 0;
  let wTotWithdrawn = 0;
  for (const w of bundle.wallets) {
    wBalance += toMoneyCents(w.balance);
    wRefBonus += toMoneyCents(w.referral_bonus_balance);
    wFreePlay += toMoneyCents(w.free_play_balance);
    wPendWithdrawal += toMoneyCents(w.pending_withdrawal);
    wPendDeposit += toMoneyCents(w.pending_deposit);
    wTotDeposited += toMoneyCents(w.total_deposited);
    wTotWithdrawn += toMoneyCents(w.total_withdrawn);
  }

  let txTotal = 0;
  const txByTypeStatusRaw = new Map<string, { count: number; cents: number }>();
  for (const tx of bundle.transactions) {
    const cents = toMoneyCents(tx.amount);
    txTotal += cents;
    const key = `${String(tx.type)}:${String(tx.status)}`;
    const prev = txByTypeStatusRaw.get(key) ?? { count: 0, cents: 0 };
    prev.count += 1;
    prev.cents += cents;
    txByTypeStatusRaw.set(key, prev);
  }
  const txByTypeStatus: Record<string, { count: number; amount: string }> = {};
  for (const key of Array.from(txByTypeStatusRaw.keys()).sort()) {
    const entry = txByTypeStatusRaw.get(key)!;
    txByTypeStatus[key] = {
      count: entry.count,
      amount: formatCents(entry.cents),
    };
  }

  let topAmt = 0;
  let topBonus = 0;
  let topFee = 0;
  let topFinal = 0;
  const topByStatusRaw = new Map<string, { count: number; cents: number }>();
  for (const t of bundle.topups) {
    const a = toMoneyCents(t.amount);
    topAmt += a;
    topBonus += toMoneyCents(t.bonus_amount);
    topFee += toMoneyCents(t.fee_amount);
    topFinal += toMoneyCents(t.final_wallet_credit);
    const st = String(t.status);
    const prev = topByStatusRaw.get(st) ?? { count: 0, cents: 0 };
    prev.count += 1;
    prev.cents += a;
    topByStatusRaw.set(st, prev);
  }
  const topByStatus: Record<string, { count: number; amount: string }> = {};
  for (const key of Array.from(topByStatusRaw.keys()).sort()) {
    const entry = topByStatusRaw.get(key)!;
    topByStatus[key] = { count: entry.count, amount: formatCents(entry.cents) };
  }

  let wdAmt = 0;
  let wdFee = 0;
  let wdNet = 0;
  const wdByStatusRaw = new Map<
    string,
    { count: number; cents: number; netCents: number }
  >();
  for (const w of bundle.withdrawals) {
    const a = toMoneyCents(w.amount);
    const f = toMoneyCents(w.fee);
    const n = toMoneyCents(w.net_amount);
    wdAmt += a;
    wdFee += f;
    wdNet += n;
    const st = String(w.status);
    const prev = wdByStatusRaw.get(st) ?? { count: 0, cents: 0, netCents: 0 };
    prev.count += 1;
    prev.cents += a;
    prev.netCents += n;
    wdByStatusRaw.set(st, prev);
  }
  const wdByStatus: Record<
    string,
    { count: number; amount: string; netAmount: string }
  > = {};
  for (const key of Array.from(wdByStatusRaw.keys()).sort()) {
    const entry = wdByStatusRaw.get(key)!;
    wdByStatus[key] = {
      count: entry.count,
      amount: formatCents(entry.cents),
      netAmount: formatCents(entry.netCents),
    };
  }

  let gaBal = 0;
  let gaFree = 0;
  for (const ga of bundle.game_accounts) {
    gaBal += toMoneyCents(ga.balance);
    gaFree += toMoneyCents(ga.free_play_balance);
  }

  let refR = 0;
  let refE = 0;
  let refDep = 0;
  for (const ra of bundle.referral_awards) {
    refR += toMoneyCents(ra.referrer_reward_amount);
    refE += toMoneyCents(ra.referee_reward_amount);
    refDep += toMoneyCents(ra.qualifying_deposit_amount);
  }

  let wsRew = 0;
  let wsSim = 0;
  for (const ws of bundle.wheel_spins) {
    wsRew += toMoneyCents(ws.reward_amount);
    wsSim += toMoneyCents(ws.simulated_win_amount);
  }

  let fcAmt = 0;
  for (const fc of bundle.faked_cashouts) {
    fcAmt += toMoneyCents(fc.amount);
  }

  return {
    wallets: {
      count: bundle.wallets.length,
      balance: formatCents(wBalance),
      referralBonusBalance: formatCents(wRefBonus),
      freePlayBalance: formatCents(wFreePlay),
      pendingWithdrawal: formatCents(wPendWithdrawal),
      pendingDeposit: formatCents(wPendDeposit),
      totalDeposited: formatCents(wTotDeposited),
      totalWithdrawn: formatCents(wTotWithdrawn),
    },
    transactions: {
      count: bundle.transactions.length,
      totalAmount: formatCents(txTotal),
      byTypeStatus: txByTypeStatus,
    },
    topups: {
      count: bundle.topups.length,
      amount: formatCents(topAmt),
      bonusAmount: formatCents(topBonus),
      feeAmount: formatCents(topFee),
      finalWalletCredit: formatCents(topFinal),
      byStatus: topByStatus,
    },
    withdrawals: {
      count: bundle.withdrawals.length,
      amount: formatCents(wdAmt),
      fee: formatCents(wdFee),
      netAmount: formatCents(wdNet),
      byStatus: wdByStatus,
    },
    gameAccounts: {
      count: bundle.game_accounts.length,
      balance: formatCents(gaBal),
      freePlayBalance: formatCents(gaFree),
    },
    referralAwards: {
      count: bundle.referral_awards.length,
      referrerRewardAmount: formatCents(refR),
      refereeRewardAmount: formatCents(refE),
      qualifyingDepositAmount: formatCents(refDep),
    },
    wheelSpins: {
      count: bundle.wheel_spins.length,
      rewardAmount: formatCents(wsRew),
      simulatedWinAmount: formatCents(wsSim),
    },
    fakedCashouts: {
      count: bundle.faked_cashouts.length,
      amount: formatCents(fcAmt),
    },
  };
}

export function validateBundleIntegrity(bundle: CanonicalRowBundle): string[] {
  const issues: string[] = [];
  const userIds = new Set<string>();
  const emails = new Set<string>();
  const referralCodes = new Set<string>();

  for (const u of bundle.users) {
    const id = String(u.id ?? '').trim();
    const email = String(u.email ?? '').trim().toLowerCase();
    if (!id) {
      issues.push('users: found row with empty id.');
      continue;
    }
    if (userIds.has(id)) {
      issues.push(`users: duplicate primary key id detected.`);
    }
    userIds.add(id);

    if (!email) {
      issues.push(`users: user ${id} has empty email.`);
    } else if (emails.has(email)) {
      issues.push(`users: duplicate case-insensitive email detected.`);
    }
    emails.add(email);

    const role = String(u.role);
    if (!['customer', 'agent', 'admin'].includes(role)) {
      issues.push(`users: user ${id} has invalid role "${role}".`);
    }
    const status = String(u.status);
    if (!['active', 'suspended', 'pending'].includes(status)) {
      issues.push(`users: user ${id} has invalid status "${status}".`);
    }
    const refCode = u.referral_code ? String(u.referral_code).trim().toUpperCase() : '';
    if (refCode) {
      if (referralCodes.has(refCode)) {
        issues.push(`users: duplicate referral_code (case-insensitive) detected.`);
      }
      referralCodes.add(refCode);
    }
  }

  for (const w of bundle.wallets) {
    const cid = String(w.customer_id);
    if (!userIds.has(cid)) {
      issues.push(`wallets: orphan wallet for missing customer_id ${cid}.`);
    }
    for (const field of [
      'balance',
      'referral_bonus_balance',
      'free_play_balance',
      'pending_withdrawal',
      'pending_deposit',
      'total_deposited',
      'total_withdrawn',
    ]) {
      if (toMoneyCents(w[field]) < 0) {
        issues.push(`wallets: negative ${field} for customer ${cid}.`);
      }
    }
  }

  for (const tx of bundle.transactions) {
    if (!userIds.has(String(tx.customer_id))) {
      issues.push(`transactions: orphan transaction ${String(tx.id)} missing user.`);
    }
    if (
      !['completed', 'pending', 'processing', 'failed', 'cancelled', 'reversed'].includes(
        String(tx.status),
      )
    ) {
      issues.push(`transactions: invalid status "${String(tx.status)}" on ${String(tx.id)}.`);
    }
  }

  for (const t of bundle.topups) {
    if (!userIds.has(String(t.customer_id))) {
      issues.push(`topups: orphan topup ${String(t.id)} missing user.`);
    }
    if (toMoneyCents(t.amount) < 0 || toMoneyCents(t.bonus_amount) < 0) {
      issues.push(`topups: negative monetary amount on ${String(t.id)}.`);
    }
    if (
      !['pending', 'submitted', 'verifying', 'approved', 'completed', 'rejected', 'cancelled'].includes(
        String(t.status),
      )
    ) {
      issues.push(`topups: invalid status "${String(t.status)}" on ${String(t.id)}.`);
    }
  }

  for (const w of bundle.withdrawals) {
    if (!userIds.has(String(w.customer_id))) {
      issues.push(`withdrawals: orphan withdrawal ${String(w.id)} missing user.`);
    }
    if (
      toMoneyCents(w.amount) <= 0 ||
      toMoneyCents(w.fee) < 0 ||
      toMoneyCents(w.net_amount) < 0
    ) {
      issues.push(`withdrawals: invalid monetary bounds on ${String(w.id)}.`);
    }
  }

  const gaPairs = new Set<string>();
  for (const ga of bundle.game_accounts) {
    const cid = String(ga.customer_id);
    if (!userIds.has(cid)) {
      issues.push(`game_accounts: orphan game_account ${String(ga.id)} missing user.`);
    }
    const pair = `${cid}::${String(ga.game_id)}`;
    if (gaPairs.has(pair)) {
      issues.push(`game_accounts: duplicate (customer_id, game_id) pair for ${cid}.`);
    }
    gaPairs.add(pair);
    if (toMoneyCents(ga.balance) < 0 || toMoneyCents(ga.free_play_balance) < 0) {
      issues.push(`game_accounts: negative balance on ${String(ga.id)}.`);
    }
  }

  const refereeIds = new Set<string>();
  for (const ra of bundle.referral_awards) {
    const rId = String(ra.referrer_id);
    const eId = String(ra.referee_id);
    if (!userIds.has(rId) || !userIds.has(eId)) {
      issues.push(`referral_awards: orphan award ${String(ra.id)} missing user.`);
    }
    if (rId === eId) {
      issues.push(`referral_awards: self-referral detected on ${String(ra.id)}.`);
    }
    if (refereeIds.has(eId)) {
      issues.push(`referral_awards: duplicate referee_id ${eId}.`);
    }
    refereeIds.add(eId);
  }

  const spinKeys = new Set<string>();
  for (const ws of bundle.wheel_spins) {
    const cid = String(ws.customer_id);
    if (!userIds.has(cid)) {
      issues.push(`wheel_spins: orphan spin ${String(ws.id)} missing user.`);
    }
    if (ws.idempotency_key) {
      const key = `${cid}::${String(ws.idempotency_key)}`;
      if (spinKeys.has(key)) {
        issues.push(`wheel_spins: duplicate (customer_id, idempotency_key) for ${cid}.`);
      }
      spinKeys.add(key);
    }
  }

  for (const n of bundle.notifications) {
    if (!userIds.has(String(n.user_id))) {
      issues.push(`notifications: orphan notification ${String(n.id)} missing user.`);
    }
  }

  const convIds = new Set<string>();
  for (const c of bundle.conversations) {
    if (!userIds.has(String(c.customer_id))) {
      issues.push(`conversations: orphan conversation ${String(c.id)} missing user.`);
    }
    convIds.add(String(c.id));
  }

  for (const m of bundle.messages) {
    if (!convIds.has(String(m.conversation_id))) {
      issues.push(`messages: orphan message ${String(m.id)} missing conversation.`);
    }
  }

  for (const ps of bundle.push_subscriptions) {
    if (!userIds.has(String(ps.user_id))) {
      issues.push(`push_subscriptions: orphan subscription ${String(ps.id)} missing user.`);
    }
  }

  return issues;
}

export function compareFinancialAggregates(
  source: FinancialAggregateSummary,
  target: FinancialAggregateSummary,
): string[] {
  const mismatches: string[] = [];

  const cmp = (label: string, a: unknown, b: unknown) => {
    if (a !== b) {
      mismatches.push(`Financial mismatch at ${label}: source=${String(a)}, target=${String(b)}`);
    }
  };

  cmp('wallets.count', source.wallets.count, target.wallets.count);
  cmp('wallets.balance', source.wallets.balance, target.wallets.balance);
  cmp('wallets.referralBonusBalance', source.wallets.referralBonusBalance, target.wallets.referralBonusBalance);
  cmp('wallets.freePlayBalance', source.wallets.freePlayBalance, target.wallets.freePlayBalance);
  cmp('wallets.pendingWithdrawal', source.wallets.pendingWithdrawal, target.wallets.pendingWithdrawal);
  cmp('wallets.pendingDeposit', source.wallets.pendingDeposit, target.wallets.pendingDeposit);
  cmp('wallets.totalDeposited', source.wallets.totalDeposited, target.wallets.totalDeposited);
  cmp('wallets.totalWithdrawn', source.wallets.totalWithdrawn, target.wallets.totalWithdrawn);

  cmp('transactions.count', source.transactions.count, target.transactions.count);
  cmp('transactions.totalAmount', source.transactions.totalAmount, target.transactions.totalAmount);
  const allTxKeys = new Set([
    ...Object.keys(source.transactions.byTypeStatus),
    ...Object.keys(target.transactions.byTypeStatus),
  ]);
  for (const key of Array.from(allTxKeys).sort()) {
    const s = source.transactions.byTypeStatus[key];
    const t = target.transactions.byTypeStatus[key];
    cmp(`transactions.group[${key}].count`, s?.count ?? 0, t?.count ?? 0);
    cmp(`transactions.group[${key}].amount`, s?.amount ?? '0.00', t?.amount ?? '0.00');
  }

  cmp('topups.count', source.topups.count, target.topups.count);
  cmp('topups.amount', source.topups.amount, target.topups.amount);
  cmp('topups.bonusAmount', source.topups.bonusAmount, target.topups.bonusAmount);
  cmp('topups.feeAmount', source.topups.feeAmount, target.topups.feeAmount);
  cmp('topups.finalWalletCredit', source.topups.finalWalletCredit, target.topups.finalWalletCredit);
  const allTopKeys = new Set([
    ...Object.keys(source.topups.byStatus),
    ...Object.keys(target.topups.byStatus),
  ]);
  for (const key of Array.from(allTopKeys).sort()) {
    const s = source.topups.byStatus[key];
    const t = target.topups.byStatus[key];
    cmp(`topups.status[${key}].count`, s?.count ?? 0, t?.count ?? 0);
    cmp(`topups.status[${key}].amount`, s?.amount ?? '0.00', t?.amount ?? '0.00');
  }

  cmp('withdrawals.count', source.withdrawals.count, target.withdrawals.count);
  cmp('withdrawals.amount', source.withdrawals.amount, target.withdrawals.amount);
  cmp('withdrawals.fee', source.withdrawals.fee, target.withdrawals.fee);
  cmp('withdrawals.netAmount', source.withdrawals.netAmount, target.withdrawals.netAmount);
  const allWdKeys = new Set([
    ...Object.keys(source.withdrawals.byStatus),
    ...Object.keys(target.withdrawals.byStatus),
  ]);
  for (const key of Array.from(allWdKeys).sort()) {
    const s = source.withdrawals.byStatus[key];
    const t = target.withdrawals.byStatus[key];
    cmp(`withdrawals.status[${key}].count`, s?.count ?? 0, t?.count ?? 0);
    cmp(`withdrawals.status[${key}].amount`, s?.amount ?? '0.00', t?.amount ?? '0.00');
    cmp(`withdrawals.status[${key}].netAmount`, s?.netAmount ?? '0.00', t?.netAmount ?? '0.00');
  }

  cmp('gameAccounts.count', source.gameAccounts.count, target.gameAccounts.count);
  cmp('gameAccounts.balance', source.gameAccounts.balance, target.gameAccounts.balance);
  cmp('gameAccounts.freePlayBalance', source.gameAccounts.freePlayBalance, target.gameAccounts.freePlayBalance);

  cmp('referralAwards.count', source.referralAwards.count, target.referralAwards.count);
  cmp(
    'referralAwards.referrerRewardAmount',
    source.referralAwards.referrerRewardAmount,
    target.referralAwards.referrerRewardAmount,
  );
  cmp(
    'referralAwards.refereeRewardAmount',
    source.referralAwards.refereeRewardAmount,
    target.referralAwards.refereeRewardAmount,
  );
  cmp(
    'referralAwards.qualifyingDepositAmount',
    source.referralAwards.qualifyingDepositAmount,
    target.referralAwards.qualifyingDepositAmount,
  );

  cmp('wheelSpins.count', source.wheelSpins.count, target.wheelSpins.count);
  cmp('wheelSpins.rewardAmount', source.wheelSpins.rewardAmount, target.wheelSpins.rewardAmount);
  cmp(
    'wheelSpins.simulatedWinAmount',
    source.wheelSpins.simulatedWinAmount,
    target.wheelSpins.simulatedWinAmount,
  );

  cmp('fakedCashouts.count', source.fakedCashouts.count, target.fakedCashouts.count);
  cmp('fakedCashouts.amount', source.fakedCashouts.amount, target.fakedCashouts.amount);

  return mismatches;
}

async function runInClientTransaction<T>(
  db: MigrationQueryable,
  fn: (client: MigrationQueryable) => Promise<T>,
): Promise<T> {
  if (typeof db.connect !== 'function') {
    return fn(db);
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function upsertBatchIntoTarget(
  client: MigrationQueryable,
  table: CanonicalTableName,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  if (rows.length === 0) return;

  switch (table) {
    case 'users': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.users (
            id, email, display_name, role, phone, avatar_url, status, email_verified,
            referral_code, referred_by, signup_ip, device_fingerprint, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            role = EXCLUDED.role,
            phone = EXCLUDED.phone,
            avatar_url = EXCLUDED.avatar_url,
            status = EXCLUDED.status,
            email_verified = EXCLUDED.email_verified,
            referral_code = EXCLUDED.referral_code,
            referred_by = EXCLUDED.referred_by,
            signup_ip = EXCLUDED.signup_ip,
            device_fingerprint = EXCLUDED.device_fingerprint,
            updated_at = EXCLUDED.updated_at
          `,
          [
            r.id,
            r.email,
            r.display_name,
            r.role,
            r.phone,
            r.avatar_url,
            r.status,
            r.email_verified,
            r.referral_code,
            r.referred_by,
            r.signup_ip,
            r.device_fingerprint,
            r.created_at,
            r.updated_at,
          ],
        );
      }
      return;
    }
    case 'ba_user': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.ba_user (
            id, name, email, "emailVerified", image, "createdAt", "updatedAt"
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (email) DO NOTHING
          `,
          [
            r.id,
            r.name,
            r.email,
            r.emailVerified,
            r.image,
            r.createdAt,
            r.updatedAt,
          ],
        );
      }
      return;
    }
    case 'auth_user_links': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.auth_user_links (
            app_user_id, auth_user_id, legacy_supabase_uid, email_normalized,
            migration_source, password_reset_required, linked_at, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (app_user_id) DO UPDATE SET
            auth_user_id = COALESCE(public.auth_user_links.auth_user_id, EXCLUDED.auth_user_id),
            legacy_supabase_uid = COALESCE(public.auth_user_links.legacy_supabase_uid, EXCLUDED.legacy_supabase_uid),
            email_normalized = EXCLUDED.email_normalized,
            updated_at = EXCLUDED.updated_at
          `,
          [
            r.app_user_id,
            r.auth_user_id,
            r.legacy_supabase_uid,
            r.email_normalized,
            r.migration_source,
            r.password_reset_required,
            r.linked_at,
            r.created_at,
            r.updated_at,
          ],
        );
      }
      return;
    }
    case 'app_config': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.app_config (id, data, updated_at)
          VALUES ($1, $2::jsonb, $3)
          ON CONFLICT (id) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
          `,
          [r.id, JSON.stringify(r.data ?? {}), r.updated_at],
        );
      }
      return;
    }
    case 'push_subscriptions': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.push_subscriptions (
            id, endpoint, user_id, user_email, user_role, p256dh, auth,
            expiration_time, platform, browser, active, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (endpoint) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            user_email = EXCLUDED.user_email,
            user_role = EXCLUDED.user_role,
            p256dh = EXCLUDED.p256dh,
            auth = EXCLUDED.auth,
            expiration_time = EXCLUDED.expiration_time,
            platform = EXCLUDED.platform,
            browser = EXCLUDED.browser,
            active = EXCLUDED.active,
            updated_at = EXCLUDED.updated_at
          `,
          [
            r.id,
            r.endpoint,
            r.user_id,
            r.user_email,
            r.user_role,
            r.p256dh,
            r.auth,
            r.expiration_time,
            r.platform,
            r.browser,
            r.active,
            r.created_at,
            r.updated_at,
          ],
        );
      }
      return;
    }
    case 'audit_logs': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.audit_logs (
            id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, timestamp
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING
          `,
          [
            r.id,
            r.actor_id,
            r.actor_name,
            r.actor_role,
            r.action,
            r.entity_type,
            r.entity_id,
            r.details,
            r.timestamp,
          ],
        );
      }
      return;
    }
    case 'game_catalog': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.game_catalog (
            id, title, category, description, min_load, bonus_pct, is_active,
            icon_url, image_url, game_url, download_url, links, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            category = EXCLUDED.category,
            description = EXCLUDED.description,
            min_load = EXCLUDED.min_load,
            bonus_pct = EXCLUDED.bonus_pct,
            is_active = EXCLUDED.is_active,
            icon_url = EXCLUDED.icon_url,
            image_url = EXCLUDED.image_url,
            game_url = EXCLUDED.game_url,
            download_url = EXCLUDED.download_url,
            links = EXCLUDED.links,
            updated_at = EXCLUDED.updated_at
          `,
          [
            r.id,
            r.title,
            r.category,
            r.description,
            r.min_load,
            r.bonus_pct,
            r.is_active,
            r.icon_url,
            r.image_url,
            r.game_url,
            r.download_url,
            JSON.stringify(r.links ?? []),
            r.created_at,
            r.updated_at,
          ],
        );
      }
      return;
    }
    case 'faked_cashouts': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.faked_cashouts (
            id, customer_name, amount, currency, method_name, game_name, is_fake, timestamp
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            customer_name = EXCLUDED.customer_name,
            amount = EXCLUDED.amount,
            currency = EXCLUDED.currency,
            method_name = EXCLUDED.method_name,
            game_name = EXCLUDED.game_name,
            is_fake = EXCLUDED.is_fake,
            timestamp = EXCLUDED.timestamp
          `,
          [
            r.id,
            r.customer_name,
            r.amount,
            r.currency,
            r.method_name,
            r.game_name,
            r.is_fake,
            r.timestamp,
          ],
        );
      }
      return;
    }
    case 'official_partners': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.official_partners (
            id, name, icon_url, platform, page_url, message_link, game_id, note,
            is_visible, sort_order, updated_by, updated_at
          )
          VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            icon_url = EXCLUDED.icon_url,
            platform = EXCLUDED.platform,
            page_url = EXCLUDED.page_url,
            message_link = EXCLUDED.message_link,
            game_id = EXCLUDED.game_id,
            note = EXCLUDED.note,
            is_visible = EXCLUDED.is_visible,
            sort_order = EXCLUDED.sort_order,
            updated_by = EXCLUDED.updated_by
          `,
          [
            r.id,
            r.name,
            r.icon_url,
            r.platform,
            r.page_url,
            r.message_link,
            r.game_id,
            r.note,
            r.is_visible,
            r.sort_order,
            r.updated_by,
            r.updated_at,
          ],
        );
      }
      return;
    }
    case 'official_partner_icons': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.official_partner_icons (
            id, content_type, image_data, size_bytes, created_by, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
            content_type = EXCLUDED.content_type,
            image_data = EXCLUDED.image_data,
            size_bytes = EXCLUDED.size_bytes
          `,
          [
            r.id,
            r.content_type,
            r.image_data,
            r.size_bytes,
            r.created_by,
            r.created_at,
          ],
        );
      }
      return;
    }
    case 'wallets': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.wallets (
            customer_id, balance, referral_bonus_balance, free_play_balance,
            pending_withdrawal, pending_deposit, total_deposited, total_withdrawn,
            currency, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (customer_id) DO UPDATE SET
            balance = EXCLUDED.balance,
            referral_bonus_balance = EXCLUDED.referral_bonus_balance,
            free_play_balance = EXCLUDED.free_play_balance,
            pending_withdrawal = EXCLUDED.pending_withdrawal,
            pending_deposit = EXCLUDED.pending_deposit,
            total_deposited = EXCLUDED.total_deposited,
            total_withdrawn = EXCLUDED.total_withdrawn,
            currency = EXCLUDED.currency,
            updated_at = EXCLUDED.updated_at
          `,
          [
            r.customer_id,
            r.balance,
            r.referral_bonus_balance,
            r.free_play_balance,
            r.pending_withdrawal,
            r.pending_deposit,
            r.total_deposited,
            r.total_withdrawn,
            r.currency,
            r.updated_at,
          ],
        );
      }
      return;
    }
    case 'game_accounts': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.game_accounts (
            id, customer_id, game_id, game_title, platform_name, username, password,
            pin, status, balance, free_play_balance, request_type,
            assigned_by_agent_id, assigned_by_agent_name, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO UPDATE SET
            game_title = EXCLUDED.game_title,
            platform_name = EXCLUDED.platform_name,
            username = EXCLUDED.username,
            password = EXCLUDED.password,
            pin = EXCLUDED.pin,
            status = EXCLUDED.status,
            balance = EXCLUDED.balance,
            free_play_balance = EXCLUDED.free_play_balance,
            request_type = EXCLUDED.request_type,
            assigned_by_agent_id = EXCLUDED.assigned_by_agent_id,
            assigned_by_agent_name = EXCLUDED.assigned_by_agent_name,
            updated_at = EXCLUDED.updated_at
          `,
          [
            r.id,
            r.customer_id,
            r.game_id,
            r.game_title,
            r.platform_name,
            r.username,
            r.password,
            r.pin,
            r.status,
            r.balance,
            r.free_play_balance,
            r.request_type,
            r.assigned_by_agent_id,
            r.assigned_by_agent_name,
            r.created_at,
            r.updated_at,
          ],
        );
      }
      return;
    }
    case 'topups': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.topups (
            id, customer_id, customer_name, amount, currency, bonus_amount,
            bonus_percentage, fee_amount, final_wallet_credit, payment_method_id,
            payment_method_name, status, proof_url, receipt_name, target_game_name,
            target_game_account_id, target_game_username, funding_source, provider_ref,
            customer_notes, metadata, reviewer_id, reviewer_name, review_notes,
            created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21::jsonb, $22, $23, $24, $25, $26
          )
          ON CONFLICT (id) DO UPDATE SET
            amount = EXCLUDED.amount,
            currency = EXCLUDED.currency,
            bonus_amount = EXCLUDED.bonus_amount,
            bonus_percentage = EXCLUDED.bonus_percentage,
            fee_amount = EXCLUDED.fee_amount,
            final_wallet_credit = EXCLUDED.final_wallet_credit,
            status = EXCLUDED.status,
            proof_url = EXCLUDED.proof_url,
            receipt_name = EXCLUDED.receipt_name,
            metadata = EXCLUDED.metadata,
            reviewer_id = EXCLUDED.reviewer_id,
            reviewer_name = EXCLUDED.reviewer_name,
            review_notes = EXCLUDED.review_notes,
            updated_at = EXCLUDED.updated_at
          `,
          [
            r.id,
            r.customer_id,
            r.customer_name,
            r.amount,
            r.currency,
            r.bonus_amount,
            r.bonus_percentage,
            r.fee_amount,
            r.final_wallet_credit,
            r.payment_method_id,
            r.payment_method_name,
            r.status,
            r.proof_url,
            r.receipt_name,
            r.target_game_name,
            r.target_game_account_id,
            r.target_game_username,
            r.funding_source,
            r.provider_ref,
            r.customer_notes,
            JSON.stringify(r.metadata ?? {}),
            r.reviewer_id,
            r.reviewer_name,
            r.review_notes,
            r.created_at,
            r.updated_at,
          ],
        );
      }
      return;
    }
    case 'withdrawals': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.withdrawals (
            id, customer_id, customer_name, amount, fee, net_amount,
            payout_method_id, payout_method_name, payout_details, status,
            reviewer_id, reviewer_name, review_notes, transaction_hash,
            created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO UPDATE SET
            amount = EXCLUDED.amount,
            fee = EXCLUDED.fee,
            net_amount = EXCLUDED.net_amount,
            payout_details = EXCLUDED.payout_details,
            status = EXCLUDED.status,
            reviewer_id = EXCLUDED.reviewer_id,
            reviewer_name = EXCLUDED.reviewer_name,
            review_notes = EXCLUDED.review_notes,
            transaction_hash = EXCLUDED.transaction_hash,
            updated_at = EXCLUDED.updated_at
          `,
          [
            r.id,
            r.customer_id,
            r.customer_name,
            r.amount,
            r.fee,
            r.net_amount,
            r.payout_method_id,
            r.payout_method_name,
            r.payout_details === null ? null : JSON.stringify(r.payout_details),
            r.status,
            r.reviewer_id,
            r.reviewer_name,
            r.review_notes,
            r.transaction_hash,
            r.created_at,
            r.updated_at,
          ],
        );
      }
      return;
    }
    case 'transactions': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.transactions (
            id, customer_id, amount, type, status, description, reference_id, game_name, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING
          `,
          [
            r.id,
            r.customer_id,
            r.amount,
            r.type,
            r.status,
            r.description,
            r.reference_id,
            r.game_name,
            r.created_at,
          ],
        );
      }
      return;
    }
    case 'referral_awards': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.referral_awards (
            id, referrer_id, referee_id, referral_code_used, source, reward_mode,
            payout_target, referrer_reward_amount, referee_reward_amount,
            qualifying_deposit_id, qualifying_deposit_amount, status, fraud_flags,
            staff_reason, assigned_by, assigned_by_name, reviewed_by, reviewed_by_name,
            review_notes, rewarded_at, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            $13::jsonb, $14, $15, $16, $17, $18, $19, $20, $21, $22
          )
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            referrer_reward_amount = EXCLUDED.referrer_reward_amount,
            referee_reward_amount = EXCLUDED.referee_reward_amount,
            qualifying_deposit_id = EXCLUDED.qualifying_deposit_id,
            qualifying_deposit_amount = EXCLUDED.qualifying_deposit_amount,
            fraud_flags = EXCLUDED.fraud_flags,
            reviewed_by = EXCLUDED.reviewed_by,
            reviewed_by_name = EXCLUDED.reviewed_by_name,
            review_notes = EXCLUDED.review_notes,
            rewarded_at = EXCLUDED.rewarded_at,
            updated_at = EXCLUDED.updated_at
          `,
          [
            r.id,
            r.referrer_id,
            r.referee_id,
            r.referral_code_used,
            r.source,
            r.reward_mode,
            r.payout_target,
            r.referrer_reward_amount,
            r.referee_reward_amount,
            r.qualifying_deposit_id,
            r.qualifying_deposit_amount,
            r.status,
            JSON.stringify(r.fraud_flags ?? []),
            r.staff_reason,
            r.assigned_by,
            r.assigned_by_name,
            r.reviewed_by,
            r.reviewed_by_name,
            r.review_notes,
            r.rewarded_at,
            r.created_at,
            r.updated_at,
          ],
        );
      }
      return;
    }
    case 'wheel_spins': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.wheel_spins (
            id, customer_id, segment_id, segment_label, reward_amount,
            simulated_win_amount, probability_weight, idempotency_key, tx_id, status, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO NOTHING
          `,
          [
            r.id,
            r.customer_id,
            r.segment_id,
            r.segment_label,
            r.reward_amount,
            r.simulated_win_amount,
            r.probability_weight,
            r.idempotency_key,
            r.tx_id,
            r.status,
            r.created_at,
          ],
        );
      }
      return;
    }
    case 'notifications': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.notifications (
            id, user_id, title, message, type, is_read, link_tab, link_request_id, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            is_read = EXCLUDED.is_read
          `,
          [
            r.id,
            r.user_id,
            r.title,
            r.message,
            r.type,
            r.is_read,
            r.link_tab,
            r.link_request_id,
            r.created_at,
          ],
        );
      }
      return;
    }
    case 'conversations': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.conversations (
            id, customer_id, customer_name, agent_id, agent_name, status,
            last_message, last_message_at, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            agent_id = EXCLUDED.agent_id,
            agent_name = EXCLUDED.agent_name,
            status = EXCLUDED.status,
            last_message = EXCLUDED.last_message,
            last_message_at = EXCLUDED.last_message_at,
            updated_at = EXCLUDED.updated_at
          `,
          [
            r.id,
            r.customer_id,
            r.customer_name,
            r.agent_id,
            r.agent_name,
            r.status,
            r.last_message,
            r.last_message_at,
            r.created_at,
            r.updated_at,
          ],
        );
      }
      return;
    }
    case 'messages': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.messages (
            id, conversation_id, sender_id, sender_name, sender_role, content,
            attachment_url, attachment_name, transaction_data, is_internal_note, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
          ON CONFLICT (id) DO NOTHING
          `,
          [
            r.id,
            r.conversation_id,
            r.sender_id,
            r.sender_name,
            r.sender_role,
            r.content,
            r.attachment_url,
            r.attachment_name,
            r.transaction_data === null ? null : JSON.stringify(r.transaction_data),
            r.is_internal_note,
            r.created_at,
          ],
        );
      }
      return;
    }
    case 'chat_attachments': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.chat_attachments (
            id, conversation_id, customer_id, uploaded_by, content_type,
            original_name, image_data, size_bytes, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING
          `,
          [
            r.id,
            r.conversation_id,
            r.customer_id,
            r.uploaded_by,
            r.content_type,
            r.original_name,
            r.image_data,
            r.size_bytes,
            r.created_at,
          ],
        );
      }
      return;
    }
    case 'storage_objects': {
      for (const r of rows) {
        await client.query(
          `
          INSERT INTO public.storage_objects (
            bucket, object_path, owner_user_id, uploaded_by, is_public,
            content_type, image_data, size_bytes, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (bucket, object_path) DO UPDATE SET
            owner_user_id = EXCLUDED.owner_user_id,
            is_public = EXCLUDED.is_public,
            content_type = EXCLUDED.content_type,
            image_data = EXCLUDED.image_data,
            size_bytes = EXCLUDED.size_bytes,
            updated_at = EXCLUDED.updated_at
          `,
          [
            r.bucket,
            r.object_path,
            r.owner_user_id,
            r.uploaded_by,
            r.is_public,
            r.content_type,
            r.image_data,
            r.size_bytes,
            r.created_at,
            r.updated_at,
          ],
        );
      }
      return;
    }
  }
}

export async function advanceTargetSequences(
  targetDb: MigrationQueryable,
  options: { readOnly?: boolean } = {},
): Promise<SequenceStatusEntry[]> {
  const seqColsRes = await targetDb
    .query<{
      table_name: string;
      column_name: string;
      sequence_name: string | null;
    }>(
      `
      SELECT
        c.table_name,
        c.column_name,
        pg_get_serial_sequence('public.' || quote_ident(c.table_name), c.column_name) AS sequence_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND (c.is_identity = 'YES' OR c.column_default LIKE 'nextval%')
      ORDER BY c.table_name ASC, c.column_name ASC
      `,
    )
    .catch(() => ({
      rows: [] as Array<{
        table_name: string;
        column_name: string;
        sequence_name: string | null;
      }>,
    }));

  const entries: SequenceStatusEntry[] = [];
  for (const row of seqColsRes.rows) {
    if (!row.sequence_name) continue;
    const tableName = String(row.table_name);
    const colName = String(row.column_name);
    const seqName = String(row.sequence_name);

    // Restrict identifier characters strictly
    if (
      !/^[a-zA-Z0-9_]+$/.test(tableName) ||
      !/^[a-zA-Z0-9_]+$/.test(colName)
    ) {
      continue;
    }

    const maxRes = await targetDb.query<{ max_val: string | number | null }>(
      `SELECT MAX(${colName})::text AS max_val FROM public.${tableName}`,
    );
    const maxValStr =
      maxRes.rows[0]?.max_val !== null && maxRes.rows[0]?.max_val !== undefined
        ? String(maxRes.rows[0].max_val)
        : null;

    const prevRes = await targetDb
      .query<{ last_value: string | number }>(
        `SELECT last_value::text AS last_value FROM ${seqName}`,
      )
      .catch(() => ({ rows: [] as Array<{ last_value: string | number }> }));
    const prevVal =
      prevRes.rows[0]?.last_value !== undefined
        ? String(prevRes.rows[0].last_value)
        : null;

    let advancedTo: string | null = prevVal;
    if (!options.readOnly && maxValStr !== null) {
      const nextNum = BigInt(maxValStr);
      const prevNum = prevVal !== null ? BigInt(prevVal) : 0n;
      const targetVal = nextNum > prevNum ? nextNum : prevNum;
      await targetDb.query(
        `SELECT setval($1::regclass, $2::bigint, true)`,
        [seqName, targetVal.toString()],
      );
      advancedTo = targetVal.toString();
    }

    entries.push({
      table: tableName,
      column: colName,
      sequenceName: seqName,
      previousValue: prevVal,
      maxColumnValue: maxValStr,
      advancedTo,
    });
  }

  return entries;
}

export async function validateSourceVsTarget(
  sourceExtraction: Awaited<ReturnType<typeof extractCanonicalSourceBundle>>,
  targetDb: MigrationQueryable,
  config: Pick<
    DataMigrationConfig,
    'mode' | 'sourceEnv' | 'targetEnv' | 'sourceDatabaseUrl' | 'targetDatabaseUrl' | 'batchSize' | 'maxRetries' | 'retryBaseDelayMs'
  >,
  logger: Logger,
  sequences: SequenceStatusEntry[] = [],
): Promise<DryRunReport> {
  const discrepancies: string[] = [];
  const warnings = [...sourceExtraction.warnings];
  const targetExtraction = await extractCanonicalSourceBundle(
    targetDb,
    config.batchSize,
    config.maxRetries,
    config.retryBaseDelayMs,
    logger,
  );

  // Validate source integrity itself before migration / during reconciliation
  const sourceIntegrityIssues = validateBundleIntegrity(sourceExtraction.bundle);
  for (const issue of sourceIntegrityIssues) {
    discrepancies.push(`[Source Integrity] ${issue}`);
  }

  if (config.mode !== 'preflight') {
    const targetIntegrityIssues = validateBundleIntegrity(targetExtraction.bundle);
    for (const issue of targetIntegrityIssues) {
      discrepancies.push(`[Target Integrity] ${issue}`);
    }
  }

  // Check target schema prerequisites
  const requiredTargetTables: CanonicalTableName[] = [
    'users',
    'auth_user_links',
    'ba_user',
    'app_config',
    'push_subscriptions',
    'audit_logs',
    'game_catalog',
    'faked_cashouts',
    'official_partners',
    'official_partner_icons',
    'wallets',
    'game_accounts',
    'topups',
    'withdrawals',
    'transactions',
    'referral_awards',
    'wheel_spins',
    'notifications',
    'conversations',
    'messages',
    'chat_attachments',
    'storage_objects',
  ];
  for (const tbl of requiredTargetTables) {
    if (!targetExtraction.sourceMeta.tables.has(tbl)) {
      discrepancies.push(
        `Target schema is missing required table public.${tbl}. Run db:migrate:up and auth:migrate:up first.`,
      );
    }
  }

  const tableSummaries: TableInspectionSummary[] = [];
  for (const tbl of CANONICAL_IMPORT_ORDER) {
    const srcRows = sourceExtraction.bundle[tbl];
    const tgtRows = targetExtraction.bundle[tbl];
    const srcChecksum = computeTableChecksum(tbl, srcRows);
    const tgtChecksum =
      targetExtraction.sourceMeta.tables.has(tbl)
        ? computeTableChecksum(tbl, tgtRows)
        : null;
    const srcBounds = getTimestampBounds(srcRows, TABLE_TIMESTAMP_COLUMNS[tbl]);
    const tgtBounds = getTimestampBounds(tgtRows, TABLE_TIMESTAMP_COLUMNS[tbl]);
    const notes: string[] = [];

    if (tbl === 'official_partners') {
      notes.push(
        'updated_at excluded from canonical checksum because trg_official_partners_updated_at updates updated_at on insert.',
      );
    }
    if (tbl === 'ba_user' || tbl === 'auth_user_links') {
      notes.push(
        'Identity link only: Supabase password hashes and session tokens are excluded; password_reset_required=true enforced.',
      );
    }

    let checksumMatched: boolean | null = null;
    if (config.mode !== 'preflight') {
      checksumMatched =
        tgtChecksum !== null &&
        srcRows.length === tgtRows.length &&
        srcChecksum === tgtChecksum;

      if (srcRows.length !== tgtRows.length) {
        discrepancies.push(
          `Row count mismatch on public.${tbl}: source=${srcRows.length}, target=${tgtRows.length}.`,
        );
      } else if (!checksumMatched) {
        discrepancies.push(
          `Canonical checksum mismatch on public.${tbl} (rows=${srcRows.length}).`,
        );
      }

      if (
        TABLE_TIMESTAMP_COLUMNS[tbl].length > 0 &&
        (srcBounds.minUtc !== tgtBounds.minUtc ||
          srcBounds.maxUtc !== tgtBounds.maxUtc)
      ) {
        discrepancies.push(
          `Timestamp range mismatch on public.${tbl}: source=[${srcBounds.minUtc}, ${srcBounds.maxUtc}] vs target=[${tgtBounds.minUtc}, ${tgtBounds.maxUtc}].`,
        );
      }
    }

    tableSummaries.push({
      table: tbl,
      sourceExists: sourceExtraction.sourceMeta.tables.has(tbl),
      targetExists: targetExtraction.sourceMeta.tables.has(tbl),
      sourceRows: srcRows.length,
      targetRows: tgtRows.length,
      checksumMatched,
      sourceChecksumSha256: srcChecksum,
      targetChecksumSha256: tgtChecksum,
      minTimestampUtc: srcBounds.minUtc,
      maxTimestampUtc: srcBounds.maxUtc,
      targetMinTimestampUtc: tgtBounds.minUtc,
      targetMaxTimestampUtc: tgtBounds.maxUtc,
      notes,
    });
  }

  const srcFin = computeFinancialAggregates(sourceExtraction.bundle);
  const tgtFin = computeFinancialAggregates(targetExtraction.bundle);
  const finMismatches =
    config.mode === 'preflight'
      ? []
      : compareFinancialAggregates(srcFin, tgtFin);
  for (const m of finMismatches) {
    discrepancies.push(m);
  }

  // Flag unmapped non-null source columns as warning/attention item
  for (const colInfo of sourceExtraction.unmappedSourceColumns) {
    if (colInfo.nonNullCount > 0) {
      warnings.push(
        `Source public.${colInfo.table}.${colInfo.column} has ${colInfo.nonNullCount} non-null rows not mapped in target schema.`,
      );
    }
  }

  if (sourceExtraction.storageObjectsPendingBackfill > 0) {
    warnings.push(
      `Supabase storage.objects contains ${sourceExtraction.storageObjectsPendingBackfill} object metadata rows whose binary blobs require Storage API backfill into public.storage_objects.`,
    );
  }

  if (sourceExtraction.legacyPasswordResetTokensCount > 0) {
    warnings.push(
      `Source public.password_reset_tokens contains ${sourceExtraction.legacyPasswordResetTokensCount} legacy rows intentionally excluded (Better Auth owns ba_verification).`,
    );
  }

  const supabaseSchemasAndTables: string[] = [];
  if (sourceExtraction.sourceMeta.authUsersExists) {
    supabaseSchemasAndTables.push(
      'auth.users / auth.sessions (hashes/sessions excluded; identities mapped to ba_user + auth_user_links)',
    );
  }
  if (sourceExtraction.sourceMeta.storageObjectsExists) {
    supabaseSchemasAndTables.push(
      'storage.objects / storage.buckets (binary assets require separate object-storage backfill to public.storage_objects)',
    );
  }
  if (sourceExtraction.sourceMeta.tables.has('password_reset_tokens')) {
    supabaseSchemasAndTables.push(
      'public.password_reset_tokens (retired legacy table; excluded)',
    );
  }
  if (sourceExtraction.sourceMeta.policiesCount > 0) {
    supabaseSchemasAndTables.push(
      `${sourceExtraction.sourceMeta.policiesCount} RLS pg_policies (replaced by Node API RBAC)`,
    );
  }

  const supabaseTriggersAndRpcs = [
    ...sourceExtraction.sourceMeta.triggers.map((t) => `trigger:${t}`),
    ...sourceExtraction.sourceMeta.functions
      .filter((fn) => SUPABASE_RPC_NAMES.includes(fn))
      .map((fn) => `function:${fn}`),
  ];

  const srcId = sanitizeConnectionIdentity(config.sourceDatabaseUrl);
  const tgtId = sanitizeConnectionIdentity(config.targetDatabaseUrl);
  const passed = discrepancies.length === 0;

  return {
    generatedAt: new Date().toISOString(),
    mode: config.mode,
    source: { env: config.sourceEnv, ...srcId },
    target: { env: config.targetEnv, ...tgtId },
    readyForHumanReview: passed,
    passed,
    discrepancies,
    warnings,
    unmappedObjects: {
      supabaseSchemasAndTables,
      unmappedSourceColumns: sourceExtraction.unmappedSourceColumns,
      supabaseExtensions: sourceExtraction.sourceMeta.extensions,
      supabaseTriggersAndRpcs,
      storageObjectsPendingBackfill:
        sourceExtraction.storageObjectsPendingBackfill,
      legacyAuthUsersDetected: sourceExtraction.legacyAuthUsersDetected,
      legacyPasswordResetTokensCount:
        sourceExtraction.legacyPasswordResetTokensCount,
    },
    tableSummaries,
    financialReconciliation: {
      source: srcFin,
      target: tgtFin,
      matched: finMismatches.length === 0,
      mismatches: finMismatches,
    },
    sequences,
    checksumLimitations: CHECKSUM_LIMITATIONS,
  };
}

function serializeBundleForDisk(bundle: CanonicalRowBundle): string {
  const serialized: Record<string, unknown[]> = {};
  for (const tbl of CANONICAL_IMPORT_ORDER) {
    serialized[tbl] = bundle[tbl].map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (Buffer.isBuffer(v)) {
          out[k] = { __binaryBase64: v.toString('base64') };
        } else {
          out[k] = v;
        }
      }
      return out;
    });
  }
  return JSON.stringify(serialized, null, 2);
}

function deserializeBundleFromDisk(rawJson: string): CanonicalRowBundle {
  const parsed = JSON.parse(rawJson) as Record<string, Array<Record<string, unknown>>>;
  const out = {} as CanonicalRowBundle;
  for (const tbl of CANONICAL_IMPORT_ORDER) {
    const rows = Array.isArray(parsed[tbl]) ? parsed[tbl]! : [];
    out[tbl] = rows.map((row) => {
      const revived: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (
          v &&
          typeof v === 'object' &&
          !Array.isArray(v) &&
          typeof (v as { __binaryBase64?: unknown }).__binaryBase64 === 'string'
        ) {
          revived[k] = Buffer.from(
            (v as { __binaryBase64: string }).__binaryBase64,
            'base64',
          );
        } else {
          revived[k] = v;
        }
      }
      return revived;
    });
  }
  return out;
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.rename(tmp, filePath);
}

export async function runExportSnapshot(options: {
  sourceDb: MigrationQueryable;
  config: DataMigrationConfig;
  logger: Logger;
  exportDir: string;
}): Promise<{
  snapshotPath: string;
  manifestPath: string;
  rowCounts: Record<CanonicalTableName, number>;
}> {
  const extraction = await runInSnapshotReadOnly(options.sourceDb, () =>
    extractCanonicalSourceBundle(
      options.sourceDb,
      options.config.batchSize,
      options.config.maxRetries,
      options.config.retryBaseDelayMs,
      options.logger,
    ),
  );

  const issues = validateBundleIntegrity(extraction.bundle);
  if (issues.length > 0) {
    throw new DataMigrationIntegrityError(
      `Source snapshot integrity check failed with ${issues.length} discrepancy(ies).`,
      issues,
    );
  }

  await fs.mkdir(options.exportDir, { recursive: true });
  const snapshotPath = path.join(options.exportDir, 'snapshot-data.json');
  const manifestPath = path.join(options.exportDir, 'snapshot-manifest.json');

  const rawBundle = serializeBundleForDisk(extraction.bundle);
  const bundleSha256 = crypto
    .createHash('sha256')
    .update(rawBundle, 'utf8')
    .digest('hex');

  const rowCounts = {} as Record<CanonicalTableName, number>;
  const tableChecksums = {} as Record<CanonicalTableName, string>;
  for (const tbl of CANONICAL_IMPORT_ORDER) {
    rowCounts[tbl] = extraction.bundle[tbl].length;
    tableChecksums[tbl] = computeTableChecksum(tbl, extraction.bundle[tbl]);
  }

  const tmpSnapshot = `${snapshotPath}.${process.pid}.tmp`;
  await fs.writeFile(tmpSnapshot, rawBundle, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmpSnapshot, snapshotPath);

  await writeJsonAtomic(manifestPath, {
    exportedAt: new Date().toISOString(),
    source: {
      env: options.config.sourceEnv,
      ...sanitizeConnectionIdentity(options.config.sourceDatabaseUrl),
    },
    bundleSha256,
    rowCounts,
    tableChecksums,
    financialSummary: computeFinancialAggregates(extraction.bundle),
    legacyAuthUsersDetected: extraction.legacyAuthUsersDetected,
    storageObjectsPendingBackfill: extraction.storageObjectsPendingBackfill,
    warnings: extraction.warnings,
    securityNote:
      'Contains game_accounts credentials; restrict permissions to 0600 and shred securely after cutover. Supabase Auth password hashes and session tokens are excluded.',
  });

  options.logger.info('data_migration_export_completed', {
    sourceEnv: options.config.sourceEnv,
    rowCounts,
    bundleSha256,
  });

  return { snapshotPath, manifestPath, rowCounts };
}

async function runInSnapshotReadOnly<T>(
  db: MigrationQueryable,
  fn: () => Promise<T>,
): Promise<T> {
  if (typeof db.connect !== 'function') {
    return fn();
  }
  const client = await db.connect();
  try {
    await client.query(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function runDataMigrationImport(options: {
  sourceDb: MigrationQueryable;
  targetDb: MigrationQueryable;
  config: DataMigrationConfig;
  logger: Logger;
  snapshotDir?: string;
}): Promise<DryRunReport> {
  const { sourceDb, targetDb, config, logger } = options;

  let extraction: Awaited<ReturnType<typeof extractCanonicalSourceBundle>>;
  if (options.snapshotDir) {
    const manifestRaw = await fs.readFile(
      path.join(options.snapshotDir, 'snapshot-manifest.json'),
      'utf8',
    );
    const manifest = JSON.parse(manifestRaw) as { bundleSha256: string };
    const snapRaw = await fs.readFile(
      path.join(options.snapshotDir, 'snapshot-data.json'),
      'utf8',
    );
    const actualSha = crypto
      .createHash('sha256')
      .update(snapRaw, 'utf8')
      .digest('hex');
    if (actualSha !== manifest.bundleSha256) {
      throw new DataMigrationIntegrityError(
        'Snapshot artifact SHA-256 verification failed; aborting import.',
        [`Expected ${manifest.bundleSha256}, got ${actualSha}`],
      );
    }
    const liveMeta = await inspectSchemaMeta(sourceDb).catch(() => ({
      tables: new Set<string>(CANONICAL_IMPORT_ORDER),
      authUsersExists: false,
      storageObjectsExists: false,
      columnsByTable: new Map<string, Set<string>>(),
      extensions: [],
      triggers: [],
      functions: [],
      policiesCount: 0,
    }));
    extraction = {
      bundle: deserializeBundleFromDisk(snapRaw),
      sourceMeta: liveMeta,
      legacyAuthUsersDetected: 0,
      storageObjectsPendingBackfill: 0,
      legacyPasswordResetTokensCount: 0,
      unmappedSourceColumns: [],
      warnings: [],
    };
  } else {
    extraction = await runInSnapshotReadOnly(sourceDb, () =>
      extractCanonicalSourceBundle(
        sourceDb,
        config.batchSize,
        config.maxRetries,
        config.retryBaseDelayMs,
        logger,
      ),
    );
  }

  const preflightIssues = validateBundleIntegrity(extraction.bundle);
  if (preflightIssues.length > 0) {
    throw new DataMigrationIntegrityError(
      `Import aborted before writing to target due to ${preflightIssues.length} source integrity error(s).`,
      preflightIssues,
    );
  }

  const checkpointPath = config.checkpointPath;
  let checkpoint: MigrationCheckpoint = {
    runId: `mig_${Date.now()}`,
    mode: 'import',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedTables: [],
    currentTable: null,
    lastPk: null,
    processedRowsByTable: {},
  };

  if (checkpointPath) {
    try {
      const existingRaw = await fs.readFile(checkpointPath, 'utf8');
      const existing = JSON.parse(existingRaw) as MigrationCheckpoint;
      if (Array.isArray(existing.completedTables)) {
        checkpoint = existing;
      }
    } catch {
      // Fresh run
    }
  }

  const completedSet = new Set<CanonicalTableName>(checkpoint.completedTables);

  for (const tbl of CANONICAL_IMPORT_ORDER) {
    if (completedSet.has(tbl)) {
      logger.info('data_migration_table_skipped_from_checkpoint', {
        table: tbl,
      });
      continue;
    }

    const rows = extraction.bundle[tbl];
    let processed = 0;
    for (let i = 0; i < rows.length; i += config.batchSize) {
      const slice = rows.slice(i, i + config.batchSize);
      await withDeterministicRetry(
        `import_${tbl}_batch_${i}`,
        config.maxRetries,
        config.retryBaseDelayMs,
        logger,
        async () => {
          await runInClientTransaction(targetDb, async (txClient) => {
            await upsertBatchIntoTarget(txClient, tbl, slice);
          });
        },
      );
      processed += slice.length;
      const lastRow = slice[slice.length - 1];
      checkpoint.currentTable = tbl;
      checkpoint.lastPk = lastRow
        ? String(
            lastRow.id ??
              lastRow.customer_id ??
              lastRow.app_user_id ??
              `${String(lastRow.bucket ?? '')}:${String(lastRow.object_path ?? '')}`,
          )
        : null;
      checkpoint.processedRowsByTable[tbl] = processed;
      checkpoint.updatedAt = new Date().toISOString();
      if (checkpointPath) {
        await writeJsonAtomic(checkpointPath, checkpoint);
      }
    }

    completedSet.add(tbl);
    checkpoint.completedTables = Array.from(completedSet);
    checkpoint.currentTable = null;
    checkpoint.lastPk = null;
    checkpoint.processedRowsByTable[tbl] = rows.length;
    checkpoint.updatedAt = new Date().toISOString();
    if (checkpointPath) {
      await writeJsonAtomic(checkpointPath, checkpoint);
    }

    logger.info('data_migration_table_imported', {
      table: tbl,
      rowsImported: rows.length,
    });
  }

  const sequences = await advanceTargetSequences(targetDb);

  const report = await validateSourceVsTarget(
    extraction,
    targetDb,
    config,
    logger,
    sequences,
  );

  if (config.reportPath) {
    await writeJsonAtomic(config.reportPath, report);
  }

  if (!report.passed) {
    throw new DataMigrationIntegrityError(
      `Post-import reconciliation failed with ${report.discrepancies.length} discrepancy(ies).`,
      report.discrepancies,
    );
  }

  return report;
}

export async function runDryRunOrValidation(options: {
  sourceDb: MigrationQueryable;
  targetDb: MigrationQueryable;
  config: DataMigrationConfig;
  logger: Logger;
}): Promise<DryRunReport> {
  const { sourceDb, targetDb, config, logger } = options;

  const extraction = await runInSnapshotReadOnly(sourceDb, () =>
    extractCanonicalSourceBundle(
      sourceDb,
      config.batchSize,
      config.maxRetries,
      config.retryBaseDelayMs,
      logger,
    ),
  );

  const sequences = await advanceTargetSequences(targetDb, {
    readOnly: true,
  }).catch(() => []);

  const report = await validateSourceVsTarget(
    extraction,
    targetDb,
    config,
    logger,
    sequences,
  );

  if (config.reportPath) {
    await writeJsonAtomic(config.reportPath, report);
  }

  logger.info('data_migration_validation_completed', {
    mode: config.mode,
    sourceEnv: config.sourceEnv,
    targetEnv: config.targetEnv,
    passed: report.passed,
    discrepancyCount: report.discrepancies.length,
    warningCount: report.warnings.length,
  });

  if (!report.passed) {
    throw new DataMigrationIntegrityError(
      `Validation failed with ${report.discrepancies.length} discrepancy(ies).`,
      report.discrepancies,
    );
  }

  return report;
}

export type { DatabaseClient, DatabasePool };
