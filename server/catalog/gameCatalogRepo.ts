import type { DatabasePool } from '../db/pool.js';

export interface GameCatalogLinkRecord {
  label: string;
  url: string;
}

export interface GameCatalogRecord {
  id: string;
  title: string;
  platform: string;
  description: string;
  minLoad: number;
  bonusPct: number;
  enabled: boolean;
  iconUrl: string | null;
  imageUrl: string | null;
  gameUrl: string | null;
  downloadUrl: string | null;
  links: GameCatalogLinkRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertGameCatalogInput {
  id: string;
  title: string;
  platform: string;
  description: string | null;
  minLoad: number;
  bonusPct: number;
  enabled: boolean;
  iconUrl: string | null;
  imageUrl: string | null;
  gameUrl: string | null;
  downloadUrl: string | null;
  links: GameCatalogLinkRecord[];
  createdAt?: string;
}

export type GameCatalogSortField =
  | 'createdAt'
  | 'title'
  | 'category'
  | 'updatedAt';

export type GameCatalogSortOrder = 'asc' | 'desc';

export interface ListGameCatalogOptions {
  includeDisabled: boolean;
  category?: string;
  search?: string;
  sortBy: GameCatalogSortField;
  sortOrder: GameCatalogSortOrder;
  limit: number;
  offset: number;
}

export interface ListGameCatalogResult {
  items: GameCatalogRecord[];
  total: number;
  catalogPopulated: boolean;
}

interface RawGameCatalogRow {
  id: string;
  title: string;
  category: string;
  description: string | null;
  min_load: string | number;
  bonus_pct: string | number;
  is_active: boolean;
  icon_url: string | null;
  image_url: string | null;
  game_url: string | null;
  download_url: string | null;
  links: unknown;
  created_at: Date | string;
  updated_at: Date | string;
  was_inserted?: boolean;
}

interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

const SORT_COLUMN_MAP: Record<GameCatalogSortField, string> = {
  createdAt: 'created_at',
  title: 'title',
  category: 'category',
  updatedAt: 'updated_at',
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function parseLinks(raw: unknown): GameCatalogLinkRecord[] {
  let source = raw;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(source)) {
    return [];
  }
  const result: GameCatalogLinkRecord[] = [];
  for (const entry of source) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { label?: unknown }).label === 'string' &&
      typeof (entry as { url?: unknown }).url === 'string'
    ) {
      const label = (entry as { label: string }).label.trim();
      const url = (entry as { url: string }).url.trim();
      if (label && url) {
        result.push({ label, url });
      }
    }
  }
  return result;
}

