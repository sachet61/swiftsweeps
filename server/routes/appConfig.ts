import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import {
  AppConfigValidationError,
  FakedCashoutNotFoundError,
  type AppConfigRepo,
  type AppConfigUpdateInput,
  type CmsPoliciesPayload,
  type CreateFakedCashoutInput,
} from '../appConfig/appConfigRepo.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';
import type { RealtimeEventBroker } from '../realtime/realtimeEvents.js';

export type TelegramFetchFn = (
  url: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<Record<string, unknown>>;
}>;

export interface AppConfigRouterDeps {
  appConfigRepo: AppConfigRepo;
  requireAuth: RequestHandler;
  realtimeEvents?: RealtimeEventBroker;
  telegramFetch?: TelegramFetchFn;
}

const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const STRICT_CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;
const ID_REGEX = /^[a-zA-Z0-9_.:-]{1,120}$/;

const PRIVILEGED_BODY_KEYS = new Set([
  'actorId',
  'actorName',
  'actorRole',
  'actingUserId',
  'role',
  'telegram',
  'push_subscriptions',
  'supportedPartners',
  'wheelOfLuck',
  'referralProgram',
]);

const ALLOWED_APP_CONFIG_UPDATE_KEYS = new Set([
  'currency',
  'paymentMethods',
  'withdrawalMethods',
  'gatewaySimulator',
  'cashoutFeed',
  'platformRules',
  'policies',
]);

const ALLOWED_POLICIES_KEYS = new Set([
  'cashoutPolicyHtml',
  'privacyPolicyHtml',
  'termsPolicyHtml',
]);

const ALLOWED_FAKED_CASHOUT_QUERY_KEYS = new Set(['limit', 'offset']);
const ALLOWED_FAKED_CASHOUT_BODY_KEYS = new Set([
  'customerName',
  'playerHandle',
  'amount',
  'currency',
  'methodName',
  'gameName',
  'isFake',
  'timestamp',
]);
const ALLOWED_RESEED_BODY_KEYS = new Set(['items']);

const ALLOWED_TELEGRAM_CONFIG_KEYS = new Set(['botToken', 'channelId', 'enabled']);
const ALLOWED_TELEGRAM_TEST_KEYS = new Set(['botToken', 'channelId']);
const ALLOWED_TELEGRAM_NOTIFY_MSG_KEYS = new Set([
  'customerName',
  'conversationId',
]);
const ALLOWED_TELEGRAM_NOTIFY_KEYS = new Set([
  'title',
  'text',
  'message',
  'customerName',
  'customerEmail',
  'conversationId',
  'actionType',
  'amount',
  'gameName',
  'proofUrl',
]);

const ALLOWED_PAYMENT_METHOD_TYPES = new Set([
  'payment_link',
  'cashapp',
  'chime',
  'crypto',
]);

function assertObjectRecord(
  raw: unknown,
  message = 'Request body must be a JSON object.',
): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }
  return raw as Record<string, unknown>;
}

function assertAllowedKeys(
  body: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  noun: string,
  extraForbiddenKeys: ReadonlySet<string> = PRIVILEGED_BODY_KEYS,
): void {
  for (const key of Object.keys(body)) {
    if (extraForbiddenKeys.has(key)) {
      throw new HttpError(
        403,
        'FORBIDDEN_FIELD_MODIFICATION',
        `Field "${key}" cannot be supplied by this endpoint.`,
      );
    }
    if (!allowedKeys.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported ${noun} field: "${key}".`,
      );
    }
  }
}

function validateSafeText(
  raw: unknown,
  label: string,
  options: { required?: boolean; maxLen: number; allowNewlines?: boolean },
): string | undefined {
  if (raw === undefined || raw === null) {
    if (options.required) {
      throw new HttpError(400, 'VALIDATION_ERROR', `${label} is required.`);
    }
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${label} must be a string.`);
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    if (options.required) {
      throw new HttpError(400, 'VALIDATION_ERROR', `${label} is required.`);
    }
    return '';
  }
  const regex = options.allowNewlines
    ? CONTROL_CHAR_REGEX
    : STRICT_CONTROL_CHAR_REGEX;
  if (regex.test(trimmed) || trimmed.length > options.maxLen) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${label} contains invalid characters or exceeds ${options.maxLen} characters.`,
    );
  }
  return trimmed;
}

function validatePolicyHtmlField(raw: unknown, label: string): string {
  if (typeof raw !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${label} must be a string.`);
  }
  const trimmed = raw.trim();
  if (CONTROL_CHAR_REGEX.test(trimmed) || trimmed.length > 32_000) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${label} exceeds 32000 characters or contains invalid control characters.`,
    );
  }
  if (
    /<script\b|<iframe\b|<object\b|<embed\b|javascript:|on[a-z]+\s*=/i.test(
      trimmed,
    )
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${label} contains disallowed HTML constructs.`,
    );
  }
  return trimmed;
}

