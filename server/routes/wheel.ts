import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { AppConfigRepo } from '../appConfig/appConfigRepo.js';
import type { ChatEventBroker } from '../chat/chatEvents.js';
import type { UserDirectoryRepo } from '../auth/userDirectoryRepo.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';
import type { RealtimeEventBroker } from '../realtime/realtimeEvents.js';
import type { TelegramFetchFn } from './appConfig.js';
import {
  WheelConflictError,
  WheelCooldownError,
  WheelForbiddenError,
  WheelNotFoundError,
  WheelValidationError,
  type WheelRepo,
} from '../wheel/wheelRepo.js';

export interface WheelRouterDeps {
  wheelRepo: WheelRepo;
  userRepo: UserDirectoryRepo;
  requireAuth: RequestHandler;
  appConfigRepo?: AppConfigRepo;
  telegramFetch?: TelegramFetchFn;
  chatEvents?: ChatEventBroker;
  realtimeEvents?: RealtimeEventBroker;
  nowFn?: () => number;
  randomUnitFn?: () => number;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,120}$/;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

const PRIVILEGED_BODY_FIELDS = new Set([
  'actorId',
  'actorName',
  'actorRole',
  'role',
  'rewardAmount',
  'reward_amount',
  'simulatedWinAmount',
  'simulated_win_amount',
  'segmentId',
  'segment_id',
  'segmentLabel',
  'segment_label',
  'freePlayBalance',
  'free_play_balance',
  'availableBalance',
  'referralBonusBalance',
  'balance',
  'freePlayReturn',
  'cashReturn',
  'txId',
  'status',
  'wallet',
  'gameAccount',
]);

const ALLOWED_STATUS_QUERY_KEYS = new Set(['userId']);

function assertObjectBody(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (PRIVILEGED_BODY_FIELDS.has(key)) {
      throw new HttpError(
        403,
        'FORBIDDEN',
        `Field "${key}" cannot be supplied by client requests.`,
      );
    }
  }
  return obj;
}

function assertAllowedKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unexpected request field "${key}".`,
      );
    }
  }
}

function validateOptionalId(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!ID_REGEX.test(trimmed)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `Invalid ${fieldName} format.`);
  }
  return trimmed;
}

function validateWheelSpinBody(raw: unknown): {
  userId?: string;
  idempotencyKey?: string;
} {
  if (raw === undefined || raw === null) return {};
  const obj = assertObjectBody(raw);
  assertAllowedKeys(obj, new Set(['userId', 'idempotencyKey']));
  const userId = validateOptionalId(obj.userId, 'userId');
  let idempotencyKey: string | undefined;
  if (obj.idempotencyKey !== undefined && obj.idempotencyKey !== null) {
    if (typeof obj.idempotencyKey !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'idempotencyKey must be a string.',
      );
    }
    const clean = obj.idempotencyKey.trim();
    if (clean) {
      if (CONTROL_CHAR_REGEX.test(clean) || clean.length > 96) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'idempotencyKey must be 1–96 safe characters.',
        );
      }
      idempotencyKey = clean;
    }
  }
  return { userId, idempotencyKey };
}

function validateWheelConfigBody(raw: unknown): { wheelOfLuck: unknown } {
  const obj = assertObjectBody(raw);
  assertAllowedKeys(obj, new Set(['wheelOfLuck', 'actingUserId']));
  const target = obj.wheelOfLuck ?? obj;
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'wheelOfLuck configuration object is required.',
    );
  }
  return { wheelOfLuck: target };
}

function validateGameCreditTransferBody(raw: unknown): {
  userId?: string;
  customerId?: string;
  gameAccountId?: string;
  gameCatalogId?: string;
  direction: 'load' | 'unload';
  source: 'free_play' | 'referral_bonus' | 'wallet_cash';
  amount: number;
} {
  const obj = assertObjectBody(raw);
  assertAllowedKeys(
    obj,
    new Set([
      'userId',
      'customerId',
      'gameAccountId',
      'gameCatalogId',
      'direction',
      'source',
      'amount',
    ]),
  );

  const userId = validateOptionalId(obj.userId, 'userId');
  const customerId = validateOptionalId(obj.customerId, 'customerId');
  const gameAccountId = validateOptionalId(obj.gameAccountId, 'gameAccountId');
  const gameCatalogId = validateOptionalId(obj.gameCatalogId, 'gameCatalogId');

  const directionRaw =
    typeof obj.direction === 'string' ? obj.direction.trim().toLowerCase() : '';
  if (directionRaw !== 'load' && directionRaw !== 'unload') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'direction must be "load" or "unload".',
    );
  }

  const sourceRaw =
    typeof obj.source === 'string' && obj.source.trim()
      ? obj.source.trim().toLowerCase()
      : 'wallet_cash';
  if (
    directionRaw === 'load' &&
    sourceRaw !== 'free_play' &&
    sourceRaw !== 'referral_bonus' &&
    sourceRaw !== 'wallet_cash'
  ) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid funding source.');
  }

  const parsedAmount = Number(obj.amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 100000) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Amount must be greater than $0.00.',
    );
  }
  const amount = Number(parsedAmount.toFixed(2));
  if (amount <= 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Amount must be greater than $0.00.',
    );
  }

  if (!gameAccountId && !gameCatalogId) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'gameAccountId or gameCatalogId is required.',
    );
  }

  return {
    userId,
    customerId,
    gameAccountId,
    gameCatalogId,
    direction: directionRaw,
    source: sourceRaw as 'free_play' | 'referral_bonus' | 'wallet_cash',
    amount,
  };
}

function validateStatusQuery(query: Request['query']): { userId?: string } {
  for (const key of Object.keys(query)) {
    if (!ALLOWED_STATUS_QUERY_KEYS.has(key)) {
      throw new HttpError(400, 'VALIDATION_ERROR', `Unknown query parameter "${key}".`);
    }
  }
  const userId = validateOptionalId(
    Array.isArray(query.userId) ? query.userId[0] : query.userId,
    'userId',
  );
  return { userId };
}

function mapRepoError(err: unknown): unknown {
  if (err instanceof HttpError) return err;
  if (err instanceof WheelValidationError) {
    return new HttpError(400, err.code, err.message);
  }
  if (err instanceof WheelForbiddenError) {
    return new HttpError(403, err.code, err.message);
  }
  if (err instanceof WheelNotFoundError) {
    return new HttpError(404, err.code, err.message);
  }
  if (err instanceof WheelConflictError) {
    return new HttpError(409, err.code, err.message);
  }
  return err;
}

async function dispatchBonusLoadTelegramAlert(
  appConfigRepo: AppConfigRepo | undefined,
  telegramFetch: TelegramFetchFn | undefined,
  text: string | null | undefined,
): Promise<boolean> {
  if (!appConfigRepo || !text) return false;
  const fetchImpl: TelegramFetchFn | undefined =
    telegramFetch ??
    (typeof fetch === 'function'
      ? (url, init) =>
          fetch(url, init).then(async (r) => ({
            ok: r.ok,
            status: r.status,
            json: () => r.json() as Promise<Record<string, unknown>>,
          }))
      : undefined);
  if (!fetchImpl) return false;

  try {
    const cfg = await appConfigRepo.getTelegramInternalConfig();
    if (!cfg.botToken || !cfg.channelId || !cfg.enabled) return false;

    const sendReq = async (targetChatId: string) => {
      const r = await fetchImpl(
        `https://api.telegram.org/bot${cfg.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: targetChatId, text }),
        },
      );
      return r.json();
    };

    let result = await sendReq(cfg.channelId);
    const desc = typeof result?.description === 'string' ? result.description : '';
    if (
      !result?.ok &&
      desc.toLowerCase().includes('chat not found') &&
      cfg.channelId.startsWith('-') &&
      !cfg.channelId.startsWith('-100')
    ) {
      result = await sendReq(`-100${cfg.channelId.replace(/^-/, '')}`);
    }
    return Boolean(result?.ok);
  } catch {
    return false;
  }
}

