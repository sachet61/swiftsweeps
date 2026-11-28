import type { Logger } from '../logging/logger.js';
import type { AppConfigRepo } from './appConfigRepo.js';
import {
  buildSuppressionLogMetadata,
  scrubTelegramSecret,
  type TelegramDiagnosticEventType,
} from './telegramSuppression.js';

export type TelegramFetchFn = (
  url: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<Record<string, unknown>>;
}>;

export interface TelegramSendResult {
  success: boolean;
  message?: string;
  suggestedChannelId?: string;
}

export interface DispatchTelegramNotificationParams {
  customerId: string;
  conversationId?: string;
  text: string;
  eventType?: TelegramDiagnosticEventType;
}

export interface TelegramDispatcher {
  sendTelegramText: (
    token: string,
    chatId: string,
    text: string,
  ) => Promise<TelegramSendResult>;
  dispatchCustomerTelegramNotification: (
    params: DispatchTelegramNotificationParams,
  ) => Promise<Record<string, unknown>>;
}

const TELEGRAM_HTTP_TIMEOUT_MS = 8_000;

export async function sendTelegramText(
  fetchImpl: TelegramFetchFn,
  token: string,
  chatId: string,
  text: string,
): Promise<TelegramSendResult> {
  const sendReq = async (
    targetChatId: string,
  ): Promise<Record<string, unknown>> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TELEGRAM_HTTP_TIMEOUT_MS);
    try {
      const resp = await fetchImpl(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: targetChatId, text }),
          signal: controller.signal,
        },
      );
      return await resp.json();
    } catch (err) {
      return {
        ok: false,
        description: scrubTelegramSecret(
          err instanceof Error ? err.message : 'Telegram request failed',
          token,
        ),
      };
    } finally {
      clearTimeout(timer);
    }
  };

  let data = await sendReq(chatId);
  const strId = chatId.trim();
  const desc = typeof data.description === 'string' ? data.description : '';
  if (
    !data.ok &&
    desc.includes('chat not found') &&
    strId.startsWith('-') &&
    !strId.startsWith('-100')
  ) {
    const suggestedId = `-100${strId.replace(/^-/, '')}`;
    data = await sendReq(suggestedId);
    if (data.ok) {
      return { success: true, suggestedChannelId: suggestedId };
    }
    return {
      success: false,
      message: scrubTelegramSecret(
        typeof data.description === 'string' ? data.description : desc,
        token,
      ),
      suggestedChannelId: suggestedId,
    };
  }

  return data.ok
    ? { success: true }
    : {
        success: false,
        message: scrubTelegramSecret(
          typeof data.description === 'string'
            ? data.description
            : 'Telegram delivery failed',
          token,
        ),
      };
}

export function createTelegramDispatcher(deps: {
  appConfigRepo: AppConfigRepo;
  telegramFetch?: TelegramFetchFn;
  logger?: Logger;
  nowFn?: () => number;
}): TelegramDispatcher {
  const fetchImpl: TelegramFetchFn =
    deps.telegramFetch ??
    (globalThis.fetch as unknown as TelegramFetchFn);
  const clock = deps.nowFn ?? (() => Date.now());

  const boundSendTelegramText = (
    token: string,
    chatId: string,
    text: string,
  ): Promise<TelegramSendResult> =>
    sendTelegramText(fetchImpl, token, chatId, text);

  const dispatchCustomerTelegramNotification = async (
    params: DispatchTelegramNotificationParams,
  ): Promise<Record<string, unknown>> => {
    const eventType: TelegramDiagnosticEventType =
      params.eventType ?? 'activity_alert';
    const MAX_IN_FLIGHT_WAIT_ATTEMPTS = 60;
    let attempt = 0;

    while (attempt <= MAX_IN_FLIGHT_WAIT_ATTEMPTS) {
      const claim = await deps.appConfigRepo.claimTelegramNotificationDispatch({
        customerId: params.customerId,
        conversationId: params.conversationId,
        nowMs: clock(),
        eventType,
      });

      if (claim.status === 'disabled') {
        return {
          success: false,
          message: 'Telegram bot not configured or disabled',
        };
      }

      if (claim.status === 'suppressed') {
        deps.logger?.info('telegram_notification_suppressed', {
          ...buildSuppressionLogMetadata({
            customerId: claim.customerId,
            evaluation: claim.evaluation,
          }),
          eventType,
        });
        return {
          success: true,
          suppressed: true,
          debounced: true,
          suppressionWindowMinutes: claim.evaluation.windowMinutes,
          message: `Cooldown active (${claim.evaluation.remainingSec}s)`,
        };
      }

      if (claim.status === 'in_flight') {
        attempt += 1;
        if (attempt > MAX_IN_FLIGHT_WAIT_ATTEMPTS) {
          deps.logger?.info('telegram_notification_suppressed', {
            customerId: claim.customerId,
            reason: 'concurrent_dispatch_in_flight',
            suppressionWindowMinutes: claim.suppressionWindowMinutes,
            eventType,
          });
          return {
            success: true,
            suppressed: true,
            debounced: true,
            suppressionWindowMinutes: claim.suppressionWindowMinutes,
            message: 'Concurrent notification dispatch already in progress',
          };
        }
        await new Promise((resolve) => setTimeout(resolve, claim.retryAfterMs));
        continue;
      }

      let sendResult: TelegramSendResult = {
        success: false,
        message: 'Telegram delivery failed',
      };
      try {
        sendResult = await boundSendTelegramText(
          claim.botToken,
          claim.channelId,
          params.text,
        );
      } catch (err) {
        sendResult = {
          success: false,
          message: scrubTelegramSecret(
            err instanceof Error ? err.message : 'Telegram delivery failed',
            claim.botToken,
          ),
        };
      } finally {
        const sentAtMs = clock();
        const safeErr = !sendResult.success
          ? scrubTelegramSecret(
              sendResult.message || 'Telegram delivery failed',
              claim.botToken,
            )
          : undefined;

        await deps.appConfigRepo.finalizeTelegramNotificationDispatch({
          cooldownKey: claim.cooldownKey,
          claimToken: claim.claimToken,
          succeeded: Boolean(sendResult.success),
          sentAtMs,
          suppressionWindowMinutes: claim.suppressionWindowMinutes,
          eventType,
          errorMessage: safeErr,
        });

        if (sendResult.success) {
          deps.logger?.info('telegram_notification_sent', {
            customerId: claim.customerId,
            eventType,
            suppressionWindowMinutes: claim.suppressionWindowMinutes,
          });
        } else {
          deps.logger?.warn('telegram_notification_failed', {
            customerId: claim.customerId,
            eventType,
            suppressionWindowMinutes: claim.suppressionWindowMinutes,
            error: safeErr || 'Telegram delivery failed',
          });
        }
      }

      return sendResult as unknown as Record<string, unknown>;
    }

    return {
      success: false,
      message: 'Telegram delivery failed',
    };
  };

  return {
    sendTelegramText: boundSendTelegramText,
    dispatchCustomerTelegramNotification,
  };
}
