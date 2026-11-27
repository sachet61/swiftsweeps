import crypto from 'node:crypto';
import type { AppUserRole } from '../auth/userDirectoryRepo.js';
import type { DatabaseClient, DatabasePool } from '../db/pool.js';

export type GameAccountStatusValue =
  | 'active'
  | 'pending_assignment'
  | 'pending_reset'
  | 'suspended';

export type GameAccountRequestType =
  | 'new_id_request'
  | 'password_reset_request';

export type GameAccountSortField =
  | 'createdAt'
  | 'updatedAt'
  | 'gameName'
  | 'status';

export type GameAccountSortOrder = 'asc' | 'desc';

export interface GameAccountRecord {
  id: string;
  customerId: string;
  gameCatalogId: string;
  gameName: string;
  platformName: string;
  username: string;
  password: string;
  gameUrl: string;
  status: GameAccountStatusValue;
  balance: number;
  freePlayBalance: number;
  requestType: GameAccountRequestType | null;
  notes: string | null;
  assignedByAgentId: string | null;
  assignedByAgentName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListGameAccountsOptions {
  customerId?: string;
  customerIds?: string[];
  status?: GameAccountStatusValue;
  gameCatalogId?: string;
  search?: string;
  sortBy: GameAccountSortField;
  sortOrder: GameAccountSortOrder;
  limit: number;
  offset: number;
}

export interface ListGameAccountsResult {
  items: GameAccountRecord[];
  total: number;
}

export interface RequestNewGameIdInput {
  customerId: string;
  customerName: string;
  actorRole: AppUserRole;
  gameCatalogId: string;
  fallbackGameTitle?: string;
  fallbackPlatformName?: string;
}

export interface RequestPasswordResetInput {
  accountId: string;
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
}

export interface ProvisionGameAccountInput {
  customerId: string;
  gameCatalogId: string;
  fallbackGameTitle?: string;
  fallbackPlatformName?: string;
  username: string;
  password?: string;
  notes?: string | null;
  status?: 'active' | 'suspended';
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
}

export interface UpdateGameCredentialsInput {
  accountId: string;
  username: string;
  password?: string;
  notes?: string | null;
  status?: 'active' | 'suspended';
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
}

export interface DeleteGameAccountInput {
  accountId: string;
  actorId: string;
  actorName: string;
  actorRole: AppUserRole;
}

export class GameAccountNotFoundError extends Error {
  constructor(message = 'Game account not found.') {
    super(message);
    this.name = 'GameAccountNotFoundError';
  }
}

export class GameAccountCustomerNotFoundError extends Error {
  constructor(message = 'Customer account not found.') {
    super(message);
    this.name = 'GameAccountCustomerNotFoundError';
  }
}

export class GameAccountCatalogNotFoundError extends Error {
  constructor(message = 'Game title not found in active catalog.') {
    super(message);
    this.name = 'GameAccountCatalogNotFoundError';
  }
}

export class GameAccountForbiddenError extends Error {
  constructor(
    message = 'You do not have permission to access or modify this game account.',
  ) {
    super(message);
    this.name = 'GameAccountForbiddenError';
  }
}

export class GameAccountConflictError extends Error {
  constructor(message = 'Game account request conflicts with existing state.') {
    super(message);
    this.name = 'GameAccountConflictError';
  }
}

export class GameAccountValidationError extends Error {
  constructor(message = 'Invalid game account payload.') {
    super(message);
    this.name = 'GameAccountValidationError';
  }
}

interface RawGameAccountRow {
  id: string;
  customer_id: string;
  game_id: string;
  game_title: string;
  platform_name?: string | null;
  username: string;
  password: string;
  pin: string | null;
  status: string;
  balance?: string | number | null;
  free_play_balance?: string | number | null;
  request_type?: string | null;
  assigned_by_agent_id?: string | null;
  assigned_by_agent_name?: string | null;
  game_url?: string | null;
  catalog_category?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawGameCatalogLookupRow {
  id: string;
  title: string;
  category: string;
  is_active: boolean;
  game_url: string | null;
}

interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

const VALID_STATUSES = new Set<GameAccountStatusValue>([
  'active',
  'pending_assignment',
  'pending_reset',
  'suspended',
]);

const VALID_REQUEST_TYPES = new Set<GameAccountRequestType>([
  'new_id_request',
  'password_reset_request',
]);

const SORT_COLUMN_MAP: Record<GameAccountSortField, string> = {
  createdAt: 'ga.created_at',
  updatedAt: 'ga.updated_at',
  gameName: 'ga.game_title',
  status: 'ga.status',
};

const GAME_ACCOUNT_SELECT_COLUMNS = `
  ga.id,
  ga.customer_id,
  ga.game_id,
  ga.game_title,
  ga.platform_name,
  ga.username,
  ga.password,
  ga.pin,
  ga.status,
  ga.balance,
  ga.free_play_balance,
  ga.request_type,
  ga.assigned_by_agent_id,
  ga.assigned_by_agent_name,
  gc.game_url AS game_url,
  gc.category AS catalog_category,
  ga.created_at,
  ga.updated_at
`;

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toFixedMoneyNumber(value: string | number | null | undefined): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Number(num.toFixed(2));
}

function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function normalizeStatus(raw: unknown): GameAccountStatusValue {
  if (typeof raw === 'string' && VALID_STATUSES.has(raw as GameAccountStatusValue)) {
    return raw as GameAccountStatusValue;
  }
  return 'active';
}

function normalizeRequestType(raw: unknown): GameAccountRequestType | null {
  if (
    typeof raw === 'string' &&
    VALID_REQUEST_TYPES.has(raw as GameAccountRequestType)
  ) {
    return raw as GameAccountRequestType;
  }
  return null;
}

function mapGameAccountRow(row: RawGameAccountRow): GameAccountRecord {
  const platformName =
    (typeof row.platform_name === 'string' && row.platform_name.trim()) ||
    (typeof row.catalog_category === 'string' && row.catalog_category.trim()) ||
    'Sweepstakes';

  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    gameCatalogId: String(row.game_id),
    gameName: String(row.game_title),
    platformName,
    username: String(row.username ?? 'Pending Assignment'),
    password: String(row.password ?? ''),
    gameUrl: typeof row.game_url === 'string' ? row.game_url : '',
    status: normalizeStatus(row.status),
    balance: toFixedMoneyNumber(row.balance),
    freePlayBalance: toFixedMoneyNumber(row.free_play_balance),
    requestType: normalizeRequestType(row.request_type),
    notes: row.pin ?? null,
    assignedByAgentId: row.assigned_by_agent_id ?? null,
    assignedByAgentName: row.assigned_by_agent_name ?? null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function runQuery<T extends Record<string, unknown>>(
  executor: Pick<DatabaseClient, 'query'>,
  sql: string,
  params: unknown[],
): Promise<QueryResultLike<T>> {
  return (await executor.query(sql, params)) as QueryResultLike<T>;
}

async function writeGameAccountAuditLog(
  client: DatabaseClient,
  params: {
    actorId: string;
    actorName: string;
    actorRole: AppUserRole;
    action: string;
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
      VALUES ($1, $2, $3, $4, $5, 'game_account', $6, $7, $8)
    `,
    [
      auditId,
      params.actorId,
      params.actorName,
      params.actorRole,
      params.action,
      params.entityId,
      params.details,
      params.timestamp,
    ],
  );
}

async function resolveCatalogGame(
  client: DatabaseClient,
  options: {
    gameCatalogId: string;
    requireActive: boolean;
    fallbackGameTitle?: string;
    fallbackPlatformName?: string;
  },
): Promise<{
  id: string;
  title: string;
  platformName: string;
  gameUrl: string;
}> {
  const lookupRes = await runQuery<
    RawGameCatalogLookupRow & Record<string, unknown>
  >(
    client,
    `
      SELECT id, title, category, is_active, game_url
      FROM public.game_catalog
      WHERE id = $1
      LIMIT 1
    `,
    [options.gameCatalogId],
  );

  const row = lookupRes.rows[0];
  if (row) {
    if (options.requireActive && !row.is_active) {
      throw new GameAccountCatalogNotFoundError(
        'Selected game is not active in the catalog.',
      );
    }
    return {
      id: String(row.id),
      title: String(row.title),
      platformName: String(row.category || 'Sweepstakes'),
      gameUrl: typeof row.game_url === 'string' ? row.game_url : '',
    };
  }

  const populatedRes = await runQuery<{ populated: boolean } & Record<string, unknown>>(
    client,
    `SELECT EXISTS (SELECT 1 FROM public.game_catalog) AS populated`,
    [],
  );
  const catalogPopulated = Boolean(populatedRes.rows[0]?.populated);

  if (catalogPopulated) {
    throw new GameAccountCatalogNotFoundError(
      'Game title not found in active catalog.',
    );
  }

  const cleanFallbackTitle = options.fallbackGameTitle?.trim();
  if (!cleanFallbackTitle) {
    throw new GameAccountCatalogNotFoundError(
      'Game title not found in active catalog.',
    );
  }

  return {
    id: options.gameCatalogId,
    title: cleanFallbackTitle,
    platformName: options.fallbackPlatformName?.trim() || 'Sweepstakes',
    gameUrl: '',
  };
}

export class GameAccountRepo {
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

  public async findById(id: string): Promise<GameAccountRecord | null> {
    const res = await runQuery<RawGameAccountRow & Record<string, unknown>>(
      this.pool,
      `
        SELECT ${GAME_ACCOUNT_SELECT_COLUMNS}
        FROM public.game_accounts ga
        LEFT JOIN public.game_catalog gc ON gc.id = ga.game_id
        WHERE ga.id = $1
        LIMIT 1
      `,
      [id],
    );
    const row = res.rows[0];
    return row ? mapGameAccountRow(row) : null;
  }

  public async listGameAccounts(
    options: ListGameAccountsOptions,
  ): Promise<ListGameAccountsResult> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.customerId) {
      params.push(options.customerId);
      conditions.push(`ga.customer_id = $${params.length}`);
    } else if (options.customerIds && options.customerIds.length > 0) {
      params.push(options.customerIds);
      conditions.push(`ga.customer_id = ANY($${params.length}::text[])`);
    }

    if (options.status) {
      params.push(options.status);
      conditions.push(`ga.status = $${params.length}`);
    }

    if (options.gameCatalogId) {
      params.push(options.gameCatalogId);
      conditions.push(`ga.game_id = $${params.length}`);
    }

    if (options.search) {
      params.push(`%${escapeIlikePattern(options.search)}%`);
      const idx = params.length;
      conditions.push(
        `(ga.game_title ILIKE $${idx} ESCAPE '\\' OR ga.username ILIKE $${idx} ESCAPE '\\' OR ga.customer_id ILIKE $${idx} ESCAPE '\\' OR ga.id ILIKE $${idx} ESCAPE '\\')`,
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortColumn = SORT_COLUMN_MAP[options.sortBy] ?? 'ga.created_at';
    const sortDirection = options.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countRes = await runQuery<{ total: number } & Record<string, unknown>>(
      this.pool,
      `SELECT COUNT(*)::int AS total FROM public.game_accounts ga ${whereClause}`,
      params,
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const listParams = [...params, options.limit, options.offset];
    const limitParam = listParams.length - 1;
    const offsetParam = listParams.length;

    const listRes = await runQuery<RawGameAccountRow & Record<string, unknown>>(
      this.pool,
      `
        SELECT ${GAME_ACCOUNT_SELECT_COLUMNS}
        FROM public.game_accounts ga
        LEFT JOIN public.game_catalog gc ON gc.id = ga.game_id
        ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection}, ga.id ASC
        LIMIT $${limitParam}
        OFFSET $${offsetParam}
      `,
      listParams,
    );

    return {
      items: listRes.rows.map(mapGameAccountRow),
      total,
    };
  }

  public async requestNewGameId(
    input: RequestNewGameIdInput,
  ): Promise<{ account: GameAccountRecord; created: boolean }> {
    return this.withTransaction(async (client) => {
      // Lock the customer user row to serialize concurrent game ID requests per player
      const userLockRes = await runQuery<{ id: string } & Record<string, unknown>>(
        client,
        `SELECT id FROM public.users WHERE id = $1 FOR UPDATE`,
        [input.customerId],
      );
      if (!userLockRes.rows[0]) {
        throw new GameAccountCustomerNotFoundError('Customer account not found.');
      }

      const catalogGame = await resolveCatalogGame(client, {
        gameCatalogId: input.gameCatalogId,
        requireActive: true,
        fallbackGameTitle: input.fallbackGameTitle,
        fallbackPlatformName: input.fallbackPlatformName,
      });

      const existingRes = await runQuery<
        RawGameAccountRow & Record<string, unknown>
      >(
        client,
        `
          SELECT
            id,
            customer_id,
            game_id,
            game_title,
            platform_name,
            username,
            password,
            pin,
            status,
            balance,
            free_play_balance,
            request_type,
            assigned_by_agent_id,
            assigned_by_agent_name,
            created_at,
            updated_at
          FROM public.game_accounts
          WHERE customer_id = $1
            AND (game_id = $2 OR lower(btrim(game_title)) = lower(btrim($3)))
          FOR UPDATE
        `,
        [input.customerId, catalogGame.id, catalogGame.title],
      );

      const existing = existingRes.rows[0];
      if (existing) {
        const existingStatus = normalizeStatus(existing.status);
        if (existingStatus === 'active') {
          throw new GameAccountConflictError(
            `You already have active credentials for ${catalogGame.title} (Username: ${existing.username}). Only 1 ID per game is permitted.`,
          );
        }
        if (
          existingStatus === 'pending_assignment' ||
          existingStatus === 'pending_reset'
        ) {
          throw new GameAccountConflictError(
            `A request for ${catalogGame.title} is already queued for Customer Support.`,
          );
        }
        throw new GameAccountConflictError(
          `Your account for ${catalogGame.title} is currently suspended. Please contact Customer Support.`,
        );
      }

      const now = new Date().toISOString();
      const accountId = `ga_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const note = `Player ${input.customerName} requested new credentials.`;

      const insertRes = await runQuery<
        RawGameAccountRow & Record<string, unknown>
      >(
        client,
        `
          INSERT INTO public.game_accounts (
            id,
            customer_id,
            game_id,
            game_title,
            platform_name,
            username,
            password,
            pin,
            status,
            balance,
            free_play_balance,
            request_type,
            assigned_by_agent_id,
            assigned_by_agent_name,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, 'Pending Assignment', '', $6, 'pending_assignment', 0.00, 0.00, 'new_id_request', NULL, NULL, $7, $7)
          RETURNING *
        `,
        [
          accountId,
          input.customerId,
          catalogGame.id,
          catalogGame.title,
          catalogGame.platformName,
          note,
          now,
        ],
      );

      const createdRow = insertRes.rows[0];
      if (!createdRow) {
        throw new Error('Failed to insert game ID request.');
      }

      await writeGameAccountAuditLog(client, {
        actorId: input.customerId,
        actorName: input.customerName,
        actorRole: input.actorRole,
        action: 'GAME_ID_REQUESTED',
        entityId: accountId,
        details: `Player requested Game ID and password for ${catalogGame.title}. Forwarded to Customer Support.`,
        timestamp: now,
      });

      const mapped = mapGameAccountRow({
        ...createdRow,
        game_url: catalogGame.gameUrl,
        catalog_category: catalogGame.platformName,
      });

      return { account: mapped, created: true };
    });
  }

  public async requestPasswordReset(
    input: RequestPasswordResetInput,
  ): Promise<GameAccountRecord> {
    return this.withTransaction(async (client) => {
      const existingRes = await runQuery<
        RawGameAccountRow & Record<string, unknown>
      >(
        client,
        `
          SELECT *
          FROM public.game_accounts
          WHERE id = $1
          FOR UPDATE
        `,
        [input.accountId],
      );

      const existing = existingRes.rows[0];
      if (!existing) {
        throw new GameAccountNotFoundError('Game account not found.');
      }

      const isStaff =
        input.actorRole === 'admin' || input.actorRole === 'agent';
      if (!isStaff && existing.customer_id !== input.actorId) {
        throw new GameAccountForbiddenError(
          'You can only request a password reset for your own gaming IDs.',
        );
      }

      const currentStatus = normalizeStatus(existing.status);
      if (currentStatus === 'pending_reset') {
        throw new GameAccountConflictError(
          `A password reset request for ${existing.game_title} is already queued for Customer Support.`,
        );
      }
      if (currentStatus !== 'active') {
        throw new GameAccountConflictError(
          'Only active gaming IDs can request a password reset.',
        );
      }

      const now = new Date().toISOString();
      const updateRes = await runQuery<
        RawGameAccountRow & Record<string, unknown>
      >(
        client,
        `
          UPDATE public.game_accounts
          SET
            status = 'pending_reset',
            request_type = 'password_reset_request',
            updated_at = $2
          WHERE id = $1
          RETURNING *
        `,
        [input.accountId, now],
      );

      const updatedRow = updateRes.rows[0];
      if (!updatedRow) {
        throw new GameAccountNotFoundError('Game account not found.');
      }

      await writeGameAccountAuditLog(client, {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: 'GAME_PASSWORD_RESET_REQUESTED',
        entityId: updatedRow.id,
        details: `Player requested credential reset for ${updatedRow.game_title} (Username: ${updatedRow.username}). Forwarded to Customer Support.`,
        timestamp: now,
      });

      const catalogRes = await runQuery<
        { game_url: string | null; category: string | null } & Record<
          string,
          unknown
        >
      >(
        client,
        `SELECT game_url, category FROM public.game_catalog WHERE id = $1 LIMIT 1`,
        [updatedRow.game_id],
      );

      return mapGameAccountRow({
        ...updatedRow,
        game_url: catalogRes.rows[0]?.game_url ?? null,
        catalog_category: catalogRes.rows[0]?.category ?? null,
      });
    });
  }

  public async provisionGameAccount(
    input: ProvisionGameAccountInput,
  ): Promise<{ account: GameAccountRecord; created: boolean }> {
    return this.withTransaction(async (client) => {
      const userLockRes = await runQuery<{ id: string } & Record<string, unknown>>(
        client,
        `SELECT id FROM public.users WHERE id = $1 FOR UPDATE`,
        [input.customerId],
      );
      if (!userLockRes.rows[0]) {
        throw new GameAccountCustomerNotFoundError('Customer account not found.');
      }

      const catalogGame = await resolveCatalogGame(client, {
        gameCatalogId: input.gameCatalogId,
        requireActive: false,
        fallbackGameTitle: input.fallbackGameTitle,
        fallbackPlatformName: input.fallbackPlatformName,
      });

      const existingRes = await runQuery<
        RawGameAccountRow & Record<string, unknown>
      >(
        client,
        `
          SELECT *
          FROM public.game_accounts
          WHERE customer_id = $1
            AND (game_id = $2 OR lower(btrim(game_title)) = lower(btrim($3)))
          FOR UPDATE
        `,
        [input.customerId, catalogGame.id, catalogGame.title],
      );

      const now = new Date().toISOString();
      const targetStatus = input.status ?? 'active';
      const existing = existingRes.rows[0];

      if (existing) {
        const nextPassword =
          input.password !== undefined && input.password.length > 0
            ? input.password
            : existing.password;
        if (!nextPassword) {
          throw new GameAccountValidationError(
            'Password is required when activating game credentials.',
          );
        }
        const nextPin =
          input.notes !== undefined ? input.notes : existing.pin;

        const updateRes = await runQuery<
          RawGameAccountRow & Record<string, unknown>
        >(
          client,
          `
            UPDATE public.game_accounts
            SET
              game_id = $2,
              game_title = $3,
              platform_name = $4,
              username = $5,
              password = $6,
              pin = $7,
              status = $8,
              request_type = NULL,
              assigned_by_agent_id = $9,
              assigned_by_agent_name = $10,
              updated_at = $11
            WHERE id = $1
            RETURNING *
          `,
          [
            existing.id,
            catalogGame.id,
            catalogGame.title,
            catalogGame.platformName,
            input.username,
            nextPassword,
            nextPin,
            targetStatus,
            input.actorId,
            input.actorName,
            now,
          ],
        );

        const updatedRow = updateRes.rows[0];
        if (!updatedRow) {
          throw new Error('Failed to update existing game account.');
        }

        await writeGameAccountAuditLog(client, {
          actorId: input.actorId,
          actorName: input.actorName,
          actorRole: input.actorRole,
          action: 'GAME_CREDENTIALS_ASSIGNED',
          entityId: updatedRow.id,
          details: `Updated credentials for ${catalogGame.title} (Username: ${input.username}) for customer ${input.customerId}. Enforced 1 ID per game rule.`,
          timestamp: now,
        });

        return {
          account: mapGameAccountRow({
            ...updatedRow,
            game_url: catalogGame.gameUrl,
            catalog_category: catalogGame.platformName,
          }),
          created: false,
        };
      }

      if (!input.password || input.password.length === 0) {
        throw new GameAccountValidationError(
          'Password is required when provisioning a new game account.',
        );
      }

      const accountId = `ga_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const insertRes = await runQuery<
        RawGameAccountRow & Record<string, unknown>
      >(
        client,
        `
          INSERT INTO public.game_accounts (
            id,
            customer_id,
            game_id,
            game_title,
            platform_name,
            username,
            password,
            pin,
            status,
            balance,
            free_play_balance,
            request_type,
            assigned_by_agent_id,
            assigned_by_agent_name,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0.00, 0.00, NULL, $10, $11, $12, $12)
          RETURNING *
        `,
        [
          accountId,
          input.customerId,
          catalogGame.id,
          catalogGame.title,
          catalogGame.platformName,
          input.username,
          input.password,
          input.notes ?? null,
          targetStatus,
          input.actorId,
          input.actorName,
          now,
        ],
      );

      const createdRow = insertRes.rows[0];
      if (!createdRow) {
        throw new Error('Failed to provision game account.');
      }

      await writeGameAccountAuditLog(client, {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: 'GAME_CREDENTIALS_DIRECT_PROVISION',
        entityId: createdRow.id,
        details: `Provisioned credentials for ${catalogGame.title} (Username: ${input.username}) for customer ${input.customerId}.`,
        timestamp: now,
      });

      return {
        account: mapGameAccountRow({
          ...createdRow,
          game_url: catalogGame.gameUrl,
          catalog_category: catalogGame.platformName,
        }),
        created: true,
      };
    });
  }

  public async updateCredentials(
    input: UpdateGameCredentialsInput,
  ): Promise<GameAccountRecord> {
    return this.withTransaction(async (client) => {
      const existingRes = await runQuery<
        RawGameAccountRow & Record<string, unknown>
      >(
        client,
        `
          SELECT *
          FROM public.game_accounts
          WHERE id = $1
          FOR UPDATE
        `,
        [input.accountId],
      );

      const existing = existingRes.rows[0];
      if (!existing) {
        throw new GameAccountNotFoundError('Game account not found.');
      }

      const nextPassword =
        input.password !== undefined && input.password.length > 0
          ? input.password
          : existing.password;
      if (!nextPassword) {
        throw new GameAccountValidationError(
          'Password is required when activating game credentials.',
        );
      }

      const nextPin = input.notes !== undefined ? input.notes : existing.pin;
      const nextStatus = input.status ?? 'active';
      const now = new Date().toISOString();

      const updateRes = await runQuery<
        RawGameAccountRow & Record<string, unknown>
      >(
        client,
        `
          UPDATE public.game_accounts
          SET
            username = $2,
            password = $3,
            pin = $4,
            status = $5,
            request_type = NULL,
            assigned_by_agent_id = $6,
            assigned_by_agent_name = $7,
            updated_at = $8
          WHERE id = $1
          RETURNING *
        `,
        [
          input.accountId,
          input.username,
          nextPassword,
          nextPin,
          nextStatus,
          input.actorId,
          input.actorName,
          now,
        ],
      );

      const updatedRow = updateRes.rows[0];
      if (!updatedRow) {
        throw new GameAccountNotFoundError('Game account not found.');
      }

      await writeGameAccountAuditLog(client, {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: 'GAME_CREDENTIALS_ASSIGNED',
        entityId: updatedRow.id,
        details: `Staff ${input.actorName} configured credentials for ${updatedRow.game_title} (Username: ${input.username}). Single ID per game enforced.`,
        timestamp: now,
      });

      const catalogRes = await runQuery<
        { game_url: string | null; category: string | null } & Record<
          string,
          unknown
        >
      >(
        client,
        `SELECT game_url, category FROM public.game_catalog WHERE id = $1 LIMIT 1`,
        [updatedRow.game_id],
      );

      return mapGameAccountRow({
        ...updatedRow,
        game_url: catalogRes.rows[0]?.game_url ?? null,
        catalog_category: catalogRes.rows[0]?.category ?? null,
      });
    });
  }

  public async deleteGameAccount(
    input: DeleteGameAccountInput,
  ): Promise<GameAccountRecord> {
    return this.withTransaction(async (client) => {
      const existingRes = await runQuery<
        RawGameAccountRow & Record<string, unknown>
      >(
        client,
        `
          SELECT *
          FROM public.game_accounts
          WHERE id = $1
          FOR UPDATE
        `,
        [input.accountId],
      );

      const existing = existingRes.rows[0];
      if (!existing) {
        throw new GameAccountNotFoundError('Game account not found.');
      }

      await runQuery(
        client,
        `DELETE FROM public.game_accounts WHERE id = $1`,
        [input.accountId],
      );

      const now = new Date().toISOString();
      const snapshotBalance = toFixedMoneyNumber(existing.balance);
      await writeGameAccountAuditLog(client, {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: 'GAME_ACCOUNT_DELETED',
        entityId: existing.id,
        details: `Deleted game account ID "${existing.username}" for game "${existing.game_title}" (Customer: ${existing.customer_id}, Balance snapshot: $${snapshotBalance.toFixed(2)}).`,
        timestamp: now,
      });

      return mapGameAccountRow(existing);
    });
  }
}
