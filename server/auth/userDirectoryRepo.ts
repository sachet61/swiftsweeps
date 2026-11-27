import crypto from 'node:crypto';
import type { DatabaseClient, DatabasePool } from '../db/pool.js';

export type AppUserRole = 'customer' | 'agent' | 'admin';
export type AppUserStatus = 'active' | 'suspended' | 'pending';
export type AuthMigrationSource =
  | 'supabase_import'
  | 'self_hosted_signup'
  | 'admin_provisioned';
export type AdminUserSortField =
  | 'createdAt'
  | 'updatedAt'
  | 'displayName'
  | 'email'
  | 'role'
  | 'status';
export type AdminUserSortOrder = 'asc' | 'desc';

export interface ResolvedAppUser {
  appUserId: string;
  authUserId: string | null;
  email: string;
  displayName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: AppUserRole;
  status: AppUserStatus;
  emailVerified: boolean;
  referralCode: string | null;
  referredBy: string | null;
  passwordResetRequired: boolean;
  isParentAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogInput {
  actorId: string;
  actorName: string;
  actorRole: AppUserRole | 'system';
  action: string;
  entityType: string;
  entityId: string;
  details: string;
}

export interface EnsureUserForSignupInput {
  authUserId: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

export interface AdminProvisionUserInput {
  appUserId: string;
  authUserId: string;
  email: string;
  displayName: string;
  role: AppUserRole;
  phone?: string;
  emailVerified: boolean;
  passwordResetRequired: boolean;
}

export const PROTECTED_PARENT_ADMIN_EMAILS = new Set(['sachet61@gmail.com']);
export const PROTECTED_PARENT_ADMIN_IDS = new Set([
  'usr_admin_master',
  'usr_admin_1',
]);

export function isParentAdminUser(user: {
  id?: string | null;
  email?: string | null;
}): boolean {
  const cleanEmail = (user.email ?? '').trim().toLowerCase();
  const cleanId = (user.id ?? '').trim();
  return (
    PROTECTED_PARENT_ADMIN_EMAILS.has(cleanEmail) ||
    PROTECTED_PARENT_ADMIN_IDS.has(cleanId)
  );
}

export interface AdminUserWalletSummary {
  customerId: string;
  currency: string;
  availableBalance: number;
  referralBonusBalance: number;
  freePlayBalance: number;
  reservedBalance: number;
  pendingDepositBalance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  lastUpdatedAt: string;
}

export interface AdminUserGameAccountSummary {
  id: string;
  customerId: string;
  gameCatalogId: string;
  gameName: string;
  platformName: string;
  username: string;
  password: string;
  status: string;
  balance: number;
  freePlayBalance: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDirectoryUserRecord extends ResolvedAppUser {
  lastLoginAt: string;
  wallet: AdminUserWalletSummary;
  gameAccounts: AdminUserGameAccountSummary[];
  gameAccountsCount: number;
}

export interface ListAdminDirectoryUsersOptions {
  search?: string;
  role?: AppUserRole;
  status?: AppUserStatus;
  sortBy: AdminUserSortField;
  sortOrder: AdminUserSortOrder;
  limit: number;
  offset: number;
}

export interface ListAdminDirectoryUsersResult {
  users: AdminDirectoryUserRecord[];
  total: number;
}

export class AdminUserNotFoundError extends Error {
  constructor(message = 'User not found.') {
    super(message);
    this.name = 'AdminUserNotFoundError';
  }
}

export class AdminUserForbiddenError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AdminUserForbiddenError';
    this.code = code;
  }
}

interface JoinedUserRow {
  app_user_id: string;
  auth_user_id: string | null;
  email: string;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  status: string;
  email_verified: boolean;
  referral_code: string | null;
  referred_by: string | null;
  password_reset_required: boolean | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawWalletSummaryRow {
  customer_id: string;
  balance: string | number;
  referral_bonus_balance: string | number;
  free_play_balance: string | number;
  pending_withdrawal: string | number;
  pending_deposit: string | number;
  total_deposited: string | number;
  total_withdrawn: string | number;
  currency: string;
  updated_at: Date | string;
}

interface RawGameAccountSummaryRow {
  id: string;
  customer_id: string;
  game_id: string;
  game_title: string;
  platform_name: string | null;
  username: string;
  password: string | null;
  pin: string | null;
  status: string;
  balance: string | number;
  free_play_balance: string | number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

type Queryable = Pick<DatabasePool, 'query'>;

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalizeRole(raw: string | undefined): AppUserRole {
  if (raw === 'admin' || raw === 'agent' || raw === 'customer') {
    return raw;
  }
  return 'customer';
}

function normalizeStatus(raw: string | undefined): AppUserStatus {
  if (raw === 'active' || raw === 'suspended' || raw === 'pending') {
    return raw;
  }
  return 'active';
}

function mapJoinedRow(row: JoinedUserRow): ResolvedAppUser {
  const email = row.email.trim().toLowerCase();
  return {
    appUserId: row.app_user_id,
    authUserId: row.auth_user_id,
    email,
    displayName: row.display_name,
    phone: row.phone ?? null,
    avatarUrl: row.avatar_url ?? null,
    role: normalizeRole(row.role),
    status: normalizeStatus(row.status),
    emailVerified: Boolean(row.email_verified),
    referralCode: row.referral_code ?? null,
    referredBy: row.referred_by ?? null,
    passwordResetRequired: Boolean(row.password_reset_required),
    isParentAdmin: isParentAdminUser({ id: row.app_user_id, email }),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function generateReferralCode(displayName: string): string {
  const prefix = displayName
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 6);
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `REF_${prefix || 'PLAYER'}_${suffix}`;
}

const ADMIN_USER_SORT_MAP: Record<AdminUserSortField, string> = {
  createdAt: 'u.created_at',
  updatedAt: 'u.updated_at',
  displayName: 'lower(u.display_name)',
  email: 'lower(u.email)',
  role: 'u.role',
  status: 'u.status',
};

function toFixedMoneyNumber(value: string | number | null | undefined): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Number(num.toFixed(2));
}

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function createEmptyWalletSummary(customerId: string): AdminUserWalletSummary {
  return {
    customerId,
    currency: 'USD',
    availableBalance: 0,
    referralBonusBalance: 0,
    freePlayBalance: 0,
    reservedBalance: 0,
    pendingDepositBalance: 0,
    totalDeposited: 0,
    totalWithdrawn: 0,
    lastUpdatedAt: new Date(0).toISOString(),
  };
}

function mapWalletSummaryRow(row: RawWalletSummaryRow): AdminUserWalletSummary {
  return {
    customerId: row.customer_id,
    currency: row.currency || 'USD',
    availableBalance: toFixedMoneyNumber(row.balance),
    referralBonusBalance: toFixedMoneyNumber(row.referral_bonus_balance),
    freePlayBalance: toFixedMoneyNumber(row.free_play_balance),
    reservedBalance: toFixedMoneyNumber(row.pending_withdrawal),
    pendingDepositBalance: toFixedMoneyNumber(row.pending_deposit),
    totalDeposited: toFixedMoneyNumber(row.total_deposited),
    totalWithdrawn: toFixedMoneyNumber(row.total_withdrawn),
    lastUpdatedAt: toIsoString(row.updated_at),
  };
}

function mapGameAccountSummaryRow(
  row: RawGameAccountSummaryRow,
): AdminUserGameAccountSummary {
  return {
    id: row.id,
    customerId: row.customer_id,
    gameCatalogId: row.game_id,
    gameName: row.game_title,
    platformName: row.platform_name ?? 'Sweepstakes',
    username: row.username,
    password: row.password ?? '',
    status: row.status,
    balance: toFixedMoneyNumber(row.balance),
    freePlayBalance: toFixedMoneyNumber(row.free_play_balance),
    notes: row.pin ?? '',
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export class UserDirectoryRepo {
  constructor(private readonly pool: Pick<DatabasePool, 'query' | 'connect'>) {}

  private async query<T = Record<string, unknown>>(
    sql: string,
    values: unknown[] = [],
    executor: Queryable = this.pool,
  ): Promise<QueryResultLike<T>> {
    return (await executor.query(sql, values)) as QueryResultLike<T>;
  }

  private async withTransaction<T>(
    fn: (client: Queryable) => Promise<T>,
  ): Promise<T> {
    if (typeof this.pool.connect !== 'function') {
      return fn(this.pool);
    }

    const client: DatabaseClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  public async findByAuthUserId(
    authUserId: string,
  ): Promise<ResolvedAppUser | null> {
    const res = await this.query<JoinedUserRow>(
      `
      SELECT
        u.id AS app_user_id,
        l.auth_user_id,
        u.email,
        u.display_name,
        u.phone,
        u.avatar_url,
        u.role,
        u.status,
        u.email_verified,
        u.referral_code,
        u.referred_by,
        COALESCE(l.password_reset_required, false) AS password_reset_required,
        u.created_at,
        u.updated_at
      FROM public.auth_user_links l
      INNER JOIN public.users u ON u.id = l.app_user_id
      WHERE l.auth_user_id = $1
      LIMIT 1
      `,
      [authUserId],
    );

    const row = res.rows[0];
    return row ? mapJoinedRow(row) : null;
  }

  public async findByAppUserId(
    appUserId: string,
  ): Promise<ResolvedAppUser | null> {
    const res = await this.query<JoinedUserRow>(
      `
      SELECT
        u.id AS app_user_id,
        l.auth_user_id,
        u.email,
        u.display_name,
        u.phone,
        u.avatar_url,
        u.role,
        u.status,
        u.email_verified,
        u.referral_code,
        u.referred_by,
        COALESCE(l.password_reset_required, false) AS password_reset_required,
        u.created_at,
        u.updated_at
      FROM public.users u
      LEFT JOIN public.auth_user_links l ON l.app_user_id = u.id
      WHERE u.id = $1
      LIMIT 1
      `,
      [appUserId],
    );

    const row = res.rows[0];
    return row ? mapJoinedRow(row) : null;
  }

  public async findByEmail(email: string): Promise<ResolvedAppUser | null> {
    const cleanEmail = email.trim().toLowerCase();
    const res = await this.query<JoinedUserRow>(
      `
      SELECT
        u.id AS app_user_id,
        l.auth_user_id,
        u.email,
        u.display_name,
        u.phone,
        u.avatar_url,
        u.role,
        u.status,
        u.email_verified,
        u.referral_code,
        u.referred_by,
        COALESCE(l.password_reset_required, false) AS password_reset_required,
        u.created_at,
        u.updated_at
      FROM public.users u
      LEFT JOIN public.auth_user_links l ON l.app_user_id = u.id
      WHERE lower(u.email) = $1
      LIMIT 1
      `,
      [cleanEmail],
    );

    const row = res.rows[0];
    return row ? mapJoinedRow(row) : null;
  }

  public async ensureUserForSelfHostedSignup(
    input: EnsureUserForSignupInput,
  ): Promise<ResolvedAppUser> {
    const cleanEmail = input.email.trim().toLowerCase();
    const existingByAuth = await this.findByAuthUserId(input.authUserId);
    if (existingByAuth) {
      return existingByAuth;
    }

    const existingByEmail = await this.findByEmail(cleanEmail);
    if (existingByEmail) {
      await this.query(
        `
        INSERT INTO public.auth_user_links (
          app_user_id,
          auth_user_id,
          email_normalized,
          migration_source,
          password_reset_required,
          linked_at,
          updated_at
        )
        VALUES ($1, $2, $3, 'self_hosted_signup', false, timezone('utc'::text, now()), timezone('utc'::text, now()))
        ON CONFLICT (app_user_id) DO UPDATE
        SET
          auth_user_id = COALESCE(public.auth_user_links.auth_user_id, EXCLUDED.auth_user_id),
          email_normalized = EXCLUDED.email_normalized,
          linked_at = COALESCE(public.auth_user_links.linked_at, EXCLUDED.linked_at),
          updated_at = timezone('utc'::text, now())
        `,
        [existingByEmail.appUserId, input.authUserId, cleanEmail],
      );
      return (await this.findByAuthUserId(input.authUserId)) ?? existingByEmail;
    }

    const appUserId = input.authUserId;
    const displayName =
      input.displayName.trim() || cleanEmail.split('@')[0] || 'Player';
    const referralCode = generateReferralCode(displayName);

    await this.query(
      `
      INSERT INTO public.users (
        id,
        email,
        display_name,
        role,
        status,
        email_verified,
        referral_code,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'customer', 'active', $4, $5, timezone('utc'::text, now()), timezone('utc'::text, now()))
      ON CONFLICT (id) DO NOTHING
      `,
      [appUserId, cleanEmail, displayName, input.emailVerified, referralCode],
    );

    await this.query(
      `
      INSERT INTO public.auth_user_links (
        app_user_id,
        auth_user_id,
        email_normalized,
        migration_source,
        password_reset_required,
        linked_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'self_hosted_signup',
        false,
        timezone('utc'::text, now()),
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
      )
      ON CONFLICT (app_user_id) DO UPDATE
      SET
        auth_user_id = EXCLUDED.auth_user_id,
        email_normalized = EXCLUDED.email_normalized,
        linked_at = COALESCE(public.auth_user_links.linked_at, EXCLUDED.linked_at),
        updated_at = timezone('utc'::text, now())
      `,
      [appUserId, input.authUserId, cleanEmail],
    );

    const created = await this.findByAuthUserId(input.authUserId);
    if (!created) {
      throw new Error('Failed to load newly created application user profile.');
    }
    return created;
  }

  public async createAdminProvisionedUser(
    input: AdminProvisionUserInput,
  ): Promise<ResolvedAppUser> {
    const cleanEmail = input.email.trim().toLowerCase();
    const displayName =
      input.displayName.trim() || cleanEmail.split('@')[0] || 'User';
    const referralCode = generateReferralCode(displayName);

    await this.query(
      `
      INSERT INTO public.users (
        id,
        email,
        display_name,
        role,
        phone,
        status,
        email_verified,
        referral_code,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, timezone('utc'::text, now()), timezone('utc'::text, now()))
      `,
      [
        input.appUserId,
        cleanEmail,
        displayName,
        input.role,
        input.phone?.trim() || null,
        input.emailVerified,
        referralCode,
      ],
    );

    await this.query(
      `
      INSERT INTO public.auth_user_links (
        app_user_id,
        auth_user_id,
        email_normalized,
        migration_source,
        password_reset_required,
        linked_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'admin_provisioned',
        $4,
        timezone('utc'::text, now()),
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
      )
      `,
      [
        input.appUserId,
        input.authUserId,
        cleanEmail,
        input.passwordResetRequired,
      ],
    );

    const created = await this.findByAppUserId(input.appUserId);
    if (!created) {
      throw new Error('Failed to load admin-provisioned user.');
    }
    return created;
  }

  public async markEmailVerifiedByAuthUserId(
    authUserId: string,
  ): Promise<ResolvedAppUser | null> {
    const existing = await this.findByAuthUserId(authUserId);
    if (!existing) {
      return null;
    }

    await this.query(
      `
      UPDATE public.users
      SET email_verified = true, updated_at = timezone('utc'::text, now())
      WHERE id = $1
      `,
      [existing.appUserId],
    );

    return this.findByAppUserId(existing.appUserId);
  }

  public async clearPasswordResetRequiredByAuthUserId(
    authUserId: string,
  ): Promise<ResolvedAppUser | null> {
    await this.query(
      `
      UPDATE public.auth_user_links
      SET password_reset_required = false, updated_at = timezone('utc'::text, now())
      WHERE auth_user_id = $1
      `,
      [authUserId],
    );

    return this.findByAuthUserId(authUserId);
  }

  public async listUsers(options: {
    limit: number;
    offset: number;
  }): Promise<ResolvedAppUser[]> {
    const safeLimit = Math.min(Math.max(1, options.limit), 100);
    const safeOffset = Math.max(0, options.offset);

    const res = await this.query<JoinedUserRow>(
      `
      SELECT
        u.id AS app_user_id,
        l.auth_user_id,
        u.email,
        u.display_name,
        u.phone,
        u.avatar_url,
        u.role,
        u.status,
        u.email_verified,
        u.referral_code,
        u.referred_by,
        COALESCE(l.password_reset_required, false) AS password_reset_required,
        u.created_at,
        u.updated_at
      FROM public.users u
      LEFT JOIN public.auth_user_links l ON l.app_user_id = u.id
      ORDER BY u.created_at DESC, u.id ASC
      LIMIT $1 OFFSET $2
      `,
      [safeLimit, safeOffset],
    );

    return res.rows.map(mapJoinedRow);
  }

  private async hydrateDirectoryUsers(
    users: ResolvedAppUser[],
  ): Promise<AdminDirectoryUserRecord[]> {
    if (users.length === 0) {
      return [];
    }

    const userIds = users.map((u) => u.appUserId);
    const [walletsRes, accountsRes] = await Promise.all([
      this.query<RawWalletSummaryRow>(
        `
        SELECT
          customer_id,
          balance,
          referral_bonus_balance,
          free_play_balance,
          pending_withdrawal,
          pending_deposit,
          total_deposited,
          total_withdrawn,
          currency,
          updated_at
        FROM public.wallets
        WHERE customer_id = ANY($1::text[])
        `,
        [userIds],
      ),
      this.query<RawGameAccountSummaryRow>(
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
          created_at,
          updated_at
        FROM public.game_accounts
        WHERE customer_id = ANY($1::text[])
        ORDER BY updated_at DESC, id ASC
        `,
        [userIds],
      ),
    ]);

    const walletsMap = new Map<string, AdminUserWalletSummary>();
    for (const row of walletsRes.rows) {
      walletsMap.set(row.customer_id, mapWalletSummaryRow(row));
    }

    const accountsMap = new Map<string, AdminUserGameAccountSummary[]>();
    for (const row of accountsRes.rows) {
      const existing = accountsMap.get(row.customer_id) ?? [];
      existing.push(mapGameAccountSummaryRow(row));
      accountsMap.set(row.customer_id, existing);
    }

    return users.map((u) => {
      const gameAccounts = accountsMap.get(u.appUserId) ?? [];
      return {
        ...u,
        lastLoginAt: u.updatedAt,
        wallet: walletsMap.get(u.appUserId) ?? createEmptyWalletSummary(u.appUserId),
        gameAccounts,
        gameAccountsCount: gameAccounts.length,
      };
    });
  }

  public async listAdminUsersDirectory(
    options: ListAdminDirectoryUsersOptions,
  ): Promise<ListAdminDirectoryUsersResult> {
    const safeLimit = Math.min(Math.max(1, options.limit), 100);
    const safeOffset = Math.max(0, options.offset);

    const conditions: string[] = [];
    const filterParams: unknown[] = [];

    if (options.role) {
      filterParams.push(options.role);
      conditions.push(`u.role = $${filterParams.length}`);
    }

    if (options.status) {
      filterParams.push(options.status);
      conditions.push(`u.status = $${filterParams.length}`);
    }

    const cleanSearch = options.search?.trim();
    if (cleanSearch) {
      filterParams.push(`%${escapeIlikePattern(cleanSearch)}%`);
      const idx = filterParams.length;
      conditions.push(
        `(u.display_name ILIKE $${idx} ESCAPE '\\' OR u.email ILIKE $${idx} ESCAPE '\\' OR u.id ILIKE $${idx} ESCAPE '\\' OR COALESCE(u.referral_code, '') ILIKE $${idx} ESCAPE '\\' OR COALESCE(u.phone, '') ILIKE $${idx} ESCAPE '\\')`,
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.query<{ total: number }>(
      `
      SELECT COUNT(*)::int AS total
      FROM public.users u
      ${whereClause}
      `,
      filterParams,
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const sortColumn = ADMIN_USER_SORT_MAP[options.sortBy] ?? 'u.created_at';
    const sortDir = options.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const listParams = [...filterParams, safeLimit, safeOffset];
    const limitParamIdx = filterParams.length + 1;
    const offsetParamIdx = filterParams.length + 2;

    const listRes = await this.query<JoinedUserRow>(
      `
      SELECT
        u.id AS app_user_id,
        l.auth_user_id,
        u.email,
        u.display_name,
        u.phone,
        u.avatar_url,
        u.role,
        u.status,
        u.email_verified,
        u.referral_code,
        u.referred_by,
        COALESCE(l.password_reset_required, false) AS password_reset_required,
        u.created_at,
        u.updated_at
      FROM public.users u
      LEFT JOIN public.auth_user_links l ON l.app_user_id = u.id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDir}, u.id ASC
      LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
      `,
      listParams,
    );

    const hydrated = await this.hydrateDirectoryUsers(
      listRes.rows.map(mapJoinedRow),
    );
    return {
      users: hydrated,
      total,
    };
  }

  public async findAdminUserDetailById(
    appUserId: string,
  ): Promise<AdminDirectoryUserRecord | null> {
    const user = await this.findByAppUserId(appUserId);
    if (!user) {
      return null;
    }
    const [hydrated] = await this.hydrateDirectoryUsers([user]);
    return hydrated ?? null;
  }

  public async resolveReferrerDisplayName(
    referredBy: string | null | undefined,
  ): Promise<string | null> {
    const cleanRef = referredBy?.trim();
    if (!cleanRef) {
      return null;
    }

    const res = await this.query<{ display_name: string }>(
      `
      SELECT display_name
      FROM public.users
      WHERE id = $1
         OR upper(referral_code) = upper($1)
         OR lower(email) = lower($1)
      LIMIT 1
      `,
      [cleanRef],
    );

    const row = res.rows[0];
    return row?.display_name ?? null;
  }

  public async updateOwnProfile(input: {
    appUserId: string;
    displayName?: string;
    phone?: string | null;
  }): Promise<ResolvedAppUser | null> {
    const hasDisplayName = input.displayName !== undefined;
    const hasPhone = input.phone !== undefined;

    if (hasDisplayName && hasPhone) {
      await this.query(
        `
        UPDATE public.users
        SET display_name = $2, phone = $3, updated_at = timezone('utc'::text, now())
        WHERE id = $1
        `,
        [input.appUserId, input.displayName, input.phone],
      );
    } else if (hasDisplayName) {
      await this.query(
        `
        UPDATE public.users
        SET display_name = $2, updated_at = timezone('utc'::text, now())
        WHERE id = $1
        `,
        [input.appUserId, input.displayName],
      );
    } else if (hasPhone) {
      await this.query(
        `
        UPDATE public.users
        SET phone = $2, updated_at = timezone('utc'::text, now())
        WHERE id = $1
        `,
        [input.appUserId, input.phone],
      );
    }

    return this.findByAppUserId(input.appUserId);
  }

  public async updateOwnAvatar(
    appUserId: string,
    avatarUrl: string | null,
  ): Promise<ResolvedAppUser | null> {
    await this.query(
      `
      UPDATE public.users
      SET avatar_url = $2, updated_at = timezone('utc'::text, now())
      WHERE id = $1
      `,
      [appUserId, avatarUrl],
    );
    return this.findByAppUserId(appUserId);
  }

  public async updateUserRoleAtomically(input: {
    targetUserId: string;
    newRole: AppUserRole;
    actor: Pick<ResolvedAppUser, 'appUserId' | 'displayName' | 'role'>;
  }): Promise<{ previousRole: AppUserRole; user: ResolvedAppUser }> {
    const txResult = await this.withTransaction(async (client) => {
      const targetRes = await this.query<JoinedUserRow>(
        `
        SELECT
          u.id AS app_user_id,
          l.auth_user_id,
          u.email,
          u.display_name,
          u.phone,
          u.avatar_url,
          u.role,
          u.status,
          u.email_verified,
          u.referral_code,
          u.referred_by,
          COALESCE(l.password_reset_required, false) AS password_reset_required,
          u.created_at,
          u.updated_at
        FROM public.users u
        LEFT JOIN public.auth_user_links l ON l.app_user_id = u.id
        WHERE u.id = $1
        LIMIT 1
        FOR UPDATE OF u
        `,
        [input.targetUserId],
        client,
      );

      const targetRow = targetRes.rows[0];
      if (!targetRow) {
        throw new AdminUserNotFoundError('User not found.');
      }

      const target = mapJoinedRow(targetRow);
      if (
        isParentAdminUser({ id: target.appUserId, email: target.email }) &&
        input.newRole !== 'admin'
      ) {
        throw new AdminUserForbiddenError(
          'PARENT_ADMIN_PROTECTED',
          'Protected parent administrator role cannot be modified.',
        );
      }

      if (
        input.actor.appUserId === target.appUserId &&
        input.newRole !== 'admin'
      ) {
        throw new AdminUserForbiddenError(
          'SELF_DEMOTION_FORBIDDEN',
          'You cannot demote your own active administrator account.',
        );
      }

      await this.query(
        `
        UPDATE public.users
        SET role = $2, updated_at = timezone('utc'::text, now())
        WHERE id = $1
        `,
        [target.appUserId, input.newRole],
        client,
      );

      const refreshedRes = await this.query<JoinedUserRow>(
        `
        SELECT
          u.id AS app_user_id,
          l.auth_user_id,
          u.email,
          u.display_name,
          u.phone,
          u.avatar_url,
          u.role,
          u.status,
          u.email_verified,
          u.referral_code,
          u.referred_by,
          COALESCE(l.password_reset_required, false) AS password_reset_required,
          u.created_at,
          u.updated_at
        FROM public.users u
        LEFT JOIN public.auth_user_links l ON l.app_user_id = u.id
        WHERE u.id = $1
        LIMIT 1
        `,
        [target.appUserId],
        client,
      );
      const updatedRow = refreshedRes.rows[0];
      if (!updatedRow) {
        throw new AdminUserNotFoundError('User not found.');
      }
      const updated = mapJoinedRow(updatedRow);

      await this.writeAuditLog(
        {
          actorId: input.actor.appUserId,
          actorName: input.actor.displayName,
          actorRole: input.actor.role,
          action: 'USER_ROLE_UPDATED',
          entityType: 'user',
          entityId: updated.appUserId,
          details: `Role updated from ${target.role} to ${updated.role}.`,
        },
        client,
      );

      return {
        previousRole: target.role,
        user: updated,
      };
    });

    return txResult;
  }

  public async updateUserStatusAtomically(input: {
    targetUserId: string;
    newStatus: AppUserStatus;
    actor: Pick<ResolvedAppUser, 'appUserId' | 'displayName' | 'role'>;
  }): Promise<{ previousStatus: AppUserStatus; user: ResolvedAppUser }> {
    const txResult = await this.withTransaction(async (client) => {
      const targetRes = await this.query<JoinedUserRow>(
        `
        SELECT
          u.id AS app_user_id,
          l.auth_user_id,
          u.email,
          u.display_name,
          u.phone,
          u.avatar_url,
          u.role,
          u.status,
          u.email_verified,
          u.referral_code,
          u.referred_by,
          COALESCE(l.password_reset_required, false) AS password_reset_required,
          u.created_at,
          u.updated_at
        FROM public.users u
        LEFT JOIN public.auth_user_links l ON l.app_user_id = u.id
        WHERE u.id = $1
        LIMIT 1
        FOR UPDATE OF u
        `,
        [input.targetUserId],
        client,
      );

      const targetRow = targetRes.rows[0];
      if (!targetRow) {
        throw new AdminUserNotFoundError('User not found.');
      }

      const target = mapJoinedRow(targetRow);
      if (
        isParentAdminUser({ id: target.appUserId, email: target.email }) &&
        input.newStatus !== 'active'
      ) {
        throw new AdminUserForbiddenError(
          'PARENT_ADMIN_PROTECTED',
          'Protected parent administrator cannot be suspended.',
        );
      }

      if (
        input.actor.appUserId === target.appUserId &&
        input.newStatus !== 'active'
      ) {
        throw new AdminUserForbiddenError(
          'SELF_SUSPENSION_FORBIDDEN',
          'You cannot suspend your own active administrator account.',
        );
      }

      await this.query(
        `
        UPDATE public.users
        SET status = $2, updated_at = timezone('utc'::text, now())
        WHERE id = $1
        `,
        [target.appUserId, input.newStatus],
        client,
      );

      const refreshedRes = await this.query<JoinedUserRow>(
        `
        SELECT
          u.id AS app_user_id,
          l.auth_user_id,
          u.email,
          u.display_name,
          u.phone,
          u.avatar_url,
          u.role,
          u.status,
          u.email_verified,
          u.referral_code,
          u.referred_by,
          COALESCE(l.password_reset_required, false) AS password_reset_required,
          u.created_at,
          u.updated_at
        FROM public.users u
        LEFT JOIN public.auth_user_links l ON l.app_user_id = u.id
        WHERE u.id = $1
        LIMIT 1
        `,
        [target.appUserId],
        client,
      );
      const updatedRow = refreshedRes.rows[0];
      if (!updatedRow) {
        throw new AdminUserNotFoundError('User not found.');
      }
      const updated = mapJoinedRow(updatedRow);

      await this.writeAuditLog(
        {
          actorId: input.actor.appUserId,
          actorName: input.actor.displayName,
          actorRole: input.actor.role,
          action: 'USER_STATUS_UPDATED',
          entityType: 'user',
          entityId: updated.appUserId,
          details: `Status updated from ${target.status} to ${updated.status}.`,
        },
        client,
      );

      return {
        previousStatus: target.status,
        user: updated,
      };
    });

    return txResult;
  }

  public async deleteUserAtomically(input: {
    targetUserId: string;
    actor: Pick<ResolvedAppUser, 'appUserId' | 'displayName' | 'role'>;
  }): Promise<ResolvedAppUser> {
    return this.withTransaction(async (client) => {
      const targetRes = await this.query<JoinedUserRow>(
        `
        SELECT
          u.id AS app_user_id,
          l.auth_user_id,
          u.email,
          u.display_name,
          u.phone,
          u.avatar_url,
          u.role,
          u.status,
          u.email_verified,
          u.referral_code,
          u.referred_by,
          COALESCE(l.password_reset_required, false) AS password_reset_required,
          u.created_at,
          u.updated_at
        FROM public.users u
        LEFT JOIN public.auth_user_links l ON l.app_user_id = u.id
        WHERE u.id = $1
        LIMIT 1
        FOR UPDATE OF u
        `,
        [input.targetUserId],
        client,
      );

      const targetRow = targetRes.rows[0];
      if (!targetRow) {
        throw new AdminUserNotFoundError('User not found.');
      }

      const target = mapJoinedRow(targetRow);
      if (isParentAdminUser({ id: target.appUserId, email: target.email })) {
        throw new AdminUserForbiddenError(
          'PARENT_ADMIN_PROTECTED',
          'Cannot delete the protected Super/Parent Administrator.',
        );
      }

      if (input.actor.appUserId === target.appUserId) {
        throw new AdminUserForbiddenError(
          'SELF_DELETE_FORBIDDEN',
          'You cannot delete your own active administrator account.',
        );
      }

      await this.query(
        `
        DELETE FROM public.users
        WHERE id = $1
        `,
        [target.appUserId],
        client,
      );

      await this.writeAuditLog(
        {
          actorId: input.actor.appUserId,
          actorName: input.actor.displayName,
          actorRole: input.actor.role,
          action: 'USER_DELETED',
          entityType: 'user',
          entityId: target.appUserId,
          details: `Deleted account ${target.email} and cascaded associated records.`,
        },
        client,
      );

      return target;
    });
  }

  public async updateUserRole(
    appUserId: string,
    newRole: AppUserRole,
  ): Promise<ResolvedAppUser | null> {
    await this.query(
      `
      UPDATE public.users
      SET role = $2, updated_at = timezone('utc'::text, now())
      WHERE id = $1
      `,
      [appUserId, newRole],
    );
    return this.findByAppUserId(appUserId);
  }

  public async updateUserStatus(
    appUserId: string,
    newStatus: AppUserStatus,
  ): Promise<ResolvedAppUser | null> {
    await this.query(
      `
      UPDATE public.users
      SET status = $2, updated_at = timezone('utc'::text, now())
      WHERE id = $1
      `,
      [appUserId, newStatus],
    );
    return this.findByAppUserId(appUserId);
  }

  public async revokeAuthSessionsByAuthUserId(authUserId: string): Promise<void> {
    await this.query(`DELETE FROM ba_session WHERE "userId" = $1`, [authUserId]);
  }

  public async writeAuditLog(
    entry: AuditLogInput,
    executor: Queryable = this.pool,
  ): Promise<void> {
    const id = `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await this.query(
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, timezone('utc'::text, now()))
      `,
      [
        id,
        entry.actorId.slice(0, 120),
        entry.actorName.slice(0, 160),
        entry.actorRole,
        entry.action.slice(0, 100),
        entry.entityType.slice(0, 60),
        entry.entityId.slice(0, 160),
        entry.details.slice(0, 1000),
      ],
      executor,
    );
  }
}