function validateOptionalUrlOrAssetPath(
  raw: unknown,
  label: string,
): string | undefined {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${label} must be a string.`);
  }
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.length > 4096 || STRICT_CONTROL_CHAR_REGEX.test(trimmed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${label} exceeds maximum length or contains invalid characters.`,
    );
  }
  if (/^(javascript|vbscript|file):/i.test(trimmed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${label} uses a disallowed URL scheme.`,
    );
  }
  if (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith('/') ||
    /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(trimmed)
  ) {
    return trimmed;
  }
  throw new HttpError(
    400,
    'VALIDATION_ERROR',
    `${label} must be an http(s) URL, relative path, or raster data URL.`,
  );
}

function validatePaymentMethods(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'paymentMethods must be a non-empty array (max 20).',
    );
  }
  return raw.map((item, idx) => {
    const pm = assertObjectRecord(
      item,
      `paymentMethods[${idx}] must be an object.`,
    );
    const id = validateSafeText(pm.id, `paymentMethods[${idx}].id`, {
      required: true,
      maxLen: 80,
    })!;
    const name = validateSafeText(pm.name, `paymentMethods[${idx}].name`, {
      required: true,
      maxLen: 120,
    })!;
    const type =
      typeof pm.type === 'string' ? pm.type.trim().toLowerCase() : '';
    if (!ALLOWED_PAYMENT_METHOD_TYPES.has(type)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `paymentMethods[${idx}].type must be payment_link, cashapp, chime, or crypto.`,
      );
    }
    const enabled = pm.enabled === undefined ? true : Boolean(pm.enabled);
    const bonusPercentage = Number(pm.bonusPercentage ?? 0);
    if (
      !Number.isFinite(bonusPercentage) ||
      bonusPercentage < 0 ||
      bonusPercentage > 500
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `paymentMethods[${idx}].bonusPercentage must be between 0 and 500.`,
      );
    }
    const feePercentage = Number(pm.feePercentage ?? 0);
    if (
      !Number.isFinite(feePercentage) ||
      feePercentage < 0 ||
      feePercentage > 100
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `paymentMethods[${idx}].feePercentage must be between 0 and 100.`,
      );
    }

    const sanitized: Record<string, unknown> = {
      id,
      name,
      type,
      enabled,
      feePercentage: Number(feePercentage.toFixed(2)),
      bonusPercentage: Number(bonusPercentage.toFixed(2)),
      instructions:
        validateSafeText(pm.instructions ?? '', `paymentMethods[${idx}].instructions`, {
          required: false,
          maxLen: 2000,
          allowNewlines: true,
        }) ?? '',
    };

    if (pm.minAmount !== undefined && pm.minAmount !== null) {
      const minAmount = Number(pm.minAmount);
      if (!Number.isFinite(minAmount) || minAmount < 0 || minAmount > 1_000_000) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          `paymentMethods[${idx}].minAmount is invalid.`,
        );
      }
      sanitized.minAmount = Number(minAmount.toFixed(2));
    }
    if (pm.maxAmount !== undefined && pm.maxAmount !== null) {
      const maxAmount = Number(pm.maxAmount);
      if (!Number.isFinite(maxAmount) || maxAmount < 0 || maxAmount > 10_000_000) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          `paymentMethods[${idx}].maxAmount is invalid.`,
        );
      }
      sanitized.maxAmount = Number(maxAmount.toFixed(2));
    }
    if (pm.bonusMinDeposit !== undefined && pm.bonusMinDeposit !== null) {
      const val = Number(pm.bonusMinDeposit);
      if (!Number.isFinite(val) || val < 0) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          `paymentMethods[${idx}].bonusMinDeposit is invalid.`,
        );
      }
      sanitized.bonusMinDeposit = Number(val.toFixed(2));
    }
    if (pm.bonusMaxCap !== undefined && pm.bonusMaxCap !== null) {
      const val = Number(pm.bonusMaxCap);
      if (!Number.isFinite(val) || val < 0) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          `paymentMethods[${idx}].bonusMaxCap is invalid.`,
        );
      }
      sanitized.bonusMaxCap = Number(val.toFixed(2));
    }
    if (pm.forwardUrl !== undefined) {
      sanitized.forwardUrl = validateOptionalUrlOrAssetPath(
        pm.forwardUrl,
        `paymentMethods[${idx}].forwardUrl`,
      );
    }
    if (pm.qrCodeUrl !== undefined) {
      sanitized.qrCodeUrl = validateOptionalUrlOrAssetPath(
        pm.qrCodeUrl,
        `paymentMethods[${idx}].qrCodeUrl`,
      );
    }
    if (pm.chimeQrCodeUrl !== undefined) {
      sanitized.chimeQrCodeUrl = validateOptionalUrlOrAssetPath(
        pm.chimeQrCodeUrl,
        `paymentMethods[${idx}].chimeQrCodeUrl`,
      );
    }
    if (pm.chimeHandle !== undefined) {
      sanitized.chimeHandle = validateSafeText(
        pm.chimeHandle,
        `paymentMethods[${idx}].chimeHandle`,
        { maxLen: 120 },
      );
    }
    if (pm.btcAddress !== undefined) {
      sanitized.btcAddress = validateSafeText(
        pm.btcAddress,
        `paymentMethods[${idx}].btcAddress`,
        { maxLen: 200 },
      );
    }
    if (pm.ethAddress !== undefined) {
      sanitized.ethAddress = validateSafeText(
        pm.ethAddress,
        `paymentMethods[${idx}].ethAddress`,
        { maxLen: 200 },
      );
    }
    if (pm.usdtAddress !== undefined) {
      sanitized.usdtAddress = validateSafeText(
        pm.usdtAddress,
        `paymentMethods[${idx}].usdtAddress`,
        { maxLen: 200 },
      );
    }
    if (pm.cryptoNetwork !== undefined) {
      sanitized.cryptoNetwork = validateSafeText(
        pm.cryptoNetwork,
        `paymentMethods[${idx}].cryptoNetwork`,
        { maxLen: 80 },
      );
    }
    if (pm.depositAddress !== undefined) {
      sanitized.depositAddress = validateSafeText(
        pm.depositAddress,
        `paymentMethods[${idx}].depositAddress`,
        { maxLen: 200 },
      );
    }
    return sanitized;
  });
}

function validateWithdrawalMethods(
  raw: unknown,
): Array<Record<string, unknown>> {
  if (!Array.isArray(raw) || raw.length > 20) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'withdrawalMethods must be an array (max 20).',
    );
  }
  return raw.map((item, idx) => {
    const wm = assertObjectRecord(
      item,
      `withdrawalMethods[${idx}] must be an object.`,
    );
    const id = validateSafeText(wm.id, `withdrawalMethods[${idx}].id`, {
      required: true,
      maxLen: 80,
    })!;
    const name = validateSafeText(wm.name, `withdrawalMethods[${idx}].name`, {
      required: true,
      maxLen: 120,
    })!;
    const type = validateSafeText(wm.type, `withdrawalMethods[${idx}].type`, {
      required: true,
      maxLen: 60,
    })!;
    const minAmount = Number(wm.minAmount ?? 0);
    const maxAmount = Number(wm.maxAmount ?? 0);
    const feeFlat = Number(wm.feeFlat ?? 0);
    const feePercentage = Number(wm.feePercentage ?? 0);
    const processingTimeHours = Number(wm.processingTimeHours ?? 0);
    if (
      !Number.isFinite(minAmount) ||
      minAmount < 0 ||
      !Number.isFinite(maxAmount) ||
      maxAmount < minAmount ||
      !Number.isFinite(feeFlat) ||
      feeFlat < 0 ||
      !Number.isFinite(feePercentage) ||
      feePercentage < 0 ||
      feePercentage > 100 ||
      !Number.isFinite(processingTimeHours) ||
      processingTimeHours < 0
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `withdrawalMethods[${idx}] numeric bounds are invalid.`,
      );
    }
    return {
      id,
      name,
      type,
      enabled: wm.enabled === undefined ? true : Boolean(wm.enabled),
      minAmount: Number(minAmount.toFixed(2)),
      maxAmount: Number(maxAmount.toFixed(2)),
      feeFlat: Number(feeFlat.toFixed(2)),
      feePercentage: Number(feePercentage.toFixed(2)),
      processingTimeHours,
    };
  });
}

function validateCashoutFeedConfig(raw: unknown): Record<string, unknown> {
  const obj = assertObjectRecord(raw, 'cashoutFeed must be an object.');
  const minAmount = Number(obj.minAmount ?? 50);
  const maxAmount = Number(obj.maxAmount ?? 250);
  const intervalSeconds = Number(obj.intervalSeconds ?? 6);
  const timeWindowHours = Number(obj.timeWindowHours ?? 2);
  if (
    !Number.isFinite(minAmount) ||
    minAmount < 1 ||
    minAmount > 100_000 ||
    !Number.isFinite(maxAmount) ||
    maxAmount < minAmount ||
    maxAmount > 100_000
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'cashoutFeed minAmount and maxAmount must be valid positive numbers with maxAmount >= minAmount.',
    );
  }
  if (
    !Number.isFinite(intervalSeconds) ||
    intervalSeconds < 2 ||
    intervalSeconds > 300
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'cashoutFeed intervalSeconds must be between 2 and 300.',
    );
  }

  let probableAmounts: number[] = [50, 75, 100, 120, 140, 150, 180, 200, 220, 250];
  if (obj.probableAmounts !== undefined) {
    if (!Array.isArray(obj.probableAmounts) || obj.probableAmounts.length === 0 || obj.probableAmounts.length > 50) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'cashoutFeed.probableAmounts must be a non-empty array (max 50).',
      );
    }
    probableAmounts = obj.probableAmounts.map((val, i) => {
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0 || n > 100_000) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          `cashoutFeed.probableAmounts[${i}] must be a positive number.`,
        );
      }
      return Number(n.toFixed(2));
    });
  }

  let namesPool: string[] = [];
  if (obj.namesPool !== undefined) {
    if (!Array.isArray(obj.namesPool) || obj.namesPool.length === 0 || obj.namesPool.length > 200) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'cashoutFeed.namesPool must be a non-empty array (max 200).',
      );
    }
    namesPool = obj.namesPool.map((name, i) =>
      validateSafeText(name, `cashoutFeed.namesPool[${i}]`, {
        required: true,
        maxLen: 60,
      })!,
    );
  }

  const displayLocationsRaw = obj.displayLocations
    ? assertObjectRecord(obj.displayLocations, 'cashoutFeed.displayLocations must be an object.')
    : { customerHome: true, withdrawalPage: true, walletPage: true };

  return {
    enabled: obj.enabled === undefined ? true : Boolean(obj.enabled),
    minAmount: Number(minAmount.toFixed(2)),
    maxAmount: Number(maxAmount.toFixed(2)),
    intervalSeconds: Math.round(intervalSeconds),
    timeWindowHours: Number.isFinite(timeWindowHours)
      ? Math.max(1, Math.min(48, Math.round(timeWindowHours)))
      : 2,
    probableAmounts,
    namesPool,
    displayLocations: {
      customerHome: displayLocationsRaw.customerHome !== false,
      withdrawalPage: displayLocationsRaw.withdrawalPage !== false,
      walletPage: displayLocationsRaw.walletPage !== false,
    },
  };
}

function validateGatewaySimulator(raw: unknown): Record<string, unknown> {
  const obj = assertObjectRecord(raw, 'gatewaySimulator must be an object.');
  const failureRate = Number(obj.failureRatePercentage ?? 0);
  if (!Number.isFinite(failureRate) || failureRate < 0 || failureRate > 100) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'gatewaySimulator.failureRatePercentage must be between 0 and 100.',
    );
  }
  const providers = obj.activeProviders
    ? assertObjectRecord(obj.activeProviders, 'gatewaySimulator.activeProviders must be an object.')
    : { zelleFedNow: true, cryptoTrc20: true };
  return {
    autoApproveInstantGateway: Boolean(obj.autoApproveInstantGateway),
    failureRatePercentage: Number(failureRate.toFixed(2)),
    activeProviders: {
      zelleFedNow: Boolean(providers.zelleFedNow),
      cryptoTrc20: Boolean(providers.cryptoTrc20),
    },
  };
}

function validatePlatformRules(raw: unknown): Record<string, unknown> {
  const obj = assertObjectRecord(raw, 'platformRules must be an object.');
  const out: Record<string, string> = {};
  for (const key of [
    'depositTerms',
    'bonusWageringTerms',
    'withdrawalPolicy',
    'refundPolicy',
    'cryptoRiskWarning',
  ]) {
    if (obj[key] !== undefined) {
      out[key] =
        validateSafeText(obj[key], `platformRules.${key}`, {
          maxLen: 4000,
          allowNewlines: true,
        }) ?? '';
    }
  }
  return out;
}

export function validatePoliciesPayload(raw: unknown): CmsPoliciesPayload {
  const body = assertObjectRecord(raw);
  assertAllowedKeys(body, ALLOWED_POLICIES_KEYS, 'CMS policies');
  const out: CmsPoliciesPayload = {};
  if ('cashoutPolicyHtml' in body) {
    out.cashoutPolicyHtml = validatePolicyHtmlField(
      body.cashoutPolicyHtml,
      'cashoutPolicyHtml',
    );
  }
  if ('privacyPolicyHtml' in body) {
    out.privacyPolicyHtml = validatePolicyHtmlField(
      body.privacyPolicyHtml,
      'privacyPolicyHtml',
    );
  }
  if ('termsPolicyHtml' in body) {
    out.termsPolicyHtml = validatePolicyHtmlField(
      body.termsPolicyHtml,
      'termsPolicyHtml',
    );
  }
  if (Object.keys(out).length === 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'At least one policy field (cashoutPolicyHtml, privacyPolicyHtml, termsPolicyHtml) is required.',
    );
  }
  return out;
}

export function validateUpdateAppConfigBody(raw: unknown): AppConfigUpdateInput {
  const body = assertObjectRecord(raw);
  assertAllowedKeys(body, ALLOWED_APP_CONFIG_UPDATE_KEYS, 'app config');

  const input: AppConfigUpdateInput = {};
  let hasField = false;

  if ('currency' in body) {
    const currency = validateSafeText(body.currency, 'currency', {
      required: true,
      maxLen: 10,
    })!.toUpperCase();
    if (!/^[A-Z]{3,10}$/.test(currency)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'currency must be an uppercase ISO currency code.',
      );
    }
    input.currency = currency;
    hasField = true;
  }

  if ('paymentMethods' in body) {
    input.paymentMethods = validatePaymentMethods(body.paymentMethods);
    hasField = true;
  }

  if ('withdrawalMethods' in body) {
    input.withdrawalMethods = validateWithdrawalMethods(body.withdrawalMethods);
    hasField = true;
  }

  if ('gatewaySimulator' in body) {
    input.gatewaySimulator = validateGatewaySimulator(body.gatewaySimulator);
    hasField = true;
  }

  if ('cashoutFeed' in body) {
    input.cashoutFeed = validateCashoutFeedConfig(body.cashoutFeed);
    hasField = true;
  }

  if ('platformRules' in body) {
    input.platformRules = validatePlatformRules(body.platformRules);
    hasField = true;
  }

  if ('policies' in body) {
    input.policies = validatePoliciesPayload(body.policies);
    hasField = true;
  }

  if (!hasField) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'At least one app config section is required.',
    );
  }

  return input;
}

export function validateFakedCashoutsQuery(rawQuery: Record<string, unknown>): {
  limit: number;
  offset: number;
} {
  for (const key of Object.keys(rawQuery)) {
    if (!ALLOWED_FAKED_CASHOUT_QUERY_KEYS.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported query parameter: "${key}".`,
      );
    }
  }

  let limit = 25;
  if (rawQuery.limit !== undefined) {
    const parsed = Number(rawQuery.limit);
    if (
      typeof rawQuery.limit !== 'string' ||
      !/^\d+$/.test(rawQuery.limit.trim()) ||
      !Number.isInteger(parsed) ||
      parsed < 1 ||
      parsed > 50
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'limit must be an integer between 1 and 50.',
      );
    }
    limit = parsed;
  }

  let offset = 0;
  if (rawQuery.offset !== undefined) {
    const parsed = Number(rawQuery.offset);
    if (
      typeof rawQuery.offset !== 'string' ||
      !/^\d+$/.test(rawQuery.offset.trim()) ||
      !Number.isInteger(parsed) ||
      parsed < 0 ||
      parsed > 1000
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'offset must be an integer between 0 and 1000.',
      );
    }
    offset = parsed;
  }

  return { limit, offset };
}

