export type NodeEnv = 'development' | 'test' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type PgSslMode = 'disable' | 'require' | 'verify-full';
export type TrustProxySetting = false | 'loopback' | number;
export type EmailProvider = 'disabled' | 'brevo' | 'smtp';

export interface ServerConfig {
  nodeEnv: NodeEnv;
  host: string;
  port: number;
  appOrigin: string;
  trustedOrigins?: string[];
  allowSameHostOrigin?: boolean;
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
  requestBodyLimitBytes: number;
  logLevel: LogLevel;
  shutdownTimeoutMs: number;
  authSecret: string;
  authCookiePrefix: string;
  authSessionExpiresInSec: number;
  authSessionUpdateAgeSec: number;
  authSessionFreshAgeSec: number;
  authRequireEmailVerification: boolean;
  authRateLimitEnabled: boolean;
  authRateLimitWindowSec: number;
  authRateLimitMax: number;
  emailProvider: EmailProvider;
  brevoApiKey?: string;
  smtpHost?: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPass?: string;
  emailFromAddress?: string;
  emailFromName: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
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
const VALID_EMAIL_PROVIDERS = new Set<EmailProvider>(['disabled', 'brevo', 'smtp']);
const BODY_LIMIT_REGEX = /^(\d+)(b|kb|mb)$/i;
const COOKIE_PREFIX_REGEX = /^[a-z0-9_-]{3,40}$/;
const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INSECURE_AUTH_SECRET_VALUES = new Set([
  'better-auth-secret-123456789',
  'change-me',
  'changeme',
  'secret',
  'dev-only-insecure-secret-not-for-production',
]);

const DEV_ONLY_FALLBACK_AUTH_SECRET =
  'dev-only-insecure-secret-not-for-production';

function parseBodyLimitBytes(raw: string): number {
  const match = BODY_LIMIT_REGEX.exec(raw);
  if (!match) {
    return 1024 * 1024;
  }
  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  if (unit === 'b') return amount;
  if (unit === 'kb') return amount * 1024;
  return amount * 1024 * 1024;
}

function parseBooleanSetting(
  raw: string | undefined,
  varName: string,
  defaultValue: boolean,
  issues: string[],
): boolean {
  if (raw === undefined || raw.trim() === '') {
    return defaultValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  issues.push(`${varName} must be "true" or "false"`);
  return defaultValue;
}

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

function parseSingleOrigin(
  rawOrigin: string,
  varName: string,
  issues: string[],
): string | null {
  const trimmed = rawOrigin.trim().replace(/^['"]|['"]$/g, '').trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed === '*' || trimmed.includes('*')) {
    issues.push(`${varName} must not contain wildcards (*)`);
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      issues.push(`${varName} must use http:// or https://`);
      return null;
    }
    if (parsed.username || parsed.password) {
      issues.push(`${varName} must not contain credentials`);
      return null;
    }
    if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
      issues.push(`${varName} must contain origins only (no path, query, or hash)`);
      return null;
    }
    return parsed.origin;
  } catch {
    issues.push(`${varName} must be a valid URL origin`);
    return null;
  }
}

function parseOriginList(
  raw: string | undefined,
  varName: string,
  issues: string[],
): string[] {
  if (!raw || !raw.trim()) {
    return [];
  }

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const origins: string[] = [];
  for (const part of parts) {
    const parsed = parseSingleOrigin(part, varName, issues);
    if (parsed && !origins.includes(parsed)) {
      origins.push(parsed);
    }
  }
  return origins;
}

function parseAppOrigins(
  envSource: Record<string, string | undefined>,
  nodeEnv: NodeEnv,
  issues: string[],
): { appOrigin: string; trustedOrigins: string[] } {
  const primaryList = parseOriginList(envSource.APP_ORIGIN, 'APP_ORIGIN', issues);
  const extraOrigins = [
    ...parseOriginList(envSource.TRUSTED_ORIGINS, 'TRUSTED_ORIGINS', issues),
    ...parseOriginList(envSource.ALLOWED_ORIGINS, 'ALLOWED_ORIGINS', issues),
    ...parseOriginList(envSource.CORS_ORIGINS, 'CORS_ORIGINS', issues),
  ];

  let appOrigin = primaryList[0] ?? '';
  if (!appOrigin) {
    if (nodeEnv === 'production') {
      if (!envSource.APP_ORIGIN?.trim()) {
        issues.push('APP_ORIGIN is required in production');
      }
    } else {
      appOrigin = 'http://localhost:3000';
    }
  }

  const trustedOrigins: string[] = [];
  for (const origin of [appOrigin, ...primaryList, ...extraOrigins]) {
    if (origin && !trustedOrigins.includes(origin)) {
      trustedOrigins.push(origin);
    }
  }

  return { appOrigin, trustedOrigins };
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

function parseAuthSecret(
  envSource: Record<string, string | undefined>,
  nodeEnv: NodeEnv,
  issues: string[],
): string {
  const raw = (envSource.AUTH_SECRET ?? envSource.BETTER_AUTH_SECRET)?.trim();
  if (!raw) {
    if (nodeEnv === 'production') {
      issues.push('AUTH_SECRET is required in production (minimum 32 characters)');
      return '';
    }
    return DEV_ONLY_FALLBACK_AUTH_SECRET;
  }

  if (raw.length < 32) {
    issues.push('AUTH_SECRET must be at least 32 characters long');
    return '';
  }

  if (
    nodeEnv === 'production' &&
    INSECURE_AUTH_SECRET_VALUES.has(raw.toLowerCase())
  ) {
    issues.push('AUTH_SECRET must not use a known placeholder secret in production');
    return '';
  }

  return raw;
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

  const port = parseIntegerInRange(
    envSource.API_PORT ?? envSource.PORT,
    envSource.API_PORT !== undefined ? 'API_PORT' : 'PORT',
    4000,
    1,
    65535,
    issues,
  );
  const { appOrigin, trustedOrigins } = parseAppOrigins(
    envSource,
    nodeEnv,
    issues,
  );
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
  const requestBodyLimitBytes = parseBodyLimitBytes(requestBodyLimit);

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

  const authSecret = parseAuthSecret(envSource, nodeEnv, issues);
  const authCookiePrefix =
    envSource.AUTH_COOKIE_PREFIX?.trim() || 'swiftsweeps_auth';
  if (!COOKIE_PREFIX_REGEX.test(authCookiePrefix)) {
    issues.push(
      'AUTH_COOKIE_PREFIX must match ^[a-z0-9_-]{3,40}$',
    );
  }

  const authSessionExpiresInSec = parseIntegerInRange(
    envSource.AUTH_SESSION_EXPIRES_IN_SEC,
    'AUTH_SESSION_EXPIRES_IN_SEC',
    604_800,
    300,
    2_592_000,
    issues,
  );
  const authSessionUpdateAgeSec = parseIntegerInRange(
    envSource.AUTH_SESSION_UPDATE_AGE_SEC,
    'AUTH_SESSION_UPDATE_AGE_SEC',
    86_400,
    60,
    authSessionExpiresInSec,
    issues,
  );
  const authSessionFreshAgeSec = parseIntegerInRange(
    envSource.AUTH_SESSION_FRESH_AGE_SEC,
    'AUTH_SESSION_FRESH_AGE_SEC',
    900,
    60,
    authSessionExpiresInSec,
    issues,
  );
  const authRequireEmailVerification = parseBooleanSetting(
    envSource.AUTH_REQUIRE_EMAIL_VERIFICATION,
    'AUTH_REQUIRE_EMAIL_VERIFICATION',
    true,
    issues,
  );
  const authRateLimitEnabled = parseBooleanSetting(
    envSource.AUTH_RATE_LIMIT_ENABLED,
    'AUTH_RATE_LIMIT_ENABLED',
    true,
    issues,
  );
  const authRateLimitWindowSec = parseIntegerInRange(
    envSource.AUTH_RATE_LIMIT_WINDOW_SEC,
    'AUTH_RATE_LIMIT_WINDOW_SEC',
    60,
    10,
    86_400,
    issues,
  );
  const authRateLimitMax = parseIntegerInRange(
    envSource.AUTH_RATE_LIMIT_MAX,
    'AUTH_RATE_LIMIT_MAX',
    30,
    1,
    1_000,
    issues,
  );

  const rawEmailProvider = (
    envSource.EMAIL_PROVIDER?.trim().toLowerCase() || 'disabled'
  ) as EmailProvider;
  if (!VALID_EMAIL_PROVIDERS.has(rawEmailProvider)) {
    issues.push('EMAIL_PROVIDER must be disabled, brevo, or smtp');
  }

  const brevoApiKey = envSource.BREVO_API_KEY?.trim() || undefined;
  const smtpHost = envSource.SMTP_HOST?.trim() || undefined;
  if (smtpHost && /\s/.test(smtpHost)) {
    issues.push('SMTP_HOST must not contain whitespace');
  }
  const smtpPort = parseIntegerInRange(
    envSource.SMTP_PORT,
    'SMTP_PORT',
    587,
    1,
    65535,
    issues,
  );
  const smtpSecure = parseBooleanSetting(
    envSource.SMTP_SECURE,
    'SMTP_SECURE',
    smtpPort === 465,
    issues,
  );
  const smtpUser = envSource.SMTP_USER?.trim() || undefined;
  const smtpPass = envSource.SMTP_PASS?.trim() || undefined;
  const emailFromAddress = envSource.EMAIL_FROM_ADDRESS?.trim() || undefined;
  const emailFromName = envSource.EMAIL_FROM_NAME?.trim() || 'SwiftSweeps';

  if (rawEmailProvider === 'brevo') {
    if (!brevoApiKey) {
      issues.push('BREVO_API_KEY is required when EMAIL_PROVIDER=brevo');
    }
    if (!emailFromAddress || !SIMPLE_EMAIL_REGEX.test(emailFromAddress)) {
      issues.push('EMAIL_FROM_ADDRESS must be a valid email when EMAIL_PROVIDER=brevo');
    }
  }

  if (rawEmailProvider === 'smtp') {
    if (!smtpHost) {
      issues.push('SMTP_HOST is required when EMAIL_PROVIDER=smtp');
    }
    if (!smtpUser) {
      issues.push('SMTP_USER is required when EMAIL_PROVIDER=smtp');
    }
    if (!smtpPass) {
      issues.push('SMTP_PASS is required when EMAIL_PROVIDER=smtp');
    }
    if (!emailFromAddress || !SIMPLE_EMAIL_REGEX.test(emailFromAddress)) {
      issues.push('EMAIL_FROM_ADDRESS must be a valid email when EMAIL_PROVIDER=smtp');
    }
  }

  const vapidPublicKey = envSource.VAPID_PUBLIC_KEY?.trim() || undefined;
  const vapidPrivateKey = envSource.VAPID_PRIVATE_KEY?.trim() || undefined;
  const rawVapidSubject = envSource.VAPID_SUBJECT?.trim() || undefined;

  if (Boolean(vapidPublicKey) !== Boolean(vapidPrivateKey)) {
    issues.push(
      'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must both be set when configuring Web Push',
    );
  }
  if (vapidPublicKey && /\s/.test(vapidPublicKey)) {
    issues.push('VAPID_PUBLIC_KEY must not contain whitespace');
  }
  if (vapidPrivateKey && /\s/.test(vapidPrivateKey)) {
    issues.push('VAPID_PRIVATE_KEY must not contain whitespace');
  }
  if (rawVapidSubject) {
    if (
      /\s/.test(rawVapidSubject) ||
      (!rawVapidSubject.startsWith('mailto:') &&
        !rawVapidSubject.startsWith('https://'))
    ) {
      issues.push(
        'VAPID_SUBJECT must start with mailto: or https:// and contain no whitespace',
      );
    }
  }
  const vapidSubject =
    rawVapidSubject ??
    (vapidPublicKey && vapidPrivateKey
      ? 'mailto:support@swiftsweeps.com'
      : undefined);

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  return {
    nodeEnv,
    host,
    port,
    appOrigin,
    trustedOrigins,
    trustProxy,
    databaseUrl,
    pgPoolMax,
    pgPoolMin,
    pgIdleTimeoutMs,
    pgConnectionTimeoutMs,
    pgStatementTimeoutMs,
    pgSslMode: rawSslMode,
    requestBodyLimit,
    requestBodyLimitBytes,
    logLevel: rawLogLevel,
    shutdownTimeoutMs,
    authSecret,
    authCookiePrefix,
    authSessionExpiresInSec,
    authSessionUpdateAgeSec,
    authSessionFreshAgeSec,
    authRequireEmailVerification,
    authRateLimitEnabled,
    authRateLimitWindowSec,
    authRateLimitMax,
    emailProvider: rawEmailProvider,
    brevoApiKey,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    emailFromAddress,
    emailFromName,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
  };
}
