import crypto from 'node:crypto';
import type { AppUserRole } from '../auth/userDirectoryRepo.js';
import type { DatabaseClient, DatabasePool } from '../db/pool.js';
import type {
  ChatConversationPayload,
  ChatMessagePayload,
  ChatTicketStatus,
} from './chatEvents.js';

export type ChatSenderRole = 'customer' | 'agent' | 'admin' | 'system';

export class ChatValidationError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 400, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ChatValidationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ChatForbiddenError extends Error {
  public readonly code: string;

  constructor(message = 'You do not have permission to access this conversation.', code = 'FORBIDDEN') {
    super(message);
    this.name = 'ChatForbiddenError';
    this.code = code;
  }
}

export class ChatNotFoundError extends Error {
  constructor(message = 'Conversation or message not found.') {
    super(message);
    this.name = 'ChatNotFoundError';
  }
}

export class ChatConflictError extends Error {
  constructor(message = 'Message identifier conflicts with an existing record.') {
    super(message);
    this.name = 'ChatConflictError';
  }
}

export interface ListConversationsOptions {
  actorId: string;
  actorRole: AppUserRole;
  status?: ChatTicketStatus;
  search?: string;
  limit: number;
  offset: number;
}

export interface ListConversationsResult {
  items: ChatConversationPayload[];
  total: number;
}

export interface EnsureConversationInput {
  actorId: string;
  actorRole: AppUserRole;
  customerId: string;
}

export interface ListMessagesOptions {
  actorId: string;
  actorRole: AppUserRole;
  customerId?: string;
  conversationId?: string;
  beforeCreatedAt?: string;
  afterCreatedAt?: string;
  limit: number;
}

export interface ListMessagesResult {
  canonicalId: string;
  customerId: string;
  messages: ChatMessagePayload[];
  hasMore: boolean;
}

export interface SendMessageInput {
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
  id?: string;
  conversationId?: string;
  recipientId?: string;
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
  transactionData?: Record<string, unknown> | null;
  isInternalNote?: boolean;
  createdAt?: string;
  deskLabel?: string;
}

export interface SendMessageResult {
  canonicalId: string;
  customerId: string;
  message: ChatMessagePayload;
  conversation: ChatConversationPayload;
  deduplicated: boolean;
}

export interface UpdateConversationStatusInput {
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
  conversationId: string;
  status: ChatTicketStatus;
}

export interface PinCashoutRulesInput {
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
  conversationId: string;
  rulesVersion: string;
  formattedText: string;
  cashoutRulesSnapshot: Record<string, unknown>;
}

export interface PinCashoutRulesResult {
  canonicalId: string;
  customerId: string;
  conversation: ChatConversationPayload;
  message: ChatMessagePayload;
  postedNewMessage: boolean;
  deduplicated: boolean;
}

export interface UnpinCashoutRulesInput {
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
  conversationId: string;
}

export interface UpdateTransactionCardStatusInput {
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
  requestId: string;
  customerId?: string;
  status: 'completed' | 'rejected';
  notes?: string;
  amount?: number;
  bonusAmount?: number;
  finalCredit?: number;
}

export interface SaveChatAttachmentInput {
  actorId: string;
  actorRole: AppUserRole;
  conversationId?: string;
  customerId?: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  extension: 'png' | 'jpg' | 'webp' | 'gif';
  originalName?: string;
  buffer: Buffer;
}

export interface ChatAttachmentRecord {
  id: string;
  conversationId: string;
  customerId: string;
  contentType: string;
  originalName: string | null;
  sizeBytes: number;
  imageData: Buffer;
  createdAt: string;
}

interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

interface RawUserRow {
  id: string;
  display_name: string;
  email: string;
  role: string;
  status: string;
}

interface RawConversationRow {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email?: string | null;
  agent_id: string | null;
  agent_name: string | null;
  status: string;
  last_message: string | null;
  last_message_at: Date | string;
  created_at: Date | string;
  updated_at?: Date | string | null;
  pinned_message_id?: string | null;
  pinned_rules_version?: string | null;
  pinned_at?: Date | string | null;
  pinned_by_id?: string | null;
  pinned_by_name?: string | null;
  pinned_message_text?: string | null;
}

interface RawMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  transaction_data: unknown;
  is_internal_note: boolean | null;
  created_at: Date | string;
  sent_at?: Date | string | null;
  delivery_status?: string | null;
}

interface RawAttachmentRow {
  id: string;
  conversation_id: string;
  customer_id: string;
  content_type: string;
  original_name: string | null;
  size_bytes: number;
  image_data: Buffer;
  created_at: Date | string;
}

const VALID_TICKET_STATUSES = new Set<ChatTicketStatus>([
  'open',
  'pending',
  'resolved',
  'closed',
]);

function isStaffRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'agent';
}

function toIsoString(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? String(value) : new Date(parsed).toISOString();
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractStorageLocationFromUrl(
  rawUrl?: string | null,
  depth = 0,
): { bucket: string; path: string } | null {
  if (!rawUrl || typeof rawUrl !== 'string' || depth > 2) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return null;
  }

  if (trimmed.includes('/api/storage/file')) {
    try {
      const parsed = new URL(trimmed, 'https://localhost');
      const paramPath = (parsed.searchParams.get('path') || '').replace(/^\/+/, '');
      const paramBucket = (parsed.searchParams.get('bucket') || 'chat_attachments').trim();
      const paramUrl = (parsed.searchParams.get('url') || '').trim();
      if (paramPath) {
        return {
          bucket: safeDecodeUri(paramBucket) || 'chat_attachments',
          path: safeDecodeUri(paramPath).split('?')[0]!.split('#')[0]!,
        };
      }
      if (paramUrl) {
        return extractStorageLocationFromUrl(paramUrl, depth + 1);
      }
    } catch {
      return null;
    }
  }

  const match = trimmed.match(/\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/i);
  if (match) {
    const bucket = safeDecodeUri(match[1]!).trim();
    const objectPath = safeDecodeUri(match[2]!).replace(/^\/+/, '').trim();
    if (bucket && objectPath) {
      return { bucket, path: objectPath };
    }
  }

  return null;
}

