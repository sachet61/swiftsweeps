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
    };

export interface ChatStreamListener {
  onChatMessage?: (event: Extract<ChatStreamEventPayload, { type: 'chat_message' }>) => void;
  onMessageUpdated?: (event: Extract<ChatStreamEventPayload, { type: 'message_updated' }>) => void;
  onConversationStatus?: (
    event: Extract<ChatStreamEventPayload, { type: 'conversation_status' }>
  ) => void;
  onStatus?: (status: 'SUBSCRIBING' | 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED') => void;
}

const STREAM_URL = '/api/chat/stream';

class ChatStreamClient {
  private listeners = new Set<ChatStreamListener>();
  private source: EventSource | null = null;
  private currentStatus: 'SUBSCRIBING' | 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED' = 'CLOSED';

  private notifyStatus(next: 'SUBSCRIBING' | 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED'): void {
    this.currentStatus = next;
    for (const listener of Array.from(this.listeners)) {
      try {
        listener.onStatus?.(next);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private openStream(): void {
    if (typeof EventSource === 'undefined' || this.source) {
      return;
    }

    this.notifyStatus('SUBSCRIBING');

    const source = new EventSource(STREAM_URL, { withCredentials: true });
    this.source = source;

    source.onopen = () => {
      if (this.source !== source) return;
      this.notifyStatus('SUBSCRIBED');
    };

    source.addEventListener('ready', () => {
      if (this.source !== source) return;
      this.notifyStatus('SUBSCRIBED');
    });

    source.addEventListener('chat_message', (evt) => {
      if (this.source !== source) return;
      try {
        const parsed = JSON.parse((evt as MessageEvent).data) as Extract<
          ChatStreamEventPayload,
          { type: 'chat_message' }
        >;
        if (!parsed || !parsed.message?.id) return;
        for (const listener of Array.from(this.listeners)) {
          try {
            listener.onChatMessage?.(parsed);
          } catch {
            // Ignore listener errors
          }
        }
      } catch {
        // Ignore malformed SSE payload
      }
    });

    source.addEventListener('message_updated', (evt) => {
      if (this.source !== source) return;
      try {
        const parsed = JSON.parse((evt as MessageEvent).data) as Extract<
          ChatStreamEventPayload,
          { type: 'message_updated' }
        >;
        if (!parsed || !parsed.message?.id) return;
        for (const listener of Array.from(this.listeners)) {
          try {
            listener.onMessageUpdated?.(parsed);
          } catch {
            // Ignore listener errors
          }
        }
      } catch {
        // Ignore malformed SSE payload
      }
    });

    source.addEventListener('conversation_status', (evt) => {
      if (this.source !== source) return;
      try {
        const parsed = JSON.parse((evt as MessageEvent).data) as Extract<
          ChatStreamEventPayload,
          { type: 'conversation_status' }
        >;
        if (!parsed || !parsed.conversationId) return;
        for (const listener of Array.from(this.listeners)) {
          try {
            listener.onConversationStatus?.(parsed);
          } catch {
            // Ignore listener errors
          }
        }
      } catch {
        // Ignore malformed SSE payload
      }
    });

    source.onerror = () => {
      if (this.source !== source) return;
      this.notifyStatus(source.readyState === EventSource.CLOSED ? 'CLOSED' : 'CHANNEL_ERROR');
    };
  }

  private closeStream(): void {
    if (this.source) {
      try {
        this.source.close();
      } catch {
        // Ignore close errors
      }
      this.source = null;
    }
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
    this.closeStream();
    this.openStream();
  }
}

export const chatStreamClient = new ChatStreamClient();
