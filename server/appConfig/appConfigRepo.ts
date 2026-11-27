import crypto from 'node:crypto';
import type { AppUserRole } from '../auth/userDirectoryRepo.js';
import type { DatabaseClient, DatabasePool } from '../db/pool.js';
import {
  TELEGRAM_CLAIM_LEASE_MS,
  canonicalCooldownKeyForCustomer,
  evaluateTelegramSuppression,
  normalizeSuppressionWindowMinutes,
  parseTimestampMs,
  pruneInFlightLeases,
  pruneTimestampMap,
  validateSuppressionWindowMinutes,
  type TelegramInFlightLease,
  type TelegramSuppressionEvaluation,
} from './telegramSuppression.js';
import {
  cloneDefaultCashoutRulesConfig,
  normalizeCashoutRulesConfig,
  type CashoutRulesConfig,
} from './cashoutRules.js';

export interface AppConfigActor {
  appUserId: string;
  displayName: string;
  role: AppUserRole;
}

export interface CmsPoliciesPayload {
  cashoutPolicyHtml?: string;
  privacyPolicyHtml?: string;
  termsPolicyHtml?: string;
}

export interface TelegramStoredConfig {
  botToken: string;
  channelId: string;
  enabled: boolean;
  mode: 'zero-egress-notification';
  suppressionWindowMinutes: number;
  updatedAt?: string;
  lastNotifiedByConv: Record<string, number>;
  inFlightByConv?: Record<string, TelegramInFlightLease>;
}

export interface TelegramRedactedConfig {
  channelId: string;
  enabled: boolean;
  tokenConfigured: boolean;
  maskedToken?: string;
  suppressionWindowMinutes: number;
  updatedAt?: string;
  mode: 'zero-egress-notification';
}

export type ClaimTelegramDispatchResult =
  | {
      status: 'disabled';
    }
  | {
      status: 'suppressed';
      customerId: string;
      cooldownKey: string;
      evaluation: TelegramSuppressionEvaluation;
    }
  | {
      status: 'in_flight';
      customerId: string;
      cooldownKey: string;
      suppressionWindowMinutes: number;
      expiresAtMs: number;
      retryAfterMs: number;
    }
  | {
      status: 'claimed';
      customerId: string;
      cooldownKey: string;
      claimToken: string;
      botToken: string;
      channelId: string;
      suppressionWindowMinutes: number;
    };

export interface AppConfigUpdateInput {
  currency?: string;
  paymentMethods?: Array<Record<string, unknown>>;
  withdrawalMethods?: Array<Record<string, unknown>>;
  gatewaySimulator?: Record<string, unknown>;
  cashoutFeed?: Record<string, unknown>;
  platformRules?: Record<string, unknown>;
  cashoutRules?: Record<string, unknown>;
  policies?: CmsPoliciesPayload;
}

export interface PublicAppConfigResult {
  config: Record<string, unknown> | null;
  updatedAt: string | null;
}

export interface AdminAppConfigResult {
  config: Record<string, unknown> | null;
  updatedAt: string | null;
}

export interface FakedCashoutRecord {
  id: string;
  customerName: string;
  playerHandle: string;
  amount: number;
  currency: string;
  methodName: string;
  gameName: string;
  isFake: boolean;
  timestamp: string;
}

export interface ListFakedCashoutsOptions {
  limit: number;
  offset: number;
}

export interface ListFakedCashoutsResult {
  items: FakedCashoutRecord[];
  total: number;
}

export interface CreateFakedCashoutInput {
  id?: string;
  customerName: string;
  amount: number;
  currency: string;
  methodName: string;
  gameName: string;
  isFake: boolean;
  timestamp: string;
}

export class AppConfigValidationError extends Error {
  constructor(message = 'Invalid application configuration.') {
    super(message);
    this.name = 'AppConfigValidationError';
  }
}

export class FakedCashoutNotFoundError extends Error {
  constructor(message = 'Cashout feed entry not found.') {
    super(message);
    this.name = 'FakedCashoutNotFoundError';
  }
}

interface RawAppConfigRow {
  data: unknown;
  updated_at?: Date | string | null;
}

