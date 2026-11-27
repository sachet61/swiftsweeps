import {
  buildSseStreamUrl,
  computeSseReconnectDelayMs,
  parseSseJson,
} from './sseReconnectUtils';

export interface AuditLogRealtimeEvent {
  type: 'audit_log';
  log: {
    id: string;
    actorId: string;
    actorName: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string;
    details: string;
    timestamp: string;
  };
}

export interface DomainInvalidationRealtimeEvent {
  type: 'domain_invalidation';
  tables: string[];
  customerId?: string;
  reason?: string;
  timestamp: string;
}

export type AppRealtimeConnectionStatus =
  | 'SUBSCRIBING'
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'CLOSED';

export interface AppRealtimeListener {
  onAuditLog?: (event: AuditLogRealtimeEvent) => void;
  onDomainInvalidation?: (event: DomainInvalidationRealtimeEvent) => void;
  onStatus?: (status: AppRealtimeConnectionStatus) => void;
  onReconnect?: (reason?: string) => void;
  onResyncRequired?: (reason?: string) => void;
}

const STREAM_URL = '/api/realtime/stream';

class RealtimeStreamClient {
  private listeners = new Set<AppRealtimeListener>();
  private source: EventSource | null = null;
  private currentStatus: AppRealtimeConnectionStatus = 'CLOSED';
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

  private notifyStatus(next: AppRealtimeConnectionStatus): void {
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

    source.addEventListener('audit_log', (evt) => {
      if (this.source !== source) return;
      this.recordEventId(evt);
      const parsed = parseSseJson<AuditLogRealtimeEvent>((evt as MessageEvent).data);
      if (!parsed || parsed.type !== 'audit_log' || !parsed.log?.id) return;
      for (const listener of Array.from(this.listeners)) {
        try {
          listener.onAuditLog?.(parsed);
        } catch {
          // Ignore listener errors
        }
      }
    });

    source.addEventListener('domain_invalidation', (evt) => {
      if (this.source !== source) return;
      this.recordEventId(evt);
      const parsed = parseSseJson<DomainInvalidationRealtimeEvent>(
        (evt as MessageEvent).data,
      );
      if (!parsed || parsed.type !== 'domain_invalidation' || !Array.isArray(parsed.tables)) {
        return;
      }
      for (const listener of Array.from(this.listeners)) {
        try {
          listener.onDomainInvalidation?.(parsed);
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

  public subscribe(listener: AppRealtimeListener): () => void {
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

export const realtimeStreamClient = new RealtimeStreamClient();
