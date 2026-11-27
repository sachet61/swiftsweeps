import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { ServerConfig } from '../config/env.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';
import {
  NotificationForbiddenError,
  NotificationNotFoundError,
  NotificationTargetUserNotFoundError,
  type NotificationRepo,
  type NotificationType,
} from '../notifications/notificationRepo.js';
import type { WebPushSender } from '../notifications/webPushSender.js';

export interface NotificationRouterDeps {
  config: Pick<ServerConfig, 'vapidPublicKey' | 'vapidPrivateKey' | 'vapidSubject' | 'appOrigin'>;
  notificationRepo: NotificationRepo;
  webPushSender: WebPushSender;
  requireAuth: RequestHandler;
  optionalAuth: RequestHandler;
}

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;
const BASE64_KEY_REGEX = /^[A-Za-z0-9+/_-]{16,512}={0,2}$/;
const SAFE_ID_REGEX = /^[A-Za-z0-9_.:-]{1,128}$/;
const SAFE_TAB_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED_TARGET_IDS = new Set([
  'anonymous',
  'staff',
  'customer',
  'agent',
  'admin',
]);

const ALLOWED_NOTIFICATION_TYPES = new Set<NotificationType>([
  'topup',
  'withdrawal',
  'bonus',
  'chat',
  'game_account',
  'referral',
  'system',
]);

const ALLOWED_PUSH_ACTION_TYPES = new Set([
  'chat',
  'payout',
  'deposit',
  'game',
  'test',
]);

const PRIVILEGED_NOTIFICATION_KEYS = new Set([
  'id',
  'isRead',
  'is_read',
  'read',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
  'actorId',
  'actorRole',
  'role',
]);

const ALLOWED_CREATE_NOTIFICATION_KEYS = new Set([
  'userId',
  'title',
  'message',
  'type',
  'linkTab',
  'linkRequestId',
]);

const ALLOWED_SUBSCRIBE_KEYS = new Set([
  'subscription',
  'userId',
  'userRole',
  'userEmail',
  'platform',
  'browser',
]);

const ALLOWED_UNSUBSCRIBE_KEYS = new Set([
  'endpoint',
  'userId',
  'revokeAllForUser',
]);

const ALLOWED_NOTIFY_KEYS = new Set([
  'recipientId',
  'recipientRole',
  'userEmail',
  'senderId',
  'title',
  'body',
  'url',
  'tag',
  'conversationId',
  'messageId',
  'actionType',
  'isInternalNote',
]);

const ALLOWED_NOTIFICATION_QUERY_KEYS = new Set([
  'userId',
  'unreadOnly',
  'type',
  'limit',
  'offset',
]);

const ALLOWED_PUSH_STATUS_QUERY_KEYS = new Set(['userId', 'endpoint']);

export interface ValidatedNotificationQuery {
  requestedUserId?: string;
  unreadOnly: boolean;
  type?: NotificationType;
  limit: number;
  offset: number;
}

export interface ValidatedCreateNotificationBody {
  targetUserId?: string;
  title: string;
  message: string;
  type: NotificationType;
  linkTab: string | null;
  linkRequestId: string | null;
}

export interface ValidatedReadAllBody {
  requestedUserId?: string;
}

export interface ValidatedPushSubscribeBody {
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: number | null;
  requestedUserId?: string;
  platform: string | null;
  browser: string | null;
}

export interface ValidatedPushUnsubscribeBody {
  endpoint?: string;
  requestedUserId?: string;
  revokeAllForUser: boolean;
}

export interface ValidatedPushNotifyBody {
  recipientId: string;
  recipientRole: string;
  requestedSenderId?: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
  conversationId?: string;
  messageId?: string;
  actionType?: 'chat' | 'payout' | 'deposit' | 'game' | 'test';
  isInternalNote: boolean;
}

function assertObjectRecord(
  raw: unknown,
  message = 'Request body must be a JSON object.',
): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }
  return raw as Record<string, unknown>;
}

