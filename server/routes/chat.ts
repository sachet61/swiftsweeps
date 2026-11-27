import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import {
  ChatConflictError,
  ChatForbiddenError,
  ChatNotFoundError,
  ChatValidationError,
  type ChatRepo,
  type ListConversationsOptions,
  type ListMessagesOptions,
  type SendMessageInput,
} from '../chat/chatRepo.js';
import type { AppConfigRepo } from '../appConfig/appConfigRepo.js';
import {
  cloneDefaultCashoutRulesConfig,
  computeCashoutRulesVersion,
  formatCashoutRulesMessage,
} from '../appConfig/cashoutRules.js';
import type { ChatEventBroker, ChatTicketStatus } from '../chat/chatEvents.js';
import type { RealtimeEventBroker } from '../realtime/realtimeEvents.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';

export interface ChatRouterDeps {
  chatRepo: ChatRepo;
  chatEvents: ChatEventBroker;
  requireAuth: RequestHandler;
  realtimeEvents?: RealtimeEventBroker;
  appConfigRepo?: AppConfigRepo;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,140}$/;
const ATTACHMENT_ID_REGEX = /^[a-zA-Z0-9_-]+\.(png|jpg|webp|gif)$/;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;
const MULTILINE_CONTROL_CHAR_REGEX =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const MAX_LIST_LIMIT = 200;
const MAX_OFFSET = 10_000;
const MAX_TEXT_LENGTH = 8_000;
const MAX_ATTACHMENT_NAME_LENGTH = 200;
const MAX_URL_LENGTH = 2_048;
const MAX_TX_JSON_BYTES = 16 * 1024;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

const ALLOWED_TICKET_STATUSES = new Set<ChatTicketStatus>([
  'open',
  'pending',
  'resolved',
  'closed',
]);

const ALLOWED_CONVERSATIONS_QUERY_KEYS = new Set([
  'status',
  'q',
  'limit',
  'offset',
]);

const ALLOWED_MESSAGES_QUERY_KEYS = new Set([
  'customerId',
  'conversationId',
  'beforeCreatedAt',
  'afterCreatedAt',
  'limit',
]);

const PRIVILEGED_BODY_FIELDS = new Set([
  'senderId',
  'sender_id',
  'senderRole',
  'sender_role',
  'senderEmail',
  'sender_email',
  'actingUserId',
  'acting_user_id',
  'actorId',
  'actorRole',
  'role',
  'agentId',
  'agent_id',
  'userId',
  'user_id',
]);

const ALLOWED_ENSURE_BODY_KEYS = new Set(['customerId']);

const ALLOWED_SEND_BODY_KEYS = new Set([
  'id',
  'conversationId',
  'recipientId',
  'text',
  'attachmentUrl',
  'attachmentName',
  'transactionData',
  'isInternalNote',
  'createdAt',
  'deskLabel',
]);

const ALLOWED_STATUS_BODY_KEYS = new Set(['conversationId', 'status']);

const ALLOWED_TX_CARD_BODY_KEYS = new Set([
  'requestId',
  'customerId',
  'status',
  'notes',
  'amount',
  'bonusAmount',
  'finalCredit',
]);

const ALLOWED_ATTACHMENT_UPLOAD_BODY_KEYS = new Set([
  'conversationId',
  'customerId',
  'fileName',
  'contentType',
  'fileBase64',
]);

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set<
  'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
>(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function assertObjectRecord(
  raw: unknown,
  message = 'Request body must be a JSON object.',
): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }
  return raw as Record<string, unknown>;
}

function assertBodyKeysAllowed(
  body: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  noun: string,
): void {
  for (const key of Object.keys(body)) {
    if (PRIVILEGED_BODY_FIELDS.has(key)) {
      throw new HttpError(
        403,
        'FORBIDDEN_FIELD_MODIFICATION',
        `Field "${key}" is derived from the authenticated session and cannot be supplied by clients.`,
      );
    }
    if (!allowedKeys.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported field "${key}" in ${noun}.`,
      );
    }
  }
}

function assertQueryKeysAllowed(
  query: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): void {
  for (const key of Object.keys(query)) {
    if (!allowedKeys.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported query parameter "${key}".`,
      );
    }
  }
}

