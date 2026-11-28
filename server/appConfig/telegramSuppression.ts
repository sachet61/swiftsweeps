import type { AppUserRole } from '../auth/userDirectoryRepo.js';

export const DEFAULT_TELEGRAM_SUPPRESSION_MINUTES = 5;
export const MIN_TELEGRAM_SUPPRESSION_MINUTES = 0;
export const MAX_TELEGRAM_SUPPRESSION_MINUTES = 1440;
export const TELEGRAM_CLAIM_LEASE_MS = 15_000;
export const MIN_SUPPRESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60_000;

export type SuppressionTimestampSource = 'telegram_notification';

export type TelegramDiagnosticOutcome = 'sent' | 'suppressed' | 'failed';
export type TelegramDiagnosticEventType = 'chat_message' | 'activity_alert';

export interface TelegramLastDiagnostic {
  status: TelegramDiagnosticOutcome;
  at: string;
  eventType: TelegramDiagnosticEventType;
  suppressionWindowMinutes: number;
  reason?: string;
  remainingSec?: number;
  errorMessage?: string;
}

export interface TelegramSuppressionEvaluation {
  suppressed: boolean;
  windowMinutes: number;
  windowMs: number;
  latestSentAtMs: number | null;
  latestSentAtIso: string | null;
  source: SuppressionTimestampSource | null;
  reason: string | null;
  elapsedMs: number | null;
  remainingSec: number;
}

export interface TelegramInFlightLease {
  token: string;
  expiresAtMs: number;
}

