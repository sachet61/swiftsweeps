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

export type ChatStreamSubscriber = (event: ChatStreamEvent) => void;

export class ChatEventBroker {
  private readonly subscribers = new Set<ChatStreamSubscriber>();

  public subscribe(listener: ChatStreamSubscriber): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  public emit(event: ChatStreamEvent): void {
    for (const listener of [...this.subscribers]) {
      try {
        listener(event);
      } catch {
        // Isolate subscriber callback errors
      }
    }
  }

  public get subscriberCount(): number {
    return this.subscribers.size;
  }
}