function readSingleQueryValue(raw: unknown, paramName: string): string | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Query parameter "${paramName}" must not be repeated.`,
    );
  }
  if (typeof raw !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Query parameter "${paramName}" must be a string.`,
    );
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function parseBoundedIntQuery(
  raw: unknown,
  paramName: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const str = readSingleQueryValue(raw, paramName);
  if (!str) return defaultValue;
  if (!/^\d+$/.test(str)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Query parameter "${paramName}" must be an integer between ${min} and ${max}.`,
    );
  }
  const parsed = Number.parseInt(str, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Query parameter "${paramName}" must be between ${min} and ${max}.`,
    );
  }
  return parsed;
}

function readOptionalId(
  raw: unknown,
  fieldName: string,
): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a string.`);
  }
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (!ID_REGEX.test(trimmed)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `Invalid ${fieldName} format.`);
  }
  return trimmed;
}

function readRequiredId(raw: unknown, fieldName: string): string {
  const parsed = readOptionalId(raw, fieldName);
  if (!parsed) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} is required.`);
  }
  return parsed;
}

function readIsoTimestamp(raw: unknown, fieldName: string): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be an ISO timestamp string.`,
    );
  }
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 64 || CONTROL_CHAR_REGEX.test(trimmed)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `Invalid ${fieldName} format.`);
  }
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a valid timestamp.`);
  }
  return new Date(ms).toISOString();
}

function validateSafeAttachmentUrl(rawUrl: unknown): string | undefined {
  if (rawUrl === undefined || rawUrl === null || rawUrl === '') return undefined;
  if (typeof rawUrl !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'attachmentUrl must be a string.');
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_URL_LENGTH || CONTROL_CHAR_REGEX.test(trimmed) || /\s/.test(trimmed)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid attachmentUrl format.');
  }
  if (/^(javascript|vbscript|data):/i.test(trimmed)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported attachmentUrl scheme.');
  }
  if (
    trimmed.startsWith('/api/chat/attachments/') ||
    trimmed.startsWith('/api/storage/file?') ||
    /^https:\/\/[^/\s?#]+/i.test(trimmed)
  ) {
    return trimmed;
  }
  throw new HttpError(
    400,
    'VALIDATION_ERROR',
    'attachmentUrl must be an HTTPS URL or a safe same-origin attachment path.',
  );
}

function detectImageMime(buffer: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | null {
  if (buffer.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // GIF: GIF87a / GIF89a
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return 'image/gif';
  }
  // WebP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function mimeToExtension(
  mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
): 'png' | 'jpg' | 'webp' | 'gif' {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
    default:
      return 'webp';
  }
}

function mapRepoErrorToHttp(err: unknown): unknown {
  if (err instanceof HttpError) return err;
  if (err instanceof ChatForbiddenError) {
    return new HttpError(403, err.code, err.message);
  }
  if (err instanceof ChatNotFoundError) {
    return new HttpError(404, 'CHAT_NOT_FOUND', err.message);
  }
  if (err instanceof ChatConflictError) {
    return new HttpError(409, 'CHAT_CONFLICT', err.message);
  }
  if (err instanceof ChatValidationError) {
    return new HttpError(err.statusCode, err.code, err.message);
  }
  return err;
}