function assertKeysAllowed(
  obj: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  noun: string,
  privilegedKeys?: ReadonlySet<string>,
): void {
  for (const key of Object.keys(obj)) {
    if (privilegedKeys?.has(key)) {
      throw new HttpError(
        403,
        'FORBIDDEN_FIELD_MODIFICATION',
        `Field "${key}" cannot be supplied by client requests.`,
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

function validateHttpsPushEndpoint(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Push subscription endpoint must be an https:// URL.',
    );
  }

  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.length > 2048 ||
    /\s/.test(trimmed) ||
    CONTROL_CHAR_REGEX.test(trimmed)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Push subscription endpoint is invalid or exceeds maximum length.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Push subscription endpoint must be a valid https:// URL.',
    );
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Push subscription endpoint must use https:// without embedded credentials.',
    );
  }

  return trimmed;
}

function validateOptionalIdentifier(
  raw: unknown,
  fieldLabel: string,
): string | undefined {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldLabel} must be a string.`,
    );
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > 128 || CONTROL_CHAR_REGEX.test(trimmed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldLabel} is invalid or exceeds maximum length.`,
    );
  }
  return trimmed;
}

function validateNotificationText(
  raw: unknown,
  fieldLabel: string,
  maxLen: number,
  required: boolean,
): string {
  if (typeof raw !== 'string') {
    if (!required && (raw === undefined || raw === null)) {
      return '';
    }
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldLabel} must be a string.`,
    );
  }
  const trimmed = raw.trim();
  if (required && !trimmed) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldLabel} is required.`,
    );
  }
  if (trimmed.length > maxLen || CONTROL_CHAR_REGEX.test(trimmed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldLabel} must be ${maxLen} characters or less without control characters.`,
    );
  }
  return trimmed;
}

function validateOptionalShortMeta(
  raw: unknown,
  fieldLabel: string,
  maxLen: number,
): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldLabel} must be a string.`,
    );
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > maxLen || CONTROL_CHAR_REGEX.test(trimmed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldLabel} must be ${maxLen} characters or less.`,
    );
  }
  return trimmed;
}

function validateSafePushUrl(
  rawUrl: unknown,
  appOrigin: string,
): string | undefined {
  if (rawUrl === undefined || rawUrl === null || rawUrl === '') {
    return undefined;
  }
  if (typeof rawUrl !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Push target url must be a string.');
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return undefined;
  }
  if (
    trimmed.length > 512 ||
    /\s/.test(trimmed) ||
    CONTROL_CHAR_REGEX.test(trimmed)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Push target url contains invalid characters.',
    );
  }
  if (trimmed.startsWith('/#') || (trimmed.startsWith('/') && !trimmed.startsWith('//'))) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    const allowedOrigin = appOrigin ? new URL(appOrigin).origin : null;
    if (
      parsed.protocol === 'https:' &&
      allowedOrigin &&
      parsed.origin === allowedOrigin
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Reject invalid / external schemes below
  }
  throw new HttpError(
    400,
    'VALIDATION_ERROR',
    'Push target url must be a safe internal application path.',
  );
}

export function validateNotificationQuery(
  rawQuery: Record<string, unknown>,
): ValidatedNotificationQuery {
  assertKeysAllowed(rawQuery, ALLOWED_NOTIFICATION_QUERY_KEYS, 'query parameter');

  const requestedUserId = validateOptionalIdentifier(rawQuery.userId, 'userId');

  let unreadOnly = false;
  if (rawQuery.unreadOnly !== undefined) {
    if (rawQuery.unreadOnly === 'true' || rawQuery.unreadOnly === '1') {
      unreadOnly = true;
    } else if (
      rawQuery.unreadOnly === 'false' ||
      rawQuery.unreadOnly === '0' ||
      rawQuery.unreadOnly === ''
    ) {
      unreadOnly = false;
    } else {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'unreadOnly must be "true" or "false".',
      );
    }
  }

  let type: NotificationType | undefined;
  if (rawQuery.type !== undefined && rawQuery.type !== '') {
    if (
      typeof rawQuery.type !== 'string' ||
      !ALLOWED_NOTIFICATION_TYPES.has(rawQuery.type as NotificationType)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid notification type filter.',
      );
    }
    type = rawQuery.type as NotificationType;
  }

  let limit = 50;
  if (rawQuery.limit !== undefined) {
    const parsed = Number(rawQuery.limit);
    if (
      typeof rawQuery.limit !== 'string' ||
      !/^\d+$/.test(rawQuery.limit.trim()) ||
      !Number.isInteger(parsed) ||
      parsed < 1 ||
      parsed > 100
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'limit must be an integer between 1 and 100.',
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
      parsed > 10_000
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'offset must be an integer between 0 and 10000.',
      );
    }
    offset = parsed;
  }

  return {
    requestedUserId,
    unreadOnly,
    type,
    limit,
    offset,
  };
}

export function validateCreateNotificationBody(
  raw: unknown,
): ValidatedCreateNotificationBody {
  const body = assertObjectRecord(raw);
  assertKeysAllowed(
    body,
    ALLOWED_CREATE_NOTIFICATION_KEYS,
    'notification',
    PRIVILEGED_NOTIFICATION_KEYS,
  );

  const targetUserId = validateOptionalIdentifier(body.userId, 'userId');
  const title = validateNotificationText(body.title, 'Notification title', 160, true);
  const message = validateNotificationText(
    body.message,
    'Notification message',
    1000,
    true,
  );

  if (
    typeof body.type !== 'string' ||
    !ALLOWED_NOTIFICATION_TYPES.has(body.type as NotificationType)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Invalid notification type.',
    );
  }

  let linkTab: string | null = null;
  if (body.linkTab !== undefined && body.linkTab !== null && body.linkTab !== '') {
    if (typeof body.linkTab !== 'string' || !SAFE_TAB_REGEX.test(body.linkTab.trim())) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'linkTab must contain only alphanumeric characters, underscores, or hyphens.',
      );
    }
    linkTab = body.linkTab.trim();
  }

  const linkRequestId =
    validateOptionalIdentifier(body.linkRequestId, 'linkRequestId') ?? null;

  return {
    targetUserId,
    title,
    message,
    type: body.type as NotificationType,
    linkTab,
    linkRequestId,
  };
}

export function validateReadAllBody(raw: unknown): ValidatedReadAllBody {
  if (raw === undefined || raw === null) {
    return {};
  }
  const body = assertObjectRecord(raw);
  assertKeysAllowed(body, new Set(['userId']), 'notification read-all');
  return {
    requestedUserId: validateOptionalIdentifier(body.userId, 'userId'),
  };
}

export function validatePushSubscribeBody(
  raw: unknown,
): ValidatedPushSubscribeBody {
  const body = assertObjectRecord(raw);
  assertKeysAllowed(body, ALLOWED_SUBSCRIBE_KEYS, 'push subscription');

  const requestedUserId = validateOptionalIdentifier(body.userId, 'userId');
  const sub = assertObjectRecord(
    body.subscription,
    'subscription object is required.',
  );
  const endpoint = validateHttpsPushEndpoint(sub.endpoint);

  const rawKeys = assertObjectRecord(
    sub.keys,
    'subscription.keys must include p256dh and auth.',
  );
  const p256dh =
    typeof rawKeys.p256dh === 'string' ? rawKeys.p256dh.trim() : '';
  const auth = typeof rawKeys.auth === 'string' ? rawKeys.auth.trim() : '';

  if (!BASE64_KEY_REGEX.test(p256dh) || !BASE64_KEY_REGEX.test(auth)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'subscription.keys.p256dh and subscription.keys.auth must be valid base64 keys.',
    );
  }

  let expirationTime: number | null = null;
  if (sub.expirationTime !== undefined && sub.expirationTime !== null) {
    if (
      typeof sub.expirationTime !== 'number' ||
      !Number.isFinite(sub.expirationTime) ||
      sub.expirationTime < 0
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'subscription.expirationTime must be null or a non-negative timestamp.',
      );
    }
    expirationTime = Math.trunc(sub.expirationTime);
  }

  const platform = validateOptionalShortMeta(body.platform, 'platform', 32);
  const browser = validateOptionalShortMeta(body.browser, 'browser', 64);

  return {
    endpoint,
    p256dh,
    auth,
    expirationTime,
    requestedUserId,
    platform,
    browser,
  };
}

export function validatePushUnsubscribeBody(
  raw: unknown,
): ValidatedPushUnsubscribeBody {
  const body = assertObjectRecord(raw);
  assertKeysAllowed(body, ALLOWED_UNSUBSCRIBE_KEYS, 'push unsubscribe');

  const requestedUserId = validateOptionalIdentifier(body.userId, 'userId');
  let endpoint: string | undefined;
  if (body.endpoint !== undefined && body.endpoint !== null && body.endpoint !== '') {
    endpoint = validateHttpsPushEndpoint(body.endpoint);
  }

  if (
    body.revokeAllForUser !== undefined &&
    typeof body.revokeAllForUser !== 'boolean'
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'revokeAllForUser must be a boolean.',
    );
  }

  return {
    endpoint,
    requestedUserId,
    revokeAllForUser: Boolean(body.revokeAllForUser),
  };
}

export function validatePushNotifyBody(
  raw: unknown,
  appOrigin: string,
): ValidatedPushNotifyBody {
  const body = assertObjectRecord(raw);
  assertKeysAllowed(body, ALLOWED_NOTIFY_KEYS, 'push notify');

  if (
    body.isInternalNote !== undefined &&
    typeof body.isInternalNote !== 'boolean'
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'isInternalNote must be a boolean.',
    );
  }
  const isInternalNote = Boolean(body.isInternalNote);
  if (isInternalNote) {
    return {
      recipientId: '',
      recipientRole: '',
      title: '',
      body: '',
      isInternalNote: true,
    };
  }

  const recipientId =
    validateOptionalIdentifier(body.recipientId, 'recipientId') ?? '';
  const recipientRole =
    validateOptionalShortMeta(body.recipientRole, 'recipientRole', 32)?.toLowerCase() ?? '';
  const requestedSenderId = validateOptionalIdentifier(body.senderId, 'senderId');

  const title =
    validateNotificationText(body.title, 'Push title', 160, false) ||
    'New Message';
  const msgBody =
    validateNotificationText(body.body, 'Push body', 300, false) ||
    'You have received a new message.';
  const url = validateSafePushUrl(body.url, appOrigin);
  const tag = validateOptionalShortMeta(body.tag, 'Push tag', 120) ?? undefined;
  const conversationId = validateOptionalIdentifier(
    body.conversationId,
    'conversationId',
  );
  const messageId = validateOptionalIdentifier(body.messageId, 'messageId');

  let actionType: 'chat' | 'payout' | 'deposit' | 'game' | 'test' | undefined;
  if (body.actionType !== undefined && body.actionType !== null && body.actionType !== '') {
    if (
      typeof body.actionType !== 'string' ||
      !ALLOWED_PUSH_ACTION_TYPES.has(body.actionType)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid push actionType.',
      );
    }
    actionType = body.actionType as
      | 'chat'
      | 'payout'
      | 'deposit'
      | 'game'
      | 'test';
  }

  return {
    recipientId,
    recipientRole,
    requestedSenderId,
    title,
    body: msgBody,
    url,
    tag,
    conversationId,
    messageId,
    actionType,
    isInternalNote: false,
  };
}

function mapNotificationDomainError(err: unknown): never {
  if (err instanceof NotificationNotFoundError) {
    throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', err.message);
  }
  if (err instanceof NotificationForbiddenError) {
    throw new HttpError(403, 'FORBIDDEN', err.message);
  }
  if (err instanceof NotificationTargetUserNotFoundError) {
    throw new HttpError(404, 'TARGET_USER_NOT_FOUND', err.message);
  }
  throw err;
}

export function createNotificationRouter({
  config,
  notificationRepo,
  webPushSender,
  requireAuth,
  optionalAuth,
}: NotificationRouterDeps): Router {
  const router = Router();

  // =========================================================================
  // Web Push Endpoints (/api/push/*)
  // =========================================================================

  router.get('/push/vapid-public-key', (_req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!config.vapidPublicKey || !webPushSender.isConfigured) {
        throw new HttpError(
          503,
          'PUSH_NOT_CONFIGURED',
          'Web Push notifications are not configured on this server.',
        );
      }

      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({
        publicKey: config.vapidPublicKey,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/push/subscribe',
    requireAuth,
    validateRequestBody(validatePushSubscribeBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const payload = req.body as ValidatedPushSubscribeBody;

        if (payload.requestedUserId && payload.requestedUserId !== actor.appUserId) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Forbidden: cannot bind push subscription for another user.',
          );
        }

        // Never trust client-supplied userRole or userEmail; bind authoritatively to session user
        const record = await notificationRepo.upsertPushSubscription({
          userId: actor.appUserId,
          userEmail: actor.email,
          userRole: actor.role,
          endpoint: payload.endpoint,
          p256dh: payload.p256dh,
          auth: payload.auth,
          expirationTime: payload.expirationTime,
          platform: payload.platform,
          browser: payload.browser,
        });

        res.status(200).json({
          success: true,
          boundUserId: record.userId,
          boundRole: record.userRole,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/push/unsubscribe',
    requireAuth,
    validateRequestBody(validatePushUnsubscribeBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const payload = req.body as ValidatedPushUnsubscribeBody;

        if (payload.requestedUserId && payload.requestedUserId !== actor.appUserId) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Forbidden: cannot revoke push subscriptions for another user.',
          );
        }

        const removedCount = await notificationRepo.deactivatePushSubscriptions({
          userId: actor.appUserId,
          endpoint: payload.endpoint,
          revokeAllForUser: payload.revokeAllForUser,
        });

        res.status(200).json({
          success: true,
          removedCount,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/push/status',
    optionalAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const rawQuery = req.query as Record<string, unknown>;
        assertKeysAllowed(
          rawQuery,
          ALLOWED_PUSH_STATUS_QUERY_KEYS,
          'query parameter',
        );

        const queryUserId = validateOptionalIdentifier(rawQuery.userId, 'userId');
        let endpoint: string | undefined;
        if (
          rawQuery.endpoint !== undefined &&
          rawQuery.endpoint !== null &&
          rawQuery.endpoint !== ''
        ) {
          endpoint = validateHttpsPushEndpoint(rawQuery.endpoint);
        }

        if (!req.authContext || req.optionalAuthError) {
          res.status(200).json({
            linked: false,
            count: 0,
            boundToCurrentUser: false,
          });
          return;
        }

        const actor = req.authContext.user;
        if (queryUserId && queryUserId !== actor.appUserId) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Forbidden: cannot query push subscription status for another user.',
          );
        }

        const status = await notificationRepo.getPushStatusForUser(
          actor.appUserId,
          endpoint,
        );
        res.status(200).json(status);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/push/notify',
    requireAuth,
    validateRequestBody((raw) => validatePushNotifyBody(raw, config.appOrigin)),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const payload = req.body as ValidatedPushNotifyBody;

        if (payload.isInternalNote) {
          res.status(200).json({
            success: true,
            skipped: true,
            sent: 0,
            failed: 0,
          });
          return;
        }

        if (payload.requestedSenderId && payload.requestedSenderId !== actor.appUserId) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Forbidden: senderId cannot impersonate another user.',
          );
        }

        if (!webPushSender.isConfigured) {
          throw new HttpError(
            503,
            'PUSH_NOT_CONFIGURED',
            'Web Push notifications are not configured on this server.',
          );
        }

        const wantsStaff =
          payload.recipientId === 'staff' ||
          payload.recipientRole === 'agent' ||
          payload.recipientRole === 'admin' ||
          payload.recipientRole === 'staff';

        let targetMode: 'staff' | 'user';
        let targetUserId: string | undefined;

        if (actor.role === 'customer') {
          if (wantsStaff) {
            targetMode = 'staff';
          } else if (payload.recipientId === actor.appUserId) {
            targetMode = 'user';
            targetUserId = actor.appUserId;
          } else {
            throw new HttpError(
              403,
              'FORBIDDEN',
              'Forbidden: customers cannot send push notifications to other customers.',
            );
          }
        } else if (actor.role === 'agent' || actor.role === 'admin') {
          if (wantsStaff) {
            targetMode = 'staff';
          } else if (
            !payload.recipientId ||
            RESERVED_TARGET_IDS.has(payload.recipientId.toLowerCase())
          ) {
            throw new HttpError(
              400,
              'VALIDATION_ERROR',
              'Explicit recipientId is required to notify a customer.',
            );
          } else {
            targetMode = 'user';
            targetUserId = payload.recipientId;
          }
        } else {
          throw new HttpError(403, 'FORBIDDEN', 'Forbidden.');
        }

        const isSelfTest =
          targetMode === 'user' && targetUserId === actor.appUserId;
        const targets = await notificationRepo.listActivePushTargets({
          targetMode,
          targetUserId,
          excludeSenderId: isSelfTest ? undefined : actor.appUserId,
        });

        if (targets.length === 0) {
          res.status(200).json({
            success: true,
            sent: 0,
            failed: 0,
            pruned: 0,
          });
          return;
        }

        const serializedPayload = JSON.stringify({
          title: payload.title,
          body: payload.body,
          icon: '/pwa-192x192-v2.png',
          badge: '/notification-badge-v2.png',
          tag:
            payload.tag ||
            (payload.messageId
              ? `msg_${payload.messageId}`
              : `chat_${payload.conversationId || Date.now()}`),
          data: {
            conversationId: payload.conversationId,
            messageId: payload.messageId,
            actionType: payload.actionType || (isSelfTest ? 'test' : 'chat'),
            url:
              payload.url || (targetMode === 'staff' ? '/#ops_chat' : '/#chat'),
            targetUserId: targetMode === 'staff' ? 'staff' : targetUserId,
            targetRole: targetMode === 'staff' ? 'staff' : 'customer',
          },
        });

        let sent = 0;
        let failed = 0;
        const goneEndpoints: string[] = [];

        await Promise.all(
          targets.map(async (target) => {
            try {
              await webPushSender.sendNotification(
                {
                  endpoint: target.endpoint,
                  expirationTime: target.expirationTime,
                  keys: {
                    p256dh: target.p256dh,
                    auth: target.auth,
                  },
                },
                serializedPayload,
                {
                  TTL: 86400,
                  urgency: 'high',
                  headers: { Urgency: 'high' },
                },
              );
              sent += 1;
            } catch (err) {
              failed += 1;
              const status = Number(
                (err as { statusCode?: unknown; status?: unknown })?.statusCode ??
                  (err as { status?: unknown })?.status ??
                  0,
              );
              if (status === 404 || status === 410) {
                goneEndpoints.push(target.endpoint);
              }
            }
          }),
        );

        let pruned = 0;
        if (goneEndpoints.length > 0) {
          pruned = await notificationRepo.pruneExpiredEndpoints(goneEndpoints);
        }

        res.status(200).json({
          success: true,
          sent,
          failed,
          pruned,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // =========================================================================
  // In-App Notifications Endpoints (/api/notifications*)
  // =========================================================================

  router.get(
    '/notifications',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const query = validateNotificationQuery(
          req.query as Record<string, unknown>,
        );

        if (query.requestedUserId && query.requestedUserId !== actor.appUserId) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Forbidden: you can only view your own notifications.',
          );
        }

        const result = await notificationRepo.listNotificationsForUser({
          userId: actor.appUserId,
          unreadOnly: query.unreadOnly,
          type: query.type,
          limit: query.limit,
          offset: query.offset,
        });

        res.status(200).json({
          success: true,
          notifications: result.items,
          total: result.total,
          unreadCount: result.unreadCount,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + result.items.length < result.total,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/notifications',
    requireAuth,
    validateRequestBody(validateCreateNotificationBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const payload = req.body as ValidatedCreateNotificationBody;
        const targetUserId = payload.targetUserId ?? actor.appUserId;

        const isStaff = actor.role === 'agent' || actor.role === 'admin';
        if (!isStaff && targetUserId !== actor.appUserId) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Forbidden: customers can only create notifications for their own account.',
          );
        }

        const { notification, created } =
          await notificationRepo.createNotification({
            userId: targetUserId,
            title: payload.title,
            message: payload.message,
            type: payload.type,
            linkTab: payload.linkTab,
            linkRequestId: payload.linkRequestId,
          });

        res.status(created ? 201 : 200).json({
          success: true,
          notification,
          deduplicated: !created,
        });
      } catch (err) {
        try {
          mapNotificationDomainError(err);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );

  router.post(
    '/notifications/read-all',
    requireAuth,
    validateRequestBody(validateReadAllBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const payload = req.body as ValidatedReadAllBody;

        if (payload.requestedUserId && payload.requestedUserId !== actor.appUserId) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Forbidden: you can only update your own notifications.',
          );
        }

        const updatedCount = await notificationRepo.markAllNotificationsRead(
          actor.appUserId,
        );

        res.status(200).json({
          success: true,
          updatedCount,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/notifications/:id/read',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const rawId = req.params.id;
        if (typeof rawId !== 'string' || !SAFE_ID_REGEX.test(rawId.trim())) {
          throw new HttpError(
            400,
            'VALIDATION_ERROR',
            'Invalid notification identifier.',
          );
        }

        const notification = await notificationRepo.markNotificationRead(
          rawId.trim(),
          actor.appUserId,
        );

        res.status(200).json({
          success: true,
          notification,
        });
      } catch (err) {
        try {
          mapNotificationDomainError(err);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );

  return router;
}
