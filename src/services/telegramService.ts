export interface TelegramStatus {
  running: boolean;
  botUsername?: string;
  channelId?: string;
  lastPollTime?: string;
  updatesReceived: number;
  lastError?: string;
  tokenConfigured?: boolean;
  maskedToken?: string;
}

class TelegramService {
  public async getStatus(): Promise<TelegramStatus> {
    try {
      const resp = await fetch('/api/telegram/status', {
        credentials: 'include',
        cache: 'no-store',
      });
      const text = await resp.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (resp.ok && data) {
        return data;
      }
      if (data && (data.error || data.message || data.lastError)) {
        return {
          running: false,
          updatesReceived: 0,
          lastError: data.lastError || data.error || data.message,
        };
      }
      return {
        running: false,
        updatesReceived: 0,
        lastError: `Telegram status unavailable (${resp.status})`,
      };
    } catch (e) {
      console.warn('[TelegramService] getStatus error:', e);
    }
    return {
      running: false,
      updatesReceived: 0,
      lastError: 'Unable to connect to Telegram engine status endpoint',
    };
  }

  public async getConfig(): Promise<{
    success?: boolean;
    botToken?: string;
    channelId?: string;
    enabled?: boolean;
    botUsername?: string;
    tokenConfigured?: boolean;
    maskedToken?: string;
    updatedAt?: string;
    error?: string;
  }> {
    try {
      const resp = await fetch('/api/telegram/config', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        return data;
      }
      return {
        success: false,
        error: data?.error || data?.message || `Failed to load config (${resp.status})`,
      };
    } catch (e: any) {
      console.warn('[TelegramService] getConfig error:', e);
      return { success: false, error: e?.message || 'Unable to load Telegram config' };
    }
  }

  public async saveConfig(
    botToken: string,
    channelId: string,
    enabled: boolean = true
  ): Promise<{ success: boolean; status?: TelegramStatus; config?: any; error?: string }> {
    const cleanToken = botToken.trim();
    const cleanChatId = channelId.trim();

    try {
      const payload: Record<string, unknown> = {
        channelId: cleanChatId,
        enabled,
      };
      if (cleanToken) {
        payload.botToken = cleanToken;
      }

      const resp = await fetch('/api/telegram/config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await resp.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { success: false, error: 'Server returned non-JSON response. Please verify server connection.' };
      }

      if (resp.ok && data.success) {
        return { success: true, status: data.status, config: data.config };
      }
      return { success: false, error: data.error || data.message || `Failed to update configuration (${resp.status})` };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error updating Telegram configuration.' };
    }
  }

  public async testConnection(
    botToken: string,
    channelId: string,
    allowStoredToken: boolean = false
  ): Promise<{ success: boolean; message: string; suggestedChannelId?: string }> {
    const cleanToken = botToken.trim();
    const cleanChatId = channelId.trim();

    if (!cleanToken && !allowStoredToken) {
      return { success: false, message: 'Please provide a Telegram Bot Token.' };
    }
    if (!cleanChatId) {
      return { success: false, message: 'Please provide a Target Chat / Channel ID.' };
    }

    try {
      const payload: Record<string, string> = { channelId: cleanChatId };
      if (cleanToken) {
        payload.botToken = cleanToken;
      }

      const resp = await fetch('/api/telegram/test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await resp.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        return { success: false, message: 'Server returned an invalid response during Telegram test.' };
      }

      if (resp.ok && typeof data.success === 'boolean') {
        return {
          success: data.success,
          message: data.message || (data.success ? 'Telegram test succeeded.' : 'Telegram test failed.'),
          ...(data.suggestedChannelId ? { suggestedChannelId: data.suggestedChannelId } : {}),
        };
      }

      return {
        success: false,
        message: data.error || data.message || `Telegram connection test failed (${resp.status}).`,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Unable to reach Telegram test endpoint.' };
    }
  }

  public async notify(params: {
    title: string;
    text: string;
    customerName?: string;
    customerEmail?: string;
    conversationId?: string;
    actionType?: 'chat' | 'topup' | 'cashout' | 'game_id_request';
    amount?: number;
    gameName?: string;
    proofUrl?: string;
  }): Promise<{ success: boolean; message?: string }> {
    try {
      const resp = await fetch('/api/telegram/notify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const text = await resp.text();
      try {
        return JSON.parse(text);
      } catch {
        return { success: false, message: 'Server response not JSON' };
      }
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  public async notifyCustomerMessage(
    customerName: string,
    conversationId?: string
  ): Promise<{ success: boolean; message?: string; debounced?: boolean }> {
    try {
      const resp = await fetch('/api/telegram/notify-message', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName, conversationId }),
      });
      const data = await resp.json().catch(() => ({}));
      return data;
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}

export const telegramService = new TelegramService();