function validateListConversationsQuery(req: Request): Omit<ListConversationsOptions, 'actorId' | 'actorRole'> {
  const query = req.query as Record<string, unknown>;
  assertQueryKeysAllowed(query, ALLOWED_CONVERSATIONS_QUERY_KEYS);

  const rawStatus = readSingleQueryValue(query.status, 'status');
  let status: ChatTicketStatus | undefined;
  if (rawStatus !== undefined) {
    const normalized = rawStatus.toLowerCase();
    if (!ALLOWED_TICKET_STATUSES.has(normalized as ChatTicketStatus)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'status must be one of open, pending, resolved, or closed.',
      );
    }
    status = normalized as ChatTicketStatus;
  }

  const rawSearch = readSingleQueryValue(query.q, 'q');
  if (rawSearch !== undefined) {
    if (rawSearch.length > 120 || CONTROL_CHAR_REGEX.test(rawSearch)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid search query.');
    }
  }

  const limit = parseBoundedIntQuery(query.limit, 'limit', 50, 1, MAX_LIST_LIMIT);
  const offset = parseBoundedIntQuery(query.offset, 'offset', 0, 0, MAX_OFFSET);

  return {
    status,
    search: rawSearch,
    limit,
    offset,
  };
}

function validateListMessagesQuery(
  req: Request,
): Omit<ListMessagesOptions, 'actorId' | 'actorRole'> {
  const query = req.query as Record<string, unknown>;
  assertQueryKeysAllowed(query, ALLOWED_MESSAGES_QUERY_KEYS);

  const customerId = readOptionalId(
    readSingleQueryValue(query.customerId, 'customerId'),
    'customerId',
  );
  const conversationId = readOptionalId(
    readSingleQueryValue(query.conversationId, 'conversationId'),
    'conversationId',
  );
  if (!customerId && !conversationId) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'customerId or conversationId is required.',
    );
  }

  const beforeCreatedAt = readIsoTimestamp(
    readSingleQueryValue(query.beforeCreatedAt, 'beforeCreatedAt'),
    'beforeCreatedAt',
  );
  const afterCreatedAt = readIsoTimestamp(
    readSingleQueryValue(query.afterCreatedAt, 'afterCreatedAt'),
    'afterCreatedAt',
  );
  if (beforeCreatedAt && afterCreatedAt) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'beforeCreatedAt and afterCreatedAt cannot be combined in the same query.',
    );
  }

  const limit = parseBoundedIntQuery(query.limit, 'limit', 50, 1, MAX_LIST_LIMIT);

  return {
    customerId,
    conversationId,
    beforeCreatedAt,
    afterCreatedAt,
    limit,
  };
}

