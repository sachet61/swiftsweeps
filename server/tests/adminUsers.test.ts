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

interface InMemoryWalletRow {
  customer_id: string;
  balance: string;
  referral_bonus_balance: string;
  free_play_balance: string;
  pending_withdrawal: string;
  pending_deposit: string;
  total_deposited: string;
  total_withdrawn: string;
  currency: string;
  updated_at: Date;
}

interface InMemoryGameAccountRow {
  id: string;
  customer_id: string;
  game_id: string;
  game_title: string;
  platform_name: string | null;
  username: string;
  password: string | null;
  pin: string | null;
  status: string;
  balance: string;
  free_play_balance: string;
  created_at: Date;
  updated_at: Date;
}

interface InMemoryAuditRow {
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

interface DbSnapshot {
  users: Map<string, InMemoryUserRow>;
  authLinks: Map<string, InMemoryAuthLinkRow>;
  wallets: Map<string, InMemoryWalletRow>;
  gameAccounts: Map<string, InMemoryGameAccountRow>;
  auditLogs: InMemoryAuditRow[];
}

function unescapeIlikePattern(pattern: string): string {
  const inner = pattern.slice(1, -1);
  return inner.replace(/\\(.)/g, '$1').toLowerCase();
}

class InMemoryAdminUsersDatabase implements Pick<DatabasePool, 'query' | 'connect'> {
  public users = new Map<string, InMemoryUserRow>();
  public authLinks = new Map<string, InMemoryAuthLinkRow>();
  public wallets = new Map<string, InMemoryWalletRow>();
  public gameAccounts = new Map<string, InMemoryGameAccountRow>();
  public auditLogs: InMemoryAuditRow[] = [];
  public failOnSqlSubstring: string | null = null;

  private cloneSnapshot(): DbSnapshot {
    return {
      users: new Map(
        Array.from(this.users.entries(), ([k, v]) => [
          k,
          { ...v, created_at: new Date(v.created_at), updated_at: new Date(v.updated_at) },
        ]),
      ),
      authLinks: new Map(
        Array.from(this.authLinks.entries(), ([k, v]) => [
          k,
          {
            ...v,
            linked_at: v.linked_at ? new Date(v.linked_at) : null,
            created_at: new Date(v.created_at),
            updated_at: new Date(v.updated_at),
          },
        ]),
      ),
      wallets: new Map(
        Array.from(this.wallets.entries(), ([k, v]) => [
          k,
          { ...v, updated_at: new Date(v.updated_at) },
        ]),
      ),
      gameAccounts: new Map(
        Array.from(this.gameAccounts.entries(), ([k, v]) => [
          k,
          { ...v, created_at: new Date(v.created_at), updated_at: new Date(v.updated_at) },
        ]),
      ),
      auditLogs: this.auditLogs.map((a) => ({
        ...a,
        timestamp: new Date(a.timestamp),
      })),
    };
  }

  private restoreSnapshot(snap: DbSnapshot): void {
    this.users = snap.users;
    this.authLinks = snap.authLinks;
    this.wallets = snap.wallets;
    this.gameAccounts = snap.gameAccounts;
    this.auditLogs = snap.auditLogs;
  }

  public async connect(): Promise<DatabaseClient> {
    let txSnapshot: DbSnapshot | null = null;
    const client: DatabaseClient = {
      query: async <T = Record<string, unknown>>(
        sql: string,
        values: unknown[] = [],
      ): Promise<{ rows: T[]; rowCount?: number }> => {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        if (normalized === 'BEGIN') {
          txSnapshot = this.cloneSnapshot();
          return { rows: [] };
        }
        if (normalized === 'COMMIT') {
          txSnapshot = null;
          return { rows: [] };
        }
        if (normalized === 'ROLLBACK') {
          if (txSnapshot) {
            this.restoreSnapshot(txSnapshot);
            txSnapshot = null;
          }
          return { rows: [] };
        }
        return (await this.query(sql, values)) as { rows: T[]; rowCount?: number };
      },
      release: () => {
        txSnapshot = null;
      },
    };
    return client;
  }