export function normalizeChatStorageUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/api/chat/attachments/')) {
    return trimmed;
  }
  const loc = extractStorageLocationFromUrl(trimmed);
  if (loc) {
    return `/api/storage/file?bucket=${encodeURIComponent(loc.bucket || 'chat_attachments')}&path=${encodeURIComponent(loc.path.replace(/^\/+/, ''))}`;
  }
  return trimmed;
}

export function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function isInternalNoteMessageRow(row: {
  is_internal_note?: boolean | null;
  transaction_data?: unknown;
}): boolean {
  if (Boolean(row.is_internal_note)) return true;
  const tx = parseJsonObject(row.transaction_data);
  return Boolean(tx?.isInternalNote || tx?.is_internal_note);
}

export function extractCustomerIdFromConvId(rawConvId?: string | null): string {
  const clean = (rawConvId || '').trim();
  if (!clean) return '';
  if (clean.startsWith('conv_cust_')) {
    return clean.slice('conv_cust_'.length);
  }
  if (clean.startsWith('conv_')) {
    return clean.slice('conv_'.length);
  }
  return clean;
}

export function canonicalConversationIdForCustomer(customerId: string): string {
  return `conv_${customerId.trim()}`;
}

function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function normalizeTicketStatus(raw: string | null | undefined): ChatTicketStatus {
  const clean = String(raw || '').trim().toLowerCase();
  if (VALID_TICKET_STATUSES.has(clean as ChatTicketStatus)) {
    return clean as ChatTicketStatus;
  }
  return 'open';
}

function enrichMessageRow(row: RawMessageRow): ChatMessagePayload {
  const tx = parseJsonObject(row.transaction_data);
  const normalizedAttachment = normalizeChatStorageUrl(
    row.attachment_url ||
      (typeof tx?.attachmentUrl === 'string' ? tx.attachmentUrl : null) ||
      (typeof tx?.proofUrl === 'string' ? tx.proofUrl : null) ||
      (typeof tx?.receiptUrl === 'string' ? tx.receiptUrl : null),
  );

  let normalizedTx: Record<string, unknown> | null = tx ? { ...tx } : null;
  if (normalizedTx) {
    for (const key of ['attachmentUrl', 'proofUrl', 'receiptUrl', 'imageUrl'] as const) {
      const val = normalizedTx[key];
      if (typeof val === 'string' && val.trim()) {
        normalizedTx[key] = normalizeChatStorageUrl(val) || val.trim();
      }
    }
    if (normalizedAttachment && !normalizedTx.attachmentUrl) {
      normalizedTx.attachmentUrl = normalizedAttachment;
    }
  }

  const isInternal = Boolean(
    row.is_internal_note || normalizedTx?.isInternalNote || normalizedTx?.is_internal_note,
  );

  const rawDeliveryStatus = String(row.delivery_status || 'sent')
    .trim()
    .toLowerCase();
  const deliveryStatus: 'pending' | 'sent' | 'failed' =
    rawDeliveryStatus === 'pending' || rawDeliveryStatus === 'failed'
      ? rawDeliveryStatus
      : 'sent';

  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    sender_id: String(row.sender_id),
    sender_name: String(row.sender_name || 'User'),
    sender_role: String(row.sender_role || 'customer'),
    content: String(row.content ?? ''),
    attachment_url: normalizedAttachment,
    attachment_name:
      row.attachment_name ??
      (typeof normalizedTx?.attachmentName === 'string'
        ? normalizedTx.attachmentName
        : typeof normalizedTx?.proofName === 'string'
          ? normalizedTx.proofName
          : null),
    transaction_data: normalizedTx,
    is_internal_note: isInternal,
    created_at: toIsoString(row.created_at),
    sent_at: row.sent_at ? toIsoString(row.sent_at) : null,
    delivery_status: deliveryStatus,
  };
}

function mapConversationRow(row: RawConversationRow): ChatConversationPayload {
  return {
    id: String(row.id),
    customer_id: String(row.customer_id),
    customer_name: String(row.customer_name || 'Customer'),
    customer_email: row.customer_email ? String(row.customer_email) : null,
    agent_id: row.agent_id ? String(row.agent_id) : null,
    agent_name: row.agent_name ? String(row.agent_name) : null,
    status: normalizeTicketStatus(row.status),
    last_message: String(row.last_message ?? ''),
    last_message_at: toIsoString(row.last_message_at),
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at || row.last_message_at || row.created_at),
    pinned_message_id: row.pinned_message_id ? String(row.pinned_message_id) : null,
    pinned_rules_version: row.pinned_rules_version
      ? String(row.pinned_rules_version)
      : null,
    pinned_at: row.pinned_at ? toIsoString(row.pinned_at) : null,
    pinned_by_id: row.pinned_by_id ? String(row.pinned_by_id) : null,
    pinned_by_name: row.pinned_by_name ? String(row.pinned_by_name) : null,
    pinned_message_text:
      typeof row.pinned_message_text === 'string' && row.pinned_message_text.trim()
        ? row.pinned_message_text
        : null,
  };
}

async function runQuery<T extends Record<string, unknown>>(
  client: Pick<DatabaseClient, 'query'>,
  sql: string,
  values: unknown[] = [],
): Promise<QueryResultLike<T>> {
  return (await client.query(sql, values)) as QueryResultLike<T>;
}