function validateSendMessageBody(rawBody: unknown): Omit<SendMessageInput, 'actorId' | 'actorName' | 'actorRole'> {
  const body = assertObjectRecord(rawBody);
  assertBodyKeysAllowed(body, ALLOWED_SEND_BODY_KEYS, 'chat message payload');

  const id = readOptionalId(body.id, 'id');
  const conversationId = readOptionalId(body.conversationId, 'conversationId');
  const recipientId = readOptionalId(body.recipientId, 'recipientId');

  let text = '';
  if (body.text !== undefined && body.text !== null) {
    if (typeof body.text !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'text must be a string.');
    }
    if (body.text.length > MAX_TEXT_LENGTH || MULTILINE_CONTROL_CHAR_REGEX.test(body.text)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Message text must not exceed ${MAX_TEXT_LENGTH} characters or contain invalid control characters.`,
      );
    }
    text = body.text;
  }

  const attachmentUrl = validateSafeAttachmentUrl(body.attachmentUrl);

  let attachmentName: string | undefined;
  if (body.attachmentName !== undefined && body.attachmentName !== null && body.attachmentName !== '') {
    if (typeof body.attachmentName !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'attachmentName must be a string.');
    }
    const trimmedName = body.attachmentName.trim();
    if (trimmedName.length > MAX_ATTACHMENT_NAME_LENGTH || CONTROL_CHAR_REGEX.test(trimmedName)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid attachmentName.');
    }
    attachmentName = trimmedName;
  }

  let transactionData: Record<string, unknown> | null = null;
  if (body.transactionData !== undefined && body.transactionData !== null) {
    if (typeof body.transactionData !== 'object' || Array.isArray(body.transactionData)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'transactionData must be a JSON object when provided.',
      );
    }
    const serialized = JSON.stringify(body.transactionData);
    if (serialized.length > MAX_TX_JSON_BYTES) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'transactionData exceeds allowed payload size.',
      );
    }
    const txObj: Record<string, unknown> = { ...(body.transactionData as Record<string, unknown>) };
    for (const urlField of ['attachmentUrl', 'proofUrl', 'receiptUrl', 'imageUrl'] as const) {
      if (txObj[urlField] !== undefined && txObj[urlField] !== null && txObj[urlField] !== '') {
        txObj[urlField] = validateSafeAttachmentUrl(txObj[urlField]);
      }
    }
    transactionData = txObj;
  }

  if (body.isInternalNote !== undefined && typeof body.isInternalNote !== 'boolean') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'isInternalNote must be a boolean.');
  }
  const isInternalNote = Boolean(body.isInternalNote);

  let deskLabel: string | undefined;
  if (body.deskLabel !== undefined && body.deskLabel !== null && body.deskLabel !== '') {
    if (typeof body.deskLabel !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'deskLabel must be a string.');
    }
    const cleanLabel = body.deskLabel.trim();
    if (cleanLabel.length > 80 || CONTROL_CHAR_REGEX.test(cleanLabel)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid deskLabel.');
    }
    deskLabel = cleanLabel;
  }

  const createdAt = readIsoTimestamp(body.createdAt, 'createdAt');

  if (!text.trim() && !attachmentUrl && !transactionData) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Message text, attachmentUrl, or transactionData is required.',
    );
  }

  return {
    id,
    conversationId,
    recipientId,
    text,
    attachmentUrl,
    attachmentName,
    transactionData,
    isInternalNote,
    createdAt,
    deskLabel,
  };
}

export function createChatRouter({
  chatRepo,
  chatEvents,
  requireAuth,
  realtimeEvents,
  appConfigRepo,
}: ChatRouterDeps): Router {
  const router = Router();

  // 1. List support conversations (strictly scoped to authenticated customer, or all customer tickets for staff)
  router.get(
    '/chat/conversations',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authContext!.user;
        const query = validateListConversationsQuery(req);
        const result = await chatRepo.listConversations({
          actorId: authUser.appUserId,
          actorRole: authUser.role,
          ...query,
        });

        res.json({
          success: true,
          conversations: result.items,
          total: result.total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + result.items.length < result.total,
        });
      } catch (err) {
        next(mapRepoErrorToHttp(err));
      }
    },
  );

  // 2. Idempotently ensure canonical customer conversation exists
  router.post(
    '/chat/conversations/ensure',
    requireAuth,
    validateRequestBody((raw) => {
      const body = assertObjectRecord(raw);
      assertBodyKeysAllowed(body, ALLOWED_ENSURE_BODY_KEYS, 'conversation ensure payload');
      return {
        customerId: readOptionalId(body.customerId, 'customerId'),
      };
    }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authContext!.user;
        const body = req.body as { customerId?: string };
        const targetCustomerId =
          body.customerId ||
          (authUser.role === 'customer' ? authUser.appUserId : '');
        if (!targetCustomerId) {
          throw new HttpError(
            400,
            'VALIDATION_ERROR',
            'customerId is required for staff requests.',
          );
        }

        const conversation = await chatRepo.ensureConversation({
          actorId: authUser.appUserId,
          actorRole: authUser.role,
          customerId: targetCustomerId,
        });

        res.json({
          success: true,
          conversation,
        });
      } catch (err) {
        next(mapRepoErrorToHttp(err));
      }
    },
  );

  // 3. Paginated conversation messages (ownership verified, internal notes stripped for customers)
  router.get(
    '/chat/messages',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authContext!.user;
        const query = validateListMessagesQuery(req);
        const result = await chatRepo.listMessages({
          actorId: authUser.appUserId,
          actorRole: authUser.role,
          ...query,
        });

        res.json({
          success: true,
          canonicalId: result.canonicalId,
          customerId: result.customerId,
          messages: result.messages,
          hasMore: result.hasMore,
        });
      } catch (err) {
        next(mapRepoErrorToHttp(err));
      }
    },
  );

  // 4. Send message / transaction card / staff internal note (idempotent by client msg ID)
  router.post(
    '/chat/send',
    requireAuth,
    validateRequestBody(validateSendMessageBody),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authContext!.user;
        const validated = req.body as Omit<
          SendMessageInput,
          'actorId' | 'actorName' | 'actorRole'
        >;

        const result = await chatRepo.sendMessage({
          ...validated,
          actorId: authUser.appUserId,
          actorName: authUser.displayName,
          actorRole: authUser.role,
        });

        if (!result.deduplicated) {
          chatEvents.emit({
            type: 'chat_message',
            customerId: result.customerId,
            conversationId: result.canonicalId,
            isInternalNote: result.message.is_internal_note,
            message: result.message,
            conversation: result.conversation,
          });
        }

        res.json({
          success: true,
          canonicalId: result.canonicalId,
          message: result.message,
          conversation: result.conversation,
          deduplicated: result.deduplicated,
        });
      } catch (err) {
        next(mapRepoErrorToHttp(err));
      }
    },
  );

  // 5. Staff-only ticket status update (PATCH + legacy POST)
  const handleStatusUpdate: RequestHandler = async (req, res, next) => {
    try {
      const authUser = req.authContext!.user;
      const body = req.body as { conversationId: string; status: ChatTicketStatus };
      const conversation = await chatRepo.updateConversationStatus({
        actorId: authUser.appUserId,
        actorName: authUser.displayName,
        actorRole: authUser.role,
        conversationId: body.conversationId,
        status: body.status,
      });

      chatEvents.emit({
        type: 'conversation_status',
        customerId: conversation.customer_id,
        conversationId: conversation.id,
        status: conversation.status,
        conversation,
      });
      realtimeEvents?.emitDomainInvalidation(
        { scope: 'admin' },
        ['audit_logs'],
        'chat_conversation_status_updated',
        conversation.customer_id,
      );

      res.json({
        success: true,
        conversation,
      });
    } catch (err) {
      next(mapRepoErrorToHttp(err));
    }
  };

  const validateStatusBody = validateRequestBody((raw) => {
    const body = assertObjectRecord(raw);
    assertBodyKeysAllowed(body, ALLOWED_STATUS_BODY_KEYS, 'ticket status update');
    const conversationId = readRequiredId(body.conversationId, 'conversationId');
    if (typeof body.status !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'status is required.');
    }
    const normalized = body.status.trim().toLowerCase();
    if (!ALLOWED_TICKET_STATUSES.has(normalized as ChatTicketStatus)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'status must be one of open, pending, resolved, or closed.',
      );
    }
    return {
      conversationId,
      status: normalized as ChatTicketStatus,
    };
  });

  router.patch(
    '/chat/conversation-status',
    requireAuth,
    requireRole('admin', 'agent'),
    validateStatusBody,
    handleStatusUpdate,
  );
  router.post(
    '/chat/conversation-status',
    requireAuth,
    requireRole('admin', 'agent'),
    validateStatusBody,
    handleStatusUpdate,
  );

  // 5b. Staff-only per-conversation Cashout Rules pin & unpin
  router.post(
    '/chat/conversations/:conversationId/pin-cashout-rules',
    requireAuth,
    requireRole('admin', 'agent'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authContext!.user;
        const conversationId = readRequiredId(
          req.params.conversationId,
          'conversationId',
        );

        const cashoutRules = appConfigRepo
          ? await appConfigRepo.getAuthoritativeCashoutRules()
          : cloneDefaultCashoutRulesConfig();

        if (!cashoutRules.enabled) {
          throw new HttpError(
            400,
            'CASHOUT_RULES_DISABLED',
            'Structured cashout rules are currently disabled in platform configuration.',
          );
        }

        const rulesVersion = computeCashoutRulesVersion(cashoutRules);
        const formattedText = formatCashoutRulesMessage(cashoutRules);

        const result = await chatRepo.pinCashoutRules({
          actorId: authUser.appUserId,
          actorName: authUser.displayName,
          actorRole: authUser.role,
          conversationId,
          rulesVersion,
          formattedText,
          cashoutRulesSnapshot: cashoutRules as unknown as Record<string, unknown>,
        });

        if (result.postedNewMessage) {
          chatEvents.emit({
            type: 'chat_message',
            customerId: result.customerId,
            conversationId: result.canonicalId,
            isInternalNote: false,
            message: result.message,
            conversation: result.conversation,
          });
        }

        chatEvents.emit({
          type: 'conversation_pin_updated',
          customerId: result.customerId,
          conversationId: result.canonicalId,
          conversation: result.conversation,
        });

        if (!result.deduplicated) {
          realtimeEvents?.emitDomainInvalidation(
            { scope: 'admin' },
            ['audit_logs'],
            'cashout_rules_pinned',
            result.customerId,
          );
        }

        res.json({
          success: true,
          conversation: result.conversation,
          message: result.message,
          rulesVersion,
          postedNewMessage: result.postedNewMessage,
          deduplicated: result.deduplicated,
        });
      } catch (err) {
        next(mapRepoErrorToHttp(err));
      }
    },
  );

  router.delete(
    '/chat/conversations/:conversationId/pin-cashout-rules',
    requireAuth,
    requireRole('admin', 'agent'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authContext!.user;
        const conversationId = readRequiredId(
          req.params.conversationId,
          'conversationId',
        );

        const result = await chatRepo.unpinCashoutRules({
          actorId: authUser.appUserId,
          actorName: authUser.displayName,
          actorRole: authUser.role,
          conversationId,
        });

        chatEvents.emit({
          type: 'conversation_pin_updated',
          customerId: result.customerId,
          conversationId: result.canonicalId,
          conversation: result.conversation,
        });

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'admin' },
          ['audit_logs'],
          'cashout_rules_unpinned',
          result.customerId,
        );

        res.json({
          success: true,
          conversation: result.conversation,
        });
      } catch (err) {
        next(mapRepoErrorToHttp(err));
      }
    },
  );

  // 6. Staff-only transaction card status update (replaces direct client Supabase messages update)
  router.patch(
    '/chat/messages/transaction-status',
    requireAuth,
    requireRole('admin', 'agent'),
    validateRequestBody((raw) => {
      const body = assertObjectRecord(raw);
      assertBodyKeysAllowed(
        body,
        ALLOWED_TX_CARD_BODY_KEYS,
        'transaction card update',
      );
      const requestId = readRequiredId(body.requestId, 'requestId');
      const customerId = readOptionalId(body.customerId, 'customerId');
      if (body.status !== 'completed' && body.status !== 'rejected') {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'status must be completed or rejected.',
        );
      }

      let notes: string | undefined;
      if (body.notes !== undefined && body.notes !== null) {
        if (typeof body.notes !== 'string') {
          throw new HttpError(400, 'VALIDATION_ERROR', 'notes must be a string.');
        }
        if (body.notes.length > 500 || MULTILINE_CONTROL_CHAR_REGEX.test(body.notes)) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid notes value.');
        }
        notes = body.notes;
      }

      const readOptMoney = (val: unknown, name: string): number | undefined => {
        if (val === undefined || val === null) return undefined;
        if (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > 10_000_000) {
          throw new HttpError(400, 'VALIDATION_ERROR', `${name} must be a non-negative number.`);
        }
        return Number(val.toFixed(2));
      };

      return {
        requestId,
        customerId,
        status: body.status as 'completed' | 'rejected',
        notes,
        amount: readOptMoney(body.amount, 'amount'),
        bonusAmount: readOptMoney(body.bonusAmount, 'bonusAmount'),
        finalCredit: readOptMoney(body.finalCredit, 'finalCredit'),
      };
    }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authContext!.user;
        const body = req.body as {
          requestId: string;
          customerId?: string;
          status: 'completed' | 'rejected';
          notes?: string;
          amount?: number;
          bonusAmount?: number;
          finalCredit?: number;
        };

        const updatedMessages = await chatRepo.updateTransactionCardStatus({
          actorId: authUser.appUserId,
          actorName: authUser.displayName,
          actorRole: authUser.role,
          ...body,
        });

        for (const msg of updatedMessages) {
          const cid = body.customerId || msg.conversation_id.replace(/^conv_/, '');
          chatEvents.emit({
            type: 'message_updated',
            customerId: cid,
            conversationId: msg.conversation_id,
            isInternalNote: msg.is_internal_note,
            message: msg,
          });
        }
        if (updatedMessages.length > 0) {
          realtimeEvents?.emitDomainInvalidation(
            { scope: 'admin' },
            ['audit_logs'],
            'chat_transaction_status_updated',
            body.customerId,
          );
        }

        res.json({
          success: true,
          updatedCount: updatedMessages.length,
          messages: updatedMessages,
        });
      } catch (err) {
        next(mapRepoErrorToHttp(err));
      }
    },
  );

  // 7. Upload chat image attachment to PostgreSQL (authenticated, strictly scoped, magic-byte verified)
  router.post(
    '/chat/attachments',
    requireAuth,
    validateRequestBody((raw) => {
      const body = assertObjectRecord(raw);
      assertBodyKeysAllowed(
        body,
        ALLOWED_ATTACHMENT_UPLOAD_BODY_KEYS,
        'chat attachment upload',
      );
      const conversationId = readOptionalId(body.conversationId, 'conversationId');
      const customerId = readOptionalId(body.customerId, 'customerId');

      if (typeof body.contentType !== 'string') {
        throw new HttpError(400, 'VALIDATION_ERROR', 'contentType is required.');
      }
      const normType = body.contentType.trim().toLowerCase();
      if (
        !ALLOWED_ATTACHMENT_MIME_TYPES.has(
          normType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
        )
      ) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Only PNG, JPEG, WebP, and GIF images are allowed in chat.',
        );
      }

      if (typeof body.fileBase64 !== 'string' || !body.fileBase64.trim()) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'fileBase64 is required.');
      }

      const rawBase64 = body.fileBase64.includes(',')
        ? body.fileBase64.split(',').pop()!
        : body.fileBase64;
      const cleanBase64 = rawBase64.replace(/\s+/g, '');
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleanBase64)) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid base64 image payload.');
      }

      const buffer = Buffer.from(cleanBase64, 'base64');
      if (buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Chat attachment image must be between 1 byte and 2 MB.',
        );
      }

      const detectedMime = detectImageMime(buffer);
      if (!detectedMime) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Uploaded file content is not a valid PNG, JPEG, WebP, or GIF image.',
        );
      }

      let originalName: string | undefined;
      if (typeof body.fileName === 'string' && body.fileName.trim()) {
        const clean = body.fileName.trim().slice(0, MAX_ATTACHMENT_NAME_LENGTH);
        if (!CONTROL_CHAR_REGEX.test(clean)) {
          originalName = clean;
        }
      }

      return {
        conversationId,
        customerId,
        contentType: detectedMime,
        extension: mimeToExtension(detectedMime),
        originalName,
        buffer,
      };
    }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authContext!.user;
        const body = req.body as {
          conversationId?: string;
          customerId?: string;
          contentType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
          extension: 'png' | 'jpg' | 'webp' | 'gif';
          originalName?: string;
          buffer: Buffer;
        };

        const saved = await chatRepo.saveChatAttachment({
          actorId: authUser.appUserId,
          actorRole: authUser.role,
          conversationId: body.conversationId,
          customerId: body.customerId,
          contentType: body.contentType,
          extension: body.extension,
          originalName: body.originalName,
          buffer: body.buffer,
        });

        res.json({
          success: true,
          id: saved.id,
          url: saved.url,
          name: saved.originalName || saved.id,
          size: saved.sizeBytes,
          conversationId: saved.conversationId,
        });
      } catch (err) {
        next(mapRepoErrorToHttp(err));
      }
    },
  );

  // 8. Authenticated chat attachment download (strictly owner-or-staff scoped)
  router.get(
    '/chat/attachments/:id',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = String(req.params.id || '').trim();
        if (!ATTACHMENT_ID_REGEX.test(id)) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid attachment identifier.');
        }

        const authUser = req.authContext!.user;
        const record = await chatRepo.getChatAttachment({
          id,
          actorId: authUser.appUserId,
          actorRole: authUser.role,
        });

        if (!record) {
          throw new HttpError(404, 'CHAT_ATTACHMENT_NOT_FOUND', 'Attachment not found.');
        }

        res.setHeader('Content-Type', record.contentType);
        res.setHeader('Content-Length', String(record.imageData.length));
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.status(200).send(record.imageData);
      } catch (err) {
        next(mapRepoErrorToHttp(err));
      }
    },
  );

  // 9. Role-scoped Server-Sent Events (SSE) realtime chat stream
  router.get(
    '/chat/stream',
    requireAuth,
    (req: Request, res: Response) => {
      const authUser = req.authContext!.user;
      const isStaff = authUser.role === 'admin' || authUser.role === 'agent';

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const writeEvent = (
        eventName: string,
        payload: unknown,
        eventId?: string,
      ) => {
        if (res.writableEnded) return;
        const idLine = eventId ? `id: ${eventId}\n` : '';
        res.write(`${idLine}event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
      };

      const canReceiveChatEvent = (
        event: Parameters<Parameters<ChatEventBroker['subscribe']>[0]>[0],
      ): boolean => {
        if (isStaff) return true;
        if (event.customerId !== authUser.appUserId) {
          return false;
        }
        if (
          (event.type === 'chat_message' || event.type === 'message_updated') &&
          event.isInternalNote
        ) {
          return false;
        }
        return true;
      };

      if (!res.writableEnded) {
        res.write('retry: 3000\n\n');
      }

      writeEvent('ready', {
        connectedAt: new Date().toISOString(),
        role: authUser.role,
        streamEpoch: chatEvents.epoch,
        latestEventId: chatEvents.latestEventId,
      });

      const headerCursor = req.get('last-event-id');
      const queryCursor =
        typeof req.query.lastEventId === 'string' ? req.query.lastEventId : undefined;
      const replay = chatEvents.getReplaySince(
        headerCursor?.trim() || queryCursor?.trim() || undefined,
      );
      if (replay.status === 'resync_required') {
        writeEvent('resync_required', {
          reason: replay.reason,
          streamEpoch: chatEvents.epoch,
          latestEventId: chatEvents.latestEventId,
        });
      } else if (replay.status === 'replay') {
        for (const envelope of replay.events) {
          if (!canReceiveChatEvent(envelope.event)) continue;
          writeEvent(envelope.event.type, envelope.event, envelope.eventId);
        }
      }

      const unsubscribe = chatEvents.subscribe((event, meta) => {
        if (!canReceiveChatEvent(event)) {
          return;
        }
        writeEvent(event.type, event, meta.eventId);
      });

      const heartbeat = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': ping\n\n');
        }
      }, 15_000);
      heartbeat.unref?.();

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearInterval(heartbeat);
        unsubscribe();
      };

      req.on('close', cleanup);
      res.on('close', cleanup);
    },
  );

  return router;
}
