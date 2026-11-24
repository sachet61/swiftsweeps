export type NodeEnv = 'development' | 'test' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type PgSslMode = 'disable' | 'require' | 'verify-full';
export type TrustProxySetting = false | 'loopback' | number;

export interface ServerConfig {
  nodeEnv: NodeEnv;
  host: string;
  port: number;
  appOrigin: string;
  /**
   * Express `trust proxy` configuration for reverse-proxied deployments behind Nginx.
   * Defaults to `'loopback'` (trusts only 127.0.0.1 / ::1) so arbitrary client
   * X-Forwarded-* headers are ignored unless sent by local Nginx.
   */
  trustProxy: TrustProxySetting;
  databaseUrl: string;
  pgPoolMax: number;
  pgPoolMin: number;
  pgIdleTimeoutMs: number;
  pgConnectionTimeoutMs: number;
  pgStatementTimeoutMs: number;
  pgSslMode: PgSslMode;
  requestBodyLimit: string;
  logLevel: LogLevel;
  shutdownTimeoutMs: number;
}

export class ConfigValidationError extends Error {
  public readonly issues: readonly string[];

  constructor(issues: string[]) {
    super(`Server configuration validation failed: ${issues.join('; ')}`);
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

const VALID_NODE_ENVS = new Set<NodeEnv>(['development', 'test', 'production']);
const VALID_LOG_LEVELS = new Set<LogLevel>(['debug', 'info', 'warn', 'error']);
const VALID_SSL_MODES = new Set<PgSslMode>(['disable', 'require', 'verify-full']);
const BODY_LIMIT_REGEX = /^\d+(b|kb|mb)$/i;

function parseIntegerInRange(
  raw: string | undefined,
  varName: string,
  defaultValue: number,
  min: number,
  max: number,
  issues: string[],
): number {
  if (raw === undefined || raw.trim() === '') {
    return defaultValue;
  }

  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    issues.push(`${varName} must be an integer between ${min} and ${max}`);
    return defaultValue;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    issues.push(`${varName} must be between ${min} and ${max}`);
    return defaultValue;
  }

  return parsed;
}

function parseTrustProxy(
  raw: string | undefined,
  issues: string[],
): TrustProxySetting {
  if (raw === undefined || raw.trim() === '') {
    return 'loopback';
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  if (normalized === 'loopback') {
    return 'loopback';
  }
  if (/^[1-5]$/.test(normalized)) {
    return Number.parseInt(normalized, 10);
  }

  issues.push(
    'TRUST_PROXY must be "loopback", "false", or an integer hop count from 1 to 5',
  );
  return 'loopback';
}

function parseAppOrigin(
  raw: string | undefined,
  nodeEnv: NodeEnv,
  issues: string[],
): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    if (nodeEnv === 'production') {
      issues.push('APP_ORIGIN is required in production');
      return '';
    }
    return 'http://localhost:3000';
  }

  if (trimmed === '*') {
    issues.push('APP_ORIGIN must not be a wildcard (*)');
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      issues.push('APP_ORIGIN must use http:// or https://');
      return '';
    }
    if (parsed.username || parsed.password) {
      issues.push('APP_ORIGIN must not contain credentials');
      return '';
    }
    if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
      issues.push('APP_ORIGIN must be an origin only (no path, query, or hash)');
      return '';
    }
    return parsed.origin;
  } catch {
    issues.push('APP_ORIGIN must be a valid URL origin');
    return '';
  }
}

function parseDatabaseUrl(raw: string | undefined, issues: string[]): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    issues.push('DATABASE_URL is required');
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      issues.push('DATABASE_URL must use postgres:// or postgresql://');
      return '';
    }
    if (!parsed.hostname) {
      issues.push('DATABASE_URL must include a database host');
      return '';
    }
    const dbName = parsed.pathname.replace(/^\/+/, '');
    if (!dbName) {
      issues.push('DATABASE_URL must include a database name');
      return '';
    }
    return trimmed;
  } catch {
    issues.push('DATABASE_URL must be a valid PostgreSQL connection URI');
    return '';
  }
}