interface RawFakedCashoutRow {
  id: string;
  customer_name: string;
  amount: string | number;
  currency: string;
  method_name: string;
  game_name: string;
  is_fake: boolean;
  timestamp: Date | string;
}

interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

function toIsoString(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) return value;
  return new Date().toISOString();
}

function roundMoney(value: number): number {
  return Math.round(Number(value) * 100) / 100;
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

export function maskTelegramToken(token: string): string | undefined {
  const clean = token.trim();
  if (!clean) return undefined;
  if (clean.length <= 10) return `${clean.slice(0, 2)}...${clean.slice(-2)}`;
  return `${clean.slice(0, 5)}...${clean.slice(-6)}`;
}

export function redactTelegramConfig(raw: unknown): TelegramRedactedConfig {
  const obj = parseJsonObject(raw);
  const botToken = typeof obj.botToken === 'string' ? obj.botToken.trim() : '';
  const channelId = typeof obj.channelId === 'string' ? obj.channelId.trim() : '';
  return {
    channelId,
    enabled: obj.enabled !== false,
    tokenConfigured: Boolean(botToken),
    ...(botToken ? { maskedToken: maskTelegramToken(botToken) } : {}),
    suppressionWindowMinutes: normalizeSuppressionWindowMinutes(
      obj.suppressionWindowMinutes,
    ),
    ...(typeof obj.updatedAt === 'string' && obj.updatedAt.trim()
      ? { updatedAt: obj.updatedAt.trim() }
      : {}),
    mode: 'zero-egress-notification',
  };
}

export function sanitizePublicAppConfigData(
  raw: unknown,
): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  const parsed = parseJsonObject(raw);
  if (Object.keys(parsed).length === 0) return null;

  const clean = { ...parsed };
  delete clean.telegram;
  delete clean.push_subscriptions;
  delete clean.supportedPartners;
  if (
    clean.policies &&
    typeof clean.policies === 'object' &&
    !Array.isArray(clean.policies)
  ) {
    const cleanPolicies = { ...(clean.policies as Record<string, unknown>) };
    delete cleanPolicies.supportedPartners;
    clean.policies = cleanPolicies;
  }
  clean.cashoutRules = normalizeCashoutRulesConfig(clean.cashoutRules);
  return clean;
}

export function sanitizeAdminAppConfigData(
  raw: unknown,
): Record<string, unknown> | null {
  const clean = sanitizePublicAppConfigData(raw);
  if (!clean) return null;
  const parsed = parseJsonObject(raw);
  if (parsed.telegram !== undefined) {
    clean.telegram = redactTelegramConfig(parsed.telegram);
  }
  return clean;
}

function mapFakedCashoutRow(row: RawFakedCashoutRow): FakedCashoutRecord {
  const customerName = String(row.customer_name ?? '').trim();
  return {
    id: String(row.id),
    customerName,
    playerHandle: customerName,
    amount: roundMoney(Number(row.amount ?? 0)),
    currency: String(row.currency || 'USD').trim().toUpperCase(),
    methodName: String(row.method_name ?? '').trim(),
    gameName: String(row.game_name ?? '').trim(),
    isFake: row.is_fake !== false,
    timestamp: toIsoString(row.timestamp),
  };
}

async function runQuery<T extends Record<string, unknown>>(
  executor: Pick<DatabaseClient, 'query'>,
  sql: string,
  params: unknown[],
): Promise<QueryResultLike<T>> {
  return (await executor.query(sql, params)) as QueryResultLike<T>;
}