export function scrubTelegramSecret(raw: unknown, botToken?: string): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return '';
  let cleaned = text;
  if (botToken && botToken.trim()) {
    cleaned = cleaned.split(botToken.trim()).join('[REDACTED]');
  }
  cleaned = cleaned.replace(/\/bot\d*:[^\s/'"]+/gi, '/bot[REDACTED]');
  return cleaned.slice(0, 300);
}

export function sanitizeTelegramDiagnostic(
  raw: unknown,
  botToken?: string,
): TelegramLastDiagnostic | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const rec = raw as Record<string, unknown>;
  const status =
    rec.status === 'sent' ||
    rec.status === 'suppressed' ||
    rec.status === 'failed'
      ? rec.status
      : null;
  const atMs = parseTimestampMs(rec.at);
  if (!status || atMs === null) {
    return undefined;
  }
  const eventType: TelegramDiagnosticEventType =
    rec.eventType === 'chat_message' ? 'chat_message' : 'activity_alert';
  const suppressionWindowMinutes = normalizeSuppressionWindowMinutes(
    rec.suppressionWindowMinutes,
  );
  const reason =
    typeof rec.reason === 'string' && rec.reason.trim()
      ? rec.reason.trim().slice(0, 120)
      : undefined;
  const remainingSec =
    typeof rec.remainingSec === 'number' &&
    Number.isFinite(rec.remainingSec) &&
    rec.remainingSec > 0
      ? Math.ceil(rec.remainingSec)
      : undefined;
  const errorMessage = rec.errorMessage
    ? scrubTelegramSecret(rec.errorMessage, botToken)
    : undefined;

  return {
    status,
    at: new Date(atMs).toISOString(),
    eventType,
    suppressionWindowMinutes,
    ...(reason ? { reason } : {}),
    ...(remainingSec !== undefined ? { remainingSec } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

export function normalizeSuppressionWindowMinutes(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_TELEGRAM_SUPPRESSION_MINUTES;
  }
  if (typeof raw === 'boolean') {
    return DEFAULT_TELEGRAM_SUPPRESSION_MINUTES;
  }
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (
    !Number.isInteger(num) ||
    num < MIN_TELEGRAM_SUPPRESSION_MINUTES ||
    num > MAX_TELEGRAM_SUPPRESSION_MINUTES
  ) {
    return DEFAULT_TELEGRAM_SUPPRESSION_MINUTES;
  }
  return num;
}

export function validateSuppressionWindowMinutes(raw: unknown): {
  valid: boolean;
  value?: number;
  error?: string;
} {
  if (raw === undefined) {
    return { valid: true };
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return {
      valid: false,
      error: `suppressionWindowMinutes must be an integer between ${MIN_TELEGRAM_SUPPRESSION_MINUTES} and ${MAX_TELEGRAM_SUPPRESSION_MINUTES}.`,
    };
  }
  if (
    raw < MIN_TELEGRAM_SUPPRESSION_MINUTES ||
    raw > MAX_TELEGRAM_SUPPRESSION_MINUTES
  ) {
    return {
      valid: false,
      error: `suppressionWindowMinutes must be between ${MIN_TELEGRAM_SUPPRESSION_MINUTES} and ${MAX_TELEGRAM_SUPPRESSION_MINUTES} minutes.`,
    };
  }
  return { valid: true, value: raw };
}

export function canonicalCustomerIdFromInput(params: {
  actorId: string;
  actorRole: AppUserRole;
  conversationId?: string;
}): string {
  if (params.actorRole === 'customer') {
    return params.actorId.trim();
  }
  const rawConv = (params.conversationId || '').trim();
  if (!rawConv) {
    return params.actorId.trim();
  }
  const stripped = rawConv.replace(/^conv_+/i, '').trim();
  return stripped || params.actorId.trim();
}

export function canonicalCooldownKeyForCustomer(customerId: string): string {
  const clean = customerId.trim().replace(/^conv_+/i, '');
  return `conv_${clean}`.toLowerCase();
}

export function parseTimestampMs(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      return Number.isFinite(num) && num > 0 ? num : null;
    }
    const ms = Date.parse(trimmed);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  return null;
}

export function evaluateTelegramSuppression(params: {
  suppressionWindowMinutes: number;
  nowMs: number;
  lastTelegramSentAtMs: number | null;
}): TelegramSuppressionEvaluation {
  const windowMinutes = normalizeSuppressionWindowMinutes(
    params.suppressionWindowMinutes,
  );
  const windowMs = windowMinutes * 60_000;

  const latestMs =
    params.lastTelegramSentAtMs !== null &&
    Number.isFinite(params.lastTelegramSentAtMs) &&
    params.lastTelegramSentAtMs > 0
      ? params.lastTelegramSentAtMs
      : null;

  if (latestMs === null) {
    return {
      suppressed: false,
      windowMinutes,
      windowMs,
      latestSentAtMs: null,
      latestSentAtIso: null,
      source: null,
      reason: null,
      elapsedMs: null,
      remainingSec: 0,
    };
  }

  const latestSentAtIso = new Date(latestMs).toISOString();

  if (windowMs <= 0) {
    return {
      suppressed: false,
      windowMinutes: 0,
      windowMs: 0,
      latestSentAtMs: latestMs,
      latestSentAtIso,
      source: 'telegram_notification',
      reason: null,
      elapsedMs: null,
      remainingSec: 0,
    };
  }

  // Ignore unreasonably far-future timestamps (> 60s skew) as corrupted/untrusted
  if (latestMs - params.nowMs > MAX_CLOCK_SKEW_MS) {
    return {
      suppressed: false,
      windowMinutes,
      windowMs,
      latestSentAtMs: latestMs,
      latestSentAtIso,
      source: 'telegram_notification',
      reason: null,
      elapsedMs: null,
      remainingSec: 0,
    };
  }

  const elapsedMs = Math.max(0, params.nowMs - latestMs);
  if (elapsedMs < windowMs) {
    const remainingSec = Math.max(1, Math.ceil((windowMs - elapsedMs) / 1000));
    return {
      suppressed: true,
      windowMinutes,
      windowMs,
      latestSentAtMs: latestMs,
      latestSentAtIso,
      source: 'telegram_notification',
      reason: 'recent_telegram_notification_sent_within_window',
      elapsedMs,
      remainingSec,
    };
  }

  return {
    suppressed: false,
    windowMinutes,
    windowMs,
    latestSentAtMs: latestMs,
    latestSentAtIso,
    source: 'telegram_notification',
    reason: null,
    elapsedMs,
    remainingSec: 0,
  };
}

export function buildSuppressionLogMetadata(params: {
  customerId: string;
  evaluation: TelegramSuppressionEvaluation;
}): {
  customerId: string;
  reason: string;
  suppressionWindowMinutes: number;
  source: SuppressionTimestampSource | null;
  lastSentAt: string | null;
  remainingSec: number;
} {
  return {
    customerId: params.customerId,
    reason:
      params.evaluation.reason ||
      'recent_telegram_notification_sent_within_window',
    suppressionWindowMinutes: params.evaluation.windowMinutes,
    source: params.evaluation.source,
    lastSentAt: params.evaluation.latestSentAtIso,
    remainingSec: params.evaluation.remainingSec,
  };
}

export function pruneTimestampMap(
  rawMap: Record<string, unknown>,
  nowMs: number,
  windowMs: number,
): Record<string, number> {
  const retentionMs = Math.max(windowMs, MIN_SUPPRESSION_RETENTION_MS);
  const cleaned: Record<string, number> = {};
  for (const [key, rawVal] of Object.entries(rawMap)) {
    const ts = parseTimestampMs(rawVal);
    if (ts !== null && nowMs - ts < retentionMs) {
      cleaned[key] = ts;
    }
  }
  return cleaned;
}

export function pruneInFlightLeases(
  rawMap: Record<string, unknown>,
  nowMs: number,
): Record<string, TelegramInFlightLease> {
  const cleaned: Record<string, TelegramInFlightLease> = {};
  for (const [key, rawVal] of Object.entries(rawMap)) {
    if (!rawVal || typeof rawVal !== 'object' || Array.isArray(rawVal)) {
      continue;
    }
    const rec = rawVal as Record<string, unknown>;
    const token = typeof rec.token === 'string' ? rec.token.trim() : '';
    const expiresAtMs = Number(rec.expiresAtMs);
    if (token && Number.isFinite(expiresAtMs) && expiresAtMs > nowMs) {
      cleaned[key] = { token, expiresAtMs };
    }
  }
  return cleaned;
}
