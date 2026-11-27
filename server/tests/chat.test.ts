import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createApiApp } from '../app.js';
import type {
  EmailDeliveryAdapter,
  SendOtpEmailPayload,
  SendPasswordResetEmailPayload,
  SendVerificationEmailPayload,
} from '../auth/emailDelivery.js';
import type { ServerConfig } from '../config/env.js';
import type { DatabaseClient, DatabasePool } from '../db/pool.js';
import { createLogger } from '../logging/logger.js';

interface InMemoryUserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  phone: string | null;
  avatar_url: string | null;
  status: string;
  email_verified: boolean;
  referral_code: string | null;
  referred_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface InMemoryAuthLinkRow {
  app_user_id: string;
  auth_user_id: string | null;
  legacy_supabase_uid: string | null;
  email_normalized: string;
  migration_source: string;
  password_reset_required: boolean;
  linked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface InMemoryConversationRow {
  id: string;
  customer_id: string;
  customer_name: string;
  agent_id: string | null;
  agent_name: string | null;
  status: string;
  last_message: string;
  last_message_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface InMemoryMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  attachment_url: string | null;
  attachment_name: string | null;
  transaction_data: Record<string, unknown> | null;
  is_internal_note: boolean;
  created_at: Date;
}

interface InMemoryChatAttachmentRow {
  id: string;
  conversation_id: string;
  customer_id: string;
  uploaded_by: string;
  content_type: string;
  original_name: string | null;
  image_data: Buffer;
  size_bytes: number;
  created_at: Date;
}

interface InMemoryTopupRow {
  id: string;
  proof_url: string | null;
}

interface InMemoryAuditLogRow {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  timestamp: Date;
}

function ilikeMatch(haystack: string, escapedPattern: string): boolean {
  // escapedPattern comes in as `%foo\_bar%` with backslash escape
  let inner = escapedPattern;
  if (inner.startsWith('%')) inner = inner.slice(1);
  if (inner.endsWith('%')) inner = inner.slice(0, -1);
  let regexStr = '';
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i]!;
    if (ch === '\\' && i + 1 < inner.length) {
      const next = inner[i + 1]!;
      regexStr += next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i += 1;
    } else if (ch === '%') {
      regexStr += '.*';
    } else if (ch === '_') {
      regexStr += '.';
    } else {
      regexStr += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(regexStr, 'i').test(haystack);
}

class InMemoryChatDatabase
  implements Pick<DatabasePool, 'query' | 'connect'>
{
  public readonly users = new Map<string, InMemoryUserRow>();
  public readonly authLinks = new Map<string, InMemoryAuthLinkRow>();
  public readonly conversations = new Map<string, InMemoryConversationRow>();
  public readonly messages = new Map<string, InMemoryMessageRow>();
  public readonly chatAttachments = new Map<string, InMemoryChatAttachmentRow>();
  public readonly topups = new Map<string, InMemoryTopupRow>();
  public readonly auditLogs: InMemoryAuditLogRow[] = [];

  public async connect(): Promise<DatabaseClient> {
    return {
      query: (sql: string, values?: unknown[]) => this.query(sql, values),
      release: () => {},
    } as DatabaseClient;
  }

  public async query(
    sql: string,
    values: unknown[] = [],
  ): Promise<{ rows: unknown[]; rowCount?: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (
      normalized === 'BEGIN' ||
      normalized === 'COMMIT' ||
      normalized === 'ROLLBACK'
    ) {
      return { rows: [] };
    }

    if (normalized === 'SELECT 1 AS ok') {
      return { rows: [{ ok: 1 }] };
    }

    // --- Auth & UserDirectory queries ---
    if (
      normalized.includes('FROM public.auth_user_links l INNER JOIN public.users u') &&
      normalized.includes('WHERE l.auth_user_id = $1')
    ) {
      const authUserId = String(values[0] ?? '');
      for (const link of this.authLinks.values()) {
        if (link.auth_user_id === authUserId) {
          const user = this.users.get(link.app_user_id);
          if (user) {
            return { rows: [this.toJoinedRow(user, link)] };
          }
        }
      }
      return { rows: [] };
    }

    if (
      normalized.includes('FROM public.users u LEFT JOIN public.auth_user_links l') &&
      normalized.includes('WHERE u.id = $1')
    ) {
      const appUserId = String(values[0] ?? '');
      const user = this.users.get(appUserId);
      if (!user) return { rows: [] };
      return { rows: [this.toJoinedRow(user, this.authLinks.get(appUserId))] };
    }

    if (
      normalized.includes('FROM public.users u LEFT JOIN public.auth_user_links l') &&
      normalized.includes('WHERE lower(u.email) = $1')
    ) {
      const cleanEmail = String(values[0] ?? '').toLowerCase();
      for (const user of this.users.values()) {
        if (user.email.toLowerCase() === cleanEmail) {
          return { rows: [this.toJoinedRow(user, this.authLinks.get(user.id))] };
        }
      }
      return { rows: [] };
    }

    if (normalized.startsWith('INSERT INTO public.users')) {
      const [id, email, displayName, emailVerified, referralCode] = values as [
        string,
        string,
        string,
        boolean,
        string,
      ];
      if (!this.users.has(id)) {
        const now = new Date();
        this.users.set(id, {
          id,
          email,
          display_name: displayName,
          role: 'customer',
          phone: null,
          avatar_url: null,
          status: 'active',
          email_verified: emailVerified,
          referral_code: referralCode,
          referred_by: null,
          created_at: now,
          updated_at: now,
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith('INSERT INTO public.auth_user_links')) {
      const appUserId = String(values[0]);
      const authUserId = String(values[1]);
      const emailNormalized = String(values[2]);
      const now = new Date();
      this.authLinks.set(appUserId, {
        app_user_id: appUserId,
        auth_user_id: authUserId,
        legacy_supabase_uid: null,
        email_normalized: emailNormalized,
        migration_source: 'self_hosted_signup',
        password_reset_required: false,
        linked_at: now,
        created_at: now,
        updated_at: now,
      });
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith('UPDATE public.users SET email_verified = true')) {
      const id = String(values[0]);
      const user = this.users.get(id);
      if (user) {
        user.email_verified = true;
        user.updated_at = new Date();
      }
      return { rows: [], rowCount: user ? 1 : 0 };
    }

    if (
      normalized ===
      'SELECT id, display_name, email, role, status FROM public.users WHERE id = $1 LIMIT 1'
    ) {
      const user = this.users.get(String(values[0] ?? ''));
      return {
        rows: user
          ? [
              {
                id: user.id,
                display_name: user.display_name,
                email: user.email,
                role: user.role,
                status: user.status,
              },
            ]
          : [],
      };
    }

    if (
      normalized ===
      'SELECT email, display_name FROM public.users WHERE id = $1 LIMIT 1'
    ) {
      const user = this.users.get(String(values[0] ?? ''));
      return {
        rows: user
          ? [{ email: user.email, display_name: user.display_name }]
          : [],
      };
    }

    // --- Conversations queries ---
    if (
      normalized.startsWith(
        'SELECT COUNT(*)::int AS total FROM public.conversations c',
      )
    ) {
      const filtered = this.filterConversations(normalized, values);
      return { rows: [{ total: filtered.length }] };
    }

    if (
      normalized.includes('FROM public.conversations c LEFT JOIN public.users u') &&
      normalized.includes('ORDER BY c.last_message_at DESC, c.id DESC')
    ) {
      const limit = Number(values[values.length - 2] ?? 50);
      const offset = Number(values[values.length - 1] ?? 0);
      const filterVals = values.slice(0, values.length - 2);
      const filtered = this.filterConversations(normalized, filterVals)
        .sort((a, b) => {
          const dt = b.last_message_at.getTime() - a.last_message_at.getTime();
          return dt !== 0 ? dt : b.id.localeCompare(a.id);
        })
        .slice(offset, offset + limit)
        .map((c) => {
          const u = this.users.get(c.customer_id);
          return {
            ...c,
            customer_name:
              u && u.display_name.trim() ? u.display_name : c.customer_name,
            customer_email: u?.email ?? null,
          };
        });
      return { rows: filtered };
    }

    if (
      normalized ===
      'SELECT customer_id FROM public.conversations WHERE id = $1 LIMIT 1'
    ) {
      const conv = this.conversations.get(String(values[0] ?? ''));
      return { rows: conv ? [{ customer_id: conv.customer_id }] : [] };
    }

    if (
      normalized.startsWith('SELECT') &&
      normalized.includes('FROM public.conversations WHERE id = $1 LIMIT 1')
    ) {
      const conv = this.conversations.get(String(values[0] ?? ''));
      return { rows: conv ? [{ ...conv }] : [] };
    }

    if (
      normalized.startsWith('SELECT id FROM public.conversations WHERE customer_id = $1 OR id = $2')
    ) {
      const custId = String(values[0] ?? '');
      const convId = String(values[1] ?? '');
      const matched = [...this.conversations.values()]
        .filter((c) => c.customer_id === custId || c.id === convId)
        .slice(0, 20)
        .map((c) => ({ id: c.id }));
      return { rows: matched };
    }

    if (normalized.startsWith('UPDATE public.conversations SET customer_name = $2')) {
      const [id, name] = values as [string, string];
      const conv = this.conversations.get(id);
      if (conv) {
        conv.customer_name = name;
        conv.updated_at = new Date();
      }
      return { rows: [], rowCount: conv ? 1 : 0 };
    }

    if (normalized.startsWith('INSERT INTO public.conversations')) {
      // Branch 1: ensureConversation (4 args)
      if (values.length === 4) {
        const [id, customerId, customerName, nowIso] = values as [
          string,
          string,
          string,
          string,
        ];
        const ts = new Date(nowIso);
        const existing = this.conversations.get(id);
        if (existing) {
          existing.customer_name = customerName;
          existing.updated_at = new Date();
          return { rows: [{ ...existing }], rowCount: 1 };
        }
        const row: InMemoryConversationRow = {
          id,
          customer_id: customerId,
          customer_name: customerName,
          agent_id: null,
          agent_name: 'Live Support Desk',
          status: 'open',
          last_message: '',
          last_message_at: ts,
          created_at: ts,
          updated_at: ts,
        };
        this.conversations.set(id, row);
        return { rows: [{ ...row }], rowCount: 1 };
      }

      // Branch 2: sendMessage (9 args)
      const [
        id,
        customerId,
        customerName,
        agentId,
        agentName,
        status,
        lastMessage,
        lastMessageAtIso,
        wantsInternalNote,
      ] = values as [
        string,
        string,
        string,
        string | null,
        string | null,
        string,
        string,
        string,
        boolean,
      ];
      const msgTs = new Date(lastMessageAtIso);
      const existing = this.conversations.get(id);
      if (existing) {
        existing.customer_name = customerName;
        if (!wantsInternalNote) {
          existing.last_message = lastMessage;
          existing.last_message_at = msgTs;
        }
        existing.updated_at = new Date();
        return { rows: [{ ...existing }], rowCount: 1 };
      }
      const row: InMemoryConversationRow = {
        id,
        customer_id: customerId,
        customer_name: customerName,
        agent_id: agentId,
        agent_name: agentName,
        status,
        last_message: lastMessage,
        last_message_at: msgTs,
        created_at: msgTs,
        updated_at: new Date(),
      };
      this.conversations.set(id, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    if (normalized.startsWith('UPDATE public.conversations SET status = $2')) {
      const candidateIds = Array.isArray(values[0])
        ? (values[0] as string[])
        : [];
      const nextStatus = String(values[1] ?? 'open');
      for (const cid of candidateIds) {
        const conv = this.conversations.get(cid);
        if (conv) {
          conv.status = nextStatus;
          conv.updated_at = new Date();
          return { rows: [{ ...conv }], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    // --- Messages queries ---
    if (normalized === 'SELECT * FROM public.messages WHERE id = $1 LIMIT 1') {
      const msg = this.messages.get(String(values[0] ?? ''));
      return { rows: msg ? [{ ...msg }] : [] };
    }

    if (
      normalized.startsWith(
        'SELECT id, conversation_id, sender_id, sender_name, sender_role, content, attachment_url, attachment_name, transaction_data, is_internal_note, created_at FROM public.messages',
      )
    ) {
      const convIds = new Set(Array.isArray(values[0]) ? (values[0] as string[]) : []);
      const excludeInternal = normalized.includes('COALESCE(is_internal_note, false) = false');
      const hasAfter = normalized.includes('created_at > $2');
      const hasBefore = normalized.includes('created_at < $2');
      const cursorIso = hasAfter || hasBefore ? String(values[1] ?? '') : null;
      const cursorMs = cursorIso ? Date.parse(cursorIso) : 0;
      const limit = Number(values[hasAfter || hasBefore ? 2 : 1] ?? 50);

      let list = [...this.messages.values()].filter((m) => {
        if (!convIds.has(m.conversation_id)) return false;
        if (excludeInternal) {
          const tx = m.transaction_data;
          if (m.is_internal_note || tx?.isInternalNote || tx?.is_internal_note) {
            return false;
          }
        }
        if (hasAfter && !(m.created_at.getTime() > cursorMs)) return false;
        if (hasBefore && !(m.created_at.getTime() < cursorMs)) return false;
        return true;
      });

      if (hasAfter) {
        list.sort((a, b) => {
          const dt = a.created_at.getTime() - b.created_at.getTime();
          return dt !== 0 ? dt : a.id.localeCompare(b.id);
        });
      } else {
        list.sort((a, b) => {
          const dt = b.created_at.getTime() - a.created_at.getTime();
          return dt !== 0 ? dt : b.id.localeCompare(a.id);
        });
      }

      return { rows: list.slice(0, limit).map((m) => ({ ...m })) };
    }

    if (normalized === "SELECT to_regclass('public.topups')::text AS reg") {
      return { rows: [{ reg: 'public.topups' }] };
    }

    if (
      normalized.startsWith(
        'SELECT id, proof_url FROM public.topups WHERE id = ANY($1::text[])',
      )
    ) {
      const ids = Array.isArray(values[0]) ? (values[0] as string[]) : [];
      const rows: InMemoryTopupRow[] = [];
      for (const id of ids) {
        const t = this.topups.get(id);
        if (t) rows.push({ ...t });
      }
      return { rows };
    }

    if (normalized.startsWith('INSERT INTO public.messages')) {
      const [
        id,
        conversationId,
        senderId,
        senderName,
        senderRole,
        content,
        attachmentUrl,
        attachmentName,
        txJson,
        isInternalNote,
        createdAtIso,
      ] = values as [
        string,
        string,
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        string | null,
        boolean,
        string,
      ];
      if (this.messages.has(id)) {
        return { rows: [], rowCount: 0 };
      }
      const row: InMemoryMessageRow = {
        id,
        conversation_id: conversationId,
        sender_id: senderId,
        sender_name: senderName,
        sender_role: senderRole,
        content,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        transaction_data: txJson ? (JSON.parse(txJson) as Record<string, unknown>) : null,
        is_internal_note: Boolean(isInternalNote),
        created_at: new Date(createdAtIso),
      };
      this.messages.set(id, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    if (
      normalized.startsWith(
        "SELECT * FROM public.messages WHERE transaction_data IS NOT NULL AND transaction_data->>'requestId' = $1",
      )
    ) {
      const reqId = String(values[0] ?? '');
      const convIds =
        values.length > 1 && Array.isArray(values[1])
          ? new Set(values[1] as string[])
          : null;
      const rows = [...this.messages.values()]
        .filter((m) => {
          if (!m.transaction_data || m.transaction_data.requestId !== reqId) {
            return false;
          }
          if (convIds && !convIds.has(m.conversation_id)) return false;
          return true;
        })
        .sort((a, b) => {
          const dt = b.created_at.getTime() - a.created_at.getTime();
          return dt !== 0 ? dt : b.id.localeCompare(a.id);
        })
        .slice(0, 25)
        .map((m) => ({ ...m }));
      return { rows };
    }

    if (
      normalized.startsWith(
        'UPDATE public.messages SET transaction_data = $2::jsonb WHERE id = $1 RETURNING *',
      )
    ) {
      const id = String(values[0] ?? '');
      const nextTxJson = String(values[1] ?? '{}');
      const row = this.messages.get(id);
      if (!row) return { rows: [], rowCount: 0 };
      row.transaction_data = JSON.parse(nextTxJson) as Record<string, unknown>;
      return { rows: [{ ...row }], rowCount: 1 };
    }

    // --- Chat Attachments ---
    if (normalized.startsWith('INSERT INTO public.chat_attachments')) {
      const [
        id,
        conversationId,
        customerId,
        uploadedBy,
        contentType,
        originalName,
        imageData,
        sizeBytes,
      ] = values as [
        string,
        string,
        string,
        string,
        string,
        string | null,
        Buffer,
        number,
      ];
      const row: InMemoryChatAttachmentRow = {
        id,
        conversation_id: conversationId,
        customer_id: customerId,
        uploaded_by: uploadedBy,
        content_type: contentType,
        original_name: originalName,
        image_data: Buffer.from(imageData),
        size_bytes: sizeBytes,
        created_at: new Date(),
      };
      this.chatAttachments.set(id, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    if (
      normalized.startsWith(
        'SELECT id, conversation_id, customer_id, content_type, original_name, size_bytes, image_data, created_at FROM public.chat_attachments WHERE id = $1',
      )
    ) {
      const row = this.chatAttachments.get(String(values[0] ?? ''));
      return { rows: row ? [{ ...row }] : [] };
    }

    // --- Audit Logs ---
    if (normalized.startsWith('INSERT INTO public.audit_logs')) {
      if (normalized.includes("'CONVERSATION_STATUS_UPDATED'")) {
        const [id, actorId, actorName, actorRole, entityId, details] = values as [
          string,
          string,
          string,
          string,
          string,
          string,
        ];
        this.auditLogs.push({
          id,
          actor_id: actorId,
          actor_name: actorName,
          actor_role: actorRole,
          action: 'CONVERSATION_STATUS_UPDATED',
          entity_type: 'conversation',
          entity_id: entityId,
          details,
          timestamp: new Date(),
        });
      } else {
        const [id, actorId, actorName, actorRole, action, entityType, entityId, details] =
          values as [string, string, string, string, string, string, string, string];
        this.auditLogs.push({
          id,
          actor_id: actorId,
          actor_name: actorName,
          actor_role: actorRole,
          action: String(action || 'AUTH_EVENT'),
          entity_type: String(entityType || 'user'),
          entity_id: String(entityId || ''),
          details: String(details || ''),
          timestamp: new Date(),
        });
      }
      return { rows: [], rowCount: 1 };
    }

    return { rows: [] };
  }

  private filterConversations(
    normalizedSql: string,
    values: unknown[],
  ): InMemoryConversationRow[] {
    let idx = 0;
    let onlyCustomerId: string | null = null;
    if (normalizedSql.includes('c.customer_id = $')) {
      onlyCustomerId = String(values[idx++] ?? '');
    }
    let statusFilter: string | null = null;
    if (normalizedSql.includes('c.status = $')) {
      statusFilter = String(values[idx++] ?? '');
    }
    let searchPattern: string | null = null;
    if (normalizedSql.includes('c.customer_name ILIKE $')) {
      searchPattern = String(values[idx++] ?? '');
    }

    const staffExcluded = normalizedSql.includes("COALESCE(u.role, 'customer') = 'customer'");

    return [...this.conversations.values()].filter((c) => {
      const user = this.users.get(c.customer_id);
      if (staffExcluded && (user?.role ?? 'customer') !== 'customer') {
        return false;
      }
      if (onlyCustomerId && c.customer_id !== onlyCustomerId) {
        return false;
      }
      if (statusFilter && c.status !== statusFilter) {
        return false;
      }
      if (searchPattern) {
        const displayName = user?.display_name?.trim() || c.customer_name;
        const email = user?.email ?? '';
        const lastMsg = c.last_message ?? '';
        if (
          !ilikeMatch(displayName, searchPattern) &&
          !ilikeMatch(email, searchPattern) &&
          !ilikeMatch(lastMsg, searchPattern)
        ) {
          return false;
        }
      }
      return true;
    });
  }

  private toJoinedRow(user: InMemoryUserRow, link?: InMemoryAuthLinkRow) {
    return {
      app_user_id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      phone: user.phone,
      avatar_url: user.avatar_url,
      status: user.status,
      email_verified: user.email_verified,
      referral_code: user.referral_code,
      referred_by: user.referred_by,
      created_at: user.created_at,
      updated_at: user.updated_at,
      auth_user_id: link?.auth_user_id ?? null,
      password_reset_required: link?.password_reset_required ?? false,
    };
  }
}

class RecordingEmailDelivery implements EmailDeliveryAdapter {
  public readonly providerName = 'test-capture';
  public readonly otps: SendOtpEmailPayload[] = [];
  public readonly resets: SendPasswordResetEmailPayload[] = [];
  public readonly verifications: SendVerificationEmailPayload[] = [];

  public isConfigured(): boolean {
    return true;
  }
  public async sendVerificationEmail(payload: SendVerificationEmailPayload) {
    this.verifications.push(payload);
  }
  public async sendOtpEmail(payload: SendOtpEmailPayload) {
    this.otps.push(payload);
  }
  public async sendPasswordResetEmail(payload: SendPasswordResetEmailPayload) {
    this.resets.push(payload);
  }
}

function createTestConfig(): ServerConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 4000,
    appOrigin: 'http://localhost:3000',
    trustedOrigins: ['http://localhost:3000'],
    trustProxy: 'loopback',
    databaseUrl: 'postgresql://app:pass@127.0.0.1:5432/swiftsweeps_test',
    pgPoolMax: 5,
    pgPoolMin: 0,
    pgIdleTimeoutMs: 30_000,
    pgConnectionTimeoutMs: 5_000,
    pgStatementTimeoutMs: 15_000,
    pgSslMode: 'disable',
    requestBodyLimit: '1mb',
    requestBodyLimitBytes: 1024 * 1024,
    logLevel: 'error',
    shutdownTimeoutMs: 5_000,
    authSecret: 'test-only-auth-secret-with-more-than-32-chars',
    authCookiePrefix: 'swiftsweeps_auth',
    authSessionExpiresInSec: 604_800,
    authSessionUpdateAgeSec: 86_400,
    authSessionFreshAgeSec: 900,
    authRequireEmailVerification: false,
    authRateLimitEnabled: false,
    authRateLimitWindowSec: 60,
    authRateLimitMax: 30,
    emailProvider: 'disabled',
    smtpPort: 587,
    smtpSecure: false,
    emailFromName: 'SwiftSweeps',
    vapidSubject: 'mailto:support@swiftsweeps.com',
  };
}

class TestSessionCookieJar {
  private readonly cookies = new Map<string, string>();

  public capture(setCookieHeaders: string | string[] | undefined): void {
    if (!setCookieHeaders) return;
    const list = Array.isArray(setCookieHeaders)
      ? setCookieHeaders
      : [setCookieHeaders];
    for (const raw of list) {
      const pair = raw.split(';', 1)[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const val = pair.slice(eq + 1).trim();
      if (val) this.cookies.set(name, val);
      else this.cookies.delete(name);
    }
  }

  public header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

async function httpRequest(
  baseUrl: string,
  method: string,
  path: string,
  options?: {
    body?: unknown;
    jar?: TestSessionCookieJar;
    origin?: string | null;
  },
): Promise<{
  status: number;
  json: any;
  buffer: Buffer;
  headers: http.IncomingHttpHeaders;
}> {
  const url = new URL(path, baseUrl);
  const bodyStr =
    options?.body !== undefined ? JSON.stringify(options.body) : undefined;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (bodyStr !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = String(Buffer.byteLength(bodyStr));
  }
  const cookieHeader = options?.jar?.header();
  if (cookieHeader) headers.Cookie = cookieHeader;
  if (
    options?.origin !== null &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  ) {
    headers.Origin = options?.origin ?? 'http://localhost:3000';
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => {
          options?.jar?.capture(res.headers['set-cookie']);
          const buffer = Buffer.concat(chunks);
          let json: any = null;
          try {
            const text = buffer.toString('utf8');
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          resolve({
            status: res.statusCode || 0,
            json,
            buffer,
            headers: res.headers,
          });
        });
      },
    );
    req.on('error', reject);
    if (bodyStr !== undefined) req.write(bodyStr);
    req.end();
  });
}

async function openSseStream(
  baseUrl: string,
  jar: TestSessionCookieJar,
): Promise<{
  status: number;
  events: Array<{ event: string; data: any }>;
  close: () => void;
}> {
  const url = new URL('/api/chat/stream', baseUrl);
  const events: Array<{ event: string; data: any }> = [];

  return new Promise((resolve, reject) => {
    let buffer = '';
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Cookie: jar.header(),
        },
      },
      (res) => {
        let settled = false;
        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          let sepIdx: number;
          while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            if (!block.trim() || block.startsWith(':')) continue;
            let eventName = 'message';
            const dataLines: string[] = [];
            for (const line of block.split('\n')) {
              if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim());
              }
            }
            if (dataLines.length > 0) {
              const rawData = dataLines.join('\n');
              try {
                events.push({ event: eventName, data: JSON.parse(rawData) });
              } catch {
                events.push({ event: eventName, data: rawData });
              }
            }
            if (!settled && events.some((e) => e.event === 'ready')) {
              settled = true;
              resolve({
                status: res.statusCode || 0,
                events,
                close: () => {
                  res.destroy();
                  req.destroy();
                },
              });
            }
          }
        });
        res.on('error', (err) => {
          if (!settled) reject(err);
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function createTestServer() {
  const db = new InMemoryChatDatabase();
  const authMemoryStore = {
    ba_user: [],
    ba_session: [],
    ba_account: [],
    ba_verification: [],
    ba_rate_limit: [],
  };
  const logger = createLogger({
    level: 'error',
    writeStdout: () => {},
    writeStderr: () => {},
  });
  const app = createApiApp({
    config: createTestConfig(),
    logger,
    pool: db,
    authDatabaseOverride: memoryAdapter(authMemoryStore),
    emailDeliveryOverride: new RecordingEmailDelivery(),
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    db,
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

async function signupAndSignIn(
  baseUrl: string,
  db: InMemoryChatDatabase,
  params: {
    email: string;
    name: string;
    role: 'customer' | 'agent' | 'admin';
    status?: string;
  },
): Promise<{ appUserId: string; jar: TestSessionCookieJar }> {
  const jar = new TestSessionCookieJar();
  const signUp = await httpRequest(baseUrl, 'POST', '/api/auth/sign-up/email', {
    jar,
    body: {
      email: params.email,
      password: 'StrongPassword#2026!',
      name: params.name,
    },
  });
  assert.equal(signUp.status, 200);

  const signIn = await httpRequest(baseUrl, 'POST', '/api/auth/sign-in/email', {
    jar,
    body: {
      email: params.email,
      password: 'StrongPassword#2026!',
    },
  });
  assert.equal(signIn.status, 200);

  let appUserId = '';
  for (const user of db.users.values()) {
    if (user.email.toLowerCase() === params.email.toLowerCase()) {
      user.role = params.role;
      if (params.status) user.status = params.status;
      appUserId = user.id;
      break;
    }
  }
  assert.ok(appUserId);
  return { appUserId, jar };
}

// 24-byte valid PNG header + IHDR bytes (passes detectImageMime)
const SAMPLE_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

// Minimal RIFF...WEBP payload >= 12 bytes
const SAMPLE_WEBP_BUFFER = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x10, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.from('VP8 ', 'ascii'),
  Buffer.from([0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
]);

test('Chat endpoints reject anonymous and suspended users fail-closed', async () => {
  const srv = await createTestServer();
  try {
    const anonChecks = await Promise.all([
      httpRequest(srv.baseUrl, 'GET', '/api/chat/conversations'),
      httpRequest(srv.baseUrl, 'POST', '/api/chat/conversations/ensure', {
        body: { customerId: 'usr_1' },
      }),
      httpRequest(
        srv.baseUrl,
        'GET',
        '/api/chat/messages?conversationId=conv_usr_1',
      ),
      httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
        body: { text: 'hello' },
      }),
      httpRequest(srv.baseUrl, 'PATCH', '/api/chat/conversation-status', {
        body: { conversationId: 'conv_usr_1', status: 'resolved' },
      }),
      httpRequest(srv.baseUrl, 'PATCH', '/api/chat/messages/transaction-status', {
        body: { requestId: 'req_1', status: 'completed' },
      }),
      httpRequest(srv.baseUrl, 'POST', '/api/chat/attachments', {
        body: {
          contentType: 'image/png',
          fileBase64: SAMPLE_PNG_BUFFER.toString('base64'),
        },
      }),
      httpRequest(srv.baseUrl, 'GET', '/api/chat/attachments/ca_123.png'),
      httpRequest(srv.baseUrl, 'GET', '/api/chat/stream'),
    ]);

    for (const res of anonChecks) {
      assert.equal(res.status, 401);
    }

    const suspended = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'suspended-chat@example.com',
      name: 'Suspended User',
      role: 'customer',
      status: 'suspended',
    });

    const suspendedRes = await httpRequest(
      srv.baseUrl,
      'GET',
      '/api/chat/conversations',
      { jar: suspended.jar },
    );
    assert.equal(suspendedRes.status, 403);
  } finally {
    await srv.close();
  }
});

test('Customer ownership isolation, anti-spoofing, and staff RBAC enforcement', async () => {
  const srv = await createTestServer();
  try {
    const custA = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'chat-a@example.com',
      name: 'Alice Player',
      role: 'customer',
    });
    const custB = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'chat-b@example.com',
      name: 'Bob Player',
      role: 'customer',
    });
    const agent = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'chat-agent@example.com',
      name: 'Agent Taylor',
      role: 'agent',
    });

    // Empty initial state for Customer A
    const emptyConvs = await httpRequest(
      srv.baseUrl,
      'GET',
      '/api/chat/conversations',
      { jar: custA.jar },
    );
    assert.equal(emptyConvs.status, 200);
    assert.deepEqual(emptyConvs.json.conversations, []);
    assert.equal(emptyConvs.json.total, 0);

    // Ensure own canonical conversation
    const ensureA = await httpRequest(
      srv.baseUrl,
      'POST',
      '/api/chat/conversations/ensure',
      { jar: custA.jar, body: {} },
    );
    assert.equal(ensureA.status, 200);
    assert.equal(ensureA.json.conversation.id, `conv_${custA.appUserId}`);
    assert.equal(ensureA.json.conversation.status, 'open');

    // Empty initial messages for Customer A
    const emptyMsgs = await httpRequest(
      srv.baseUrl,
      'GET',
      `/api/chat/messages?conversationId=${encodeURIComponent(`conv_${custA.appUserId}`)}`,
      { jar: custA.jar },
    );
    assert.equal(emptyMsgs.status, 200);
    assert.deepEqual(emptyMsgs.json.messages, []);
    assert.equal(emptyMsgs.json.hasMore, false);

    // Customer B cannot ensure, read, or send into Customer A's thread
    const bEnsureA = await httpRequest(
      srv.baseUrl,
      'POST',
      '/api/chat/conversations/ensure',
      { jar: custB.jar, body: { customerId: custA.appUserId } },
    );
    assert.equal(bEnsureA.status, 403);

    const bReadA = await httpRequest(
      srv.baseUrl,
      'GET',
      `/api/chat/messages?conversationId=${encodeURIComponent(`conv_${custA.appUserId}`)}`,
      { jar: custB.jar },
    );
    assert.equal(bReadA.status, 403);

    const bSendA = await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
      jar: custB.jar,
      body: {
        conversationId: `conv_${custA.appUserId}`,
        recipientId: custA.appUserId,
        text: 'Cross-tenant probe',
      },
    });
    assert.equal(bSendA.status, 403);

    // Customer cannot spoof privileged senderId/senderRole/actingUserId/role fields
    for (const spoofBody of [
      { text: 'spoof', senderId: agent.appUserId },
      { text: 'spoof', senderRole: 'admin' },
      { text: 'spoof', actingUserId: agent.appUserId },
      { text: 'spoof', role: 'agent' },
    ]) {
      const spoofRes = await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
        jar: custA.jar,
        body: spoofBody,
      });
      assert.equal(spoofRes.status, 403);
      assert.equal(spoofRes.json?.error?.code, 'FORBIDDEN_FIELD_MODIFICATION');
    }

    // Customer cannot post internal note (flag or nested transactionData)
    const custInternalFlag = await httpRequest(
      srv.baseUrl,
      'POST',
      '/api/chat/send',
      {
        jar: custA.jar,
        body: { text: 'Trying internal', isInternalNote: true },
      },
    );
    assert.equal(custInternalFlag.status, 403);
    assert.equal(custInternalFlag.json?.error?.code, 'INTERNAL_NOTE_FORBIDDEN');

    const custInternalTx = await httpRequest(
      srv.baseUrl,
      'POST',
      '/api/chat/send',
      {
        jar: custA.jar,
        body: {
          text: 'Trying hidden internal',
          transactionData: { isInternalNote: true, notes: 'bypass' },
        },
      },
    );
    assert.equal(custInternalTx.status, 403);
    assert.equal(custInternalTx.json?.error?.code, 'INTERNAL_NOTE_FORBIDDEN');

    // Customer cannot update ticket status or transaction card status
    const custStatusUpd = await httpRequest(
      srv.baseUrl,
      'PATCH',
      '/api/chat/conversation-status',
      {
        jar: custA.jar,
        body: { conversationId: `conv_${custA.appUserId}`, status: 'resolved' },
      },
    );
    assert.equal(custStatusUpd.status, 403);

    const custTxUpd = await httpRequest(
      srv.baseUrl,
      'PATCH',
      '/api/chat/messages/transaction-status',
      {
        jar: custA.jar,
        body: { requestId: 'topup_1', status: 'completed' },
      },
    );
    assert.equal(custTxUpd.status, 403);

    // Staff cannot open a support conversation for another staff account
    const staffForStaff = await httpRequest(
      srv.baseUrl,
      'POST',
      '/api/chat/conversations/ensure',
      {
        jar: agent.jar,
        body: { customerId: agent.appUserId },
      },
    );
    assert.equal(staffForStaff.status, 400);
    assert.equal(staffForStaff.json?.error?.code, 'STAFF_CONVERSATION_FORBIDDEN');

    // Staff ensuring conversation for missing user -> 404
    const missingEnsure = await httpRequest(
      srv.baseUrl,
      'POST',
      '/api/chat/conversations/ensure',
      {
        jar: agent.jar,
        body: { customerId: 'usr_nonexistent_1' },
      },
    );
    assert.equal(missingEnsure.status, 404);
  } finally {
    await srv.close();
  }
});

