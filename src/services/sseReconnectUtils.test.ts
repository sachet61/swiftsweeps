import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSseStreamUrl,
  computeSseReconnectDelayMs,
  parseSseJson,
} from './sseReconnectUtils';

test('computeSseReconnectDelayMs uses bounded exponential backoff with >=1000ms floor', () => {
  // Deterministic 0 jitter
  assert.equal(
    computeSseReconnectDelayMs(0, { randomFn: () => 0 }),
    3_000,
  );
  assert.equal(
    computeSseReconnectDelayMs(1, { randomFn: () => 0 }),
    6_000,
  );
  assert.equal(
    computeSseReconnectDelayMs(2, { randomFn: () => 0 }),
    12_000,
  );
  assert.equal(
    computeSseReconnectDelayMs(3, { randomFn: () => 0 }),
    24_000,
  );
  assert.equal(
    computeSseReconnectDelayMs(4, { randomFn: () => 0 }),
    30_000,
  );
  assert.equal(
    computeSseReconnectDelayMs(50, { randomFn: () => 1 }),
    30_000,
  );

  // Respects 1000ms floor even if caller supplies smaller baseDelayMs
  assert.equal(
    computeSseReconnectDelayMs(0, { baseDelayMs: 100, jitterRatio: 0 }),
    1_000,
  );

  // Applies max jitter without exceeding maxDelayMs
  assert.equal(
    computeSseReconnectDelayMs(0, { randomFn: () => 1 }),
    3_600,
  );
});

test('buildSseStreamUrl appends encoded lastEventId cleanly', () => {
  assert.equal(buildSseStreamUrl('/api/realtime/stream'), '/api/realtime/stream');
  assert.equal(
    buildSseStreamUrl('/api/realtime/stream', '   '),
    '/api/realtime/stream',
  );
  assert.equal(
    buildSseStreamUrl('/api/realtime/stream', 're_ab12:42'),
    '/api/realtime/stream?lastEventId=re_ab12%3A42',
  );
  assert.equal(
    buildSseStreamUrl('/api/chat/stream?foo=bar', 'ce_1:2'),
    '/api/chat/stream?foo=bar&lastEventId=ce_1%3A2',
  );
});

test('parseSseJson safely handles malformed payloads', () => {
  assert.deepEqual(parseSseJson<{ ok: boolean }>('{"ok":true}'), { ok: true });
  assert.equal(parseSseJson('{broken'), null);
  assert.equal(parseSseJson(''), null);
  assert.equal(parseSseJson(null), null);
});
