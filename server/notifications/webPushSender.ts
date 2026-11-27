import webpush from 'web-push';
import type { ServerConfig } from '../config/env.js';
import type { Logger } from '../logging/logger.js';

export interface WebPushSubscriptionTarget {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface WebPushSendOptions {
  TTL?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  headers?: Record<string, string>;
}

export interface WebPushSender {
  readonly isConfigured: boolean;
  sendNotification(
    subscription: WebPushSubscriptionTarget,
    payload: string,
    options?: WebPushSendOptions,
  ): Promise<void>;
}

export function createWebPushSender(
  config: Pick<ServerConfig, 'vapidPublicKey' | 'vapidPrivateKey' | 'vapidSubject'>,
  logger: Logger,
): WebPushSender {
  const publicKey = config.vapidPublicKey?.trim();
  const privateKey = config.vapidPrivateKey?.trim();
  const subject = config.vapidSubject?.trim() || 'mailto:support@swiftsweeps.com';

  if (!publicKey || !privateKey) {
    return {
      isConfigured: false,
      async sendNotification(): Promise<void> {
        throw new Error('Web Push VAPID keys are not configured.');
      },
    };
  }

  return {
    isConfigured: true,
    async sendNotification(
      subscription: WebPushSubscriptionTarget,
      payload: string,
      options?: WebPushSendOptions,
    ): Promise<void> {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime ?? null,
            keys: subscription.keys,
          },
          payload,
          {
            TTL: options?.TTL ?? 86400,
            urgency: options?.urgency ?? 'high',
            headers: options?.headers ?? { Urgency: 'high' },
            vapidDetails: {
              subject,
              publicKey,
              privateKey,
            },
          },
        );
      } catch (err) {
        const statusCode = Number(
          (err as { statusCode?: unknown; status?: unknown })?.statusCode ??
            (err as { status?: unknown })?.status ??
            0,
        );
        if (statusCode !== 404 && statusCode !== 410) {
          logger.warn('web_push_delivery_failed', {
            statusCode: statusCode || null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        throw err;
      }
    },
  };
}