function validateSingleFakedCashoutItem(
  raw: unknown,
  prefix = '',
): CreateFakedCashoutInput {
  const body = assertObjectRecord(
    raw,
    `${prefix || 'Cashout item'} must be a JSON object.`,
  );
  assertAllowedKeys(body, ALLOWED_FAKED_CASHOUT_BODY_KEYS, 'cashout feed item');

  const customerName = validateSafeText(
    body.customerName ?? body.playerHandle,
    `${prefix}customerName`,
    { required: true, maxLen: 80 },
  )!;
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${prefix}amount must be greater than 0 and at most 100000.`,
    );
  }
  const roundedAmount = Math.round(amount * 100) / 100;
  if (roundedAmount <= 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${prefix}amount must be at least 0.01.`,
    );
  }

  const currency = (
    validateSafeText(body.currency ?? 'USD', `${prefix}currency`, {
      required: true,
      maxLen: 10,
    }) || 'USD'
  ).toUpperCase();
  if (!/^[A-Z]{3,10}$/.test(currency)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${prefix}currency must be a valid uppercase currency code.`,
    );
  }

  const methodName = validateSafeText(body.methodName, `${prefix}methodName`, {
    required: true,
    maxLen: 80,
  })!;
  const gameName = validateSafeText(body.gameName, `${prefix}gameName`, {
    required: true,
    maxLen: 120,
  })!;

  let timestampIso = new Date().toISOString();
  if (body.timestamp !== undefined) {
    if (typeof body.timestamp !== 'string' || Number.isNaN(Date.parse(body.timestamp))) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `${prefix}timestamp must be a valid ISO timestamp.`,
      );
    }
    timestampIso = new Date(body.timestamp).toISOString();
  }

  return {
    customerName,
    amount: roundedAmount,
    currency,
    methodName,
    gameName,
    isFake: body.isFake === undefined ? true : Boolean(body.isFake),
    timestamp: timestampIso,
  };
}

function validateCreateFakedCashoutBody(raw: unknown): CreateFakedCashoutInput {
  return validateSingleFakedCashoutItem(raw, '');
}

function validateReseedFakedCashoutsBody(raw: unknown): {
  items: CreateFakedCashoutInput[];
} {
  const body = assertObjectRecord(raw);
  assertAllowedKeys(body, ALLOWED_RESEED_BODY_KEYS, 'faked cashouts reseed');

  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'items must be a non-empty array containing between 1 and 50 cashout entries.',
    );
  }

  return {
    items: body.items.map((item, idx) =>
      validateSingleFakedCashoutItem(item, `items[${idx}].`),
    ),
  };
}

function validateTelegramConfigBody(raw: unknown): {
  botToken?: string;
  channelId?: string;
  enabled: boolean;
} {
  const body = assertObjectRecord(raw);
  assertAllowedKeys(body, ALLOWED_TELEGRAM_CONFIG_KEYS, 'telegram config');
  const botToken = validateSafeText(body.botToken, 'botToken', {
    required: false,
    maxLen: 256,
  });
  const channelId = validateSafeText(body.channelId, 'channelId', {
    required: false,
    maxLen: 128,
  });
  const enabled = body.enabled === undefined ? true : Boolean(body.enabled);
  return { botToken, channelId, enabled };
}

function validateTelegramTestBody(raw: unknown): {
  botToken?: string;
  channelId?: string;
} {
  const body = assertObjectRecord(raw);
  assertAllowedKeys(body, ALLOWED_TELEGRAM_TEST_KEYS, 'telegram test');
  const botToken = validateSafeText(body.botToken, 'botToken', {
    required: false,
    maxLen: 256,
  });
  const channelId = validateSafeText(body.channelId, 'channelId', {
    required: false,
    maxLen: 128,
  });
  return { botToken, channelId };
}

function validateTelegramNotifyMessageBody(raw: unknown): {
  customerName?: string;
  conversationId?: string;
} {
  const body = assertObjectRecord(raw);
  assertAllowedKeys(
    body,
    ALLOWED_TELEGRAM_NOTIFY_MSG_KEYS,
    'telegram notify-message',
  );
  return {
    customerName: validateSafeText(body.customerName, 'customerName', {
      required: false,
      maxLen: 100,
    }),
    conversationId: validateSafeText(body.conversationId, 'conversationId', {
      required: false,
      maxLen: 120,
    }),
  };
}

function validateTelegramNotifyBody(raw: unknown): {
  title?: string;
  text: string;
  actionType?: string;
  gameName?: string;
} {
  const body = assertObjectRecord(raw);
  assertAllowedKeys(body, ALLOWED_TELEGRAM_NOTIFY_KEYS, 'telegram notify');
  const text = validateSafeText(body.text ?? body.message, 'text', {
    required: true,
    maxLen: 2000,
    allowNewlines: true,
  })!;
  const title = validateSafeText(body.title, 'title', {
    required: false,
    maxLen: 160,
  });
  const actionType = validateSafeText(body.actionType, 'actionType', {
    required: false,
    maxLen: 40,
  });
  const gameName = validateSafeText(body.gameName, 'gameName', {
    required: false,
    maxLen: 120,
  });
  return { title, text, actionType, gameName };
}

function validateCashoutIdParam(rawId: unknown): string {
  if (typeof rawId !== 'string' || !ID_REGEX.test(rawId.trim())) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Invalid cashout entry identifier.',
    );
  }
  return rawId.trim();
}

function mapDomainError(err: unknown): never {
  if (err instanceof FakedCashoutNotFoundError) {
    throw new HttpError(404, 'CASHOUT_ENTRY_NOT_FOUND', err.message);
  }
  if (err instanceof AppConfigValidationError) {
    throw new HttpError(400, 'VALIDATION_ERROR', err.message);
  }
  throw err;
}

export function createAppConfigRouter({
  appConfigRepo,
  requireAuth,
  realtimeEvents,
  telegramFetch,
}: AppConfigRouterDeps): Router {
  const router = Router();
  const requireAdmin = requireRole('admin');

  const fetchImpl: TelegramFetchFn =
    telegramFetch ??
    (async (url, init) => {
      const response = await fetch(url, init);
      return {
        ok: response.ok,
        status: response.status,
        json: async () => (await response.json()) as Record<string, unknown>,
      };
    });

  const sendTelegramText = async (
    token: string,
    chatId: string,
    text: string,
  ): Promise<{
    success: boolean;
    message?: string;
    suggestedChannelId?: string;
  }> => {
    const sendReq = async (targetChatId: string) => {
      const resp = await fetchImpl(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: targetChatId, text }),
        },
      );
      return resp.json();
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
        message: typeof data.description === 'string' ? data.description : desc,
        suggestedChannelId: suggestedId,
      };
    }

    return data.ok
      ? { success: true }
      : {
          success: false,
          message:
            typeof data.description === 'string'
              ? data.description
              : 'Telegram delivery failed',
        };
  };

  // Public read of sanitized app_config (strips telegram credentials)
  router.get(
    '/app-config',
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const result = await appConfigRepo.getPublicAppConfig();
        res.status(200).json({
          success: true,
          config: result.config,
          updatedAt: result.updatedAt,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Admin read of app_config (masks telegram botToken; never exposes secret)
  router.get(
    '/admin/app-config',
    requireAuth,
    requireAdmin,
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const result = await appConfigRepo.getAdminAppConfig();
        res.status(200).json({
          success: true,
          config: result.config,
          updatedAt: result.updatedAt,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Admin full/partial general settings save
  router.put(
    '/admin/app-config',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateUpdateAppConfigBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = req.authContext!.user;
        const payload = req.body as AppConfigUpdateInput;

        const saved = await appConfigRepo.updateAppConfig(payload, {
          appUserId: actor.appUserId,
          displayName: actor.displayName,
          role: actor.role,
        });

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'authenticated' },
          ['app_config', 'audit_logs'],
          'app_config_updated',
        );

        res.status(200).json({
          success: true,
          config: saved.config,
          updatedAt: saved.updatedAt,
        });
      } catch (err) {
        try {
          mapDomainError(err);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );

  // Admin CMS policies save
  router.patch(
    '/admin/app-config/policies',
    requireAuth,
    requireAdmin,
    validateRequestBody(validatePoliciesPayload),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = req.authContext!.user;
        const payload = req.body as CmsPoliciesPayload;

        const saved = await appConfigRepo.updateCmsPolicies(payload, {
          appUserId: actor.appUserId,
          displayName: actor.displayName,
          role: actor.role,
        });

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'authenticated' },
          ['app_config', 'audit_logs'],
          'app_config_policies_updated',
        );

        res.status(200).json({
          success: true,
          policies: saved.policies,
          updatedAt: saved.updatedAt,
          message: 'Policy settings saved successfully!',
        });
      } catch (err) {
        try {
          mapDomainError(err);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );

  // Public bounded live ticker read
  router.get(
    '/faked-cashouts',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const query = validateFakedCashoutsQuery(
          req.query as Record<string, unknown>,
        );
        const result = await appConfigRepo.listFakedCashouts(query);
        res.status(200).json({
          success: true,
          items: result.items,
          total: result.total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + result.items.length < result.total,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Admin create single simulated cashout row
  router.post(
    '/admin/faked-cashouts',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateCreateFakedCashoutBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = req.authContext!.user;
        const payload = req.body as CreateFakedCashoutInput;

        const created = await appConfigRepo.createFakedCashout(payload, {
          appUserId: actor.appUserId,
          displayName: actor.displayName,
          role: actor.role,
        });

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'authenticated' },
          ['faked_cashouts', 'audit_logs'],
          'faked_cashout_created',
        );

        res.status(201).json({
          success: true,
          item: created,
        });
      } catch (err) {
        try {
          mapDomainError(err);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );

  // Admin reseed simulated cashout feed batch
  router.post(
    '/admin/faked-cashouts/reseed',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateReseedFakedCashoutsBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = req.authContext!.user;
        const { items } = req.body as { items: CreateFakedCashoutInput[] };

        const inserted = await appConfigRepo.reseedFakedCashouts(items, {
          appUserId: actor.appUserId,
          displayName: actor.displayName,
          role: actor.role,
        });

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'authenticated' },
          ['faked_cashouts', 'audit_logs'],
          'faked_cashouts_reseeded',
        );

        res.status(200).json({
          success: true,
          items: inserted,
          total: inserted.length,
        });
      } catch (err) {
        try {
          mapDomainError(err);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );

  // Admin delete single faked cashout row
  router.delete(
    '/admin/faked-cashouts/:id',
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = req.authContext!.user;
        const cashoutId = validateCashoutIdParam(req.params.id);

        const deleted = await appConfigRepo.deleteFakedCashout(cashoutId, {
          appUserId: actor.appUserId,
          displayName: actor.displayName,
          role: actor.role,
        });

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'authenticated' },
          ['faked_cashouts', 'audit_logs'],
          'faked_cashout_deleted',
        );

        res.status(200).json({
          success: true,
          id: deleted.id,
        });
      } catch (err) {
        try {
          mapDomainError(err);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );

  // Admin-only Telegram Bot endpoints (credentials stored inside public.app_config.data.telegram)
  router.get(
    '/telegram/status',
    requireAuth,
    requireAdmin,
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const cfg = await appConfigRepo.getTelegramInternalConfig();
        let botUsername: string | undefined;
        let lastError: string | undefined;

        if (cfg.botToken) {
          try {
            const meRes = await fetchImpl(
              `https://api.telegram.org/bot${cfg.botToken}/getMe`,
            );
            const meData = await meRes.json();
            if (meData.ok && meData.result && typeof meData.result === 'object') {
              const resultObj = meData.result as Record<string, unknown>;
              if (typeof resultObj.username === 'string') {
                botUsername = resultObj.username;
              }
            } else if (typeof meData.description === 'string') {
              lastError = meData.description;
            }
          } catch (err) {
            lastError =
              err instanceof Error
                ? err.message
                : 'Failed to contact Telegram API';
          }
        }

        const redacted = {
          channelId: cfg.channelId,
          enabled: cfg.enabled,
          tokenConfigured: Boolean(cfg.botToken),
          maskedToken: cfg.botToken
            ? `${cfg.botToken.slice(0, 5)}...${cfg.botToken.slice(-6)}`
            : undefined,
          mode: cfg.mode,
        };

        res.status(200).json({
          running: false,
          botUsername,
          channelId: redacted.channelId,
          enabled: redacted.enabled,
          updatesReceived: 0,
          lastError,
          tokenConfigured: redacted.tokenConfigured,
          maskedToken: redacted.maskedToken,
          mode: redacted.mode,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/telegram/config',
    requireAuth,
    requireAdmin,
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const cfg = await appConfigRepo.getTelegramInternalConfig();
        const adminCfg = await appConfigRepo.getAdminAppConfig();
        const redactedTg = (adminCfg.config?.telegram ?? {
          channelId: cfg.channelId,
          enabled: cfg.enabled,
          tokenConfigured: Boolean(cfg.botToken),
          mode: cfg.mode,
        }) as Record<string, unknown>;

        res.status(200).json({
          success: true,
          ...redactedTg,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/telegram/config',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateTelegramConfigBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = req.authContext!.user;
        const body = req.body as ReturnType<typeof validateTelegramConfigBody>;

        const saved = await appConfigRepo.saveTelegramConfig(body, {
          appUserId: actor.appUserId,
          displayName: actor.displayName,
          role: actor.role,
        });

        res.status(200).json({
          success: true,
          status: {
            running: false,
            channelId: saved.channelId,
            updatesReceived: 0,
            tokenConfigured: saved.tokenConfigured,
            maskedToken: saved.maskedToken,
            mode: saved.mode,
          },
          config: saved,
        });
      } catch (err) {
        try {
          mapDomainError(err);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );

  router.post(
    '/telegram/test',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateTelegramTestBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const body = req.body as ReturnType<typeof validateTelegramTestBody>;
        const cfg = await appConfigRepo.getTelegramInternalConfig();
        const cleanToken = body.botToken?.trim() || cfg.botToken;
        const cleanChatId = body.channelId?.trim() || cfg.channelId;

        if (!cleanToken) {
          res.status(200).json({
            success: false,
            message: 'Please provide a Telegram Bot Token.',
          });
          return;
        }
        if (!cleanChatId) {
          res.status(200).json({
            success: false,
            message: 'Please provide a Target Chat / Channel ID.',
          });
          return;
        }

        const meRes = await fetchImpl(
          `https://api.telegram.org/bot${cleanToken}/getMe`,
        );
        const meData = await meRes.json();
        if (!meData.ok) {
          res.status(200).json({
            success: false,
            message: `Invalid Bot Token: ${String(meData.description || 'Verification failed')}`,
          });
          return;
        }

        const botUser =
          meData.result && typeof meData.result === 'object'
            ? String((meData.result as Record<string, unknown>).username || 'bot')
            : 'bot';
        const testMsg = `Swift Sweeps Notification Bot Connected!\nBot: @${botUser}\nMode: Zero-Egress Notifications Active`;
        const sendResult = await sendTelegramText(
          cleanToken,
          cleanChatId,
          testMsg,
        );

        res.status(200).json(
          sendResult.success
            ? {
                success: true,
                ...(sendResult.suggestedChannelId
                  ? { suggestedChannelId: sendResult.suggestedChannelId }
                  : {}),
                message: `Connection successful! Test notification delivered to ${sendResult.suggestedChannelId || cleanChatId} from @${botUser}.`,
              }
            : {
                success: false,
                ...(sendResult.suggestedChannelId
                  ? { suggestedChannelId: sendResult.suggestedChannelId }
                  : {}),
                message: `Bot @${botUser} verified, but cannot send message to ${cleanChatId}: ${sendResult.message}`,
              },
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // Authenticated Telegram alerts (derives actor identity on server)
  router.post(
    '/telegram/notify-message',
    requireAuth,
    validateRequestBody(validateTelegramNotifyMessageBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = req.authContext!.user;
        const body = req.body as ReturnType<
          typeof validateTelegramNotifyMessageBody
        >;

        const cfg = await appConfigRepo.getTelegramInternalConfig();
        if (!cfg.botToken || !cfg.channelId || !cfg.enabled) {
          res.status(200).json({
            success: false,
            message: 'Telegram bot not configured or disabled',
          });
          return;
        }

        const displayName =
          actor.role === 'customer'
            ? actor.displayName || 'Customer'
            : body.customerName || actor.displayName || 'Customer';
        const convKey =
          actor.role === 'customer'
            ? `conv_${actor.appUserId}`.toLowerCase()
            : (body.conversationId || `conv_${actor.appUserId}`).toLowerCase();

        const nowMs = Date.now();
        const lastSent = cfg.lastNotifiedByConv[convKey] || 0;
        if (nowMs - lastSent < 60_000) {
          const remainingSec = Math.ceil((60_000 - (nowMs - lastSent)) / 1000);
          res.status(200).json({
            success: true,
            debounced: true,
            message: `Cooldown active (${remainingSec}s)`,
          });
          return;
        }

        const result = await sendTelegramText(
          cfg.botToken,
          cfg.channelId,
          `💬 New message from ${displayName}`,
        );
        if (result.success) {
          await appConfigRepo.recordTelegramConversationCooldown({
            cooldownKey: convKey,
            nowMs,
          });
        }
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/telegram/notify',
    requireAuth,
    validateRequestBody(validateTelegramNotifyBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = req.authContext!.user;
        const body = req.body as ReturnType<typeof validateTelegramNotifyBody>;

        const cfg = await appConfigRepo.getTelegramInternalConfig();
        if (!cfg.botToken || !cfg.channelId || !cfg.enabled) {
          res.status(200).json({
            success: false,
            message: 'Telegram bot not configured or disabled',
          });
          return;
        }

        const safeText = `[${actor.displayName}] ${body.text}`.slice(0, 2000);
        const result = await sendTelegramText(
          cfg.botToken,
          cfg.channelId,
          safeText,
        );
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
