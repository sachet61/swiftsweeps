import crypto from 'node:crypto';
import type { ResolvedAppUser } from '../auth/userDirectoryRepo.js';
import {
  parseSseEventCursor,
  type SseEventMeta,
  type SseReplayResult,
} from '../chat/chatEvents.js';

export type RealtimeAudience =
  | { scope: 'admin' }
  | { scope: 'staff' }
  | { scope: 'user'; customerId: string }
  | { scope: 'user_and_staff'; customerId: string }
  | { scope: 'authenticated' };

export interface AuditLogRealtimePayload {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: 'customer' | 'agent' | 'admin' | 'system' | string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  timestamp: string;
}

export type RealtimeStreamEvent =
  | {
      type: 'audit_log';
      log: AuditLogRealtimePayload;
    }
  | {
      type: 'domain_invalidation';
      tables: string[];
      customerId?: string;
      reason?: string;
      timestamp: string;
    };

export interface RealtimeEventEnvelope extends SseEventMeta {
  audience: RealtimeAudience;
  event: RealtimeStreamEvent;
}

export type RealtimeStreamSubscriber = (
  envelope: RealtimeEventEnvelope,
) => void;

/**
 * Enforces strict role & record-ownership isolation for server-side SSE delivery
 * and Last-Event-ID replay.
 */
export function canUserReceiveRealtimeEvent(
  audience: RealtimeAudience,
  user: Pick<ResolvedAppUser, 'appUserId' | 'role'> | null | undefined,
): boolean {
  if (!user || !user.appUserId) {
    return false;
  }

  const isAdmin = user.role === 'admin';
  const isStaff = user.role === 'admin' || user.role === 'agent';

  switch (audience.scope) {
    case 'admin':
      return isAdmin;
    case 'staff':
      return isStaff;
    case 'user':
      return Boolean(audience.customerId) && user.appUserId === audience.customerId;
    case 'user_and_staff':
      return (
        isStaff ||
        (Boolean(audience.customerId) && user.appUserId === audience.customerId)
      );
    case 'authenticated':
      return user.role === 'admin' || user.role === 'agent' || user.role === 'customer';
    default:
      return false;
  }
}

export class RealtimeEventBroker {
  private readonly subscribers = new Set<RealtimeStreamSubscriber>();
  private readonly history: RealtimeEventEnvelope[] = [];
  private readonly maxHistory: number;
  public readonly epoch: string;
  private seq = 0;

  constructor(options?: { maxHistory?: number; epoch?: string }) {
    const requestedMax = options?.maxHistory ?? 250;
    this.maxHistory =
      Number.isSafeInteger(requestedMax) && requestedMax > 0
        ? requestedMax
        : 250;
    this.epoch =
      options?.epoch?.trim() ||
      `re_${crypto.randomBytes(4).toString('hex')}`;
  }

  public get latestEventId(): string {
    return `${this.epoch}:${this.seq}`;
  }

  public get subscriberCount(): number {
    return this.subscribers.size;
  }

  public subscribe(listener: RealtimeStreamSubscriber): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  public emit(
    audience: RealtimeAudience,
    event: RealtimeStreamEvent,
  ): SseEventMeta {
    this.seq += 1;
    const envelope: RealtimeEventEnvelope = {
      eventId: `${this.epoch}:${this.seq}`,
      seq: this.seq,
      audience,
      event,
    };

    this.history.push(envelope);
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }

    for (const listener of [...this.subscribers]) {
      try {
        listener(envelope);
      } catch {
        // Isolate subscriber callback failures
      }
    }

    return { eventId: envelope.eventId, seq: envelope.seq };
  }

  public emitAuditLog(log: AuditLogRealtimePayload): SseEventMeta {
    return this.emit({ scope: 'admin' }, { type: 'audit_log', log });
  }

  public emitDomainInvalidation(
    audience: RealtimeAudience,
    tables: string[],
    reason?: string,
    customerId?: string,
  ): SseEventMeta {
    const cleanTables = Array.from(
      new Set(
        tables
          .map((t) => String(t || '').trim())
          .filter(Boolean),
      ),
    );
    return this.emit(audience, {
      type: 'domain_invalidation',
      tables: cleanTables,
      ...(customerId ? { customerId } : {}),
      ...(reason ? { reason } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  public getReplaySince(
    lastEventId: string | undefined,
  ): SseReplayResult<RealtimeEventEnvelope> {
    if (!lastEventId || !lastEventId.trim()) {
      return { status: 'none' };
    }
    const parsed = parseSseEventCursor(lastEventId);
    if (!parsed) {
      return { status: 'resync_required', reason: 'invalid_cursor' };
    }
    if (parsed.epoch !== this.epoch) {
      return { status: 'resync_required', reason: 'epoch_mismatch' };
    }
    if (parsed.seq > this.seq) {
      return { status: 'resync_required', reason: 'future_cursor' };
    }
    if (parsed.seq === this.seq) {
      return { status: 'replay', events: [] };
    }
    const earliestSeq = this.history[0]?.seq;
    if (earliestSeq === undefined || parsed.seq < earliestSeq - 1) {
      return { status: 'resync_required', reason: 'buffer_evicted' };
    }
    return {
      status: 'replay',
      events: this.history.filter((entry) => entry.seq > parsed.seq),
    };
  }
}