test('Input validation rejects bad URLs, oversized text, SVG/fake images, and unknown fields', async () => {
  const srv = await createTestServer();
  try {
    const cust = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'chat-val@example.com',
      name: 'Val Player',
      role: 'customer',
    });

    // Empty message rejected
    const emptySend = await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
      jar: cust.jar,
      body: { text: '   ' },
    });
    assert.equal(emptySend.status, 400);

    // Oversized text (> 8000 chars)
    const hugeSend = await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
      jar: cust.jar,
      body: { text: 'x'.repeat(8001) },
    });
    assert.equal(hugeSend.status, 400);

    // Unsafe attachmentUrl schemes
    for (const badUrl of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'http://insecure.example/img.png',
    ]) {
      const badRes = await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
        jar: cust.jar,
        body: { text: 'hi', attachmentUrl: badUrl },
      });
      assert.equal(badRes.status, 400);
    }

    // Unknown query param rejected
    const badQuery = await httpRequest(
      srv.baseUrl,
      'GET',
      '/api/chat/conversations?unknownParam=1',
      { jar: cust.jar },
    );
    assert.equal(badQuery.status, 400);

    // SVG disguised as PNG fails magic-byte inspection
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const badUpload = await httpRequest(
      srv.baseUrl,
      'POST',
      '/api/chat/attachments',
      {
        jar: cust.jar,
        body: {
          contentType: 'image/png',
          fileName: 'evil.png',
          fileBase64: svgBuffer.toString('base64'),
        },
      },
    );
    assert.equal(badUpload.status, 400);

    // Invalid attachment id path param rejected
    const badIdDownload = await httpRequest(
      srv.baseUrl,
      'GET',
      '/api/chat/attachments/not-valid.svg',
      { jar: cust.jar },
    );
    assert.equal(badIdDownload.status, 400);
  } finally {
    await srv.close();
  }
});

