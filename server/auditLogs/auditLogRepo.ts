import crypto from 'node:crypto';
import type { DatabaseClient, DatabasePool } from '../db/pool.js';

export type AuditActorRole = 'customer' | 'agent' | 'admin' | 'system';

export const ALLOWED_AUDIT_ENTITY_TYPES = new Set([
  'topup',
  'withdrawal',
  'wallet',
  'game_account',
  'settings',
  'user',
  'chat',
  'auth',
  'official_partner',
  'referral',
  'conversation',
  'system',
]);

export interface AuditLogRecord {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: AuditActorRole;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  timestamp: string;
}

export interface ListAuditLogsOptions {
  limit: number;
  entityType?: string;
  search?: string;
  fromIso?: string;
  toIso?: string;
  beforeTimestamp?: string;
}

export interface ListAuditLogsResult {
  logs: AuditLogRecord[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface CreateAuditLogInput {
  actorId: string;
  actorName: string;
  actorRole: AuditActorRole;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
}

interface RawAuditLogRow {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  timestamp: Date | string;
}

interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

const AUDIT_LOG_SELECT_COLUMNS = `
  id,
  actor_id,
  actor_name,
  actor_role,
  action,
  entity_type,
  entity_id,
  details,
  timestamp
`;

function toIsoString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString()
    : new Date().toISOString();
}

function normalizeActorRole(raw: unknown): AuditActorRole {
  const normalized = String(raw ?? 'customer')
    .trim()
    .toLowerCase();
  if (
    normalized === 'admin' ||
    normalized === 'agent' ||
    normalized === 'customer' ||
    normalized === 'system'
  ) {
    return normalized;
  }
  return 'customer';
}

function mapAuditLogRow(row: RawAuditLogRow): AuditLogRecord {
  return {
    id: String(row.id ?? ''),
    actorId: String(row.actor_id ?? 'system'),
    actorName: String(row.actor_name ?? 'System'),
    actorRole: normalizeActorRole(row.actor_role),
    action: String(row.action ?? 'UNKNOWN_ACTION'),
    entityType: String(row.entity_type ?? 'settings'),
    entityId: String(row.entity_id ?? ''),
    details: String(row.details ?? ''),
    timestamp: toIsoString(row.timestamp),
  };
}

function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

async function runQuery<T extends Record<string, unknown>>(
  executor: Pick<DatabaseClient, 'query'>,
  sql: string,
  params: unknown[],
): Promise<QueryResultLike<T>> {
  return (await executor.query(sql, params)) as QueryResultLike<T>;
}

export class AuditLogRepo {
  private readonly pool: Pick<DatabasePool, 'query'>;

  constructor(pool: Pick<DatabasePool, 'query'>) {
    this.pool = pool;
  }

  public async listAuditLogs(
    options: ListAuditLogsOptions,
  ): Promise<ListAuditLogsResult> {
    const safeLimit = Math.min(Math.max(1, Math.trunc(options.limit)), 500);
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (
      options.entityType &&
      options.entityType !== 'all' &&
      ALLOWED_AUDIT_ENTITY_TYPES.has(options.entityType)
    ) {
      values.push(options.entityType);
      clauses.push(`entity_type = $${values.length}`);
    }

    if (options.beforeTimestamp) {
      values.push(options.beforeTimestamp);
      clauses.push(`timestamp < $${values.length}`);
    }

    if (options.fromIso) {
      values.push(options.fromIso);
      clauses.push(`timestamp >= $${values.length}`);
    }

    if (options.toIso) {
      values.push(options.toIso);
      clauses.push(`timestamp <= $${values.length}`);
    }

    if (options.search) {
      values.push(`%${escapeIlikePattern(options.search)}%`);
      const p = `$${values.length}`;
      clauses.push(
        `(action ILIKE ${p} ESCAPE '\\' OR actor_name ILIKE ${p} ESCAPE '\\' OR entity_id ILIKE ${p} ESCAPE '\\' OR COALESCE(details, '') ILIKE ${p} ESCAPE '\\')`,
      );
    }

    const whereSql =
      clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    values.push(safeLimit + 1);
    const limitParam = `$${values.length}`;

    const res = await runQuery<RawAuditLogRow & Record<string, unknown>>(
      this.pool,
      `
        SELECT ${AUDIT_LOG_SELECT_COLUMNS}
        FROM public.audit_logs
        ${whereSql}
        ORDER BY timestamp DESC, id DESC
        LIMIT ${limitParam}
      `,
      values,
    );

    const rows = Array.isArray(res.rows) ? res.rows : [];
    const hasMore = rows.length > safeLimit;
    const sliced = hasMore ? rows.slice(0, safeLimit) : rows;
    const logs = sliced.map(mapAuditLogRow);
    const nextCursor =
      logs.length > 0 ? logs[logs.length - 1]!.timestamp : null;

    return {
      logs,
      hasMore,
      nextCursor,
    };
  }

  public async createAuditLog(
    input: CreateAuditLogInput,
  ): Promise<AuditLogRecord> {
    const id = `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const nowIso = new Date().toISOString();

    const res = await runQuery<RawAuditLogRow & Record<string, unknown>>(
      this.pool,
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING ${AUDIT_LOG_SELECT_COLUMNS}
      `,
      [
        id,
        input.actorId,
        input.actorName,
        input.actorRole,
        input.action,
        input.entityType,
        input.entityId,
        input.details,
        nowIso,
      ],
    );

    const inserted = res.rows[0];
    if (!inserted) {
      throw new Error('Audit log insert did not return a created record.');
    }

    return mapAuditLogRow(inserted);
  }
}