export function createWheelRouter({
  wheelRepo,
  requireAuth,
  appConfigRepo,
  telegramFetch,
  chatEvents,
  realtimeEvents,
  nowFn,
  randomUnitFn,
}: WheelRouterDeps): Router {
  const router = Router();
  const requireAdmin = requireRole('admin');

  function resolveActor(req: Request) {
    const actor = req.authContext?.user;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
    }
    return actor;
  }

  router.get(
    '/wheel/status',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = await resolveActor(req);
        const query = validateStatusQuery(req.query);
        const isStaff = actor.role === 'admin' || actor.role === 'agent';

        if (query.userId && query.userId !== actor.appUserId && !isStaff) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Access Denied: You can only view your own Wheel of Luck status.',
          );
        }

        const targetUserId =
          isStaff && query.userId ? query.userId : actor.appUserId;
        const status = await wheelRepo.getStatus(
          targetUserId,
          nowFn ? nowFn() : Date.now(),
        );
        res.status(200).json(status);
      } catch (err) {
        next(mapRepoError(err));
      }
    },
  );

  router.post(
    '/wheel/spin',
    requireAuth,
    validateRequestBody(validateWheelSpinBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = await resolveActor(req);
        const body = req.body as ReturnType<typeof validateWheelSpinBody>;

        if (body.userId && body.userId !== actor.appUserId) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Access Denied: You can only spin the Wheel of Luck for your own account.',
          );
        }

        const result = await wheelRepo.spin({
          customerId: actor.appUserId,
          idempotencyKey: body.idempotencyKey,
          nowMs: nowFn ? nowFn() : Date.now(),
          randomUnitFn,
        });
        realtimeEvents?.emitDomainInvalidation(
          { scope: 'user_and_staff', customerId: actor.appUserId },
          ['wallets', 'transactions', 'wheel_spins', 'audit_logs'],
          'wheel_spin',
          actor.appUserId,
        );
        res.status(200).json(result);
      } catch (err) {
        if (err instanceof WheelCooldownError) {
          res.status(429).json({
            error: {
              code: err.code,
              message: err.message,
              requestId: req.requestId,
            },
            code: err.code,
            eligibility: err.eligibility,
          });
          return;
        }
        next(mapRepoError(err));
      }
    },
  );

  router.post(
    '/admin/wheel-config',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateWheelConfigBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = await resolveActor(req);
        const body = req.body as ReturnType<typeof validateWheelConfigBody>;
        const wheelOfLuck = await wheelRepo.saveWheelConfig({
          wheelOfLuck: body.wheelOfLuck,
          actorId: actor.appUserId,
          actorName: actor.displayName,
        });
        realtimeEvents?.emitDomainInvalidation(
          { scope: 'authenticated' },
          ['app_config', 'audit_logs'],
          'wheel_config_updated',
        );
        res.status(200).json({
          success: true,
          wheelOfLuck,
        });
      } catch (err) {
        next(mapRepoError(err));
      }
    },
  );

  router.post(
    '/game-accounts/transfer',
    requireAuth,
    validateRequestBody(validateGameCreditTransferBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = await resolveActor(req);
        const body = req.body as ReturnType<
          typeof validateGameCreditTransferBody
        >;
        const isStaff = actor.role === 'admin' || actor.role === 'agent';

        if (body.customerId && body.customerId !== actor.appUserId && !isStaff) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Access Denied: You can only manage credits for your own game accounts.',
          );
        }

        const { telegramText, ...publicResult } = await wheelRepo.transferGameCredits({
          gameAccountId: body.gameAccountId,
          gameCatalogId: body.gameCatalogId,
          customerIdOverride: body.customerId,
          direction: body.direction,
          source: body.source,
          amount: body.amount,
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
          nowMs: nowFn ? nowFn() : Date.now(),
        });
        const telegramNotified = await dispatchBonusLoadTelegramAlert(
          appConfigRepo,
          telegramFetch,
          telegramText,
        );
        const result = {
          ...publicResult,
          telegramNotified,
        };
        if (chatEvents && result.staffMessage && result.staffMessage.id) {
          const staffMsg = result.staffMessage as Record<string, unknown>;
          const convId = String(
            staffMsg.conversation_id ?? `conv_${body.customerId || actor.appUserId}`,
          );
          const msgCustId = convId.replace(/^conv_/, '');
          chatEvents.emit({
            type: 'chat_message',
            customerId: msgCustId,
            conversationId: convId,
            isInternalNote: Boolean(staffMsg.is_internal_note),
            message: {
              id: String(staffMsg.id),
              conversation_id: convId,
              sender_id: String(staffMsg.sender_id ?? actor.appUserId),
              sender_name: String(staffMsg.sender_name ?? actor.displayName),
              sender_role: String(staffMsg.sender_role ?? actor.role),
              content: String(staffMsg.content ?? ''),
              attachment_url: null,
              attachment_name: null,
              transaction_data:
                (staffMsg.transaction_data as Record<string, unknown> | null) ??
                null,
              is_internal_note: Boolean(staffMsg.is_internal_note),
              created_at: String(
                staffMsg.created_at ?? new Date().toISOString(),
              ),
            },
          });
        }
        const targetCid =
          (result.wallet as { customerId?: string } | undefined)?.customerId ||
          body.customerId ||
          actor.appUserId;
        realtimeEvents?.emitDomainInvalidation(
          { scope: 'user_and_staff', customerId: targetCid },
          ['wallets', 'transactions', 'game_accounts', 'audit_logs'],
          'game_credit_transfer',
          targetCid,
        );
        res.status(200).json(result);
      } catch (err) {
        next(mapRepoError(err));
      }
    },
  );

  return router;
}