test('Happy paths: messages, internal note isolation, topup proof hydration, ticket status & audit, transaction card update, and attachments', async () => {
  const srv = await createTestServer();
  try {
    const custA = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'happy-a@example.com',
      name: 'Alice_VIP',
      role: 'customer',
    });
    const custB = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'happy-b@example.com',
      name: 'Bob Regular',
      role: 'customer',
    });
    const agent = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'happy-agent@example.com',
      name: 'Support Agent',
      role: 'agent',
    });

    // Seed a topup proof in public.topups for hydration verification
    srv.db.topups.set('topup_999', {
      id: 'topup_999',
      proof_url:
        'https://proj.supabase.co/storage/v1/object/public/chat_attachments/receipts/topup_999.webp?t=1',
    });

    // 1. Customer A uploads an attachment
    const uploadRes = await httpRequest(
      srv.baseUrl,
      'POST',
      '/api/chat/attachments',
      {
        jar: custA.jar,
        body: {
          conversationId: `conv_${custA.appUserId}`,
          fileName: 'receipt.webp',
          contentType: 'image/webp',
          fileBase64: SAMPLE_WEBP_BUFFER.toString('base64'),
        },
      },
    );
    assert.equal(uploadRes.status, 200);
    assert.equal(uploadRes.json.success, true);
    assert.match(uploadRes.json.url, /^\/api\/chat\/attachments\/ca_.*\.webp$/);

    // Owner and staff can download binary; Customer B gets 403
    const ownerDl = await httpRequest(srv.baseUrl, 'GET', uploadRes.json.url, {
      jar: custA.jar,
    });
    assert.equal(ownerDl.status, 200);
    assert.equal(ownerDl.headers['content-type'], 'image/webp');
    assert.equal(ownerDl.headers['x-content-type-options'], 'nosniff');
    assert.deepEqual(ownerDl.buffer, SAMPLE_WEBP_BUFFER);

    const staffDl = await httpRequest(srv.baseUrl, 'GET', uploadRes.json.url, {
      jar: agent.jar,
    });
    assert.equal(staffDl.status, 200);
    assert.deepEqual(staffDl.buffer, SAMPLE_WEBP_BUFFER);

    const wrongCustDl = await httpRequest(srv.baseUrl, 'GET', uploadRes.json.url, {
      jar: custB.jar,
    });
    assert.equal(wrongCustDl.status, 403);

    // 2. Customer A sends a top-up transaction card without attachmentUrl (hydrated from public.topups)
    const cardRes = await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
      jar: custA.jar,
      body: {
        id: 'msg_card_topup_999',
        text: 'Submitted top-up for $50.00',
        transactionData: {
          transactionType: 'topup',
          requestId: 'topup_999',
          status: 'pending',
          amount: 50,
        },
      },
    });
    assert.equal(cardRes.status, 200);
    assert.equal(cardRes.json.message.sender_role, 'customer');

    // 3. Staff posts a public reply, then a private internal note
    const publicReply = await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
      jar: agent.jar,
      body: {
        conversationId: `conv_${custA.appUserId}`,
        text: 'Checking your receipt now!',
        attachmentUrl: uploadRes.json.url,
        attachmentName: 'receipt.webp',
        deskLabel: 'Customer Support Desk',
      },
    });
    assert.equal(publicReply.status, 200);
    assert.equal(publicReply.json.message.sender_name, 'Customer Support Desk');
    assert.equal(publicReply.json.conversation.last_message, 'Checking your receipt now!');

    const internalNote = await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
      jar: agent.jar,
      body: {
        conversationId: `conv_${custA.appUserId}`,
        text: 'Internal fraud check: verified Chime handle',
        isInternalNote: true,
      },
    });
    assert.equal(internalNote.status, 200);
    assert.equal(internalNote.json.message.is_internal_note, true);
    // Internal note MUST NOT overwrite public last_message!
    assert.equal(
      internalNote.json.conversation.last_message,
      'Checking your receipt now!',
    );

    // 4. Customer A lists messages: internal note is excluded, topup proof is hydrated
    const custMsgs = await httpRequest(
      srv.baseUrl,
      'GET',
      `/api/chat/messages?conversationId=${encodeURIComponent(`conv_${custA.appUserId}`)}`,
      { jar: custA.jar },
    );
    assert.equal(custMsgs.status, 200);
    assert.equal(custMsgs.json.messages.length, 2);
    assert.ok(
      custMsgs.json.messages.every((m: any) => m.is_internal_note === false),
    );
    const cardMsg = custMsgs.json.messages.find(
      (m: any) => m.id === 'msg_card_topup_999',
    );
    assert.equal(
      cardMsg.attachment_url,
      '/api/storage/file?bucket=chat_attachments&path=receipts%2Ftopup_999.webp',
    );
    assert.equal(cardMsg.transaction_data.proofUrl, cardMsg.attachment_url);

    // Staff lists messages: sees all 3 including internal note
    const staffMsgs = await httpRequest(
      srv.baseUrl,
      'GET',
      `/api/chat/messages?conversationId=${encodeURIComponent(`conv_${custA.appUserId}`)}`,
      { jar: agent.jar },
    );
    assert.equal(staffMsgs.status, 200);
    assert.equal(staffMsgs.json.messages.length, 3);
    assert.equal(staffMsgs.json.messages[2].is_internal_note, true);

    // 5. Staff updates transaction card status
    const txCardUpd = await httpRequest(
      srv.baseUrl,
      'PATCH',
      '/api/chat/messages/transaction-status',
      {
        jar: agent.jar,
        body: {
          requestId: 'topup_999',
          customerId: custA.appUserId,
          status: 'completed',
          notes: 'Approved & loaded',
          amount: 50,
          bonusAmount: 5,
          finalCredit: 55,
        },
      },
    );
    assert.equal(txCardUpd.status, 200);
    assert.equal(txCardUpd.json.updatedCount, 1);
    assert.equal(txCardUpd.json.messages[0].transaction_data.status, 'completed');
    assert.equal(txCardUpd.json.messages[0].transaction_data.finalCredit, 55);

    // 6. Staff updates conversation ticket status + audit log written
    const statusUpd = await httpRequest(
      srv.baseUrl,
      'PATCH',
      '/api/chat/conversation-status',
      {
        jar: agent.jar,
        body: {
          conversationId: `conv_${custA.appUserId}`,
          status: 'resolved',
        },
      },
    );
    assert.equal(statusUpd.status, 200);
    assert.equal(statusUpd.json.conversation.status, 'resolved');
    const convAuditLogs = srv.db.auditLogs.filter(
      (l) => l.action === 'CONVERSATION_STATUS_UPDATED',
    );
    assert.equal(convAuditLogs.length, 1);
    assert.equal(convAuditLogs[0]!.action, 'CONVERSATION_STATUS_UPDATED');
    assert.equal(convAuditLogs[0]!.actor_id, agent.appUserId);

    // 7. Staff conversation search escapes %/_ literals safely and filters status
    await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
      jar: custB.jar,
      body: { text: 'Need help with game account' },
    });

    const underscoreSearch = await httpRequest(
      srv.baseUrl,
      'GET',
      '/api/chat/conversations?q=Alice_VIP&status=resolved',
      { jar: agent.jar },
    );
    assert.equal(underscoreSearch.status, 200);
    assert.equal(underscoreSearch.json.conversations.length, 1);
    assert.equal(underscoreSearch.json.conversations[0].customer_id, custA.appUserId);

    // Customer A only ever sees own conversation
    const custAConvs = await httpRequest(
      srv.baseUrl,
      'GET',
      '/api/chat/conversations',
      { jar: custA.jar },
    );
    assert.equal(custAConvs.status, 200);
    assert.equal(custAConvs.json.conversations.length, 1);
    assert.equal(custAConvs.json.conversations[0].customer_id, custA.appUserId);
  } finally {
    await srv.close();
  }
});

