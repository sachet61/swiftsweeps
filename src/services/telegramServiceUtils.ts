export const MIN_TELEGRAM_SUPPRESSION_MINUTES = 0;
export const MAX_TELEGRAM_SUPPRESSION_MINUTES = 1440;

/**
 * Safely extracts a human-readable string message from heterogeneous API error
 * payloads (including Express `{ error: { code, message, requestId } }` objects,
 * legacy `{ error: "..." }` strings, or `{ message / lastError }` fields).
 * Guarantees a non-empty string return value so React JSX never receives an object.
 */
export function extractTelegramApiError(
  data: unknown,
  fallback: string,
): string {
  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    if (typeof rec.lastError === 'string' && rec.lastError.trim()) {
      return rec.lastError.trim();
    }
    if (typeof rec.error === 'string' && rec.error.trim()) {
      return rec.error.trim();
    }
    if (rec.error && typeof rec.error === 'object') {
      const errObj = rec.error as Record<string, unknown>;
      if (typeof errObj.message === 'string' && errObj.message.trim()) {
        return errObj.message.trim();
      }
      if (typeof errObj.code === 'string' && errObj.code.trim()) {
        return errObj.code.trim();
      }
    }
    if (typeof rec.message === 'string' && rec.message.trim()) {
      return rec.message.trim();
    }
  }
  return fallback;
}

export function coerceSafeFeedbackText(
  value: unknown,
  fallback = 'An unexpected error occurred.',
): string {
  if (typeof value === 'string') {
    return value.trim() ? value : fallback;
  }
  return extractTelegramApiError(value, fallback);
}

export type SuppressionWindowParseResult =
  | { valid: true; value: number; error?: never }
  | { valid: false; value?: never; error: string };

/**
 * Strictly validates an admin-entered suppression window (in minutes).
 * Does not silently coerce blank, decimal, or out-of-range values to 0.
 */
export function parseSuppressionWindowInput(
  rawInput: string | number,
): SuppressionWindowParseResult {
  const trimmed =
    typeof rawInput === 'number'
      ? Number.isFinite(rawInput)
        ? String(rawInput)
        : ''
      : typeof rawInput === 'string'
        ? rawInput.trim()
        : '';

  if (!trimmed) {
    return {
      valid: false,
      error: `Please enter a suppression duration between ${MIN_TELEGRAM_SUPPRESSION_MINUTES} and ${MAX_TELEGRAM_SUPPRESSION_MINUTES} minutes (0 disables suppression).`,
    };
  }

  if (!/^\d+$/.test(trimmed)) {
    return {
      valid: false,
      error: `Suppression duration must be a whole number between ${MIN_TELEGRAM_SUPPRESSION_MINUTES} and ${MAX_TELEGRAM_SUPPRESSION_MINUTES} minutes.`,
    };
  }

  const parsed = Number(trimmed);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_TELEGRAM_SUPPRESSION_MINUTES ||
    parsed > MAX_TELEGRAM_SUPPRESSION_MINUTES
  ) {
    return {
      valid: false,
      error: `Suppression duration must be between ${MIN_TELEGRAM_SUPPRESSION_MINUTES} and ${MAX_TELEGRAM_SUPPRESSION_MINUTES} minutes.`,
    };
  }

  return { valid: true, value: parsed };
}

export interface TelegramLastDiagnostic {
  status: 'sent' | 'suppressed' | 'failed';
  at: string;
  eventType: 'chat_message' | 'activity_alert';
  suppressionWindowMinutes: number;
  reason?: string;
  remainingSec?: number;
  errorMessage?: string;
}

export function formatTelegramDiagnosticSummary(
  diag: TelegramLastDiagnostic | null | undefined,
): {
  statusLabel: string;
  eventLabel: string;
  detailText: string;
} {
  if (!diag) {
    return {
      statusLabel: 'No Alerts Yet',
      eventLabel: 'Idle',
      detailText: 'No alert activity recorded yet.',
    };
  }

  const eventLabel =
    diag.eventType === 'chat_message' ? 'Support Chat' : 'Activity Alert';

  if (diag.status === 'sent') {
    return {
      statusLabel: 'Sent',
      eventLabel,
      detailText:
        diag.suppressionWindowMinutes > 0
          ? `Delivered to Telegram (started ${diag.suppressionWindowMinutes}m cooldown).`
          : 'Delivered to Telegram (suppression disabled).',
    };
  }

  if (diag.status === 'suppressed') {
    const remainingText =
      typeof diag.remainingSec === 'number' && diag.remainingSec > 0
        ? ` (${diag.remainingSec}s remaining)`
        : '';
    return {
      statusLabel: 'Suppressed',
      eventLabel,
      detailText: `Skipped duplicate alert — a Telegram alert was sent for this customer within ${diag.suppressionWindowMinutes}m${remainingText}.`,
    };
  }

  return {
    statusLabel: 'Failed',
    eventLabel,
    detailText: coerceSafeFeedbackText(
      diag.errorMessage,
      'Telegram delivery failed.',
    ),
  };
}
