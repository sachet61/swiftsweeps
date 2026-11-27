import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TELEGRAM_SUPPRESSION_MINUTES,
  buildSuppressionLogMetadata,
  canonicalCooldownKeyForCustomer,
  canonicalCustomerIdFromInput,
  evaluateTelegramSuppression,
  normalizeSuppressionWindowMinutes,
  parseTimestampMs,
  pruneTimestampMap,
  validateSuppressionWindowMinutes,
} from '../appConfig/telegramSuppression.js';

test('suppression window normalization & validation supports configurable minute periods and rejects invalid inputs', () => {
  assert.equal(normalizeSuppressionWindowMinutes(undefined), DEFAULT_TELEGRAM_SUPPRESSION_MINUTES);
  assert.equal(normalizeSuppressionWindowMinutes(null), DEFAULT_TELEGRAM_SUPPRESSION_MINUTES);
  assert.equal(normalizeSuppressionWindowMinutes(0), 0);
  assert.equal(normalizeSuppressionWindowMinutes(10), 10);
  assert.equal(normalizeSuppressionWindowMinutes(30), 30);
  assert.equal(normalizeSuppressionWindowMinutes(60), 60);
  assert.equal(normalizeSuppressionWindowMinutes(-5), DEFAULT_TELEGRAM_SUPPRESSION_MINUTES);

  assert.deepEqual(validateSuppressionWindowMinutes(undefined), { valid: true });
  assert.deepEqual(validateSuppressionWindowMinutes(0), { valid: true, value: 0 });
  assert.deepEqual(validateSuppressionWindowMinutes(5), { valid: true, value: 5 });
  assert.deepEqual(validateSuppressionWindowMinutes(60), { valid: true, value: 60 });
  assert.equal(validateSuppressionWindowMinutes(-1).valid, false);
  assert.equal(validateSuppressionWindowMinutes(1441).valid, false);
  assert.equal(validateSuppressionWindowMinutes(5.5).valid, false);
  assert.equal(validateSuppressionWindowMinutes('10').valid, false);
});

test('parseTimestampMs handles UTC, non-UTC timezone offsets, Date objects, and missing/invalid timestamps safely', () => {
  const utcMs = parseTimestampMs('2026-11-27T15:00:00.000Z');
  const plusOffsetMs = parseTimestampMs('2026-11-27T20:30:00.000+05:30');
  const minusOffsetMs = parseTimestampMs('2026-11-27T08:00:00.000-07:00');
  assert.equal(utcMs, plusOffsetMs);
  assert.equal(utcMs, minusOffsetMs);
  assert.equal(parseTimestampMs(new Date(utcMs!)), utcMs);

  assert.equal(parseTimestampMs(null), null);
  assert.equal(parseTimestampMs(undefined), null);
  assert.equal(parseTimestampMs(''), null);
  assert.equal(parseTimestampMs('not-a-timestamp'), null);
  assert.equal(parseTimestampMs(0), null);
  assert.equal(parseTimestampMs(-100), null);
  assert.equal(parseTimestampMs(NaN), null);
});