test('Pagination, deterministic tie-breaking, idempotent message IDs, and concurrency', async () => {
  const srv = await createTestServer();
  try {
    const cust = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'page-cust@example.com',
      name: 'Page User',
      role: 'customer',
    });
    const custOther = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'page-other@example.com',
      name: 'Other User',
      role: 'customer',
    });

    // Seed 5 messages with two sharing an identical timestamp to verify (created_at, id) tie-breaking
    const baseTs = Date.parse('2026-11-26T10:00:00.000Z');
    const timestamps = [
      new Date(baseTs).toISOString(),
      new Date(baseTs + 1000).toISOString(),
      new Date(baseTs + 1000).toISOString(),
      new Date(baseTs + 2000).toISOString(),
      new Date(baseTs + 3000).toISOString(),
    ];
    const ids = ['m_01', 'm_02_b', 'm_02_a', 'm_04', 'm_05'];

    for (let i = 0; i < ids.length; i += 1) {
      const sendRes = await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
        jar: cust.jar,
        body: {
          id: ids[i],
          text: `Message ${ids[i]}`,
          createdAt: timestamps[i],
        },
      });
      assert.equal(sendRes.status, 200);
      assert.equal(sendRes.json.deduplicated, false);
    }

    // Duplicate send with identical id returns deduplicated: true without duplication
    const dupRes = await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
      jar: cust.jar,
      body: {
        id: 'm_04',
        text: 'Duplicate delivery attempt',
      },
    });
    assert.equal(dupRes.status, 200);
    assert.equal(dupRes.json.deduplicated, true);
    assert.equal(dupRes.json.message.content, 'Message m_04');

    // Cross-conversation reuse of deterministic message ID conflicts with 409
    const conflictRes = await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
      jar: custOther.jar,
      body: {
        id: 'm_04',
        text: 'Hijack existing message id',
      },
    });
    assert.equal(conflictRes.status, 409);
    assert.equal(conflictRes.json?.error?.code, 'CHAT_CONFLICT');

    // Initial latest page (limit=2) -> [m_04, m_05] with hasMore=true
    const convId = `conv_${cust.appUserId}`;
    const page1 = await httpRequest(
      srv.baseUrl,
      'GET',
      `/api/chat/messages?conversationId=${encodeURIComponent(convId)}&limit=2`,
      { jar: cust.jar },
    );
    assert.equal(page1.status, 200);
    assert.equal(page1.json.hasMore, true);
    assert.deepEqual(
      page1.json.messages.map((m: any) => m.id),
      ['m_04', 'm_05'],
    );

    // Older page using beforeCreatedAt=m_04.created_at (limit=3) -> [m_01, m_02_a, m_02_b]
    const page2 = await httpRequest(
      srv.baseUrl,
      'GET',
      `/api/chat/messages?conversationId=${encodeURIComponent(convId)}&beforeCreatedAt=${encodeURIComponent(page1.json.messages[0].created_at)}&limit=3`,
      { jar: cust.jar },
    );
    assert.equal(page2.status, 200);
    assert.equal(page2.json.hasMore, false);
    assert.deepEqual(
      page2.json.messages.map((m: any) => m.id),
      ['m_01', 'm_02_a', 'm_02_b'],
    );

    // Forward delta polling afterCreatedAt
    const delta = await httpRequest(
      srv.baseUrl,
      'GET',
      `/api/chat/messages?conversationId=${encodeURIComponent(convId)}&afterCreatedAt=${encodeURIComponent(timestamps[3]!)}&limit=10`,
      { jar: cust.jar },
    );
    assert.equal(delta.status, 200);
    assert.deepEqual(
      delta.json.messages.map((m: any) => m.id),
      ['m_05'],
    );

    // Concurrent ensureConversation calls succeed without duplicates
    const [e1, e2, e3] = await Promise.all([
      httpRequest(srv.baseUrl, 'POST', '/api/chat/conversations/ensure', {
        jar: custOther.jar,
        body: {},
      }),
      httpRequest(srv.baseUrl, 'POST', '/api/chat/conversations/ensure', {
        jar: custOther.jar,
        body: {},
      }),
      httpRequest(srv.baseUrl, 'POST', '/api/chat/conversations/ensure', {
        jar: custOther.jar,
        body: {},
      }),
    ]);
    assert.equal(e1.status, 200);
    assert.equal(e2.status, 200);
    assert.equal(e3.status, 200);
    assert.equal(
      e1.json.conversation.id,
      `conv_${custOther.appUserId}`,
    );
  } finally {
    await srv.close();
  }
});