function mapGameCatalogRow(row: RawGameCatalogRow): GameCatalogRecord {
  const parsedLinks = parseLinks(row.links);
  const gameUrl = row.game_url ?? parsedLinks[0]?.url ?? null;
  const downloadUrl =
    row.download_url ??
    parsedLinks.find((l) => l.label.toLowerCase().includes('download'))?.url ??
    parsedLinks[1]?.url ??
    gameUrl;

  return {
    id: String(row.id),
    title: String(row.title),
    platform: String(row.category || 'General'),
    description: row.description ?? '',
    minLoad: Number(row.min_load ?? 5),
    bonusPct: Number(row.bonus_pct ?? 0),
    enabled: row.is_active !== false,
    iconUrl: row.icon_url ?? row.image_url ?? null,
    imageUrl: row.image_url ?? row.icon_url ?? null,
    gameUrl,
    downloadUrl,
    links: parsedLinks,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export class GameCatalogRepo {
  constructor(private readonly pool: Pick<DatabasePool, 'query'>) {}

  private async query<T = Record<string, unknown>>(
    sql: string,
    values: unknown[] = [],
  ): Promise<QueryResultLike<T>> {
    return (await this.pool.query(sql, values)) as QueryResultLike<T>;
  }

  public async listGames(
    options: ListGameCatalogOptions,
  ): Promise<ListGameCatalogResult> {
    const safeLimit = Math.min(Math.max(1, Math.trunc(options.limit)), 100);
    const safeOffset = Math.max(0, Math.trunc(options.offset));

    const populatedRes = await this.query<{ populated: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM public.game_catalog) AS populated`,
    );
    const catalogPopulated = Boolean(populatedRes.rows[0]?.populated);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!options.includeDisabled) {
      conditions.push('is_active = true');
    }

    if (options.category) {
      params.push(options.category);
      conditions.push(`lower(category) = lower($${params.length})`);
    }

    if (options.search) {
      params.push(`%${escapeIlikePattern(options.search)}%`);
      const p = `$${params.length}`;
      conditions.push(
        `(title ILIKE ${p} ESCAPE '\\' OR category ILIKE ${p} ESCAPE '\\' OR COALESCE(description, '') ILIKE ${p} ESCAPE '\\')`,
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.query<{ total: string | number }>(
      `SELECT COUNT(*)::int AS total FROM public.game_catalog ${whereClause}`,
      params,
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const sortColumn = SORT_COLUMN_MAP[options.sortBy] ?? 'created_at';
    const sortDir = options.sortOrder === 'desc' ? 'DESC' : 'ASC';

    const listParams = [...params, safeLimit, safeOffset];
    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;

    const rowsRes = await this.query<RawGameCatalogRow>(
      `
      SELECT
        id,
        title,
        category,
        description,
        min_load,
        bonus_pct,
        is_active,
        icon_url,
        image_url,
        game_url,
        download_url,
        links,
        created_at,
        updated_at
      FROM public.game_catalog
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDir}, id ASC
      LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      listParams,
    );

    return {
      items: rowsRes.rows.map(mapGameCatalogRow),
      total,
      catalogPopulated,
    };
  }

  public async findById(id: string): Promise<GameCatalogRecord | null> {
    const res = await this.query<RawGameCatalogRow>(
      `
      SELECT
        id,
        title,
        category,
        description,
        min_load,
        bonus_pct,
        is_active,
        icon_url,
        image_url,
        game_url,
        download_url,
        links,
        created_at,
        updated_at
      FROM public.game_catalog
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    const row = res.rows[0];
    return row ? mapGameCatalogRow(row) : null;
  }

  public async upsertGame(
    input: UpsertGameCatalogInput,
  ): Promise<{ item: GameCatalogRecord; created: boolean }> {
    const res = await this.query<RawGameCatalogRow>(
      `
      INSERT INTO public.game_catalog (
        id,
        title,
        category,
        description,
        min_load,
        bonus_pct,
        is_active,
        icon_url,
        image_url,
        game_url,
        download_url,
        links,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12::jsonb,
        COALESCE($13::timestamptz, timezone('utc'::text, now())),
        timezone('utc'::text, now())
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        min_load = EXCLUDED.min_load,
        bonus_pct = EXCLUDED.bonus_pct,
        is_active = EXCLUDED.is_active,
        icon_url = EXCLUDED.icon_url,
        image_url = EXCLUDED.image_url,
        game_url = EXCLUDED.game_url,
        download_url = EXCLUDED.download_url,
        links = EXCLUDED.links,
        updated_at = timezone('utc'::text, now())
      RETURNING
        id,
        title,
        category,
        description,
        min_load,
        bonus_pct,
        is_active,
        icon_url,
        image_url,
        game_url,
        download_url,
        links,
        created_at,
        updated_at,
        (xmax = 0) AS was_inserted
      `,
      [
        input.id,
        input.title,
        input.platform,
        input.description,
        input.minLoad,
        input.bonusPct,
        input.enabled,
        input.iconUrl,
        input.imageUrl,
        input.gameUrl,
        input.downloadUrl,
        JSON.stringify(input.links),
        input.createdAt ?? null,
      ],
    );

    const row = res.rows[0];
    if (!row) {
      throw new Error('Failed to persist game catalog entry.');
    }
    return {
      item: mapGameCatalogRow(row),
      created: Boolean(row.was_inserted),
    };
  }

  public async upsertConfigBatch(
    inputs: UpsertGameCatalogInput[],
  ): Promise<GameCatalogRecord[]> {
    if (inputs.length === 0) {
      return [];
    }

    const valuesSql: string[] = [];
    const params: unknown[] = [];

    for (const input of inputs) {
      const base = params.length;
      params.push(
        input.id,
        input.title,
        input.platform,
        input.description,
        input.minLoad,
        input.bonusPct,
        input.enabled,
        input.iconUrl,
        input.imageUrl,
        input.gameUrl,
        input.downloadUrl,
        JSON.stringify(input.links),
        input.createdAt ?? null,
      );
      valuesSql.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}::jsonb, COALESCE($${base + 13}::timestamptz, timezone('utc'::text, now())), timezone('utc'::text, now()))`,
      );
    }

    const res = await this.query<RawGameCatalogRow>(
      `
      INSERT INTO public.game_catalog (
        id,
        title,
        category,
        description,
        min_load,
        bonus_pct,
        is_active,
        icon_url,
        image_url,
        game_url,
        download_url,
        links,
        created_at,
        updated_at
      )
      VALUES ${valuesSql.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        min_load = EXCLUDED.min_load,
        bonus_pct = EXCLUDED.bonus_pct,
        is_active = EXCLUDED.is_active,
        icon_url = EXCLUDED.icon_url,
        image_url = EXCLUDED.image_url,
        game_url = EXCLUDED.game_url,
        download_url = EXCLUDED.download_url,
        links = EXCLUDED.links,
        updated_at = timezone('utc'::text, now())
      RETURNING
        id,
        title,
        category,
        description,
        min_load,
        bonus_pct,
        is_active,
        icon_url,
        image_url,
        game_url,
        download_url,
        links,
        created_at,
        updated_at
      `,
      params,
    );

    return res.rows.map(mapGameCatalogRow);
  }

  public async deleteGame(id: string): Promise<GameCatalogRecord | null> {
    const res = await this.query<RawGameCatalogRow>(
      `
      DELETE FROM public.game_catalog
      WHERE id = $1
      RETURNING
        id,
        title,
        category,
        description,
        min_load,
        bonus_pct,
        is_active,
        icon_url,
        image_url,
        game_url,
        download_url,
        links,
        created_at,
        updated_at
      `,
      [id],
    );

    const row = res.rows[0];
    return row ? mapGameCatalogRow(row) : null;
  }
}
