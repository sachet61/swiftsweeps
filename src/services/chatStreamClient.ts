import {
  buildSseStreamUrl,
  computeSseReconnectDelayMs,
  parseSseJson,
} from './sseReconnectUtils';

export interface ChatStreamConversationRow {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email?: string | null;
  agent_id: string | null;
  agent_name: string | null;
  status: 'open' | 'pending' | 'resolved' | 'closed' | string;
  last_message: string;
  last_message_at: string;
  created_at: string;
  updated_at?: string;
  pinned_message_id?: string | null;
  pinned_rules_version?: string | null;
  pinned_at?: string | null;
  pinned_by_id?: string | null;
  pinned_by_name?: string | null;
  pinned_message_text?: string | null;
}

export interface ChatStreamMessageRow {
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

export type ChatStreamEventPayload =
  | {
      type: 'chat_message';
      customerId: string;
      conversationId: string;
      isInternalNote: boolean;
      message: ChatStreamMessageRow;
      conversation: ChatStreamConversationRow;
    }
  | {
      type: 'message_updated';
      customerId: string;
      conversationId: string;
      isInternalNote: boolean;
      message: ChatStreamMessageRow;
    }
  | {
      type: 'conversation_status';
      customerId: string;
      conversationId: string;
      status: string;
      conversation: ChatStreamConversationRow;
    }
  | {
      type: 'conversation_pin_updated';
      customerId: string;
      conversationId: string;
      conversation: ChatStreamConversationRow;
    };

export type ChatStreamConnectionStatus =
  | 'SUBSCRIBING'
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'CLOSED';

export interface ChatStreamListener {
  onChatMessage?: (event: Extract<ChatStreamEventPayload, { type: 'chat_message' }>) => void;
  onMessageUpdated?: (event: Extract<ChatStreamEventPayload, { type: 'message_updated' }>) => void;
  onConversationStatus?: (
    event: Extract<ChatStreamEventPayload, { type: 'conversation_status' }>
  ) => void;
  onConversationPinUpdated?: (
    event: Extract<ChatStreamEventPayload, { type: 'conversation_pin_updated' }>
  ) => void;
  onStatus?: (status: ChatStreamConnectionStatus) => void;
  onReconnect?: (reason?: string) => void;
  onResyncRequired?: (reason?: string) => void;
}

const STREAM_URL = '/api/chat/stream';

class ChatStreamClient {
  private listeners = new Set<ChatStreamListener>();
  private source: EventSource | null = null;
  private currentStatus: ChatStreamConnectionStatus = 'CLOSED';
  private hasConnectedOnce = false;
  private lastEventId: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private notifyStatus(next: ChatStreamConnectionStatus): void {
    this.currentStatus = next;
    for (const listener of Array.from(this.listeners)) {
      try {
        listener.onStatus?.(next);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private notifyReconnect(reason?: string): void {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener.onReconnect?.(reason);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.listeners.size === 0 || typeof EventSource === 'undefined') {
      return;
    }
    const delayMs = computeSseReconnectDelayMs(this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.listeners.size === 0 || this.source) return;
      this.openStream();
    }, delayMs);
  }

  private recordEventId(evt: Event): void {
    const id = (evt as MessageEvent).lastEventId;
    if (typeof id === 'string' && id.trim()) {
      this.lastEventId = id.trim();
    }
  }

