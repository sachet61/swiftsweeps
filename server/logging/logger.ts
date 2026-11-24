import type { LogLevel } from '../config/env.js';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY_PATTERN =
  /pass(word|phrase)?|secret|token|authorization|cookie|set-cookie|api[-_]?key|private[-_]?key|connection[-_]?string|database[-_]?url|dsn|session|signature|credential/i;

const REDACTED = '[REDACTED]';

export function redactString(input: string): string {
  return input
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgres://[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]')
    .replace(
      /\b(password|passphrase|secret|token|api_key|apikey|access_token|refresh_token)=([^&\s]+)/gi,
      '$1=[REDACTED]',
    );
}

export function redactSensitive(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    return value.map((item) => redactSensitive(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = redactSensitive(entry, seen);
      }
    }
    return out;
  }

  return String(value);
}

export interface LogMeta {
  [key: string]: unknown;
}

export interface Logger {
  debug(event: string, meta?: LogMeta): void;
  info(event: string, meta?: LogMeta): void;
  warn(event: string, meta?: LogMeta): void;
  error(event: string, meta?: LogMeta): void;
}

export interface LoggerOptions {
  level?: LogLevel;
  writeStdout?: (line: string) => void;
  writeStderr?: (line: string) => void;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const minPriority = LEVEL_PRIORITY[options.level ?? 'info'];
  const writeStdout =
    options.writeStdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const writeStderr =
    options.writeStderr ?? ((line: string) => process.stderr.write(`${line}\n`));

  function emit(level: LogLevel, event: string, meta?: LogMeta): void {
    if (LEVEL_PRIORITY[level] < minPriority) {
      return;
    }

    const sanitizedMeta =
      meta !== undefined
        ? (redactSensitive(meta) as Record<string, unknown>)
        : undefined;

    const payload = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event: redactString(event),
      ...(sanitizedMeta ?? {}),
    });

    if (level === 'warn' || level === 'error') {
      writeStderr(payload);
    } else {
      writeStdout(payload);
    }
  }

  return {
    debug: (event, meta) => emit('debug', event, meta),
    info: (event, meta) => emit('info', event, meta),
    warn: (event, meta) => emit('warn', event, meta),
    error: (event, meta) => emit('error', event, meta),
  };
}