export function loadServerConfig(
  envSource: Record<string, string | undefined> = process.env,
): ServerConfig {
  const issues: string[] = [];

  const rawNodeEnv = (envSource.NODE_ENV?.trim() || 'development') as NodeEnv;
  if (!VALID_NODE_ENVS.has(rawNodeEnv)) {
    issues.push('NODE_ENV must be development, test, or production');
  }
  const nodeEnv: NodeEnv = VALID_NODE_ENVS.has(rawNodeEnv)
    ? rawNodeEnv
    : 'development';

  const host = envSource.HOST?.trim() || '127.0.0.1';
  if (/\s/.test(host)) {
    issues.push('HOST must not contain whitespace');
  }

  const port = parseIntegerInRange(envSource.PORT, 'PORT', 4000, 1, 65535, issues);
  const appOrigin = parseAppOrigin(envSource.APP_ORIGIN, nodeEnv, issues);
  const trustProxy = parseTrustProxy(envSource.TRUST_PROXY, issues);
  const databaseUrl = parseDatabaseUrl(envSource.DATABASE_URL, issues);

  const pgPoolMax = parseIntegerInRange(
    envSource.PG_POOL_MAX,
    'PG_POOL_MAX',
    10,
    1,
    100,
    issues,
  );
  const pgPoolMin = parseIntegerInRange(
    envSource.PG_POOL_MIN,
    'PG_POOL_MIN',
    0,
    0,
    pgPoolMax,
    issues,
  );
  const pgIdleTimeoutMs = parseIntegerInRange(
    envSource.PG_IDLE_TIMEOUT_MS,
    'PG_IDLE_TIMEOUT_MS',
    30_000,
    1_000,
    600_000,
    issues,
  );
  const pgConnectionTimeoutMs = parseIntegerInRange(
    envSource.PG_CONNECTION_TIMEOUT_MS,
    'PG_CONNECTION_TIMEOUT_MS',
    5_000,
    500,
    60_000,
    issues,
  );
  const pgStatementTimeoutMs = parseIntegerInRange(
    envSource.PG_STATEMENT_TIMEOUT_MS,
    'PG_STATEMENT_TIMEOUT_MS',
    15_000,
    1_000,
    120_000,
    issues,
  );

  const rawSslMode = (envSource.PG_SSL_MODE?.trim() || 'disable') as PgSslMode;
  if (!VALID_SSL_MODES.has(rawSslMode)) {
    issues.push('PG_SSL_MODE must be disable, require, or verify-full');
  }

  const requestBodyLimit = envSource.REQUEST_BODY_LIMIT?.trim() || '1mb';
  if (!BODY_LIMIT_REGEX.test(requestBodyLimit)) {
    issues.push('REQUEST_BODY_LIMIT must match <number>(b|kb|mb)');
  }

  const rawLogLevel = (envSource.LOG_LEVEL?.trim() || 'info') as LogLevel;
  if (!VALID_LOG_LEVELS.has(rawLogLevel)) {
    issues.push('LOG_LEVEL must be debug, info, warn, or error');
  }

  const shutdownTimeoutMs = parseIntegerInRange(
    envSource.SHUTDOWN_TIMEOUT_MS,
    'SHUTDOWN_TIMEOUT_MS',
    10_000,
    1_000,
    60_000,
    issues,
  );

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  return {
    nodeEnv,
    host,
    port,
    appOrigin,
    trustProxy,
    databaseUrl,
    pgPoolMax,
    pgPoolMin,
    pgIdleTimeoutMs,
    pgConnectionTimeoutMs,
    pgStatementTimeoutMs,
    pgSslMode: rawSslMode,
    requestBodyLimit,
    logLevel: rawLogLevel,
    shutdownTimeoutMs,
  };
}
