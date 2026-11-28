import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceSafeFeedbackText,
  extractTelegramApiError,
  formatTelegramDiagnosticSummary,
  parseSuppressionWindowInput,
} from './telegramServiceUtils';
import { TelegramService } from './telegramService';

test('extractTelegramApiError unwraps Express structured { error: { code, message } } objects as safe strings', () => {
  const payload = {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'suppressionWindowMinutes must be between 0 and 1440 minutes.',
      requestId: 'req_12345',
    },
  };

  assert.equal(
    extractTelegramApiError(payload, 'Fallback error'),
    'suppressionWindowMinutes must be between 0 and 1440 minutes.',
  );
  assert.equal(
    extractTelegramApiError({ error: 'Plain string error' }, 'Fallback error'),
    'Plain string error',
  );
  assert.equal(
    extractTelegramApiError({ error: { code: 'FORBIDDEN' } }, 'Fallback error'),
    'FORBIDDEN',
  );
  assert.equal(
    extractTelegramApiError({ message: 'Top-level message' }, 'Fallback error'),
    'Top-level message',
  );
  assert.equal(
    extractTelegramApiError({ lastError: 'Upstream bot error' }, 'Fallback error'),
    'Upstream bot error',
  );
  assert.equal(extractTelegramApiError({}, 'Fallback error'), 'Fallback error');
  assert.equal(extractTelegramApiError(null, 'Fallback error'), 'Fallback error');
});

test('coerceSafeFeedbackText never returns an object so React JSX and .includes() cannot crash', () => {
  const objError = {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Database temporarily unavailable.',
    requestId: 'req_99',
  };
  const coerced = coerceSafeFeedbackText(objError, 'Safe fallback');
  assert.equal(typeof coerced, 'string');
  assert.equal(coerced, 'Database temporarily unavailable.');
  assert.equal(coerced.includes('chat not found'), false);

  const emptyObjCoerced = coerceSafeFeedbackText({ foo: 'bar' }, 'Safe fallback');
  assert.equal(emptyObjCoerced, 'Safe fallback');

  const wrappedObj = { error: objError };
  const coercedWrapped = coerceSafeFeedbackText(wrappedObj, 'Safe fallback');
  assert.equal(typeof coercedWrapped, 'string');
  assert.equal(coercedWrapped, 'Database temporarily unavailable.');
  assert.equal(coercedWrapped.includes('chat not found'), false);
});

test('parseSuppressionWindowInput accepts custom durations (0..1440) and rejects blank/invalid values cleanly', () => {
  assert.deepEqual(parseSuppressionWindowInput('0'), { valid: true, value: 0 });
  assert.deepEqual(parseSuppressionWindowInput('15'), { valid: true, value: 15 });
  assert.deepEqual(parseSuppressionWindowInput('45'), { valid: true, value: 45 });
  assert.deepEqual(parseSuppressionWindowInput('120'), { valid: true, value: 120 });
  assert.deepEqual(parseSuppressionWindowInput('1440'), { valid: true, value: 1440 });
  assert.deepEqual(parseSuppressionWindowInput(' 015 '), { valid: true, value: 15 });

  assert.equal(parseSuppressionWindowInput('').valid, false);
  assert.equal(parseSuppressionWindowInput('   ').valid, false);
  assert.equal(parseSuppressionWindowInput('-5').valid, false);
  assert.equal(parseSuppressionWindowInput('1441').valid, false);
  assert.equal(parseSuppressionWindowInput('12.5').valid, false);
  assert.equal(parseSuppressionWindowInput('abc').valid, false);
});

test('TelegramService.saveConfig, getConfig, getStatus, and testConnection return string errors on Express error objects', async () => {
  const originalFetch = globalThis.fetch;
  const service = new TelegramService();

  try {
    // 1. Express 400/403/500 structured error object on saveConfig must yield string error
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'FORBIDDEN',
            message: 'Admin privileges required.',
            requestId: 'req_abc',
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    const saveErrRes = await service.saveConfig('', '-1001234567890', true, 15);
    assert.equal(saveErrRes.success, false);
    assert.equal(typeof saveErrRes.error, 'string');
    assert.equal(saveErrRes.error, 'Admin privileges required.');

    const cfgErrRes = await service.getConfig();
    assert.equal(cfgErrRes.success, false);
    assert.equal(typeof cfgErrRes.error, 'string');
    assert.equal(cfgErrRes.error, 'Admin privileges required.');

    const statusErrRes = await service.getStatus();
    assert.equal(typeof statusErrRes.lastError, 'string');
    assert.equal(statusErrRes.lastError, 'Admin privileges required.');

    const testErrRes = await service.testConnection('123:tok', '-1001234567890');
    assert.equal(testErrRes.success, false);
    assert.equal(typeof testErrRes.message, 'string');
    assert.equal(testErrRes.message, 'Admin privileges required.');

    // 2. Out-of-range duration is rejected locally with clear string error
    const outOfRangeRes = await service.saveConfig('123:tok', '-1001234567890', true, 1500);
    assert.equal(outOfRangeRes.success, false);
    assert.equal(typeof outOfRangeRes.error, 'string');
    assert.match(outOfRangeRes.error || '', /0 and 1440/);

    // 3. Successful custom non-preset duration (e.g. 15 min) sends exact integer and returns updated config
    let capturedBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          success: true,
          status: {
            running: false,
            channelId: '-1001234567890',
            suppressionWindowMinutes: 15,
            updatesReceived: 0,
            tokenConfigured: true,
          },
          config: {
            channelId: '-1001234567890',
            enabled: true,
            tokenConfigured: true,
            suppressionWindowMinutes: 15,
            updatedAt: '2026-11-27T17:10:00.000Z',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const saveOkRes = await service.saveConfig('', '-1001234567890', true, 15);
    assert.equal(saveOkRes.success, true);
    assert.equal(capturedBody?.['suppressionWindowMinutes'], 15);
    assert.equal(saveOkRes.config?.suppressionWindowMinutes, 15);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('formatTelegramDiagnosticSummary produces safe status, event labels, and detail text across all states', () => {
  assert.deepEqual(formatTelegramDiagnosticSummary(null), {
    statusLabel: 'No Alerts Yet',
    eventLabel: 'Idle',
    detailText: 'No alert activity recorded yet.',
  });

  const sent = formatTelegramDiagnosticSummary({
    status: 'sent',
    at: '2026-11-27T12:00:00.000Z',
    eventType: 'chat_message',
    suppressionWindowMinutes: 10,
  });
  assert.equal(sent.statusLabel, 'Sent');
  assert.equal(sent.eventLabel, 'Support Chat');
  assert.match(sent.detailText, /10m cooldown/);

  const suppressed = formatTelegramDiagnosticSummary({
    status: 'suppressed',
    at: '2026-11-27T12:02:00.000Z',
    eventType: 'activity_alert',
    suppressionWindowMinutes: 10,
    remainingSec: 480,
  });
  assert.equal(suppressed.statusLabel, 'Suppressed');
  assert.equal(suppressed.eventLabel, 'Activity Alert');
  assert.match(suppressed.detailText, /480s remaining/);

  const failed = formatTelegramDiagnosticSummary({
    status: 'failed',
    at: '2026-11-27T12:05:00.000Z',
    eventType: 'chat_message',
    suppressionWindowMinutes: 5,
    errorMessage: 'chat not found',
  });
  assert.equal(failed.statusLabel, 'Failed');
  assert.equal(failed.detailText, 'chat not found');
});