test('Role-scoped SSE /api/chat/stream isolates customers and suppresses internal notes for customers', async () => {
  const srv = await createTestServer();
  try {
    const custA = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'sse-a@example.com',
      name: 'SSE A',
      role: 'customer',
    });
    const custB = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'sse-b@example.com',
      name: 'SSE B',
      role: 'customer',
    });
    const agent = await signupAndSignIn(srv.baseUrl, srv.db, {
      email: 'sse-agent@example.com',
      name: 'SSE Agent',
      role: 'agent',
    });

    const streamA = await openSseStream(srv.baseUrl, custA.jar);
    const streamStaff = await openSseStream(srv.baseUrl, agent.jar);
    try {
      assert.equal(streamA.status, 200);
      assert.equal(streamStaff.status, 200);

      // 1. Customer B sends message -> Staff receives it, Customer A does NOT
      await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
        jar: custB.jar,
        body: { id: 'msg_sse_b1', text: 'Secret from B' },
      });

      // 2. Staff sends internal note for Customer A -> Staff receives it, Customer A does NOT
      await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
        jar: agent.jar,
        body: {
          id: 'msg_sse_internal_a',
          conversationId: `conv_${custA.appUserId}`,
          text: 'Private agent note for A',
          isInternalNote: true,
        },
      });

      // 3. Staff sends public reply to Customer A -> Both Staff and Customer A receive it
      await httpRequest(srv.baseUrl, 'POST', '/api/chat/send', {
        jar: agent.jar,
        body: {
          id: 'msg_sse_public_a',
          conversationId: `conv_${custA.appUserId}`,
          text: 'Hello A, we are on it!',
        },
      });

      // Wait briefly for stream flush
      await new Promise((r) => setTimeout(r, 80));

      const staffMsgIds = streamStaff.events
        .filter((e) => e.event === 'chat_message')
        .map((e) => e.data.message.id);
      assert.deepEqual(staffMsgIds, [
        'msg_sse_b1',
        'msg_sse_internal_a',
        'msg_sse_public_a',
      ]);

      const custAMsgIds = streamA.events
        .filter((e) => e.event === 'chat_message')
        .map((e) => e.data.message.id);
      assert.deepEqual(custAMsgIds, ['msg_sse_public_a']);
    } finally {
      streamA.close();
      streamStaff.close();
    }
  } finally {
    await srv.close();
  }
});