test('evaluateTelegramSuppression enforces window boundaries, dynamic periods, and ignores missing timestamps', () => {
  const nowMs = Date.parse('2026-11-27T12:10:00.000Z');
  const sixMinAgo = Date.parse('2026-11-27T12:04:00.000Z');
  const exactFiveMinAgo = Date.parse('2026-11-27T12:05:00.000Z');
  const fourMinAgo = Date.parse('2026-11-27T12:06:00.000Z');

  // Missing timestamps never suppress
  const noHistory = evaluateTelegramSuppression({
    suppressionWindowMinutes: 10,
    nowMs,
    lastTelegramSentAtMs: null,
    lastOutboundMessageSentAtMs: null,
  });
  assert.equal(noHistory.suppressed, false);

  // 4 min ago within 5 min window -> suppressed
  const withinFive = evaluateTelegramSuppression({
    suppressionWindowMinutes: 5,
    nowMs,
    lastTelegramSentAtMs: fourMinAgo,
    lastOutboundMessageSentAtMs: null,
  });
  assert.equal(withinFive.suppressed, true);
  assert.equal(withinFive.source, 'telegram_notification');
  assert.equal(withinFive.remainingSec, 60);

  // Exact boundary (5 min ago with 5 min window) -> expired, NOT suppressed
  const exactBoundary = evaluateTelegramSuppression({
    suppressionWindowMinutes: 5,
    nowMs,
    lastTelegramSentAtMs: exactFiveMinAgo,
    lastOutboundMessageSentAtMs: null,
  });
  assert.equal(exactBoundary.suppressed, false);

  // 6 min ago expired for 5 min window, but suppressed when window increases to 10 min
  const expiredForFive = evaluateTelegramSuppression({
    suppressionWindowMinutes: 5,
    nowMs,
    lastTelegramSentAtMs: null,
    lastOutboundMessageSentAtMs: sixMinAgo,
  });
  assert.equal(expiredForFive.suppressed, false);

  const activeForTen = evaluateTelegramSuppression({
    suppressionWindowMinutes: 10,
    nowMs,
    lastTelegramSentAtMs: null,
    lastOutboundMessageSentAtMs: sixMinAgo,
  });
  assert.equal(activeForTen.suppressed, true);
  assert.equal(activeForTen.source, 'outbound_chat_message');

  // Window 0 explicitly disables suppression
  const disabled = evaluateTelegramSuppression({
    suppressionWindowMinutes: 0,
    nowMs,
    lastTelegramSentAtMs: fourMinAgo,
    lastOutboundMessageSentAtMs: fourMinAgo,
  });
  assert.equal(disabled.suppressed, false);
});

test('customer identification and suppression log metadata stay scoped and omit sensitive PII', () => {
  assert.equal(
    canonicalCustomerIdFromInput({
      actorId: 'cust_real_1',
      actorRole: 'customer',
      conversationId: 'conv_cust_other',
    }),
    'cust_real_1',
  );
  assert.equal(
    canonicalCustomerIdFromInput({
      actorId: 'admin_1',
      actorRole: 'admin',
      conversationId: 'conv_cust_real_2',
    }),
    'cust_real_2',
  );
  assert.equal(canonicalCooldownKeyForCustomer('cust_ABC'), 'conv_cust_abc');

  const evalRes = evaluateTelegramSuppression({
    suppressionWindowMinutes: 30,
    nowMs: Date.parse('2026-11-27T12:10:00.000Z'),
    lastTelegramSentAtMs: Date.parse('2026-11-27T12:00:00.000Z'),
    lastOutboundMessageSentAtMs: null,
  });
  const logMeta = buildSuppressionLogMetadata({
    customerId: 'cust_real_1',
    evaluation: evalRes,
  });
  assert.equal(logMeta.customerId, 'cust_real_1');
  assert.equal(logMeta.suppressionWindowMinutes, 30);
  assert.equal(logMeta.reason, 'recent_telegram_notification_sent_within_window');
  assert.equal('email' in logMeta, false);
  assert.equal('customerName' in logMeta, false);
});

test('pruneTimestampMap retains timestamps for configured windows longer than 10 minutes', () => {
  const nowMs = Date.parse('2026-11-27T13:00:00.000Z');
  const fortyFiveMinAgo = nowMs - 45 * 60_000;
  const twoDaysAgo = nowMs - 48 * 60 * 60_000;
  const pruned = pruneTimestampMap(
    {
      conv_recent: fortyFiveMinAgo,
      conv_stale: twoDaysAgo,
      conv_corrupt: 'invalid',
    },
    nowMs,
    60 * 60_000,
  );
  assert.equal(pruned.conv_recent, fortyFiveMinAgo);
  assert.equal(pruned.conv_stale, undefined);
  assert.equal(pruned.conv_corrupt, undefined);
});
