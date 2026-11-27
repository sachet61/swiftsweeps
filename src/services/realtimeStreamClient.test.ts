import assert from 'node:assert/strict';
import test from 'node:test';
import { realtimeStreamClient } from './realtimeStreamClient';
import { chatStreamClient } from './chatStreamClient';

interface MockEvent {
  data?: string;
  lastEventId?: string;
}

class MockEventSource {
  public static instances: MockEventSource[] = [];
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSED = 2;

  public readonly CONNECTING = 0;
  public readonly OPEN = 1;
  public readonly CLOSED = 2;

  public readyState = MockEventSource.CONNECTING;
  public onopen: ((ev: any) => void) | null = null;
  public onerror: ((ev: any) => void) | null = null;
  public closedCount = 0;
  private readonly listeners = new Map<string, Array<(ev: any) => void>>();

  constructor(
    public readonly url: string,
    public readonly options?: { withCredentials?: boolean },
  ) {
    MockEventSource.instances.push(this);
  }

  public addEventListener(type: string, cb: (ev: any) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(cb);
    this.listeners.set(type, existing);
  }

  public close(): void {
    this.readyState = MockEventSource.CLOSED;
    this.closedCount += 1;
  }

  public emit(type: string, event: MockEvent = {}): void {
    if (type === 'open') {
      this.readyState = MockEventSource.OPEN;
      this.onopen?.(event);
      return;
    }
    if (type === 'error') {
      this.onerror?.(event);
      return;
    }
    for (const cb of this.listeners.get(type) ?? []) {
      cb(event);
    }
  }
}

