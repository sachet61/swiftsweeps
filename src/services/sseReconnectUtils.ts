export interface SseBackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  randomFn?: () => number;
}

const DEFAULT_BASE_DELAY_MS = 3_000;
const DEFAULT_MAX_DELAY_MS = 30_000;

/**
 * Computes bounded exponential backoff delay for SSE recovery after EventSource.CLOSED.
 * Never returns aggressive sub-second intervals.
 */
export function computeSseReconnectDelayMs(
  attempt: number,
  options?: SseBackoffOptions,
): number {
  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  const baseDelayMs = Math.max(1_000, options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const maxDelayMs = Math.max(baseDelayMs, options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.min(safeAttempt, 10));

  const jitterRatio = options?.jitterRatio ?? 0.2;
  if (jitterRatio <= 0) {
    return Math.round(exp);
  }
  const rnd = options?.randomFn ? options.randomFn() : Math.random();
  const clampedRnd = Math.max(0, Math.min(1, Number.isFinite(rnd) ? rnd : 0.5));
  const jitterOffset = exp * jitterRatio * clampedRnd;
  return Math.round(Math.min(maxDelayMs, exp + jitterOffset));
}

export function buildSseStreamUrl(baseUrl: string, lastEventId?: string | null): string {
  const cleanId = typeof lastEventId === 'string' ? lastEventId.trim() : '';
  if (!cleanId) return baseUrl;
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}lastEventId=${encodeURIComponent(cleanId)}`;
}

export function parseSseJson<T>(raw: unknown): T | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
