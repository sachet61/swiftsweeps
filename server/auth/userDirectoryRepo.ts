import crypto from 'node:crypto';
import type { DatabasePool } from '../db/pool.js';

export type AppUserRole = 'customer' | 'agent' | 'admin';
export type AppUserStatus = 'active' | 'suspended' | 'pending';
export type AuthMigrationSource =
  | 'supabase_import'
  | 'self_hosted_signup'
  | 'admin_provisioned';

export interface ResolvedAppUser {
  appUserId: string;
  authUserId: string | null;
  email: string;
  displayName: string;
  role: AppUserRole;
  status: AppUserStatus;
  emailVerified: boolean;
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

interface JoinedUserRow {
  app_user_id: string;
  auth_user_id: string | null;
  email: string;
  display_name: string;
  role: string;
  status: string;
  email_verified: boolean;
  password_reset_required: boolean | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

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
    role: normalizeRole(row.role),
    status: normalizeStatus(row.status),
    emailVerified: Boolean(row.email_verified),
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

export class UserDirectoryRepo {
  constructor(private readonly pool: Pick<DatabasePool, 'query'>) {}

  private async query<T = Record<string, unknown>>(
    sql: string,
    values: unknown[] = [],
  ): Promise<QueryResultLike<T>> {
    return (await this.pool.query(sql, values)) as QueryResultLike<T>;
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
        u.role,
        u.status,
        u.email_verified,
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
        u.role,
        u.status,
        u.email_verified,
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
        u.role,
        u.status,
        u.email_verified,
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
        u.role,
        u.status,
        u.email_verified,
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

  public async writeAuditLog(entry: AuditLogInput): Promise<void> {
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
    );
  }
}