  private openStream(): void {
    if (typeof EventSource === 'undefined' || this.source) {
      return;
    }

    this.clearReconnectTimer();
    this.notifyStatus('SUBSCRIBING');

    const url = buildSseStreamUrl(STREAM_URL, this.lastEventId);
    const source = new EventSource(url, { withCredentials: true });
    this.source = source;
    let connectedThisStream = false;

    const markConnected = (reason?: string) => {
      if (this.source !== source) return;
      this.reconnectAttempts = 0;
      if (!connectedThisStream) {
        connectedThisStream = true;
        const wasReconnect = this.hasConnectedOnce;
        this.hasConnectedOnce = true;
        this.notifyStatus('SUBSCRIBED');
        if (wasReconnect) {
          this.notifyReconnect(reason || 'stream_reconnected');
        }
      } else {
        this.notifyStatus('SUBSCRIBED');
      }
    };

    source.onopen = () => {
      markConnected('event_source_open');
    };

    source.addEventListener('ready', (evt) => {
      if (this.source !== source) return;
      const readyPayload = parseSseJson<{ latestEventId?: string }>(
        (evt as MessageEvent).data,
      );
      if (
        !this.lastEventId &&
        typeof readyPayload?.latestEventId === 'string' &&
        readyPayload.latestEventId.trim()
      ) {
        this.lastEventId = readyPayload.latestEventId.trim();
      }
      markConnected('ready');
    });

    source.addEventListener('resync_required', (evt) => {
      if (this.source !== source) return;
      const payload = parseSseJson<{ reason?: string; latestEventId?: string }>(
        (evt as MessageEvent).data,
      );
      this.lastEventId =
        typeof payload?.latestEventId === 'string' && payload.latestEventId.trim()
          ? payload.latestEventId.trim()
          : null;
      const reason = payload?.reason || 'resync_required';
      for (const listener of Array.from(this.listeners)) {
        try {
          listener.onResyncRequired?.(reason);
        } catch {
          // Ignore listener errors
        }
      }
      this.notifyReconnect(reason);
    });

    source.addEventListener('chat_message', (evt) => {
      if (this.source !== source) return;
      this.recordEventId(evt);
      const parsed = parseSseJson<
        Extract<ChatStreamEventPayload, { type: 'chat_message' }>
      >((evt as MessageEvent).data);
      if (!parsed || !parsed.message?.id) return;
      for (const listener of Array.from(this.listeners)) {
        try {
          listener.onChatMessage?.(parsed);
        } catch {
          // Ignore listener errors
        }
      }
    });

    source.addEventListener('message_updated', (evt) => {
      if (this.source !== source) return;
      this.recordEventId(evt);
      const parsed = parseSseJson<
        Extract<ChatStreamEventPayload, { type: 'message_updated' }>
      >((evt as MessageEvent).data);
      if (!parsed || !parsed.message?.id) return;
      for (const listener of Array.from(this.listeners)) {
        try {
          listener.onMessageUpdated?.(parsed);
        } catch {
          // Ignore listener errors
        }
      }
    });

    source.addEventListener('conversation_status', (evt) => {
      if (this.source !== source) return;
      this.recordEventId(evt);
      const parsed = parseSseJson<
        Extract<ChatStreamEventPayload, { type: 'conversation_status' }>
      >((evt as MessageEvent).data);
      if (!parsed || !parsed.conversationId) return;
      for (const listener of Array.from(this.listeners)) {
        try {
          listener.onConversationStatus?.(parsed);
        } catch {
          // Ignore listener errors
        }
      }
    });

    source.addEventListener('conversation_pin_updated', (evt) => {
      if (this.source !== source) return;
      this.recordEventId(evt);
      const parsed = parseSseJson<
        Extract<ChatStreamEventPayload, { type: 'conversation_pin_updated' }>
      >((evt as MessageEvent).data);
      if (!parsed || !parsed.conversationId || !parsed.conversation) return;
      for (const listener of Array.from(this.listeners)) {
        try {
          listener.onConversationPinUpdated?.(parsed);
        } catch {
          // Ignore listener errors
        }
      }
    });

    source.onerror = () => {
      if (this.source !== source) return;
      if (source.readyState === EventSource.CLOSED) {
        try {
          source.close();
        } catch {
          // Ignore close errors
        }
        this.source = null;
        this.notifyStatus('CLOSED');
        this.scheduleReconnect();
      } else {
        this.notifyStatus('CHANNEL_ERROR');
      }
    };
  }

  private closeStream(): void {
    this.clearReconnectTimer();
    if (this.source) {
      try {
        this.source.close();
      } catch {
        // Ignore close errors
      }
      this.source = null;
    }
    this.hasConnectedOnce = false;
    this.lastEventId = null;
    this.reconnectAttempts = 0;
    this.currentStatus = 'CLOSED';
  }

  public subscribe(listener: ChatStreamListener): () => void {
    this.listeners.add(listener);

    if (typeof EventSource !== 'undefined') {
      if (!this.source) {
        this.openStream();
      } else {
        try {
          listener.onStatus?.(this.currentStatus);
        } catch {
          // Ignore
        }
      }
    }

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.closeStream();
      }
    };
  }

  public reconnectIfActive(): void {
    if (this.listeners.size === 0 || typeof EventSource === 'undefined') {
      return;
    }
    const preservedCursor = this.lastEventId;
    this.clearReconnectTimer();
    if (this.source) {
      try {
        this.source.close();
      } catch {
        // Ignore
      }
      this.source = null;
    }
    this.lastEventId = preservedCursor;
    this.reconnectAttempts = 0;
    this.openStream();
  }
}

export const chatStreamClient = new ChatStreamClient();
