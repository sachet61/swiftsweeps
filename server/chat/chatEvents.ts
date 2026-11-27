import crypto from 'node:crypto';

export type ChatTicketStatus = 'open' | 'pending' | 'resolved' | 'closed';

export interface ChatMessagePayload {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  attachment_url: string | null;
  attachment_name: string | null;
  transaction_data: Record<string, unknown> | null;
  is_internal_note: boolean;
  created_at: string;
}

export interface ChatConversationPayload {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  agent_id: string | null;
  agent_name: string | null;
  status: ChatTicketStatus;
  last_message: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export type ChatStreamEvent =
  | {
      type: 'chat_message';
      customerId: string;
      conversationId: string;
      isInternalNote: boolean;
      message: ChatMessagePayload;
      conversation?: ChatConversationPayload;
    }
  | {
      type: 'message_updated';
      customerId: string;
      conversationId: string;
      isInternalNote: boolean;
      message: ChatMessagePayload;
    }
  | {
      type: 'conversation_status';
      customerId: string;
      conversationId: string;
      status: ChatTicketStatus;
      conversation: ChatConversationPayload;
    };

export interface SseEventMeta {
  eventId: string;
  seq: number;
}

export interface ChatEventEnvelope extends SseEventMeta {
  event: ChatStreamEvent;
}

export type ChatStreamSubscriber = (
  event: ChatStreamEvent,
  meta: SseEventMeta,
) => void;

export type SseReplayResult<T> =
  | { status: 'none' }
  | { status: 'replay'; events: T[] }
  | {
      status: 'resync_required';
      reason:
        | 'invalid_cursor'
        | 'epoch_mismatch'
        | 'future_cursor'
        | 'buffer_evicted';
    };

const SSE_CURSOR_REGEX = /^([a-zA-Z0-9_-]{4,40}):(\d{1,12})$/;

export function parseSseEventCursor(
  raw: string | undefined,
): { epoch: string; seq: number } | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = SSE_CURSOR_REGEX.exec(trimmed);
  if (!match) return null;
  const seq = Number.parseInt(match[2]!, 10);
  if (!Number.isSafeInteger(seq) || seq < 0) return null;
  return { epoch: match[1]!, seq };
}

export class ChatEventBroker {
  private readonly subscribers = new Set<ChatStreamSubscriber>();
  private readonly history: ChatEventEnvelope[] = [];
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
      `ce_${crypto.randomBytes(4).toString('hex')}`;
  }

  public get latestEventId(): string {
    return `${this.epoch}:${this.seq}`;
  }

  public subscribe(listener: ChatStreamSubscriber): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  public emit(event: ChatStreamEvent): SseEventMeta {
    this.seq += 1;
    const meta: SseEventMeta = {
      eventId: `${this.epoch}:${this.seq}`,
      seq: this.seq,
    };
    this.history.push({ ...meta, event });
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }

    for (const listener of [...this.subscribers]) {
      try {
        listener(event, meta);
      } catch {
        // Isolate subscriber callback errors
      }
    }
    return meta;
  }

  public getReplaySince(
    lastEventId: string | undefined,
  ): SseReplayResult<ChatEventEnvelope> {
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

  public get subscriberCount(): number {
    return this.subscribers.size;
  }
}
