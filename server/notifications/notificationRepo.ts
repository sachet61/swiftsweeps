import crypto from 'node:crypto';
import type { AppUserRole } from '../auth/userDirectoryRepo.js';
import type { DatabasePool } from '../db/pool.js';

export type NotificationType =
  | 'topup'
  | 'withdrawal'
  | 'bonus'
  | 'chat'
  | 'game_account'
  | 'referral'
  | 'system';

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  linkTab: string | null;
  linkRequestId: string | null;
  createdAt: string;
}

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  userId: string;
  userEmail: string | null;
  userRole: AppUserRole;
  p256dh: string;
  auth: string;
  expirationTime: number | null;
  platform: string | null;
  browser: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export class NotificationNotFoundError extends Error {
  constructor(message = 'Notification not found.') {
    super(message);
    this.name = 'NotificationNotFoundError';
  }
}

export class NotificationForbiddenError extends Error {
  constructor(message = 'You do not have permission to access this notification.') {
    super(message);
    this.name = 'NotificationForbiddenError';
  }
}

export class NotificationTargetUserNotFoundError extends Error {
  constructor(message = 'Target notification user not found.') {
    super(message);
    this.name = 'NotificationTargetUserNotFoundError';
  }
}

interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

interface RawNotificationRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link_tab: string | null;
  link_request_id: string | null;
  created_at: Date | string;
}

interface RawPushSubscriptionRow extends Record<string, unknown> {
  id: string;
  endpoint: string;
  user_id: string;
  user_email: string | null;
  user_role: string;
  p256dh: string;
  auth: string;
  expiration_time: number | string | null;
  platform: string | null;
  browser: string | null;
  active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

function toIsoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function normalizeRole(role: unknown): AppUserRole {
  if (role === 'admin') return 'admin';
  if (role === 'agent') return 'agent';
  return 'customer';
}

export function hashPushEndpointId(endpoint: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(endpoint, 'utf8')
    .digest('hex')
    .slice(0, 24);
  return `push_${digest}`;
}

function mapNotificationRow(row: RawNotificationRow): NotificationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    type: row.type as NotificationType,
    isRead: Boolean(row.is_read),
    linkTab: row.link_tab ?? null,
    linkRequestId: row.link_request_id ?? null,
    createdAt: toIsoDate(row.created_at),
  };
}

function mapPushSubscriptionRow(
  row: RawPushSubscriptionRow,
): PushSubscriptionRecord {
  const rawExp = row.expiration_time;
  const expirationTime =
    rawExp === null || rawExp === undefined ? null : Number(rawExp);

  return {
    id: row.id,
    endpoint: row.endpoint,
    userId: row.user_id,
    userEmail: row.user_email ?? null,
    userRole: normalizeRole(row.user_role),
    p256dh: row.p256dh,
    auth: row.auth,
    expirationTime: Number.isFinite(expirationTime) ? expirationTime : null,
    platform: row.platform ?? null,
    browser: row.browser ?? null,
    active: Boolean(row.active),
    createdAt: toIsoDate(row.created_at),
    updatedAt: toIsoDate(row.updated_at),
  };
}

export class NotificationRepo {
  constructor(private readonly pool: Pick<DatabasePool, 'query'>) {}

  private async query<T = Record<string, unknown>>(
    sql: string,
    values: unknown[] = [],
  ): Promise<QueryResultLike<T>> {
    return (await this.pool.query(sql, values)) as QueryResultLike<T>;
  }

