import crypto from 'node:crypto';
import type { AppUserRole } from '../auth/userDirectoryRepo.js';
import type { DatabaseClient, DatabasePool } from '../db/pool.js';

export type PartnerPlatform = 'facebook' | 'instagram' | 'telegram';
export type OfficialPartnerSortField =
  | 'manual'
  | 'name'
  | 'platform'
  | 'updatedAt';
export type OfficialPartnerSortOrder = 'asc' | 'desc';

export interface OfficialPartnerRecord {
  id: string;
  name: string;
  iconUrl: string | null;
  platform: PartnerPlatform;
  pageUrl: string;
  messageLink: string | null;
  gameId: string | null;
  note: string | null;
  isVisible: boolean;
  sortOrder: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface OfficialPartnerIconRecord {
  id: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  imageData: Buffer;
  sizeBytes: number;
  createdBy: string | null;
  createdAt: string;
}

export interface ListOfficialPartnersOptions {
  includeHidden: boolean;
  platform?: PartnerPlatform;
  search?: string;
  sortBy: OfficialPartnerSortField;
  sortOrder: OfficialPartnerSortOrder;
  limit: number;
  offset: number;
}

export interface ListOfficialPartnersResult {
  items: OfficialPartnerRecord[];
  total: number;
}

export interface OfficialPartnerMutationActor {
  appUserId: string;
  displayName: string;
  role: AppUserRole;
}

export interface CreateOfficialPartnerInput {
  name: string;
  iconUrl: string | null;
  platform: PartnerPlatform;
  pageUrl: string;
  messageLink: string | null;
  gameId: string | null;
  note: string | null;
  isVisible: boolean;
}

export interface SaveOfficialPartnerIconInput {
  id: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  imageData: Buffer;
  sizeBytes: number;
  actorId: string;
}

export class OfficialPartnerNotFoundError extends Error {
  constructor(message = 'Official partner not found.') {
    super(message);
    this.name = 'OfficialPartnerNotFoundError';
  }
}

export class OfficialPartnerValidationError extends Error {
  constructor(message = 'Invalid official partner details.') {
    super(message);
    this.name = 'OfficialPartnerValidationError';
  }
}

interface RawOfficialPartnerRow {
  id: string;
  name: string;
  icon_url: string | null;
  platform: string;
  page_url: string;
  message_link: string | null;
  game_id: string | null;
  note: string | null;
  is_visible: boolean;
  sort_order: number | string;
  updated_by: string | null;
  updated_at: Date | string;
}

interface RawOfficialPartnerIconRow {
  id: string;
  content_type: string;
  image_data: Buffer | Uint8Array | string;
  size_bytes: number | string;
  created_by: string | null;
  created_at: Date | string;
}

interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

const PARTNER_SELECT_COLUMNS = `
  id,
  name,
  icon_url,
  platform,
  page_url,
  message_link,
  game_id,
  note,
  is_visible,
  sort_order,
  updated_by,
  updated_at
`;

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalizePlatform(raw: string): PartnerPlatform {
  if (raw === 'facebook' || raw === 'instagram' || raw === 'telegram') {
    return raw;
  }
  return 'facebook';
}

function mapPartnerRow(row: RawOfficialPartnerRow): OfficialPartnerRecord {
  return {
    id: String(row.id),
    name: String(row.name ?? '').trim(),
    iconUrl: row.icon_url ?? null,
    platform: normalizePlatform(String(row.platform)),
    pageUrl: String(row.page_url ?? ''),
    messageLink: row.message_link ?? null,
    gameId: row.game_id ?? null,
    note: row.note ?? null,
    isVisible: row.is_visible !== false,
    sortOrder: Number.isFinite(Number(row.sort_order))
      ? Number(row.sort_order)
      : 0,
    updatedBy: row.updated_by ?? null,
    updatedAt: toIsoString(row.updated_at),
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

async function writePartnerAuditLog(
  client: DatabaseClient,
  params: {
    actor: OfficialPartnerMutationActor;
    action:
      | 'PARTNER_CREATED'
      | 'PARTNER_UPDATED'
      | 'PARTNER_REORDERED'
      | 'PARTNER_DELETED';
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
      VALUES ($1, $2, $3, $4, $5, 'official_partner', $6, $7, $8)
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

export class OfficialPartnerRepo {
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
      query: (text, values) => this.pool.query(text, values),
      release: () => {},
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

  public async listPartners(
    options: ListOfficialPartnersOptions,
  ): Promise<ListOfficialPartnersResult> {
    const safeLimit = Math.min(Math.max(1, Math.trunc(options.limit)), 200);
    const safeOffset = Math.max(0, Math.trunc(options.offset));

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!options.includeHidden) {
      conditions.push('is_visible = true');
    }

    if (options.platform) {
      params.push(options.platform);
      conditions.push(`platform = $${params.length}`);
    }

    if (options.search) {
      params.push(`%${escapeIlikePattern(options.search)}%`);
      const p = `$${params.length}`;
      conditions.push(
        `(name ILIKE ${p} ESCAPE '\\' OR COALESCE(note, '') ILIKE ${p} ESCAPE '\\' OR page_url ILIKE ${p} ESCAPE '\\')`,
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await runQuery<{ total: number } & Record<string, unknown>>(
      this.pool,
      `SELECT COUNT(*)::int AS total FROM public.official_partners ${whereClause}`,
      params,
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const sortDir = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
    let orderClause = `sort_order ${sortDir}, name ASC, id ASC`;
    if (options.sortBy === 'name') {
      orderClause = `lower(name) ${sortDir}, sort_order ASC, id ASC`;
    } else if (options.sortBy === 'platform') {
      orderClause = `platform ${sortDir}, sort_order ASC, name ASC, id ASC`;
    } else if (options.sortBy === 'updatedAt') {
      orderClause = `updated_at ${sortDir}, sort_order ASC, id ASC`;
    }

    const listParams = [...params, safeLimit, safeOffset];
    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;

    const rowsRes = await runQuery<
      RawOfficialPartnerRow & Record<string, unknown>
    >(
      this.pool,
      `
        SELECT ${PARTNER_SELECT_COLUMNS}
        FROM public.official_partners
        ${whereClause}
        ORDER BY ${orderClause}
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      listParams,
    );

    return {
      items: rowsRes.rows.map(mapPartnerRow),
      total,
    };
  }

  public async findById(id: string): Promise<OfficialPartnerRecord | null> {
    const res = await runQuery<RawOfficialPartnerRow & Record<string, unknown>>(
      this.pool,
      `
        SELECT ${PARTNER_SELECT_COLUMNS}
        FROM public.official_partners
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );
    const row = res.rows[0];
    return row ? mapPartnerRow(row) : null;
  }

  public async createPartner(
    input: CreateOfficialPartnerInput,
    actor: OfficialPartnerMutationActor,
  ): Promise<OfficialPartnerRecord> {
    return this.withTransaction(async (client) => {
      const maxRes = await runQuery<
        { max_sort_order: number | string | null } & Record<string, unknown>
      >(
        client,
        `SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order FROM public.official_partners`,
        [],
      );
      const currentMax = Number(maxRes.rows[0]?.max_sort_order ?? -1);
      const nextSortOrder = Number.isFinite(currentMax) ? currentMax + 1 : 0;
      const nowIso = new Date().toISOString();
      const partnerId = crypto.randomUUID();

      const insertRes = await runQuery<
        RawOfficialPartnerRow & Record<string, unknown>
      >(
        client,
        `
          INSERT INTO public.official_partners (
            id,
            name,
            icon_url,
            platform,
            page_url,
            message_link,
            game_id,
            note,
            is_visible,
            sort_order,
            updated_by,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING ${PARTNER_SELECT_COLUMNS}
        `,
        [
          partnerId,
          input.name,
          input.iconUrl,
          input.platform,
          input.pageUrl,
          input.messageLink,
          input.gameId,
          input.note,
          input.isVisible,
          nextSortOrder,
          actor.appUserId,
          nowIso,
        ],
      );

      const createdRow = insertRes.rows[0];
      if (!createdRow) {
        throw new Error('Failed to create official partner.');
      }

      const partner = mapPartnerRow(createdRow);
      await writePartnerAuditLog(client, {
        actor,
        action: 'PARTNER_CREATED',
        entityId: partner.id,
        details: `Created official partner "${partner.name}" (${partner.platform}) with visibility=${partner.isVisible}.`,
        timestamp: nowIso,
      });

      return partner;
    });
  }

  public async updatePartnerWithResolver(
    id: string,
    resolveMerged: (existing: OfficialPartnerRecord) => CreateOfficialPartnerInput,
    actor: OfficialPartnerMutationActor,
  ): Promise<OfficialPartnerRecord> {
    return this.withTransaction(async (client) => {
      const existingRes = await runQuery<
        RawOfficialPartnerRow & Record<string, unknown>
      >(
        client,
        `
          SELECT ${PARTNER_SELECT_COLUMNS}
          FROM public.official_partners
          WHERE id = $1
          FOR UPDATE
        `,
        [id],
      );
      const existingRow = existingRes.rows[0];
      if (!existingRow) {
        throw new OfficialPartnerNotFoundError('Official partner not found.');
      }

      const existing = mapPartnerRow(existingRow);
      const nextValues = resolveMerged(existing);
      const nowIso = new Date().toISOString();

      const updateRes = await runQuery<
        RawOfficialPartnerRow & Record<string, unknown>
      >(
        client,
        `
          UPDATE public.official_partners
          SET
            name = $2,
            icon_url = $3,
            platform = $4,
            page_url = $5,
            message_link = $6,
            game_id = $7,
            note = $8,
            is_visible = $9,
            updated_by = $10,
            updated_at = $11
          WHERE id = $1
          RETURNING ${PARTNER_SELECT_COLUMNS}
        `,
        [
          id,
          nextValues.name,
          nextValues.iconUrl,
          nextValues.platform,
          nextValues.pageUrl,
          nextValues.messageLink,
          nextValues.gameId,
          nextValues.note,
          nextValues.isVisible,
          actor.appUserId,
          nowIso,
        ],
      );

      const updatedRow = updateRes.rows[0];
      if (!updatedRow) {
        throw new OfficialPartnerNotFoundError('Official partner not found.');
      }

      const partner = mapPartnerRow(updatedRow);
      await writePartnerAuditLog(client, {
        actor,
        action: 'PARTNER_UPDATED',
        entityId: partner.id,
        details: `Updated official partner "${partner.name}" (${partner.platform}, visible=${partner.isVisible}).`,
        timestamp: nowIso,
      });

      return partner;
    });
  }

  public async reorderPartners(
    orderedIds: string[],
    actor: OfficialPartnerMutationActor,
  ): Promise<OfficialPartnerRecord[]> {
    return this.withTransaction(async (client) => {
      const existingRes = await runQuery<
        { id: string } & Record<string, unknown>
      >(
        client,
        `
          SELECT id
          FROM public.official_partners
          WHERE id = ANY($1::uuid[])
          FOR UPDATE
        `,
        [orderedIds],
      );

      const existingSet = new Set(
        existingRes.rows.map((r) => String(r.id).toLowerCase()),
      );
      const missingId = orderedIds.find(
        (id) => !existingSet.has(id.toLowerCase()),
      );
      if (missingId) {
        throw new OfficialPartnerNotFoundError(
          `Official partner "${missingId}" not found.`,
        );
      }

      const nowIso = new Date().toISOString();
      for (let index = 0; index < orderedIds.length; index += 1) {
        const partnerId = orderedIds[index]!;
        await runQuery(
          client,
          `
            UPDATE public.official_partners
            SET
              sort_order = $2,
              updated_by = $3,
              updated_at = $4
            WHERE id = $1
          `,
          [partnerId, index, actor.appUserId, nowIso],
        );
      }

      const listRes = await runQuery<
        RawOfficialPartnerRow & Record<string, unknown>
      >(
        client,
        `
          SELECT ${PARTNER_SELECT_COLUMNS}
          FROM public.official_partners
          ORDER BY sort_order ASC, name ASC, id ASC
          LIMIT 200
        `,
        [],
      );

      await writePartnerAuditLog(client, {
        actor,
        action: 'PARTNER_REORDERED',
        entityId: orderedIds[0]!,
        details: `Reordered ${orderedIds.length} official partners.`,
        timestamp: nowIso,
      });

      return listRes.rows.map(mapPartnerRow);
    });
  }

  public async deletePartner(
    id: string,
    actor: OfficialPartnerMutationActor,
  ): Promise<OfficialPartnerRecord> {
    return this.withTransaction(async (client) => {
      const existingRes = await runQuery<
        RawOfficialPartnerRow & Record<string, unknown>
      >(
        client,
        `
          SELECT ${PARTNER_SELECT_COLUMNS}
          FROM public.official_partners
          WHERE id = $1
          FOR UPDATE
        `,
        [id],
      );

      const existingRow = existingRes.rows[0];
      if (!existingRow) {
        throw new OfficialPartnerNotFoundError('Official partner not found.');
      }

      await runQuery(
        client,
        `DELETE FROM public.official_partners WHERE id = $1`,
        [id],
      );

      const deleted = mapPartnerRow(existingRow);
      await writePartnerAuditLog(client, {
        actor,
        action: 'PARTNER_DELETED',
        entityId: deleted.id,
        details: `Deleted official partner "${deleted.name}" (${deleted.platform}).`,
        timestamp: new Date().toISOString(),
      });

      return deleted;
    });
  }

  public async saveIcon(input: SaveOfficialPartnerIconInput): Promise<void> {
    await runQuery(
      this.pool,
      `
        INSERT INTO public.official_partner_icons (
          id,
          content_type,
          image_data,
          size_bytes,
          created_by,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        input.id,
        input.contentType,
        input.imageData,
        input.sizeBytes,
        input.actorId,
        new Date().toISOString(),
      ],
    );
  }

  public async findIconById(
    id: string,
  ): Promise<OfficialPartnerIconRecord | null> {
    const res = await runQuery<
      RawOfficialPartnerIconRow & Record<string, unknown>
    >(
      this.pool,
      `
        SELECT id, content_type, image_data, size_bytes, created_by, created_at
        FROM public.official_partner_icons
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    const row = res.rows[0];
    if (!row) {
      return null;
    }

    const rawBytes = row.image_data;
    const buffer = Buffer.isBuffer(rawBytes)
      ? rawBytes
      : rawBytes instanceof Uint8Array
        ? Buffer.from(rawBytes)
        : Buffer.from(String(rawBytes), 'base64');

    const contentType =
      row.content_type === 'image/png' ||
      row.content_type === 'image/jpeg' ||
      row.content_type === 'image/webp'
        ? row.content_type
        : 'image/png';

    return {
      id: String(row.id),
      contentType,
      imageData: buffer,
      sizeBytes: Number(row.size_bytes ?? buffer.length),
      createdBy: row.created_by ?? null,
      createdAt: toIsoString(row.created_at),
    };
  }
}