  public async query(
    sql: string,
    values: unknown[] = [],
  ): Promise<{ rows: unknown[]; rowCount?: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (this.failOnSqlSubstring && normalized.includes(this.failOnSqlSubstring)) {
      throw new Error('pg_internal_constraint_leak: sensitive_connection_string_postgres://db:pass@host');
    }

    if (normalized === 'SELECT 1 AS ok') {
      return { rows: [{ ok: 1 }] };
    }

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

    if (normalized.startsWith('SELECT COUNT(*)::int AS total FROM public.users u')) {
      const filtered = this.filterDirectoryUsers(normalized, values);
      return { rows: [{ total: filtered.length }] };
    }

    if (
      normalized.includes('FROM public.users u LEFT JOIN public.auth_user_links l') &&
      normalized.includes('ORDER BY')
    ) {
      const filterParamCount = Math.max(0, values.length - 2);
      const filterValues = values.slice(0, filterParamCount);
      const limit = Number(values[filterParamCount] ?? 100);
      const offset = Number(values[filterParamCount + 1] ?? 0);

      const filtered = this.filterDirectoryUsers(normalized, filterValues);
      const sorted = this.sortDirectoryUsers(normalized, filtered);
      const sliced = sorted
        .slice(offset, offset + limit)
        .map((u) => this.toJoinedRow(u, this.authLinks.get(u.id)));
      return { rows: sliced };
    }

    if (normalized.includes('FROM public.wallets') && normalized.includes('customer_id = ANY')) {
      const ids = Array.isArray(values[0]) ? (values[0] as string[]) : [];
      const rows = ids
        .map((id) => this.wallets.get(id))
        .filter((w): w is InMemoryWalletRow => Boolean(w));
      return { rows };
    }

    if (
      normalized.includes('FROM public.game_accounts') &&
      normalized.includes('customer_id = ANY')
    ) {
      const ids = new Set(Array.isArray(values[0]) ? (values[0] as string[]) : []);
      const rows = [...this.gameAccounts.values()]
        .filter((a) => ids.has(a.customer_id))
        .sort((a, b) => {
          const dt = b.updated_at.getTime() - a.updated_at.getTime();
          return dt !== 0 ? dt : a.id.localeCompare(b.id);
        });
      return { rows };
    }

    if (normalized.startsWith('INSERT INTO public.users')) {
      if (normalized.includes("'customer', 'active'")) {
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

      const [id, email, displayName, role, phone, emailVerified, referralCode] = values as [
        string,
        string,
        string,
        string,
        string | null,
        boolean,
        string,
      ];
      const now = new Date();
      this.users.set(id, {
        id,
        email,
        display_name: displayName,
        role,
        phone,
        avatar_url: null,
        status: 'active',
        email_verified: emailVerified,
        referral_code: referralCode,
        referred_by: null,
        created_at: now,
        updated_at: now,
      });
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith('INSERT INTO public.auth_user_links')) {
      const appUserId = String(values[0]);
      const authUserId = String(values[1]);
      const emailNormalized = String(values[2]);
      const isAdminProvisioned = normalized.includes("'admin_provisioned'");
      const passwordResetRequired = isAdminProvisioned ? Boolean(values[3]) : false;
      const now = new Date();
      const existing = this.authLinks.get(appUserId);
      if (existing) {
        existing.auth_user_id = existing.auth_user_id ?? authUserId;
        existing.email_normalized = emailNormalized;
        existing.linked_at = existing.linked_at ?? now;
        existing.updated_at = now;
      } else {
        this.authLinks.set(appUserId, {
          app_user_id: appUserId,
          auth_user_id: authUserId,
          legacy_supabase_uid: null,
          email_normalized: emailNormalized,
          migration_source: isAdminProvisioned ? 'admin_provisioned' : 'self_hosted_signup',
          password_reset_required: passwordResetRequired,
          linked_at: now,
          created_at: now,
          updated_at: now,
        });
      }
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

    if (normalized.startsWith('UPDATE public.users SET role = $2')) {
      const [id, newRole] = values as [string, string];
      const user = this.users.get(id);
      if (user) {
        user.role = newRole;
        user.updated_at = new Date();
      }
      return { rows: [], rowCount: user ? 1 : 0 };
    }

    if (normalized.startsWith('UPDATE public.users SET status = $2')) {
      const [id, newStatus] = values as [string, string];
      const user = this.users.get(id);
      if (user) {
        user.status = newStatus;
        user.updated_at = new Date();
      }
      return { rows: [], rowCount: user ? 1 : 0 };
    }

    if (normalized.startsWith('DELETE FROM public.users WHERE id = $1')) {
      const id = String(values[0] ?? '');
      const existed = this.users.delete(id);
      if (existed) {
        this.authLinks.delete(id);
        this.wallets.delete(id);
        for (const [accId, acc] of this.gameAccounts.entries()) {
          if (acc.customer_id === id) {
            this.gameAccounts.delete(accId);
          }
        }
      }
      return { rows: [], rowCount: existed ? 1 : 0 };
    }

    if (normalized.startsWith('INSERT INTO public.audit_logs')) {
      const [id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details] = values as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      this.auditLogs.push({
        id,
        actor_id,
        actor_name,
        actor_role,
        action,
        entity_type,
        entity_id,
        details,
        timestamp: new Date(),
      });
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL in InMemoryAdminUsersDatabase: ${normalized}`);
  }

  private filterDirectoryUsers(normalized: string, values: unknown[]): InMemoryUserRow[] {
    let idx = 0;
    let roleFilter: string | null = null;
    let statusFilter: string | null = null;
    let searchTerm: string | null = null;

    if (normalized.includes('u.role = $')) {
      roleFilter = String(values[idx++] ?? '');
    }
    if (normalized.includes('u.status = $')) {
      statusFilter = String(values[idx++] ?? '');
    }
    if (normalized.includes('u.display_name ILIKE')) {
      searchTerm = unescapeIlikePattern(String(values[idx++] ?? '%%'));
    }

    return [...this.users.values()].filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter && u.status !== statusFilter) return false;
      if (searchTerm !== null && searchTerm !== '') {
        const haystacks = [
          u.display_name,
          u.email,
          u.id,
          u.referral_code ?? '',
          u.phone ?? '',
        ];
        if (!haystacks.some((h) => h.toLowerCase().includes(searchTerm!))) {
          return false;
        }
      }
      return true;
    });
  }

  private sortDirectoryUsers(normalized: string, rows: InMemoryUserRow[]): InMemoryUserRow[] {
    const orderMatch = normalized.match(/ORDER BY ([^,]+)\s+(ASC|DESC)/i);
    const sortExpr = orderMatch?.[1]?.trim() ?? 'u.created_at';
    const dir = orderMatch?.[2]?.toUpperCase() === 'ASC' ? 1 : -1;

    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortExpr === 'u.created_at') {
        cmp = a.created_at.getTime() - b.created_at.getTime();
      } else if (sortExpr === 'u.updated_at') {
        cmp = a.updated_at.getTime() - b.updated_at.getTime();
      } else if (sortExpr === 'lower(u.display_name)') {
        cmp = a.display_name.toLowerCase().localeCompare(b.display_name.toLowerCase());
      } else if (sortExpr === 'lower(u.email)') {
        cmp = a.email.toLowerCase().localeCompare(b.email.toLowerCase());
      } else if (sortExpr === 'u.role') {
        cmp = a.role.localeCompare(b.role);
      } else if (sortExpr === 'u.status') {
        cmp = a.status.localeCompare(b.status);
      }
      if (cmp !== 0) {
        return cmp * dir;
      }
      return a.id.localeCompare(b.id);
    });
  }

  private toJoinedRow(user: InMemoryUserRow, link: InMemoryAuthLinkRow | undefined) {
    return {
      app_user_id: user.id,
      auth_user_id: link?.auth_user_id ?? null,
      email: user.email,
      display_name: user.display_name,
      phone: user.phone,
      avatar_url: user.avatar_url,
      role: user.role,
      status: user.status,
      email_verified: user.email_verified,
      referral_code: user.referral_code,
      referred_by: user.referred_by,
      password_reset_required: link?.password_reset_required ?? false,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }
}

function createCaptureEmailAdapter(): {
  adapter: EmailDeliveryAdapter;
  otps: SendOtpEmailPayload[];
  resets: SendPasswordResetEmailPayload[];
  verifications: SendVerificationEmailPayload[];
} {
  const otps: SendOtpEmailPayload[] = [];
  const resets: SendPasswordResetEmailPayload[] = [];
  const verifications: SendVerificationEmailPayload[] = [];

  return {
    otps,
    resets,
    verifications,
    adapter: {
      providerName: 'test-capture',
      isConfigured: () => true,
      async sendVerificationEmail(payload) {
        verifications.push(payload);
      },
      async sendOtpEmail(payload) {
        otps.push(payload);
      },
      async sendPasswordResetEmail(payload) {
        resets.push(payload);
      },
    },
  };
}

function createTestConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 0,
    appOrigin: 'https://swiftsweeps.example.com',
    trustProxy: 'loopback',
    databaseUrl: 'postgres://staging_user:not_a_real_secret@127.0.0.1:5432/staging_db',
    pgPoolMax: 5,
    pgPoolMin: 0,
    pgIdleTimeoutMs: 10_000,
    pgConnectionTimeoutMs: 2_000,
    pgStatementTimeoutMs: 5_000,
    pgSslMode: 'disable',
    requestBodyLimit: '1mb',
    requestBodyLimitBytes: 1024 * 1024,
    logLevel: 'silent' as ServerConfig['logLevel'],
    shutdownTimeoutMs: 2_000,
    authSecret: 'test-auth-secret-value-at-least-32-chars-9988',
    authCookiePrefix: 'swiftsweeps_auth',
    authSessionExpiresInSec: 604_800,
    authSessionUpdateAgeSec: 86_400,
    authSessionFreshAgeSec: 900,
    authRequireEmailVerification: true,
    authRateLimitEnabled: false,
    authRateLimitWindowSec: 60,
    authRateLimitMax: 30,
    emailProvider: 'disabled',
    smtpPort: 587,
    smtpSecure: false,
    emailFromName: 'SwiftSweeps',
    ...overrides,
  };
}

function createSilentLogger() {
  return createLogger({
    level: 'error',
    writeStdout: () => {},
    writeStderr: () => {},
  });
}

function extractSetCookies(res: Response): string[] {
  const headersObj = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headersObj.getSetCookie === 'function') {
    return headersObj.getSetCookie();
  }
  const single = res.headers.get('set-cookie');
  return single ? [single] : [];
}

function toCookieHeader(setCookies: string[]): string {
  return setCookies
    .map((entry) => entry.split(';', 1)[0]?.trim())
    .filter((pair): pair is string => Boolean(pair))
    .join('; ');
}

async function withAdminUsersServer(
  fn: (ctx: {
    baseUrl: string;
    appDb: InMemoryAdminUsersDatabase;
    authStore: Record<string, unknown[]>;
    emailCapture: ReturnType<typeof createCaptureEmailAdapter>;
    origin: string;
  }) => Promise<void>,
): Promise<void> {
  const origin = 'https://swiftsweeps.example.com';
  const appDb = new InMemoryAdminUsersDatabase();
  const authStore: Record<string, unknown[]> = {
    ba_user: [],
    ba_session: [],
    ba_account: [],
    ba_verification: [],
    ba_rate_limit: [],
  };
  const emailCapture = createCaptureEmailAdapter();

  const app = createApiApp({
    config: createTestConfig({ appOrigin: origin }),
    logger: createSilentLogger(),
    pool: appDb,
    authDatabaseOverride: memoryAdapter(authStore),
    emailDeliveryOverride: emailCapture.adapter,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await fn({ baseUrl, appDb, authStore, emailCapture, origin });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function signUpVerifiedUser(
  baseUrl: string,
  origin: string,
  emailCapture: ReturnType<typeof createCaptureEmailAdapter>,
  input: { name: string; email: string; password: string },
): Promise<string> {
  const signUpRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  assert.equal(signUpRes.status, 200);

  const otpEntry = [...emailCapture.otps]
    .reverse()
    .find((entry) => entry.to === input.email.toLowerCase());
  assert.ok(otpEntry, `Expected OTP email for ${input.email}`);

  const verifyRes = await fetch(`${baseUrl}/api/auth/email-otp/verify-email`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email.toLowerCase(),
      otp: otpEntry.otp,
    }),
  });
  assert.equal(verifyRes.status, 200);

  const signInRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email.toLowerCase(),
      password: input.password,
    }),
  });
  assert.equal(signInRes.status, 200);
  const cookie = toCookieHeader(extractSetCookies(signInRes));
  assert.ok(cookie);
  return cookie;
}

test('admin users directory enforces RBAC, rejects unauthenticated/spoofed headers, and returns empty result cleanly', async () => {
  await withAdminUsersServer(async ({ baseUrl, appDb, emailCapture, origin }) => {
    // 1. Unauthenticated request with spoofed x-user headers -> 401
    const unauthRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: {
        'x-user-id': 'usr_admin_master',
        'x-user-role': 'admin',
      },
    });
    assert.equal(unauthRes.status, 401);

    // 2. Empty DB list verified via direct authorized admin session check before creating test users:
    // Create a single verified user -> temporarily promote -> delete? Better: create parent admin,
    // search for nonexistent term to confirm empty search result structure, AND test direct customer denial.
    const customerCookie = await signUpVerifiedUser(baseUrl, origin, emailCapture, {
      name: 'Customer Alice',
      email: 'alice@example.com',
      password: 'Password123!',
    });

    const customerListRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Cookie: customerCookie },
    });
    assert.equal(customerListRes.status, 403);

    const aliceRow = [...appDb.users.values()].find((u) => u.email === 'alice@example.com');
    assert.ok(aliceRow);

    const customerDetailRes = await fetch(`${baseUrl}/api/admin/users/${aliceRow.id}`, {
      headers: { Cookie: customerCookie },
    });
    assert.equal(customerDetailRes.status, 403);

    const parentCookie = await signUpVerifiedUser(baseUrl, origin, emailCapture, {
      name: 'Super Admin',
      email: 'sachet61@gmail.com',
      password: 'AdminPassword123!',
    });
    const parentRow = [...appDb.users.values()].find((u) => u.email === 'sachet61@gmail.com');
    assert.ok(parentRow);
    parentRow.role = 'admin';

    // Empty search result
    const emptySearchRes = await fetch(
      `${baseUrl}/api/admin/users?search=${encodeURIComponent('nonexistent_user_xyz')}`,
      { headers: { Cookie: parentCookie } },
    );
    assert.equal(emptySearchRes.status, 200);
    const emptyJson = (await emptySearchRes.json()) as {
      success: boolean;
      users: unknown[];
      total: number;
      pagination: { limit: number; offset: number; total: number; hasMore: boolean };
    };
    assert.equal(emptyJson.success, true);
    assert.deepEqual(emptyJson.users, []);
    assert.equal(emptyJson.total, 0);
    assert.equal(emptyJson.pagination.hasMore, false);
  });
});

test('admin users directory supports search escaping, filtering, sorting, pagination, wallet/gameAccount hydration, and strict query validation', async () => {
  await withAdminUsersServer(async ({ baseUrl, appDb, emailCapture, origin }) => {
    const parentCookie = await signUpVerifiedUser(baseUrl, origin, emailCapture, {
      name: 'Parent Admin',
      email: 'sachet61@gmail.com',
      password: 'AdminPassword123!',
    });
    const parentRow = [...appDb.users.values()].find((u) => u.email === 'sachet61@gmail.com');
    assert.ok(parentRow);
    parentRow.role = 'admin';

    await signUpVerifiedUser(baseUrl, origin, emailCapture, {
      name: 'Agent Support',
      email: 'agent@example.com',
      password: 'AgentPassword123!',
    });
    const agentRow = [...appDb.users.values()].find((u) => u.email === 'agent@example.com');
    assert.ok(agentRow);
    agentRow.role = 'agent';

    await signUpVerifiedUser(baseUrl, origin, emailCapture, {
      name: 'Vip_Player_100%',
      email: 'vip_player@example.com',
      password: 'VipPassword123!',
    });
    const vipRow = [...appDb.users.values()].find((u) => u.email === 'vip_player@example.com');
    assert.ok(vipRow);
    vipRow.phone = '+1-555-0199';

    // Attach wallet with decimal precision & game account
    appDb.wallets.set(vipRow.id, {
      customer_id: vipRow.id,
      balance: '142.75',
      referral_bonus_balance: '12.50',
      free_play_balance: '5.00',
      pending_withdrawal: '25.00',
      pending_deposit: '10.00',
      total_deposited: '300.00',
      total_withdrawn: '150.25',
      currency: 'USD',
      updated_at: new Date(),
    });
    appDb.gameAccounts.set('ga_vip_1', {
      id: 'ga_vip_1',
      customer_id: vipRow.id,
      game_id: 'game_firekirin',
      game_title: 'Fire Kirin',
      platform_name: 'Sweepstakes',
      username: 'vip_fk_88',
      password: 'secret_game_pass',
      pin: 'VIP pin 1',
      status: 'active',
      balance: '48.90',
      free_play_balance: '3.25',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Search with literal '%' does NOT match all rows (ILIKE escaped)
    const pctSearchRes = await fetch(
      `${baseUrl}/api/admin/users?search=${encodeURIComponent('100%')}`,
      { headers: { Cookie: parentCookie } },
    );
    assert.equal(pctSearchRes.status, 200);
    const pctJson = (await pctSearchRes.json()) as {
      users: Array<{
        id: string;
        wallet: { availableBalance: number; totalWithdrawn: number };
        gameAccountsCount: number;
        gameAccounts: Array<{ id: string; balance: number }>;
      }>;
      total: number;
    };
    assert.equal(pctJson.total, 1);
    assert.equal(pctJson.users[0]?.id, vipRow.id);
    assert.equal(pctJson.users[0]?.wallet.availableBalance, 142.75);
    assert.equal(pctJson.users[0]?.wallet.totalWithdrawn, 150.25);
    assert.equal(pctJson.users[0]?.gameAccountsCount, 1);
    assert.equal(pctJson.users[0]?.gameAccounts[0]?.balance, 48.9);

    // Filter by role & pagination
    const page1Res = await fetch(
      `${baseUrl}/api/admin/users?sortBy=displayName&sortOrder=asc&limit=2&offset=0`,
      { headers: { Cookie: parentCookie } },
    );
    assert.equal(page1Res.status, 200);
    const page1 = (await page1Res.json()) as {
      users: Array<{ displayName: string }>;
      total: number;
      pagination: { hasMore: boolean };
    };
    assert.equal(page1.total, 3);
    assert.equal(page1.users.length, 2);
    assert.equal(page1.pagination.hasMore, true);
    assert.deepEqual(
      page1.users.map((u) => u.displayName),
      ['Agent Support', 'Parent Admin'],
    );

    const roleFilteredRes = await fetch(
      `${baseUrl}/api/admin/users?role=agent`,
      { headers: { Cookie: parentCookie } },
    );
    assert.equal(roleFilteredRes.status, 200);
    const roleFiltered = (await roleFilteredRes.json()) as {
      users: Array<{ id: string; role: string }>;
    };
    assert.equal(roleFiltered.users.length, 1);
    assert.equal(roleFiltered.users[0]?.id, agentRow.id);

    // Single user detail lookup + missing 404 + invalid ID 400
    const detailRes = await fetch(`${baseUrl}/api/admin/users/${vipRow.id}`, {
      headers: { Cookie: parentCookie },
    });
    assert.equal(detailRes.status, 200);
    const detailJson = (await detailRes.json()) as { user: { id: string; phone: string | null } };
    assert.equal(detailJson.user.id, vipRow.id);
    assert.equal(detailJson.user.phone, '+1-555-0199');

    const missingDetailRes = await fetch(`${baseUrl}/api/admin/users/usr_does_not_exist`, {
      headers: { Cookie: parentCookie },
    });
    assert.equal(missingDetailRes.status, 404);

    // Query spoofing & validation
    const spoofQueryRes = await fetch(
      `${baseUrl}/api/admin/users?actingUserRole=admin`,
      { headers: { Cookie: parentCookie } },
    );
    assert.equal(spoofQueryRes.status, 403);

    const unknownQueryRes = await fetch(
      `${baseUrl}/api/admin/users?userId=someone`,
      { headers: { Cookie: parentCookie } },
    );
    assert.equal(unknownQueryRes.status, 400);

    const badLimitRes = await fetch(
      `${baseUrl}/api/admin/users?limit=999`,
      { headers: { Cookie: parentCookie } },
    );
    assert.equal(badLimitRes.status, 400);
  });
});

test('admin user mutations enforce server RBAC, reject spoofed bodies/unknown fields/CSRF, protect parent admin & self, and revoke sessions', async () => {
  await withAdminUsersServer(async ({ baseUrl, appDb, emailCapture, origin }) => {
    const parentCookie = await signUpVerifiedUser(baseUrl, origin, emailCapture, {
      name: 'Parent Admin',
      email: 'sachet61@gmail.com',
      password: 'AdminPassword123!',
    });
    const parentRow = [...appDb.users.values()].find((u) => u.email === 'sachet61@gmail.com');
    assert.ok(parentRow);
    parentRow.role = 'admin';

    const secondaryAdminCookie = await signUpVerifiedUser(baseUrl, origin, emailCapture, {
      name: 'Secondary Admin',
      email: 'secadmin@example.com',
      password: 'SecAdminPassword123!',
    });
    const secondaryAdminRow = [...appDb.users.values()].find((u) => u.email === 'secadmin@example.com');
    assert.ok(secondaryAdminRow);
    secondaryAdminRow.role = 'admin';

    const agentCookie = await signUpVerifiedUser(baseUrl, origin, emailCapture, {
      name: 'Support Agent',
      email: 'agent2@example.com',
      password: 'AgentPassword123!',
    });
    const agentRow = [...appDb.users.values()].find((u) => u.email === 'agent2@example.com');
    assert.ok(agentRow);
    agentRow.role = 'agent';

    let targetCookie = await signUpVerifiedUser(baseUrl, origin, emailCapture, {
      name: 'Target Player',
      email: 'target@example.com',
      password: 'TargetPassword123!',
    });
    const targetRow = [...appDb.users.values()].find((u) => u.email === 'target@example.com');
    assert.ok(targetRow);

    // Agent can READ directory & detail, but CANNOT mutate role, status, or delete
    const agentReadRes = await fetch(`${baseUrl}/api/admin/users/${targetRow.id}`, {
      headers: { Cookie: agentCookie },
    });
    assert.equal(agentReadRes.status, 200);

    const agentRoleRes = await fetch(`${baseUrl}/api/admin/users/${targetRow.id}/role`, {
      method: 'PATCH',
      headers: { Origin: origin, Cookie: agentCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRole: 'admin' }),
    });
    assert.equal(agentRoleRes.status, 403);

    const agentStatusRes = await fetch(`${baseUrl}/api/admin/users/${targetRow.id}/status`, {
      method: 'PATCH',
      headers: { Origin: origin, Cookie: agentCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'suspended' }),
    });
    assert.equal(agentStatusRes.status, 403);

    const agentDeleteRes = await fetch(`${baseUrl}/api/admin/users/${targetRow.id}`, {
      method: 'DELETE',
      headers: { Origin: origin, Cookie: agentCookie },
    });
    assert.equal(agentDeleteRes.status, 403);

    // Reject spoofed body keys (403) and unknown fields (400)
    const spoofBodyRes = await fetch(`${baseUrl}/api/admin/users/${targetRow.id}/role`, {
      method: 'PATCH',
      headers: { Origin: origin, Cookie: parentCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRole: 'agent', actingUserRole: 'admin' }),
    });
    assert.equal(spoofBodyRes.status, 403);

    const unknownBodyRes = await fetch(`${baseUrl}/api/admin/users/${targetRow.id}/role`, {
      method: 'PATCH',
      headers: { Origin: origin, Cookie: parentCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRole: 'agent', extraField: true }),
    });
    assert.equal(unknownBodyRes.status, 400);

    // CSRF cross-origin blocked on DELETE
    const csrfDeleteRes = await fetch(`${baseUrl}/api/admin/users/${targetRow.id}`, {
      method: 'DELETE',
      headers: { Origin: 'https://evil.invalid', Cookie: parentCookie },
    });
    assert.equal(csrfDeleteRes.status, 403);

    // Parent Admin protection against secondary admin (demote, suspend, delete)
    const demoteParentRes = await fetch(`${baseUrl}/api/admin/users/${parentRow.id}/role`, {
      method: 'PATCH',
      headers: { Origin: origin, Cookie: secondaryAdminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRole: 'customer' }),
    });
    assert.equal(demoteParentRes.status, 403);

    const suspendParentRes = await fetch(`${baseUrl}/api/admin/users/${parentRow.id}/status`, {
      method: 'PATCH',
      headers: { Origin: origin, Cookie: secondaryAdminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'suspended' }),
    });
    assert.equal(suspendParentRes.status, 403);

    const deleteParentRes = await fetch(`${baseUrl}/api/admin/users/${parentRow.id}`, {
      method: 'DELETE',
      headers: { Origin: origin, Cookie: secondaryAdminCookie },
    });
    assert.equal(deleteParentRes.status, 403);

    // Self-demotion, self-suspension, and self-deletion forbidden
    const selfDemoteRes = await fetch(`${baseUrl}/api/admin/users/${secondaryAdminRow.id}/role`, {
      method: 'PATCH',
      headers: { Origin: origin, Cookie: secondaryAdminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRole: 'agent' }),
    });
    assert.equal(selfDemoteRes.status, 403);

    const selfSuspendRes = await fetch(`${baseUrl}/api/admin/users/${secondaryAdminRow.id}/status`, {
      method: 'PATCH',
      headers: { Origin: origin, Cookie: secondaryAdminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'suspended' }),
    });
    assert.equal(selfSuspendRes.status, 403);

    const selfDeleteRes = await fetch(`${baseUrl}/api/admin/users/${secondaryAdminRow.id}`, {
      method: 'DELETE',
      headers: { Origin: origin, Cookie: secondaryAdminCookie },
    });
    assert.equal(selfDeleteRes.status, 403);

    // Role change succeeds, writes audit log, and revokes target's active sessions
    const promoteRes = await fetch(`${baseUrl}/api/admin/users/${targetRow.id}/role`, {
      method: 'PATCH',
      headers: { Origin: origin, Cookie: parentCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRole: 'agent' }),
    });
    assert.equal(promoteRes.status, 200);
    const promoteJson = (await promoteRes.json()) as {
      success: boolean;
      user: { role: string };
    };
    assert.equal(promoteJson.success, true);
    assert.equal(promoteJson.user.role, 'agent');

    // Old target session cookie was revoked on role change
    const targetMeAfterRoleRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: targetCookie },
    });
    assert.equal(targetMeAfterRoleRes.status, 401);

    // Target signs in again, then gets suspended -> session revoked
    const targetReSignIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'target@example.com', password: 'TargetPassword123!' }),
    });
    assert.equal(targetReSignIn.status, 200);
    targetCookie = toCookieHeader(extractSetCookies(targetReSignIn));

    const suspendTargetRes = await fetch(`${baseUrl}/api/admin/users/${targetRow.id}/status`, {
      method: 'PATCH',
      headers: { Origin: origin, Cookie: parentCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'suspended' }),
    });
    assert.equal(suspendTargetRes.status, 200);
    const suspendJson = (await suspendTargetRes.json()) as {
      success: boolean;
      user: { status: string };
    };
    assert.equal(suspendJson.success, true);
    assert.equal(suspendJson.user.status, 'suspended');
    assert.equal(appDb.users.get(targetRow.id)?.status, 'suspended');

    const targetMeSuspended = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: targetCookie },
    });
    assert.equal(targetMeSuspended.status, 401);

    assert.ok(
      appDb.auditLogs.some(
        (log) => log.action === 'USER_ROLE_UPDATED' && log.entity_id === targetRow.id,
      ),
    );
    assert.ok(
      appDb.auditLogs.some(
        (log) => log.action === 'USER_STATUS_UPDATED' && log.entity_id === targetRow.id,
      ),
    );
  });
});

test('DELETE /api/admin/users/:userId atomically deletes user, cascades related records, removes Better Auth user, and rolls back safely on DB failure', async () => {
  await withAdminUsersServer(async ({ baseUrl, appDb, authStore, emailCapture, origin }) => {
    const parentCookie = await signUpVerifiedUser(baseUrl, origin, emailCapture, {
      name: 'Parent Admin',
      email: 'sachet61@gmail.com',
      password: 'AdminPassword123!',
    });
    const parentRow = [...appDb.users.values()].find((u) => u.email === 'sachet61@gmail.com');
    assert.ok(parentRow);
    parentRow.role = 'admin';

    const doomedCookie = await signUpVerifiedUser(baseUrl, origin, emailCapture, {
      name: 'Doomed Player',
      email: 'doomed@example.com',
      password: 'DoomedPassword123!',
    });
    const doomedRow = [...appDb.users.values()].find((u) => u.email === 'doomed@example.com');
    assert.ok(doomedRow);
    const doomedAuthLink = appDb.authLinks.get(doomedRow.id);
    assert.ok(doomedAuthLink?.auth_user_id);

    appDb.wallets.set(doomedRow.id, {
      customer_id: doomedRow.id,
      balance: '50.00',
      referral_bonus_balance: '0.00',
      free_play_balance: '0.00',
      pending_withdrawal: '0.00',
      pending_deposit: '0.00',
      total_deposited: '50.00',
      total_withdrawn: '0.00',
      currency: 'USD',
      updated_at: new Date(),
    });
    appDb.gameAccounts.set('ga_doomed', {
      id: 'ga_doomed',
      customer_id: doomedRow.id,
      game_id: 'game_orion',
      game_title: 'Orion Stars',
      platform_name: 'Sweepstakes',
      username: 'doomed_os',
      password: 'pw',
      pin: null,
      status: 'active',
      balance: '10.00',
      free_play_balance: '0.00',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 1. Force DB error during audit log write to prove transaction ROLLBACK preserves user & records and returns sanitized 500
    appDb.failOnSqlSubstring = 'INSERT INTO public.audit_logs';
    const failedDeleteRes = await fetch(`${baseUrl}/api/admin/users/${doomedRow.id}`, {
      method: 'DELETE',
      headers: { Origin: origin, Cookie: parentCookie },
    });
    assert.equal(failedDeleteRes.status, 500);
    const failedBodyText = await failedDeleteRes.text();
    assert.equal(failedBodyText.includes('sensitive_connection_string'), false);
    assert.equal(failedBodyText.includes('pg_internal_constraint_leak'), false);
    // User, wallet, and game account were rolled back cleanly
    assert.ok(appDb.users.has(doomedRow.id));
    assert.ok(appDb.wallets.has(doomedRow.id));
    assert.ok(appDb.gameAccounts.has('ga_doomed'));

    // 2. Clear injected fault and verify complete deletion + cascade + Better Auth purge
    appDb.failOnSqlSubstring = null;
    const deleteRes = await fetch(`${baseUrl}/api/admin/users/${doomedRow.id}`, {
      method: 'DELETE',
      headers: { Origin: origin, Cookie: parentCookie },
    });
    assert.equal(deleteRes.status, 200);
    const deleteJson = (await deleteRes.json()) as {
      success: boolean;
      deletedUserId: string;
    };
    assert.equal(deleteJson.success, true);
    assert.equal(deleteJson.deletedUserId, doomedRow.id);

    assert.equal(appDb.users.has(doomedRow.id), false);
    assert.equal(appDb.authLinks.has(doomedRow.id), false);
    assert.equal(appDb.wallets.has(doomedRow.id), false);
    assert.equal(appDb.gameAccounts.has('ga_doomed'), false);
    assert.equal(
      (authStore.ba_user as Array<{ id: string }>).some(
        (u) => u.id === doomedAuthLink.auth_user_id,
      ),
      false,
    );

    // Audit log recorded & deleted user's session invalidated & subsequent DELETE returns 404
    assert.ok(
      appDb.auditLogs.some(
        (log) => log.action === 'USER_DELETED' && log.entity_id === doomedRow.id,
      ),
    );
    const doomedMeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: doomedCookie },
    });
    assert.equal(doomedMeRes.status, 401);

    const repeatDeleteRes = await fetch(`${baseUrl}/api/admin/users/${doomedRow.id}`, {
      method: 'DELETE',
      headers: { Origin: origin, Cookie: parentCookie },
    });
    assert.equal(repeatDeleteRes.status, 404);
  });
});