  public async listNotificationsForUser(params: {
    userId: string;
    unreadOnly?: boolean;
    type?: NotificationType;
    limit: number;
    offset: number;
  }): Promise<{
    items: NotificationRecord[];
    total: number;
    unreadCount: number;
  }> {
    const filterClauses = ['user_id = $1'];
    const filterValues: unknown[] = [params.userId];

    if (params.unreadOnly) {
      filterClauses.push('is_read = false');
    }

    if (params.type) {
      filterValues.push(params.type);
      filterClauses.push(`type = $${filterValues.length}`);
    }

    const whereSql = filterClauses.join(' AND ');
    const limitIdx = filterValues.length + 1;
    const offsetIdx = filterValues.length + 2;

    const [rowsRes, countRes, unreadRes] = await Promise.all([
      this.query<RawNotificationRow>(
        `SELECT id, user_id, title, message, type, is_read, link_tab, link_request_id, created_at
         FROM public.notifications
         WHERE ${whereSql}
         ORDER BY created_at DESC, id DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...filterValues, params.limit, params.offset],
      ),
      this.query<{ total: number | string }>(
        `SELECT COUNT(*)::int AS total
         FROM public.notifications
         WHERE ${whereSql}`,
        filterValues,
      ),
      this.query<{ unread_count: number | string }>(
        `SELECT COUNT(*)::int AS unread_count
         FROM public.notifications
         WHERE user_id = $1 AND is_read = false`,
        [params.userId],
      ),
    ]);

    return {
      items: rowsRes.rows.map(mapNotificationRow),
      total: Number(countRes.rows[0]?.total ?? rowsRes.rows.length),
      unreadCount: Number(unreadRes.rows[0]?.unread_count ?? 0),
    };
  }

  public async createNotification(input: {
    userId: string;
    title: string;
    message: string;
    type: NotificationType;
    linkTab?: string | null;
    linkRequestId?: string | null;
  }): Promise<{ notification: NotificationRecord; created: boolean }> {
    const userRes = await this.query<{ id: string }>(
      `SELECT id FROM public.users WHERE id = $1 LIMIT 1`,
      [input.userId],
    );
    if (!userRes.rows[0]) {
      throw new NotificationTargetUserNotFoundError(
        'Notification target user does not exist.',
      );
    }

    if (input.linkRequestId) {
      const existingByReq = await this.query<RawNotificationRow>(
        `SELECT id, user_id, title, message, type, is_read, link_tab, link_request_id, created_at
         FROM public.notifications
         WHERE user_id = $1 AND type = $2 AND title = $3 AND link_request_id = $4
         ORDER BY created_at DESC
         LIMIT 1`,
        [input.userId, input.type, input.title, input.linkRequestId],
      );
      if (existingByReq.rows[0]) {
        return {
          notification: mapNotificationRow(existingByReq.rows[0]),
          created: false,
        };
      }
    } else {
      const existingRecent = await this.query<RawNotificationRow>(
        `SELECT id, user_id, title, message, type, is_read, link_tab, link_request_id, created_at
         FROM public.notifications
         WHERE user_id = $1
           AND type = $2
           AND title = $3
           AND message = $4
           AND created_at >= timezone('utc'::text, now()) - interval '15 seconds'
         ORDER BY created_at DESC
         LIMIT 1`,
        [input.userId, input.type, input.title, input.message],
      );
      if (existingRecent.rows[0]) {
        return {
          notification: mapNotificationRow(existingRecent.rows[0]),
          created: false,
        };
      }
    }

    const id = `notif_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const insertRes = await this.query<RawNotificationRow>(
      `INSERT INTO public.notifications (
         id, user_id, title, message, type, is_read, link_tab, link_request_id, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, false, $6, $7, timezone('utc'::text, now())
       )
       RETURNING id, user_id, title, message, type, is_read, link_tab, link_request_id, created_at`,
      [
        id,
        input.userId,
        input.title,
        input.message,
        input.type,
        input.linkTab ?? null,
        input.linkRequestId ?? null,
      ],
    );

    return {
      notification: mapNotificationRow(insertRes.rows[0]!),
      created: true,
    };
  }

  public async markNotificationRead(
    notificationId: string,
    actorUserId: string,
  ): Promise<NotificationRecord> {
    const existingRes = await this.query<{ id: string; user_id: string }>(
      `SELECT id, user_id
       FROM public.notifications
       WHERE id = $1
       LIMIT 1`,
      [notificationId],
    );

    const existing = existingRes.rows[0];
    if (!existing) {
      throw new NotificationNotFoundError('Notification not found.');
    }

    if (existing.user_id !== actorUserId) {
      throw new NotificationForbiddenError(
        'You can only mark your own notifications as read.',
      );
    }

    const updatedRes = await this.query<RawNotificationRow>(
      `UPDATE public.notifications
       SET is_read = true
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, title, message, type, is_read, link_tab, link_request_id, created_at`,
      [notificationId, actorUserId],
    );

    if (!updatedRes.rows[0]) {
      throw new NotificationNotFoundError('Notification not found.');
    }

    return mapNotificationRow(updatedRes.rows[0]);
  }

  public async markAllNotificationsRead(userId: string): Promise<number> {
    const res = await this.query(
      `UPDATE public.notifications
       SET is_read = true
       WHERE user_id = $1 AND is_read = false`,
      [userId],
    );
    return Number(res.rowCount ?? 0);
  }

  /**
   * Strictly enforces 1-to-1 device endpoint binding via atomic ON CONFLICT (endpoint) DO UPDATE.
   * Any prior user/role sharing the same browser push endpoint is overwritten immediately.
   */
  public async upsertPushSubscription(input: {
    userId: string;
    userEmail: string | null;
    userRole: AppUserRole;
    endpoint: string;
    p256dh: string;
    auth: string;
    expirationTime?: number | null;
    platform?: string | null;
    browser?: string | null;
  }): Promise<PushSubscriptionRecord> {
    const id = hashPushEndpointId(input.endpoint);
    const res = await this.query<RawPushSubscriptionRow>(
      `INSERT INTO public.push_subscriptions (
         id, endpoint, user_id, user_email, user_role, p256dh, auth, expiration_time, platform, browser, active, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, timezone('utc'::text, now()), timezone('utc'::text, now())
       )
       ON CONFLICT (endpoint) DO UPDATE SET
         id = EXCLUDED.id,
         user_id = EXCLUDED.user_id,
         user_email = EXCLUDED.user_email,
         user_role = EXCLUDED.user_role,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         expiration_time = EXCLUDED.expiration_time,
         platform = EXCLUDED.platform,
         browser = EXCLUDED.browser,
         active = true,
         created_at = CASE
           WHEN public.push_subscriptions.user_id = EXCLUDED.user_id
             THEN public.push_subscriptions.created_at
           ELSE EXCLUDED.created_at
         END,
         updated_at = timezone('utc'::text, now())
       RETURNING id, endpoint, user_id, user_email, user_role, p256dh, auth, expiration_time, platform, browser, active, created_at, updated_at`,
      [
        id,
        input.endpoint,
        input.userId,
        input.userEmail ? input.userEmail.trim().toLowerCase() : null,
        normalizeRole(input.userRole),
        input.p256dh,
        input.auth,
        input.expirationTime ?? null,
        input.platform ?? null,
        input.browser ?? null,
      ],
    );

    return mapPushSubscriptionRow(res.rows[0]!);
  }

  public async deactivatePushSubscriptions(input: {
    userId: string;
    endpoint?: string;
    revokeAllForUser?: boolean;
  }): Promise<number> {
    const cleanEndpoint = input.endpoint?.trim();
    if (cleanEndpoint) {
      const res = await this.query(
        `DELETE FROM public.push_subscriptions
         WHERE endpoint = $1 AND user_id = $2`,
        [cleanEndpoint, input.userId],
      );
      return Number(res.rowCount ?? 0);
    }

    if (input.revokeAllForUser) {
      const res = await this.query(
        `DELETE FROM public.push_subscriptions
         WHERE user_id = $1`,
        [input.userId],
      );
      return Number(res.rowCount ?? 0);
    }

    return 0;
  }

  public async getPushStatusForUser(
    userId: string,
    endpoint?: string,
  ): Promise<{
    linked: boolean;
    count: number;
    boundToCurrentUser: boolean;
  }> {
    const res = await this.query<{ id: string; endpoint: string }>(
      `SELECT id, endpoint
       FROM public.push_subscriptions
       WHERE user_id = $1 AND active = true
       ORDER BY updated_at DESC
       LIMIT 50`,
      [userId],
    );

    const count = res.rows.length;
    const cleanEndpoint = endpoint?.trim();
    const boundToCurrentUser = cleanEndpoint
      ? res.rows.some((row) => row.endpoint === cleanEndpoint)
      : count > 0;

    return {
      linked: count > 0,
      count,
      boundToCurrentUser,
    };
  }

  public async listActivePushTargets(criteria: {
    targetMode: 'staff' | 'user';
    targetUserId?: string;
    excludeSenderId?: string;
  }): Promise<PushSubscriptionRecord[]> {
    if (criteria.targetMode === 'staff') {
      const res = await this.query<RawPushSubscriptionRow>(
        `SELECT id, endpoint, user_id, user_email, user_role, p256dh, auth, expiration_time, platform, browser, active, created_at, updated_at
         FROM public.push_subscriptions
         WHERE active = true
           AND user_role IN ('agent', 'admin')
           AND ($1::text IS NULL OR user_id <> $1)
         ORDER BY updated_at DESC
         LIMIT 100`,
        [criteria.excludeSenderId ?? null],
      );
      return res.rows.map(mapPushSubscriptionRow);
    }

    if (!criteria.targetUserId) {
      return [];
    }

    const res = await this.query<RawPushSubscriptionRow>(
      `SELECT id, endpoint, user_id, user_email, user_role, p256dh, auth, expiration_time, platform, browser, active, created_at, updated_at
       FROM public.push_subscriptions
       WHERE active = true
         AND user_id = $1
         AND ($2::text IS NULL OR user_id <> $2)
       ORDER BY updated_at DESC
       LIMIT 50`,
      [criteria.targetUserId, criteria.excludeSenderId ?? null],
    );
    return res.rows.map(mapPushSubscriptionRow);
  }

  public async pruneExpiredEndpoints(endpoints: string[]): Promise<number> {
    const unique = Array.from(
      new Set(endpoints.map((ep) => ep.trim()).filter(Boolean)),
    );
    if (unique.length === 0) {
      return 0;
    }

    const res = await this.query(
      `DELETE FROM public.push_subscriptions
       WHERE endpoint = ANY($1::text[])`,
      [unique],
    );
    return Number(res.rowCount ?? 0);
  }
}