test('realtimeStreamClient tracks cursor, triggers onReconnect only after reconnect, and cleans up on unsubscribe', async () => {
  const originalEventSource = (globalThis as any).EventSource;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  MockEventSource.instances = [];
  const scheduledTimeouts: Array<{ delay: number; fn: () => void; cleared: boolean }> = [];
  (globalThis as any).EventSource = MockEventSource;
  (globalThis as any).setTimeout = (fn: () => void, delay: number) => {
    const entry = { delay, fn, cleared: false };
    scheduledTimeouts.push(entry);
    return entry as any;
  };
  (globalThis as any).clearTimeout = (handle: any) => {
    if (handle && typeof handle === 'object') {
      handle.cleared = true;
    }
  };

  try {
    const statuses: string[] = [];
    const reconnects: Array<string | undefined> = [];
    const resyncs: Array<string | undefined> = [];
    const auditIds: string[] = [];
    const invalidationTables: string[][] = [];

    const unsub = realtimeStreamClient.subscribe({
      onStatus: (s) => statuses.push(s),
      onReconnect: (r) => reconnects.push(r),
      onResyncRequired: (r) => resyncs.push(r),
      onAuditLog: (e) => auditIds.push(e.log.id),
      onDomainInvalidation: (e) => invalidationTables.push(e.tables),
    });

    assert.equal(MockEventSource.instances.length, 1);
    const first = MockEventSource.instances[0]!;
    assert.equal(first.url, '/api/realtime/stream');
    assert.deepEqual(first.options, { withCredentials: true });

    // Initial connect emits ready -> SUBSCRIBED, MUST NOT fire onReconnect
    first.emit('ready', {
      data: JSON.stringify({ latestEventId: 're_epoch1:0' }),
    });
    assert.deepEqual(statuses, ['SUBSCRIBING', 'SUBSCRIBED']);
    assert.deepEqual(reconnects, []);

    // Incoming events update lastEventId
    first.emit('audit_log', {
      lastEventId: 're_epoch1:1',
      data: JSON.stringify({
        type: 'audit_log',
        log: {
          id: 'aud_1',
          actorId: 'usr_admin',
          actorName: 'Admin',
          actorRole: 'admin',
          action: 'TOPUP_APPROVED',
          entityType: 'topup',
          entityId: 'top_1',
          details: 'Approved $50',
          timestamp: '2026-11-26T10:00:00.000Z',
        },
      }),
    });
    first.emit('domain_invalidation', {
      lastEventId: 're_epoch1:2',
      data: JSON.stringify({
        type: 'domain_invalidation',
        tables: ['topups', 'wallets'],
        timestamp: '2026-11-26T10:00:01.000Z',
      }),
    });
    assert.deepEqual(auditIds, ['aud_1']);
    assert.deepEqual(invalidationTables, [['topups', 'wallets']]);

    // Simulate connection drop -> CLOSED schedules bounded backoff >= 1000ms
    first.readyState = MockEventSource.CLOSED;
    first.emit('error');
    assert.equal(statuses[statuses.length - 1], 'CLOSED');
    assert.equal(scheduledTimeouts.length, 1);
    assert.ok(scheduledTimeouts[0]!.delay >= 3_000);

    // Trigger scheduled reconnect -> opens stream with ?lastEventId=re_epoch1%3A2
    scheduledTimeouts[0]!.fn();
    assert.equal(MockEventSource.instances.length, 2);
    const second = MockEventSource.instances[1]!;
    assert.equal(second.url, '/api/realtime/stream?lastEventId=re_epoch1%3A2');

    second.emit('ready', {
      data: JSON.stringify({ latestEventId: 're_epoch1:3' }),
    });
    assert.deepEqual(reconnects, ['ready']);

    // Server emits resync_required -> triggers onResyncRequired + onReconnect
    second.emit('resync_required', {
      data: JSON.stringify({
        reason: 'buffer_evicted',
        latestEventId: 're_epoch1:10',
      }),
    });
    assert.deepEqual(resyncs, ['buffer_evicted']);
    assert.deepEqual(reconnects, ['ready', 'buffer_evicted']);

    unsub();
    assert.equal(second.closedCount, 1);
  } finally {
    (globalThis as any).EventSource = originalEventSource;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('chatStreamClient passes lastEventId on reconnect and handles resync_required', () => {
  const originalEventSource = (globalThis as any).EventSource;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  MockEventSource.instances = [];
  const scheduledTimeouts: Array<{ delay: number; fn: () => void; cleared: boolean }> = [];
  (globalThis as any).EventSource = MockEventSource;
  (globalThis as any).setTimeout = (fn: () => void, delay: number) => {
    const entry = { delay, fn, cleared: false };
    scheduledTimeouts.push(entry);
    return entry as any;
  };
  (globalThis as any).clearTimeout = (handle: any) => {
    if (handle && typeof handle === 'object') {
      handle.cleared = true;
    }
  };

  try {
    const reconnects: Array<string | undefined> = [];
    const resyncs: Array<string | undefined> = [];
    const msgIds: string[] = [];

    const unsub = chatStreamClient.subscribe({
      onReconnect: (r) => reconnects.push(r),
      onResyncRequired: (r) => resyncs.push(r),
      onChatMessage: (evt) => msgIds.push(evt.message.id),
    });

    const s1 = MockEventSource.instances[0]!;
    s1.emit('ready', { data: JSON.stringify({ latestEventId: 'ce_1:0' }) });
    s1.emit('chat_message', {
      lastEventId: 'ce_1:4',
      data: JSON.stringify({
        type: 'chat_message',
        customerId: 'usr_a',
        conversationId: 'conv_usr_a',
        isInternalNote: false,
        message: {
          id: 'msg_1',
          conversation_id: 'conv_usr_a',
          sender_id: 'usr_a',
          sender_name: 'Alice',
          sender_role: 'customer',
          content: 'hi',
          attachment_url: null,
          attachment_name: null,
          transaction_data: null,
          is_internal_note: false,
          created_at: '2026-11-26T10:00:00.000Z',
        },
        conversation: {
          id: 'conv_usr_a',
          customer_id: 'usr_a',
          customer_name: 'Alice',
          agent_id: null,
          agent_name: 'Support',
          status: 'open',
          last_message: 'hi',
          last_message_at: '2026-11-26T10:00:00.000Z',
          created_at: '2026-11-26T10:00:00.000Z',
        },
      }),
    });

    assert.deepEqual(msgIds, ['msg_1']);
    assert.deepEqual(reconnects, []);

    s1.readyState = MockEventSource.CLOSED;
    s1.emit('error');
    assert.equal(scheduledTimeouts.length, 1);

    scheduledTimeouts[0]!.fn();
    const s2 = MockEventSource.instances[1]!;
    assert.equal(s2.url, '/api/chat/stream?lastEventId=ce_1%3A4');
    s2.emit('ready', { data: JSON.stringify({ latestEventId: 'ce_1:4' }) });
    s2.emit('resync_required', {
      data: JSON.stringify({ reason: 'epoch_mismatch', latestEventId: 'ce_2:0' }),
    });

    assert.deepEqual(resyncs, ['epoch_mismatch']);
    assert.deepEqual(reconnects, ['ready', 'epoch_mismatch']);

    unsub();
    assert.equal(s2.closedCount, 1);
  } finally {
    (globalThis as any).EventSource = originalEventSource;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