export class ChatRepo {
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
          // Ignore secondary rollback failure
        }
        throw err;
      } finally {
        client.release();
      }
    }

    const fallbackClient: DatabaseClient = {
      query: (text, values) => this.pool.query(text, values),
      release: () => {},
    };
    return fn(fallbackClient);
  }

  private async resolveTargetCustomer(
    client: DatabaseClient,
    customerId: string,
  ): Promise<RawUserRow> {
    const cleanId = customerId.trim();
    if (!cleanId) {
      throw new ChatValidationError('Cannot determine customer ID for conversation.');
    }

    const res = await runQuery<RawUserRow & Record<string, unknown>>(
      client,
      `
        SELECT id, display_name, email, role, status
        FROM public.users
        WHERE id = $1
        LIMIT 1
      `,
      [cleanId],
    );
    const user = res.rows[0];
    if (!user) {
      throw new ChatNotFoundError('Customer account not found.');
    }
    if (isStaffRole(user.role)) {
      throw new ChatValidationError(
        'Support conversations cannot be created for staff or administrator accounts.',
        400,
        'STAFF_CONVERSATION_FORBIDDEN',
      );
    }
    return user;
  }

  private async resolveCustomerIdForStaff(
    client: DatabaseClient,
    customerId?: string,
    conversationId?: string,
  ): Promise<string> {
    if (customerId && customerId.trim()) {
      return customerId.trim();
    }
    const cleanConv = (conversationId || '').trim();
    if (!cleanConv) {
      throw new ChatValidationError('customerId or conversationId is required.');
    }

    const convRes = await runQuery<{ customer_id: string } & Record<string, unknown>>(
      client,
      `
        SELECT customer_id
        FROM public.conversations
        WHERE id = $1
        LIMIT 1
      `,
      [cleanConv],
    );
    if (convRes.rows[0]?.customer_id) {
      return String(convRes.rows[0].customer_id);
    }

    return extractCustomerIdFromConvId(cleanConv);
  }

  public async listConversations(
    options: ListConversationsOptions,
  ): Promise<ListConversationsResult> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (isStaffRole(options.actorRole)) {
      conditions.push(`COALESCE(u.role, 'customer') = 'customer'`);
    } else {
      values.push(options.actorId);
      conditions.push(`c.customer_id = $${values.length}`);
    }

    if (options.status) {
      values.push(options.status);
      conditions.push(`c.status = $${values.length}`);
    }

    if (options.search) {
      values.push(`%${escapeIlikePattern(options.search)}%`);
      const paramIdx = values.length;
      conditions.push(
        `(c.customer_name ILIKE $${paramIdx} ESCAPE '\\' OR COALESCE(u.email, '') ILIKE $${paramIdx} ESCAPE '\\' OR c.last_message ILIKE $${paramIdx} ESCAPE '\\')`,
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await runQuery<{ total: number }>(
      this.pool,
      `
        SELECT COUNT(*)::int AS total
        FROM public.conversations c
        LEFT JOIN public.users u ON u.id = c.customer_id
        ${whereClause}
      `,
      values,
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const listValues = [...values, options.limit, options.offset];
    const limitParam = listValues.length - 1;
    const offsetParam = listValues.length;

    const listRes = await runQuery<RawConversationRow & Record<string, unknown>>(
      this.pool,
      `
        SELECT
          c.id,
          c.customer_id,
          COALESCE(NULLIF(btrim(u.display_name), ''), c.customer_name) AS customer_name,
          u.email AS customer_email,
          c.agent_id,
          c.agent_name,
          c.status,
          c.last_message,
          c.last_message_at,
          c.created_at,
          c.updated_at,
          c.pinned_message_id,
          c.pinned_rules_version,
          c.pinned_at,
          c.pinned_by_id,
          c.pinned_by_name,
          c.pinned_message_text
        FROM public.conversations c
        LEFT JOIN public.users u ON u.id = c.customer_id
        ${whereClause}
        ORDER BY c.last_message_at DESC, c.id DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `,
      listValues,
    );

    return {
      items: listRes.rows.map(mapConversationRow),
      total,
    };
  }

  public async ensureConversation(
    input: EnsureConversationInput,
  ): Promise<ChatConversationPayload> {
    const cleanCustomerId = input.customerId.trim();
    if (!cleanCustomerId) {
      throw new ChatValidationError('customerId is required.');
    }

    if (!isStaffRole(input.actorRole) && cleanCustomerId !== input.actorId) {
      throw new ChatForbiddenError(
        'Forbidden: You can only open your own support conversation.',
      );
    }

    return this.withTransaction(async (client) => {
      const targetUser = await this.resolveTargetCustomer(client, cleanCustomerId);
      const canonicalId = canonicalConversationIdForCustomer(targetUser.id);
      const nowIso = new Date().toISOString();

      const existingRes = await runQuery<RawConversationRow & Record<string, unknown>>(
        client,
        `
          SELECT
            id,
            customer_id,
            customer_name,
            agent_id,
            agent_name,
            status,
            last_message,
            last_message_at,
            created_at,
            updated_at,
            pinned_message_id,
            pinned_rules_version,
            pinned_at,
            pinned_by_id,
            pinned_by_name,
            pinned_message_text
          FROM public.conversations
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [canonicalId],
      );

      if (existingRes.rows[0]) {
        const existing = existingRes.rows[0];
        if (existing.customer_name !== targetUser.display_name && targetUser.display_name) {
          await runQuery(
            client,
            `
              UPDATE public.conversations
              SET customer_name = $2, updated_at = timezone('utc'::text, now())
              WHERE id = $1
            `,
            [canonicalId, targetUser.display_name],
          );
          existing.customer_name = targetUser.display_name;
        }
        return mapConversationRow({
          ...existing,
          customer_email: targetUser.email,
        });
      }

      const insertedRes = await runQuery<RawConversationRow & Record<string, unknown>>(
        client,
        `
          INSERT INTO public.conversations (
            id,
            customer_id,
            customer_name,
            agent_id,
            agent_name,
            status,
            last_message,
            last_message_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, NULL, 'Live Support Desk', 'open', '', $4, $4, $4)
          ON CONFLICT (id) DO UPDATE SET
            customer_name = EXCLUDED.customer_name,
            updated_at = timezone('utc'::text, now())
          RETURNING *
        `,
        [
          canonicalId,
          targetUser.id,
          targetUser.display_name || 'Customer',
          nowIso,
        ],
      );

      const row = insertedRes.rows[0];
      if (!row) {
        throw new Error('Failed to persist support conversation.');
      }

      return mapConversationRow({
        ...row,
        customer_email: targetUser.email,
      });
    });
  }

  public async listMessages(
    options: ListMessagesOptions,
  ): Promise<ListMessagesResult> {
    const staffCaller = isStaffRole(options.actorRole);

    let effectiveCustomerId = '';
    if (staffCaller) {
      effectiveCustomerId = await this.resolveCustomerIdForStaff(
        { query: (sql, vals) => this.pool.query(sql, vals), release: () => {} },
        options.customerId,
        options.conversationId,
      );
    } else {
      const requestedCustomerId = (options.customerId || '').trim();
      const requestedConvCustomerId = extractCustomerIdFromConvId(options.conversationId);

      if (requestedCustomerId && requestedCustomerId !== options.actorId) {
        throw new ChatForbiddenError(
          'Forbidden: You can only view your own support messages.',
        );
      }
      if (
        requestedConvCustomerId &&
        requestedConvCustomerId !== options.actorId
      ) {
        throw new ChatForbiddenError(
          'Forbidden: You can only view your own support conversation.',
        );
      }

      effectiveCustomerId = options.actorId;
    }

    if (!effectiveCustomerId) {
      throw new ChatValidationError('customerId or conversationId is required.');
    }

    const canonicalConvId = canonicalConversationIdForCustomer(effectiveCustomerId);
    const candidateIds = new Set<string>([canonicalConvId, effectiveCustomerId]);
    if (options.conversationId && staffCaller) {
      candidateIds.add(options.conversationId.trim());
    }
    candidateIds.add(`conv_cust_${effectiveCustomerId}`);

    const convsRes = await runQuery<{ id: string }>(
      this.pool,
      `
        SELECT id
        FROM public.conversations
        WHERE customer_id = $1 OR id = $2
        LIMIT 20
      `,
      [effectiveCustomerId, canonicalConvId],
    );
    for (const row of convsRes.rows) {
      if (row.id) candidateIds.add(String(row.id));
    }

    const queryIds = Array.from(candidateIds).filter(Boolean);
    const values: unknown[] = [queryIds];
    const conditions: string[] = ['conversation_id = ANY($1::text[])'];

    if (!staffCaller) {
      conditions.push('COALESCE(is_internal_note, false) = false');
      conditions.push(
        "COALESCE((transaction_data->>'isInternalNote')::boolean, false) = false",
      );
      conditions.push(
        "COALESCE((transaction_data->>'is_internal_note')::boolean, false) = false",
      );
    }

    const isForwardDelta = Boolean(options.afterCreatedAt);
    if (options.afterCreatedAt) {
      values.push(options.afterCreatedAt);
      conditions.push(`created_at > $${values.length}`);
    } else if (options.beforeCreatedAt) {
      values.push(options.beforeCreatedAt);
      conditions.push(`created_at < $${values.length}`);
    }

    const fetchLimit = isForwardDelta ? options.limit : options.limit + 1;
    values.push(fetchLimit);
    const limitParam = values.length;

    const orderClause = isForwardDelta
      ? 'ORDER BY created_at ASC, id ASC'
      : 'ORDER BY created_at DESC, id DESC';

    const msgRes = await runQuery<RawMessageRow & Record<string, unknown>>(
      this.pool,
      `
        SELECT
          id,
          conversation_id,
          sender_id,
          sender_name,
          sender_role,
          content,
          attachment_url,
          attachment_name,
          transaction_data,
          is_internal_note,
          created_at,
          sent_at,
          delivery_status
        FROM public.messages
        WHERE ${conditions.join(' AND ')}
        ${orderClause}
        LIMIT $${limitParam}
      `,
      values,
    );

    const hasMore = isForwardDelta
      ? msgRes.rows.length >= options.limit
      : msgRes.rows.length > options.limit;
    const slicedRows =
      !isForwardDelta && msgRes.rows.length > options.limit
        ? msgRes.rows.slice(0, options.limit)
        : msgRes.rows;

    const enriched = slicedRows
      .map(enrichMessageRow)
      .filter((m) => (staffCaller ? true : !m.is_internal_note))
      .sort((a, b) => {
        const ta = Date.parse(a.created_at) || 0;
        const tb = Date.parse(b.created_at) || 0;
        if (ta !== tb) return ta - tb;
        return a.id.localeCompare(b.id);
      });

    // Hydrate missing topup proof_url onto transaction cards from public.topups
    const missingTopupIds = Array.from(
      new Set(
        enriched
          .filter(
            (m) =>
              m.transaction_data?.transactionType === 'topup' &&
              typeof m.transaction_data?.requestId === 'string' &&
              m.transaction_data.requestId &&
              !m.attachment_url &&
              !m.transaction_data?.proofUrl,
          )
          .map((m) => String(m.transaction_data!.requestId)),
      ),
    ).slice(0, 50);

    if (missingTopupIds.length > 0) {
      try {
        const regCheck = await runQuery<{ reg: string | null }>(
          this.pool,
          "SELECT to_regclass('public.topups')::text AS reg",
        );
        if (regCheck.rows[0]?.reg) {
          const topupRes = await runQuery<{
            id: string;
            proof_url: string | null;
          }>(
            this.pool,
            `
              SELECT id, proof_url
              FROM public.topups
              WHERE id = ANY($1::text[])
              LIMIT 50
            `,
            [missingTopupIds],
          );
          const proofMap = new Map<string, string>();
          for (const t of topupRes.rows) {
            if (t.id && t.proof_url) {
              proofMap.set(
                String(t.id),
                normalizeChatStorageUrl(t.proof_url) || String(t.proof_url),
              );
            }
          }
          if (proofMap.size > 0) {
            for (const msg of enriched) {
              const reqId =
                typeof msg.transaction_data?.requestId === 'string'
                  ? msg.transaction_data.requestId
                  : '';
              const foundProof = reqId ? proofMap.get(reqId) : undefined;
              if (foundProof) {
                msg.attachment_url = foundProof;
                msg.attachment_name = msg.attachment_name || 'Payment Receipt';
                msg.transaction_data = {
                  ...(msg.transaction_data || {}),
                  proofUrl: foundProof,
                  attachmentUrl:
                    msg.transaction_data?.attachmentUrl || foundProof,
                };
              }
            }
          }
        }
      } catch {
        // Non-fatal topup proof enrichment fallback
      }
    }

    return {
      canonicalId: canonicalConvId,
      customerId: effectiveCustomerId,
      messages: enriched,
      hasMore,
    };
  }

  public async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const staffCaller = isStaffRole(input.actorRole);
    const wantsInternalNote = Boolean(
      input.isInternalNote ||
        input.transactionData?.isInternalNote ||
        input.transactionData?.is_internal_note,
    );

    if (wantsInternalNote && !staffCaller) {
      throw new ChatForbiddenError(
        'Forbidden: Only verified support agents or administrators can create internal notes.',
        'INTERNAL_NOTE_FORBIDDEN',
      );
    }

    return this.withTransaction(async (client) => {
      let targetCustomerId = '';
      if (staffCaller) {
        targetCustomerId = await this.resolveCustomerIdForStaff(
          client,
          input.recipientId,
          input.conversationId,
        );
      } else {
        const requestedTarget =
          (input.recipientId || '').trim() ||
          extractCustomerIdFromConvId(input.conversationId);
        if (requestedTarget && requestedTarget !== input.actorId) {
          throw new ChatForbiddenError(
            'Forbidden: You can only post messages to your own support conversation.',
          );
        }
        targetCustomerId = input.actorId;
      }

      const targetUser = await this.resolveTargetCustomer(client, targetCustomerId);
      const canonicalConvId = canonicalConversationIdForCustomer(targetUser.id);

      const senderId = input.actorId;
      const senderRole: AppUserRole = input.actorRole;
      const senderName =
        staffCaller && input.deskLabel
          ? input.deskLabel
          : input.actorName || 'User';

      const msgId =
        input.id && input.id.trim()
          ? input.id.trim()
          : `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      // Check idempotent deterministic message ID BEFORE mutating conversation state
      const existingMsgRes = await runQuery<RawMessageRow & Record<string, unknown>>(
        client,
        `
          SELECT *
          FROM public.messages
          WHERE id = $1
          LIMIT 1
        `,
        [msgId],
      );
      const existingMsg = existingMsgRes.rows[0];
      if (existingMsg) {
        const existingConvCust = extractCustomerIdFromConvId(existingMsg.conversation_id);
        if (
          existingMsg.conversation_id !== canonicalConvId &&
          existingConvCust !== targetUser.id
        ) {
          throw new ChatConflictError(
            'Message identifier belongs to a different conversation.',
          );
        }
        if (!staffCaller && existingMsg.sender_id !== senderId) {
          throw new ChatConflictError(
            'Message identifier conflicts with an existing message.',
          );
        }
        const convRes = await runQuery<RawConversationRow & Record<string, unknown>>(
          client,
          `SELECT * FROM public.conversations WHERE id = $1 LIMIT 1`,
          [canonicalConvId],
        );
        const convRow = convRes.rows[0] || {
          id: canonicalConvId,
          customer_id: targetUser.id,
          customer_name: targetUser.display_name,
          customer_email: targetUser.email,
          agent_id: null,
          agent_name: null,
          status: 'open',
          last_message: '',
          last_message_at: existingMsg.created_at,
          created_at: existingMsg.created_at,
          updated_at: existingMsg.created_at,
        };
        return {
          canonicalId: canonicalConvId,
          customerId: targetUser.id,
          message: enrichMessageRow(existingMsg),
          conversation: mapConversationRow({
            ...convRow,
            customer_email: targetUser.email,
          }),
          deduplicated: true,
        };
      }

      const parsedCreatedAt = input.createdAt ? Date.parse(input.createdAt) : NaN;
      const createdAtIso = !Number.isNaN(parsedCreatedAt)
        ? new Date(parsedCreatedAt).toISOString()
        : new Date().toISOString();

      const rawTx = input.transactionData
        ? { ...input.transactionData }
        : null;
      const rawAttUrl =
        input.attachmentUrl ||
        (typeof rawTx?.attachmentUrl === 'string' ? rawTx.attachmentUrl : undefined) ||
        (typeof rawTx?.proofUrl === 'string' ? rawTx.proofUrl : undefined) ||
        (typeof rawTx?.receiptUrl === 'string' ? rawTx.receiptUrl : undefined);
      const normalizedAttachmentUrl = normalizeChatStorageUrl(rawAttUrl);

      const txPayload: Record<string, unknown> | null =
        rawTx || normalizedAttachmentUrl || input.attachmentName || wantsInternalNote
          ? {
              ...(rawTx || {}),
              ...(typeof rawTx?.proofUrl === 'string'
                ? { proofUrl: normalizeChatStorageUrl(rawTx.proofUrl) || rawTx.proofUrl }
                : {}),
              ...(typeof rawTx?.receiptUrl === 'string'
                ? { receiptUrl: normalizeChatStorageUrl(rawTx.receiptUrl) || rawTx.receiptUrl }
                : {}),
              ...(normalizedAttachmentUrl
                ? { attachmentUrl: normalizedAttachmentUrl }
                : {}),
              ...(input.attachmentName
                ? { attachmentName: input.attachmentName }
                : {}),
              ...(wantsInternalNote ? { isInternalNote: true } : {}),
            }
          : null;

      // Lock/upsert canonical conversation row
      const existingConvRes = await runQuery<RawConversationRow & Record<string, unknown>>(
        client,
        `
          SELECT *
          FROM public.conversations
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [canonicalConvId],
      );
      const existingConv = existingConvRes.rows[0];

      const publicPreview =
        input.text.trim() || (normalizedAttachmentUrl ? '[Photo Attachment]' : '');
      const nextLastMessage = wantsInternalNote
        ? existingConv?.last_message ?? ''
        : publicPreview || (existingConv?.last_message ?? '');
      const nextLastMessageAt =
        wantsInternalNote && existingConv?.last_message_at
          ? toIsoString(existingConv.last_message_at)
          : createdAtIso;
      const nextStatus = existingConv?.status
        ? normalizeTicketStatus(existingConv.status)
        : 'open';

      const convRes = await runQuery<RawConversationRow & Record<string, unknown>>(
        client,
        `
          INSERT INTO public.conversations (
            id,
            customer_id,
            customer_name,
            agent_id,
            agent_name,
            status,
            last_message,
            last_message_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, timezone('utc'::text, now()))
          ON CONFLICT (id) DO UPDATE SET
            customer_name = EXCLUDED.customer_name,
            last_message = CASE
              WHEN $9::boolean THEN public.conversations.last_message
              ELSE EXCLUDED.last_message
            END,
            last_message_at = CASE
              WHEN $9::boolean THEN public.conversations.last_message_at
              ELSE EXCLUDED.last_message_at
            END,
            updated_at = timezone('utc'::text, now())
          RETURNING *
        `,
        [
          canonicalConvId,
          targetUser.id,
          targetUser.display_name || 'Customer',
          staffCaller ? senderId : existingConv?.agent_id ?? null,
          staffCaller ? senderName : existingConv?.agent_name ?? 'Live Support Desk',
          nextStatus,
          nextLastMessage,
          nextLastMessageAt,
          wantsInternalNote,
        ],
      );

      const savedConv = convRes.rows[0];
      if (!savedConv) {
        throw new Error('Failed to persist support conversation.');
      }

      const insertedMsgRes = await runQuery<RawMessageRow & Record<string, unknown>>(
        client,
        `
          INSERT INTO public.messages (
            id,
            conversation_id,
            sender_id,
            sender_name,
            sender_role,
            content,
            attachment_url,
            attachment_name,
            transaction_data,
            is_internal_note,
            created_at,
            sent_at,
            delivery_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, timezone('utc'::text, now()), 'sent')
          ON CONFLICT (id) DO NOTHING
          RETURNING *
        `,
        [
          msgId,
          canonicalConvId,
          senderId,
          senderName,
          senderRole,
          input.text,
          normalizedAttachmentUrl,
          input.attachmentName ?? null,
          txPayload ? JSON.stringify(txPayload) : null,
          wantsInternalNote,
          createdAtIso,
        ],
      );

      const savedMsgRow = insertedMsgRes.rows[0];
      if (!savedMsgRow) {
        throw new ChatConflictError('Message write conflicted with an existing record.');
      }

      return {
        canonicalId: canonicalConvId,
        customerId: targetUser.id,
        message: enrichMessageRow(savedMsgRow),
        conversation: mapConversationRow({
          ...savedConv,
          customer_email: targetUser.email,
        }),
        deduplicated: false,
      };
    });
  }

  public async updateConversationStatus(
    input: UpdateConversationStatusInput,
  ): Promise<ChatConversationPayload> {
    if (!isStaffRole(input.actorRole)) {
      throw new ChatForbiddenError(
        'Forbidden: Only verified support agents or administrators can update ticket status.',
      );
    }

    const rawConvId = input.conversationId.trim();
    const customerId = extractCustomerIdFromConvId(rawConvId);
    const canonicalConvId = rawConvId.startsWith('conv_')
      ? canonicalConversationIdForCustomer(customerId)
      : rawConvId;
    const candidateIds = Array.from(new Set([rawConvId, canonicalConvId].filter(Boolean)));

    return this.withTransaction(async (client) => {
      const updateRes = await runQuery<RawConversationRow & Record<string, unknown>>(
        client,
        `
          UPDATE public.conversations
          SET status = $2,
              updated_at = timezone('utc'::text, now())
          WHERE id = ANY($1::text[])
          RETURNING *
        `,
        [candidateIds, input.status],
      );

      const updated = updateRes.rows[0];
      if (!updated) {
        throw new ChatNotFoundError('Conversation not found.');
      }

      const userRes = await runQuery<{ email: string; display_name: string } & Record<string, unknown>>(
        client,
        `SELECT email, display_name FROM public.users WHERE id = $1 LIMIT 1`,
        [updated.customer_id],
      );

      const auditId = `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      await runQuery(
        client,
        `
          INSERT INTO public.audit_logs (
            id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, timestamp
          )
          VALUES ($1, $2, $3, $4, 'CONVERSATION_STATUS_UPDATED', 'conversation', $5, $6, timezone('utc'::text, now()))
        `,
        [
          auditId,
          input.actorId,
          input.actorName,
          input.actorRole,
          updated.id,
          `Updated ticket status for ${updated.customer_name} (${updated.customer_id}) to ${input.status}.`,
        ],
      );

      return mapConversationRow({
        ...updated,
        customer_name: userRes.rows[0]?.display_name || updated.customer_name,
        customer_email: userRes.rows[0]?.email ?? null,
      });
    });
  }

  public async pinCashoutRules(
    input: PinCashoutRulesInput,
  ): Promise<PinCashoutRulesResult> {
    if (!isStaffRole(input.actorRole)) {
      throw new ChatForbiddenError(
        'Forbidden: Only support staff or administrators can pin cashout rules.',
      );
    }

    const rawConvId = input.conversationId.trim();
    if (!rawConvId) {
      throw new ChatValidationError('conversationId is required.');
    }

    return this.withTransaction(async (client) => {
      const resolvedCustomerId = await this.resolveCustomerIdForStaff(
        client,
        undefined,
        rawConvId,
      );
      const targetUser = await this.resolveTargetCustomer(
        client,
        resolvedCustomerId,
      );
      const canonicalConvId = canonicalConversationIdForCustomer(targetUser.id);

      const existingConvRes = await runQuery<
        RawConversationRow & Record<string, unknown>
      >(
        client,
        `
          SELECT *
          FROM public.conversations
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [canonicalConvId],
      );
      const existingConv = existingConvRes.rows[0];

      // 1. Idempotent short-circuit if this exact rules version is already pinned
      if (
        existingConv?.pinned_message_id &&
        existingConv.pinned_rules_version === input.rulesVersion
      ) {
        const pinnedMsgRes = await runQuery<
          RawMessageRow & Record<string, unknown>
        >(
          client,
          `SELECT * FROM public.messages WHERE id = $1 LIMIT 1`,
          [existingConv.pinned_message_id],
        );
        if (pinnedMsgRes.rows[0]) {
          return {
            canonicalId: canonicalConvId,
            customerId: targetUser.id,
            conversation: mapConversationRow({
              ...existingConv,
              customer_name:
                targetUser.display_name || existingConv.customer_name,
              customer_email: targetUser.email,
            }),
            message: enrichMessageRow(pinnedMsgRes.rows[0]),
            postedNewMessage: false,
            deduplicated: true,
          };
        }
      }

      // 2. Reuse an existing rules message of the exact same rulesVersion if already sent
      const existingRulesMsgRes = await runQuery<
        RawMessageRow & Record<string, unknown>
      >(
        client,
        `
          SELECT *
          FROM public.messages
          WHERE conversation_id = $1
            AND transaction_data IS NOT NULL
            AND transaction_data->>'rulesVersion' = $2
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [canonicalConvId, input.rulesVersion],
      );

      const nowIso = new Date().toISOString();
      let pinnedMessageRow = existingRulesMsgRes.rows[0];
      let postedNewMessage = false;

      if (!pinnedMessageRow) {
        postedNewMessage = true;
        const msgId = `msg_rules_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const txPayload = {
          cardType: 'cashout_rules',
          rulesVersion: input.rulesVersion,
          cashoutRules: input.cashoutRulesSnapshot,
          pinnedBy: input.actorName,
          pinnedAt: nowIso,
        };

        if (!existingConv) {
          await runQuery(
            client,
            `
              INSERT INTO public.conversations (
                id,
                customer_id,
                customer_name,
                agent_id,
                agent_name,
                status,
                last_message,
                last_message_at,
                created_at,
                updated_at
              )
              VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $7, timezone('utc'::text, now()))
              ON CONFLICT (id) DO NOTHING
            `,
            [
              canonicalConvId,
              targetUser.id,
              targetUser.display_name || 'Customer',
              input.actorId,
              input.actorName,
              'Pinned Cashout Rules',
              nowIso,
            ],
          );
        }

        const insertedMsgRes = await runQuery<
          RawMessageRow & Record<string, unknown>
        >(
          client,
          `
            INSERT INTO public.messages (
              id,
              conversation_id,
              sender_id,
              sender_name,
              sender_role,
              content,
              attachment_url,
              attachment_name,
              transaction_data,
              is_internal_note,
              created_at,
              sent_at,
              delivery_status
            )
            VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7::jsonb, false, $8, timezone('utc'::text, now()), 'sent')
            ON CONFLICT (id) DO NOTHING
            RETURNING *
          `,
          [
            msgId,
            canonicalConvId,
            input.actorId,
            input.actorName,
            input.actorRole,
            input.formattedText,
            JSON.stringify(txPayload),
            nowIso,
          ],
        );

        pinnedMessageRow = insertedMsgRes.rows[0];
        if (!pinnedMessageRow) {
          throw new Error('Failed to create cashout rules message for pinning.');
        }
      }

      const pinRes = await runQuery<
        RawConversationRow & Record<string, unknown>
      >(
        client,
        `
          UPDATE public.conversations
          SET pinned_message_id = $2,
              pinned_rules_version = $3,
              pinned_at = $4::timestamptz,
              pinned_by_id = $5,
              pinned_by_name = $6,
              pinned_message_text = $7,
              last_message = CASE WHEN $8::boolean THEN $9 ELSE last_message END,
              last_message_at = CASE WHEN $8::boolean THEN $10::timestamptz ELSE last_message_at END,
              updated_at = timezone('utc'::text, now())
          WHERE id = $1
          RETURNING *
        `,
        [
          canonicalConvId,
          String(pinnedMessageRow.id),
          input.rulesVersion,
          nowIso,
          input.actorId,
          input.actorName,
          input.formattedText,
          postedNewMessage,
          'Pinned Cashout Rules',
          nowIso,
        ],
      );

      const savedConv = pinRes.rows[0];
      if (!savedConv) {
        throw new Error('Failed to pin cashout rules on conversation.');
      }

      const auditId = `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      await runQuery(
        client,
        `
          INSERT INTO public.audit_logs (
            id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, timestamp
          )
          VALUES ($1, $2, $3, $4, 'CASHOUT_RULES_PINNED', 'conversation', $5, $6, timezone('utc'::text, now()))
        `,
        [
          auditId,
          input.actorId,
          input.actorName,
          input.actorRole,
          canonicalConvId,
          `Pinned cashout rules (${input.rulesVersion}) for conversation ${canonicalConvId} (${postedNewMessage ? 'new_message_posted' : 'reused_existing_message'}).`,
        ],
      );

      return {
        canonicalId: canonicalConvId,
        customerId: targetUser.id,
        conversation: mapConversationRow({
          ...savedConv,
          customer_name: targetUser.display_name || savedConv.customer_name,
          customer_email: targetUser.email,
        }),
        message: enrichMessageRow(pinnedMessageRow),
        postedNewMessage,
        deduplicated: false,
      };
    });
  }

  public async unpinCashoutRules(
    input: UnpinCashoutRulesInput,
  ): Promise<{ canonicalId: string; customerId: string; conversation: ChatConversationPayload }> {
    if (!isStaffRole(input.actorRole)) {
      throw new ChatForbiddenError(
        'Forbidden: Only support staff or administrators can unpin cashout rules.',
      );
    }

    const rawConvId = input.conversationId.trim();
    if (!rawConvId) {
      throw new ChatValidationError('conversationId is required.');
    }
    const customerId = extractCustomerIdFromConvId(rawConvId);
    const canonicalConvId = rawConvId.startsWith('conv_')
      ? canonicalConversationIdForCustomer(customerId)
      : rawConvId;
    const candidateIds = Array.from(
      new Set([rawConvId, canonicalConvId].filter(Boolean)),
    );

    return this.withTransaction(async (client) => {
      const updateRes = await runQuery<
        RawConversationRow & Record<string, unknown>
      >(
        client,
        `
          UPDATE public.conversations
          SET pinned_message_id = NULL,
              pinned_rules_version = NULL,
              pinned_at = NULL,
              pinned_by_id = NULL,
              pinned_by_name = NULL,
              pinned_message_text = NULL,
              updated_at = timezone('utc'::text, now())
          WHERE id = ANY($1::text[])
          RETURNING *
        `,
        [candidateIds],
      );

      const updated = updateRes.rows[0];
      if (!updated) {
        throw new ChatNotFoundError('Conversation not found.');
      }

      const userRes = await runQuery<
        { email: string; display_name: string } & Record<string, unknown>
      >(
        client,
        `SELECT email, display_name FROM public.users WHERE id = $1 LIMIT 1`,
        [updated.customer_id],
      );

      const auditId = `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      await runQuery(
        client,
        `
          INSERT INTO public.audit_logs (
            id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, timestamp
          )
          VALUES ($1, $2, $3, $4, 'CASHOUT_RULES_UNPINNED', 'conversation', $5, $6, timezone('utc'::text, now()))
        `,
        [
          auditId,
          input.actorId,
          input.actorName,
          input.actorRole,
          updated.id,
          `Unpinned cashout rules for conversation ${updated.id}.`,
        ],
      );

      return {
        canonicalId: String(updated.id),
        customerId: String(updated.customer_id),
        conversation: mapConversationRow({
          ...updated,
          customer_name: userRes.rows[0]?.display_name || updated.customer_name,
          customer_email: userRes.rows[0]?.email ?? null,
        }),
      };
    });
  }

  public async updateTransactionCardStatus(
    input: UpdateTransactionCardStatusInput,
  ): Promise<ChatMessagePayload[]> {
    if (!isStaffRole(input.actorRole)) {
      throw new ChatForbiddenError(
        'Forbidden: Only support staff can update transaction card status.',
      );
    }

    const cleanRequestId = input.requestId.trim();
    if (!cleanRequestId) {
      throw new ChatValidationError('requestId is required.');
    }

    return this.withTransaction(async (client) => {
      const values: unknown[] = [cleanRequestId];
      let convFilterSql = '';
      if (input.customerId && input.customerId.trim()) {
        const cid = input.customerId.trim();
        const convIds = Array.from(
          new Set([canonicalConversationIdForCustomer(cid), cid, `conv_cust_${cid}`]),
        );
        values.push(convIds);
        convFilterSql = `AND conversation_id = ANY($${values.length}::text[])`;
      }

      const matchRes = await runQuery<RawMessageRow & Record<string, unknown>>(
        client,
        `
          SELECT *
          FROM public.messages
          WHERE transaction_data IS NOT NULL
            AND transaction_data->>'requestId' = $1
            ${convFilterSql}
          ORDER BY created_at DESC, id DESC
          LIMIT 25
          FOR UPDATE
        `,
        values,
      );

      if (matchRes.rows.length === 0) {
        return [];
      }

      const nowIso = new Date().toISOString();
      const updatedPayloads: ChatMessagePayload[] = [];

      for (const row of matchRes.rows) {
        const existingTx = parseJsonObject(row.transaction_data) || {};
        const nextTx: Record<string, unknown> = {
          ...existingTx,
          status: input.status,
          approvedBy: input.actorName,
          approvedAt: nowIso,
          ...(input.notes !== undefined && input.notes.trim()
            ? { notes: input.notes.trim() }
            : {}),
          ...(input.amount !== undefined ? { amount: input.amount } : {}),
          ...(input.bonusAmount !== undefined
            ? { bonusAmount: input.bonusAmount }
            : {}),
          ...(input.finalCredit !== undefined
            ? { finalCredit: input.finalCredit }
            : {}),
        };

        const updRes = await runQuery<RawMessageRow & Record<string, unknown>>(
          client,
          `
            UPDATE public.messages
            SET transaction_data = $2::jsonb
            WHERE id = $1
            RETURNING *
          `,
          [row.id, JSON.stringify(nextTx)],
        );

        if (updRes.rows[0]) {
          updatedPayloads.push(enrichMessageRow(updRes.rows[0]));
        }
      }

      return updatedPayloads;
    });
  }

  public async saveChatAttachment(input: SaveChatAttachmentInput): Promise<{
    id: string;
    url: string;
    contentType: string;
    sizeBytes: number;
    originalName: string | null;
    conversationId: string;
    customerId: string;
  }> {
    const staffCaller = isStaffRole(input.actorRole);
    let targetCustomerId = '';

    if (staffCaller) {
      targetCustomerId =
        (input.customerId || '').trim() ||
        extractCustomerIdFromConvId(input.conversationId);
      if (!targetCustomerId) {
        throw new ChatValidationError(
          'customerId or conversationId is required for attachment upload.',
        );
      }
    } else {
      const requestedCust =
        (input.customerId || '').trim() ||
        extractCustomerIdFromConvId(input.conversationId);
      if (requestedCust && requestedCust !== input.actorId) {
        throw new ChatForbiddenError(
          'Forbidden: You can only upload attachments to your own support conversation.',
        );
      }
      targetCustomerId = input.actorId;
    }

    const ensuredConv = await this.ensureConversation({
      actorId: input.actorId,
      actorRole: input.actorRole,
      customerId: targetCustomerId,
    });

    const id = `ca_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${input.extension}`;
    const sizeBytes = input.buffer.length;

    await this.pool.query(
      `
        INSERT INTO public.chat_attachments (
          id,
          conversation_id,
          customer_id,
          uploaded_by,
          content_type,
          original_name,
          image_data,
          size_bytes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        id,
        ensuredConv.id,
        targetCustomerId,
        input.actorId,
        input.contentType,
        input.originalName ?? null,
        input.buffer,
        sizeBytes,
      ],
    );

    return {
      id,
      url: `/api/chat/attachments/${id}`,
      contentType: input.contentType,
      sizeBytes,
      originalName: input.originalName ?? null,
      conversationId: ensuredConv.id,
      customerId: targetCustomerId,
    };
  }

  public async getChatAttachment(params: {
    id: string;
    actorId: string;
    actorRole: AppUserRole;
  }): Promise<ChatAttachmentRecord | null> {
    const res = await runQuery<RawAttachmentRow & Record<string, unknown>>(
      this.pool,
      `
        SELECT
          id,
          conversation_id,
          customer_id,
          content_type,
          original_name,
          size_bytes,
          image_data,
          created_at
        FROM public.chat_attachments
        WHERE id = $1
        LIMIT 1
      `,
      [params.id],
    );
    const row = res.rows[0];
    if (!row) {
      return null;
    }

    if (!isStaffRole(params.actorRole) && row.customer_id !== params.actorId) {
      throw new ChatForbiddenError(
        'Forbidden: You do not have permission to access this attachment.',
      );
    }

    return {
      id: String(row.id),
      conversationId: String(row.conversation_id),
      customerId: String(row.customer_id),
      contentType: String(row.content_type),
      originalName: row.original_name ? String(row.original_name) : null,
      sizeBytes: Number(row.size_bytes),
      imageData: Buffer.isBuffer(row.image_data)
        ? row.image_data
        : Buffer.from(row.image_data),
      createdAt: toIsoString(row.created_at),
    };
  }
}