async function writeSettingsAuditLog(
  client: DatabaseClient,
  params: {
    actor: AppConfigActor;
    action: string;
    entityId: string;
    details: string;
    timestamp: string;
  },
): Promise<void> {
  const auditId = `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  await runQuery(
    client,
    `
      INSERT INTO public.audit_logs (
        id,
        actor_id,
        actor_name,
        actor_role,
        action,
        entity_type,
        entity_id,
        details,
        timestamp
      )
      VALUES ($1, $2, $3, $4, $5, 'settings', $6, $7, $8)
    `,
    [
      auditId,
      params.actor.appUserId,
      params.actor.displayName,
      params.actor.role,
      params.action,
      params.entityId,
      params.details,
      params.timestamp,
    ],
  );
}

export class AppConfigRepo {
  private readonly pool: Pick<DatabasePool, 'query'> &
    Partial<Pick<DatabasePool, 'connect'>>;

  constructor(
    pool: Pick<DatabasePool, 'query'> & Partial<Pick<DatabasePool, 'connect'>>,
  ) {
    this.pool = pool;
  }

  private async withTransaction<T>(
    fn: (client: DatabaseClient) => Promise<T>,
  ): Promise<T> {
    if (typeof this.pool.connect === 'function') {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Ignore secondary rollback error
        }
        throw err;
      } finally {
        client.release();
      }
    }

    const fallbackClient: DatabaseClient = {
      query: (text: string, values?: unknown[]) =>
        this.pool.query(text, values),
      release: () => undefined,
    };
    await fallbackClient.query('BEGIN');
    try {
      const result = await fn(fallbackClient);
      await fallbackClient.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await fallbackClient.query('ROLLBACK');
      } catch {
        // Ignore secondary rollback error
      }
      throw err;
    }
  }

  public async getPublicAppConfig(): Promise<PublicAppConfigResult> {
    const res = await runQuery<RawAppConfigRow & Record<string, unknown>>(
      this.pool,
      `SELECT data, updated_at FROM public.app_config WHERE id = 'main' LIMIT 1`,
      [],
    );
    const row = res.rows[0];
    if (!row) {
      return { config: null, updatedAt: null };
    }
    return {
      config: sanitizePublicAppConfigData(row.data),
      updatedAt: row.updated_at ? toIsoString(row.updated_at) : null,
    };
  }

  public async getAuthoritativeCashoutRules(): Promise<CashoutRulesConfig> {
    const res = await runQuery<RawAppConfigRow & Record<string, unknown>>(
      this.pool,
      `SELECT data FROM public.app_config WHERE id = 'main' LIMIT 1`,
      [],
    );
    const row = res.rows[0];
    if (!row) {
      return cloneDefaultCashoutRulesConfig();
    }
    const parsed = parseJsonObject(row.data);
    return normalizeCashoutRulesConfig(parsed.cashoutRules);
  }

  public async getAdminAppConfig(): Promise<AdminAppConfigResult> {
    const res = await runQuery<RawAppConfigRow & Record<string, unknown>>(
      this.pool,
      `SELECT data, updated_at FROM public.app_config WHERE id = 'main' LIMIT 1`,
      [],
    );
    const row = res.rows[0];
    if (!row) {
      return { config: null, updatedAt: null };
    }
    return {
      config: sanitizeAdminAppConfigData(row.data),
      updatedAt: row.updated_at ? toIsoString(row.updated_at) : null,
    };
  }

  public async updateAppConfig(
    input: AppConfigUpdateInput,
    actor: AppConfigActor,
  ): Promise<AdminAppConfigResult> {
    const nowIso = new Date().toISOString();

    return this.withTransaction(async (client) => {
      const existingRes = await runQuery<
        RawAppConfigRow & Record<string, unknown>
      >(
        client,
        `SELECT data FROM public.app_config WHERE id = 'main' FOR UPDATE`,
        [],
      );
      const currentData = parseJsonObject(existingRes.rows[0]?.data);
      const nextData: Record<string, unknown> = { ...currentData };

      if (input.currency !== undefined) {
        nextData.currency = input.currency;
      }
      if (input.paymentMethods !== undefined) {
        nextData.paymentMethods = input.paymentMethods;
      }
      if (input.withdrawalMethods !== undefined) {
        nextData.withdrawalMethods = input.withdrawalMethods;
      }
      if (input.gatewaySimulator !== undefined) {
        nextData.gatewaySimulator = input.gatewaySimulator;
      }
      if (input.cashoutFeed !== undefined) {
        nextData.cashoutFeed = input.cashoutFeed;
      }
      if (input.platformRules !== undefined) {
        nextData.platformRules = input.platformRules;
      }
      if (input.cashoutRules !== undefined) {
        nextData.cashoutRules = {
          ...normalizeCashoutRulesConfig(input.cashoutRules),
          updatedAt: nowIso,
        };
      }
      if (input.policies !== undefined) {
        const prevPolicies = parseJsonObject(currentData.policies);
        delete prevPolicies.supportedPartners;
        nextData.policies = {
          ...prevPolicies,
          ...input.policies,
        };
      }

      delete nextData.push_subscriptions;
      delete nextData.supportedPartners;

      const upsertRes = await runQuery<
        RawAppConfigRow & Record<string, unknown>
      >(
        client,
        `
          INSERT INTO public.app_config (id, data, updated_at)
          VALUES ('main', $1::jsonb, $2::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
          RETURNING data, updated_at
        `,
        [JSON.stringify(nextData), nowIso],
      );

      await writeSettingsAuditLog(client, {
        actor,
        action: 'APP_CONFIG_UPDATED',
        entityId: 'global_config',
        details: 'Updated payment methods, cashout ticker, or platform disclosures.',
        timestamp: nowIso,
      });

      const savedRow = upsertRes.rows[0];
      return {
        config: sanitizeAdminAppConfigData(savedRow?.data ?? nextData),
        updatedAt: savedRow?.updated_at
          ? toIsoString(savedRow.updated_at)
          : nowIso,
      };
    });
  }

  public async updateCmsPolicies(
    policies: CmsPoliciesPayload,
    actor: AppConfigActor,
  ): Promise<{ policies: Record<string, unknown>; updatedAt: string }> {
    const nowIso = new Date().toISOString();

    return this.withTransaction(async (client) => {
      const existingRes = await runQuery<
        RawAppConfigRow & Record<string, unknown>
      >(
        client,
        `SELECT data FROM public.app_config WHERE id = 'main' FOR UPDATE`,
        [],
      );
      const currentData = parseJsonObject(existingRes.rows[0]?.data);
      const prevPolicies = parseJsonObject(currentData.policies);
      delete prevPolicies.supportedPartners;

      const mergedPolicies = {
        ...prevPolicies,
        ...policies,
      };
      const nextData: Record<string, unknown> = {
        ...currentData,
        policies: mergedPolicies,
      };
      delete nextData.push_subscriptions;
      delete nextData.supportedPartners;

      const upsertRes = await runQuery<
        RawAppConfigRow & Record<string, unknown>
      >(
        client,
        `
          INSERT INTO public.app_config (id, data, updated_at)
          VALUES ('main', $1::jsonb, $2::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
          RETURNING updated_at
        `,
        [JSON.stringify(nextData), nowIso],
      );

      await writeSettingsAuditLog(client, {
        actor,
        action: 'CMS_POLICIES_UPDATED',
        entityId: 'cms_policies',
        details: 'Updated Cashout Policy, Privacy Disclosures, or Terms of Service.',
        timestamp: nowIso,
      });

      return {
        policies: mergedPolicies,
        updatedAt: upsertRes.rows[0]?.updated_at
          ? toIsoString(upsertRes.rows[0].updated_at)
          : nowIso,
      };
    });
  }

  public async getTelegramInternalConfig(): Promise<TelegramStoredConfig> {
    const res = await runQuery<RawAppConfigRow & Record<string, unknown>>(
      this.pool,
      `SELECT data FROM public.app_config WHERE id = 'main' LIMIT 1`,
      [],
    );
    const data = parseJsonObject(res.rows[0]?.data);
    const tg = parseJsonObject(data.telegram);
    const rawNotified = parseJsonObject(tg.lastNotifiedByConv);
    const lastNotifiedByConv: Record<string, number> = {};
    for (const [key, val] of Object.entries(rawNotified)) {
      const ts = parseTimestampMs(val);
      if (ts !== null) {
        lastNotifiedByConv[key.toLowerCase()] = ts;
      }
    }
    return {
      botToken: typeof tg.botToken === 'string' ? tg.botToken.trim() : '',
      channelId: typeof tg.channelId === 'string' ? tg.channelId.trim() : '',
      enabled: tg.enabled !== false,
      mode: 'zero-egress-notification',
      suppressionWindowMinutes: normalizeSuppressionWindowMinutes(
        tg.suppressionWindowMinutes,
      ),
      updatedAt: typeof tg.updatedAt === 'string' ? tg.updatedAt : undefined,
      lastNotifiedByConv,
    };
  }

  public async saveTelegramConfig(
    input: {
      botToken?: string;
      channelId?: string;
      enabled: boolean;
      suppressionWindowMinutes?: number;
    },
    actor: AppConfigActor,
  ): Promise<TelegramRedactedConfig> {
    const nowIso = new Date().toISOString();
    const windowCheck = validateSuppressionWindowMinutes(
      input.suppressionWindowMinutes,
    );
    if (!windowCheck.valid) {
      throw new AppConfigValidationError(windowCheck.error);
    }

    return this.withTransaction(async (client) => {
      const existingRes = await runQuery<
        RawAppConfigRow & Record<string, unknown>
      >(
        client,
        `SELECT data FROM public.app_config WHERE id = 'main' FOR UPDATE`,
        [],
      );
      const currentData = parseJsonObject(existingRes.rows[0]?.data);
      const currentTg = parseJsonObject(currentData.telegram);
      const existingToken =
        typeof currentTg.botToken === 'string' ? currentTg.botToken.trim() : '';
      const existingChannel =
        typeof currentTg.channelId === 'string' ? currentTg.channelId.trim() : '';

      const nextToken = input.botToken?.trim() || existingToken;
      const nextChannel = input.channelId?.trim() || existingChannel;
      if (!nextToken) {
        throw new AppConfigValidationError('Telegram Bot API Token is required.');
      }
      if (!nextChannel) {
        throw new AppConfigValidationError('Target Telegram Channel / Chat ID is required.');
      }

      const nextSuppressionMinutes =
        windowCheck.value !== undefined
          ? windowCheck.value
          : normalizeSuppressionWindowMinutes(currentTg.suppressionWindowMinutes);

      const existingInFlight = parseJsonObject(currentTg.inFlightByConv);

      const nextTg: TelegramStoredConfig = {
        botToken: nextToken,
        channelId: nextChannel,
        enabled: input.enabled,
        mode: 'zero-egress-notification',
        suppressionWindowMinutes: nextSuppressionMinutes,
        updatedAt: nowIso,
        lastNotifiedByConv: parseJsonObject(
          currentTg.lastNotifiedByConv,
        ) as Record<string, number>,
        ...(Object.keys(existingInFlight).length > 0
          ? {
              inFlightByConv: existingInFlight as Record<
                string,
                TelegramInFlightLease
              >,
            }
          : {}),
      };

      const nextData: Record<string, unknown> = {
        ...currentData,
        telegram: nextTg,
      };
      delete nextData.push_subscriptions;
      delete nextData.supportedPartners;

      await runQuery(
        client,
        `
          INSERT INTO public.app_config (id, data, updated_at)
          VALUES ('main', $1::jsonb, $2::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
        `,
        [JSON.stringify(nextData), nowIso],
      );

      await writeSettingsAuditLog(client, {
        actor,
        action: 'TELEGRAM_CONFIG_UPDATED',
        entityId: 'telegram_bot',
        details: `Updated Telegram alerts (${nextTg.enabled ? 'enabled' : 'paused'}, channel ${nextTg.channelId}, suppression ${nextTg.suppressionWindowMinutes}m).`,
        timestamp: nowIso,
      });

      return redactTelegramConfig(nextTg);
    });
  }

  public async claimTelegramNotificationDispatch(params: {
    customerId: string;
    conversationId?: string;
    nowMs: number;
  }): Promise<ClaimTelegramDispatchResult> {
    const cleanCustomerId = params.customerId.trim();
    const cooldownKey = canonicalCooldownKeyForCustomer(cleanCustomerId);
    const candidateConvIds = Array.from(
      new Set(
        [
          `conv_${cleanCustomerId}`,
          params.conversationId?.trim() || '',
        ].filter(Boolean),
      ),
    );

    return this.withTransaction(async (client) => {
      const existingRes = await runQuery<
        RawAppConfigRow & Record<string, unknown>
      >(
        client,
        `SELECT data FROM public.app_config WHERE id = 'main' FOR UPDATE`,
        [],
      );
      const currentData = parseJsonObject(existingRes.rows[0]?.data);
      const currentTg = parseJsonObject(currentData.telegram);
      const botToken =
        typeof currentTg.botToken === 'string' ? currentTg.botToken.trim() : '';
      const channelId =
        typeof currentTg.channelId === 'string' ? currentTg.channelId.trim() : '';
      const enabled = currentTg.enabled !== false;

      if (!botToken || !channelId || !enabled) {
        return { status: 'disabled' };
      }

      const suppressionWindowMinutes = normalizeSuppressionWindowMinutes(
        currentTg.suppressionWindowMinutes,
      );

      const rawNotified = parseJsonObject(currentTg.lastNotifiedByConv);
      const lastTelegramSentAtMs = parseTimestampMs(
        rawNotified[cooldownKey] ?? rawNotified[`conv_${cleanCustomerId}`],
      );

      let lastOutboundMessageSentAtMs: number | null = null;
      const regRes = await runQuery<{ reg: string | null } & Record<string, unknown>>(
        client,
        `SELECT to_regclass('public.messages')::text AS reg`,
        [],
      );
      if (regRes.rows[0]?.reg && candidateConvIds.length > 0) {
        const msgRes = await runQuery<
          { last_sent_at: Date | string | null } & Record<string, unknown>
        >(
          client,
          `
            SELECT MAX(sent_at) AS last_sent_at
            FROM public.messages
            WHERE conversation_id = ANY($1::text[])
              AND sender_role IN ('agent', 'admin', 'system')
              AND COALESCE(is_internal_note, false) = false
              AND delivery_status = 'sent'
              AND sent_at IS NOT NULL
          `,
          [candidateConvIds],
        );
        lastOutboundMessageSentAtMs = parseTimestampMs(
          msgRes.rows[0]?.last_sent_at,
        );
      }

      const evaluation = evaluateTelegramSuppression({
        suppressionWindowMinutes,
        nowMs: params.nowMs,
        lastTelegramSentAtMs,
        lastOutboundMessageSentAtMs,
      });

      if (evaluation.suppressed) {
        return {
          status: 'suppressed',
          customerId: cleanCustomerId,
          cooldownKey,
          evaluation,
        };
      }

      const activeLeases = pruneInFlightLeases(
        parseJsonObject(currentTg.inFlightByConv),
        params.nowMs,
      );
      const existingLease = activeLeases[cooldownKey];
      if (existingLease && existingLease.expiresAtMs > params.nowMs) {
        return {
          status: 'in_flight',
          customerId: cleanCustomerId,
          cooldownKey,
          suppressionWindowMinutes,
          expiresAtMs: existingLease.expiresAtMs,
          retryAfterMs: 30,
        };
      }

      const claimToken = crypto.randomBytes(12).toString('hex');
      activeLeases[cooldownKey] = {
        token: claimToken,
        expiresAtMs: params.nowMs + TELEGRAM_CLAIM_LEASE_MS,
      };

      const nextData: Record<string, unknown> = {
        ...currentData,
        telegram: {
          ...currentTg,
          inFlightByConv: activeLeases,
        },
      };

      const nowIso = new Date(params.nowMs).toISOString();
      await runQuery(
        client,
        `
          INSERT INTO public.app_config (id, data, updated_at)
          VALUES ('main', $1::jsonb, $2::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
        `,
        [JSON.stringify(nextData), nowIso],
      );

      return {
        status: 'claimed',
        customerId: cleanCustomerId,
        cooldownKey,
        claimToken,
        botToken,
        channelId,
        suppressionWindowMinutes,
      };
    });
  }

  public async finalizeTelegramNotificationDispatch(params: {
    cooldownKey: string;
    claimToken: string;
    succeeded: boolean;
    sentAtMs: number;
    suppressionWindowMinutes: number;
  }): Promise<void> {
    const nowIso = new Date(params.sentAtMs).toISOString();

    await this.withTransaction(async (client) => {
      const existingRes = await runQuery<
        RawAppConfigRow & Record<string, unknown>
      >(
        client,
        `SELECT data FROM public.app_config WHERE id = 'main' FOR UPDATE`,
        [],
      );
      const currentData = parseJsonObject(existingRes.rows[0]?.data);
      const currentTg = parseJsonObject(currentData.telegram);

      const activeLeases = pruneInFlightLeases(
        parseJsonObject(currentTg.inFlightByConv),
        params.sentAtMs,
      );
      if (activeLeases[params.cooldownKey]?.token === params.claimToken) {
        delete activeLeases[params.cooldownKey];
      }

      let nextLastNotified = parseJsonObject(currentTg.lastNotifiedByConv);
      if (params.succeeded) {
        const cleaned = pruneTimestampMap(
          nextLastNotified,
          params.sentAtMs,
          params.suppressionWindowMinutes * 60_000,
        );
        cleaned[params.cooldownKey] = params.sentAtMs;
        nextLastNotified = cleaned;
      }

      const nextTg: Record<string, unknown> = {
        ...currentTg,
        lastNotifiedByConv: nextLastNotified,
      };
      if (Object.keys(activeLeases).length > 0) {
        nextTg.inFlightByConv = activeLeases;
      } else {
        delete nextTg.inFlightByConv;
      }

      const nextData: Record<string, unknown> = {
        ...currentData,
        telegram: nextTg,
      };

      await runQuery(
        client,
        `
          INSERT INTO public.app_config (id, data, updated_at)
          VALUES ('main', $1::jsonb, $2::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
        `,
        [JSON.stringify(nextData), nowIso],
      );
    });
  }

  public async recordTelegramConversationCooldown(params: {
    cooldownKey: string;
    nowMs: number;
  }): Promise<void> {
    const nowIso = new Date(params.nowMs).toISOString();

    await this.withTransaction(async (client) => {
      const existingRes = await runQuery<
        RawAppConfigRow & Record<string, unknown>
      >(
        client,
        `SELECT data FROM public.app_config WHERE id = 'main' FOR UPDATE`,
        [],
      );
      const currentData = parseJsonObject(existingRes.rows[0]?.data);
      const currentTg = parseJsonObject(currentData.telegram);
      const windowMinutes = normalizeSuppressionWindowMinutes(
        currentTg.suppressionWindowMinutes,
      );
      const existingMap = parseJsonObject(currentTg.lastNotifiedByConv);
      const pruned = pruneTimestampMap(
        existingMap,
        params.nowMs,
        windowMinutes * 60_000,
      );
      pruned[params.cooldownKey.toLowerCase()] = params.nowMs;

      const nextData: Record<string, unknown> = {
        ...currentData,
        telegram: {
          ...currentTg,
          lastNotifiedByConv: pruned,
        },
      };

      await runQuery(
        client,
        `
          INSERT INTO public.app_config (id, data, updated_at)
          VALUES ('main', $1::jsonb, $2::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
        `,
        [JSON.stringify(nextData), nowIso],
      );
    });
  }

  public async listFakedCashouts(
    options: ListFakedCashoutsOptions,
  ): Promise<ListFakedCashoutsResult> {
    const countRes = await runQuery<{ total: string | number } & Record<string, unknown>>(
      this.pool,
      `SELECT COUNT(*)::int AS total FROM public.faked_cashouts`,
      [],
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const rowsRes = await runQuery<RawFakedCashoutRow & Record<string, unknown>>(
      this.pool,
      `
        SELECT id, customer_name, amount, currency, method_name, game_name, is_fake, timestamp
        FROM public.faked_cashouts
        ORDER BY timestamp DESC, id DESC
        LIMIT $1 OFFSET $2
      `,
      [options.limit, options.offset],
    );

    return {
      items: rowsRes.rows.map(mapFakedCashoutRow),
      total,
    };
  }

  public async createFakedCashout(
    input: CreateFakedCashoutInput,
    actor: AppConfigActor,
  ): Promise<FakedCashoutRecord> {
    const nowIso = new Date().toISOString();
    const rowId =
      input.id?.trim() ||
      `fake_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const amount = roundMoney(input.amount);

    return this.withTransaction(async (client) => {
      const insertRes = await runQuery<
        RawFakedCashoutRow & Record<string, unknown>
      >(
        client,
        `
          INSERT INTO public.faked_cashouts (
            id,
            customer_name,
            amount,
            currency,
            method_name,
            game_name,
            is_fake,
            timestamp
          )
          VALUES ($1, $2, $3::numeric(12, 2), $4, $5, $6, $7, $8::timestamptz)
          RETURNING id, customer_name, amount, currency, method_name, game_name, is_fake, timestamp
        `,
        [
          rowId,
          input.customerName,
          amount.toFixed(2),
          input.currency,
          input.methodName,
          input.gameName,
          input.isFake,
          input.timestamp,
        ],
      );

      const created = mapFakedCashoutRow(insertRes.rows[0]!);
      await writeSettingsAuditLog(client, {
        actor,
        action: 'FAKED_CASHOUT_CREATED',
        entityId: created.id,
        details: `Created simulated cashout feed item for ${created.customerName} ($${created.amount.toFixed(2)}).`,
        timestamp: nowIso,
      });

      return created;
    });
  }

  public async reseedFakedCashouts(
    items: CreateFakedCashoutInput[],
    actor: AppConfigActor,
  ): Promise<FakedCashoutRecord[]> {
    const nowIso = new Date().toISOString();

    return this.withTransaction(async (client) => {
      await runQuery(client, `DELETE FROM public.faked_cashouts`, []);

      const inserted: FakedCashoutRecord[] = [];
      for (let idx = 0; idx < items.length; idx += 1) {
        const item = items[idx]!;
        const rowId =
          item.id?.trim() ||
          `fake_${Date.now()}_${idx}_${crypto.randomBytes(3).toString('hex')}`;
        const amount = roundMoney(item.amount);
        const res = await runQuery<RawFakedCashoutRow & Record<string, unknown>>(
          client,
          `
            INSERT INTO public.faked_cashouts (
              id,
              customer_name,
              amount,
              currency,
              method_name,
              game_name,
              is_fake,
              timestamp
            )
            VALUES ($1, $2, $3::numeric(12, 2), $4, $5, $6, $7, $8::timestamptz)
            RETURNING id, customer_name, amount, currency, method_name, game_name, is_fake, timestamp
          `,
          [
            rowId,
            item.customerName,
            amount.toFixed(2),
            item.currency,
            item.methodName,
            item.gameName,
            item.isFake,
            item.timestamp,
          ],
        );
        inserted.push(mapFakedCashoutRow(res.rows[0]!));
      }

      await writeSettingsAuditLog(client, {
        actor,
        action: 'FAKED_CASHOUT_RESEEDED',
        entityId: 'faked_cashouts',
        details: `Reseeded live payout ticker with ${inserted.length} simulated cashout entries.`,
        timestamp: nowIso,
      });

      return inserted;
    });
  }

  public async deleteFakedCashout(
    id: string,
    actor: AppConfigActor,
  ): Promise<FakedCashoutRecord> {
    const nowIso = new Date().toISOString();

    return this.withTransaction(async (client) => {
      const delRes = await runQuery<RawFakedCashoutRow & Record<string, unknown>>(
        client,
        `
          DELETE FROM public.faked_cashouts
          WHERE id = $1
          RETURNING id, customer_name, amount, currency, method_name, game_name, is_fake, timestamp
        `,
        [id],
      );

      if (!delRes.rows[0]) {
        throw new FakedCashoutNotFoundError('Cashout feed entry not found.');
      }

      const deleted = mapFakedCashoutRow(delRes.rows[0]);
      await writeSettingsAuditLog(client, {
        actor,
        action: 'FAKED_CASHOUT_DELETED',
        entityId: deleted.id,
        details: `Deleted simulated cashout feed item ${deleted.id} (${deleted.customerName}).`,
        timestamp: nowIso,
      });

      return deleted;
    });
  }
}
