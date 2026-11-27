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

interface InMemoryAuditLogRow {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string | null;
  timestamp: Date;
}

interface InMemoryGameCatalogRow {
  id: string;
  title: string;
  category: string;
  is_active: boolean;
  game_url: string | null;
}

interface InMemoryGameAccountRow {
  id: string;
  customer_id: string;
  game_id: string;
  game_title: string;
  platform_name: string;
  username: string;
  password: string;
  pin: string | null;
  status: string;
  balance: string;
  free_play_balance: string;
  request_type: string | null;
  assigned_by_agent_id: string | null;
  assigned_by_agent_name: string | null;
  created_at: Date;
  updated_at: Date;
}

class InMemoryGameAccountDatabase
  implements Pick<DatabasePool, 'query' | 'connect'>
{
  public readonly users = new Map<string, InMemoryUserRow>();
  public readonly authLinks = new Map<string, InMemoryAuthLinkRow>();
  public readonly games = new Map<string, InMemoryGameCatalogRow>();
  public gameAccounts = new Map<string, InMemoryGameAccountRow>();
  public auditLogs: InMemoryAuditLogRow[] = [];

  public failNextGameAccountQuery = false;
  public delayInsideTxMs = 0;
  public beginCount = 0;
  public commitCount = 0;
  public rollbackCount = 0;

  private lockQueue: Promise<void> = Promise.resolve();
  private txSnapshot: {
    gameAccounts: Map<string, InMemoryGameAccountRow>;
    auditLogs: InMemoryAuditLogRow[];
  } | null = null;

  public async connect(): Promise<DatabaseClient> {
    let releaseQueue: (() => void) | null = null;
    await new Promise<void>((resolve) => {
      this.lockQueue = this.lockQueue.then(
        () =>
          new Promise<void>((done) => {
            releaseQueue = done;
            resolve();
          }),
      );
    });

    return {
      query: async (sql: string, values?: unknown[]) => {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        if (normalized === 'BEGIN') {
          this.beginCount += 1;
          this.txSnapshot = {
            gameAccounts: new Map(
              Array.from(this.gameAccounts.entries()).map(([k, v]) => [
                k,
                { ...v },
              ]),
            ),
            auditLogs: [...this.auditLogs],
          };
          return { rows: [], rowCount: 0 };
        }
        if (normalized === 'COMMIT') {
          this.commitCount += 1;
          this.txSnapshot = null;
          return { rows: [], rowCount: 0 };
        }
        if (normalized === 'ROLLBACK') {
          this.rollbackCount += 1;
          if (this.txSnapshot) {
            this.gameAccounts = this.txSnapshot.gameAccounts;
            this.auditLogs = this.txSnapshot.auditLogs;
            this.txSnapshot = null;
          }
          return { rows: [], rowCount: 0 };
        }
        return this.query(sql, values);
      },
      release: () => {
        this.txSnapshot = null;
        if (releaseQueue) {
          const done = releaseQueue;
          releaseQueue = null;
          done();
        }
      },
    };
  }

  public async query(
    sql: string,
    values: unknown[] = [],
  ): Promise<{ rows: unknown[]; rowCount?: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim();

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

    if (normalized.startsWith('INSERT INTO public.audit_logs')) {
      const [
        id,
        actor_id,
        actor_name,
        actor_role,
        action,
        entity_type,
        entity_id,
        details,
        timestamp,
      ] = values as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string | null,
        string | undefined,
      ];
      const finalEntityType =
        normalized.includes("'game_account'") ? 'game_account' : entity_type;
      const finalEntityId = normalized.includes("'game_account'")
        ? String(values[5] ?? '')
        : entity_id;
      const finalDetails = normalized.includes("'game_account'")
        ? (values[6] as string | null)
        : details;
      const finalTs = normalized.includes("'game_account'")
        ? new Date(String(values[7] ?? new Date().toISOString()))
        : new Date(String(timestamp ?? new Date().toISOString()));

      this.auditLogs.push({
        id,
        actor_id,
        actor_name,
        actor_role,
        action,
        entity_type: finalEntityType,
        entity_id: finalEntityId,
        details: finalDetails ?? null,
        timestamp: finalTs,
      });
      return { rows: [], rowCount: 1 };
    }

    if (
      normalized.includes('public.game_accounts') &&
      this.failNextGameAccountQuery
    ) {
      this.failNextGameAccountQuery = false;
      throw new Error('pg_game_accounts_error: relation lock timeout');
    }

    if (normalized === 'SELECT id FROM public.users WHERE id = $1 FOR UPDATE') {
      const userId = String(values[0] ?? '');
      const user = this.users.get(userId);
      if (this.delayInsideTxMs > 0) {
        await new Promise((r) => setTimeout(r, this.delayInsideTxMs));
      }
      return { rows: user ? [{ id: user.id }] : [] };
    }

    if (
      normalized ===
      'SELECT id, title, category, is_active, game_url FROM public.game_catalog WHERE id = $1 LIMIT 1'
    ) {
      const gameId = String(values[0] ?? '');
      const game = this.games.get(gameId);
      return { rows: game ? [game] : [] };
    }

    if (
      normalized ===
      'SELECT game_url, category FROM public.game_catalog WHERE id = $1 LIMIT 1'
    ) {
      const gameId = String(values[0] ?? '');
      const game = this.games.get(gameId);
      return {
        rows: game
          ? [{ game_url: game.game_url, category: game.category }]
          : [],
      };
    }

    if (
      normalized ===
      'SELECT EXISTS (SELECT 1 FROM public.game_catalog) AS populated'
    ) {
      return { rows: [{ populated: this.games.size > 0 }] };
    }

    // Single lookup: findById
    if (
      normalized.includes('FROM public.game_accounts ga LEFT JOIN public.game_catalog gc') &&
      normalized.includes('WHERE ga.id = $1 LIMIT 1')
    ) {
      const id = String(values[0] ?? '');
      const row = this.gameAccounts.get(id);
      return { rows: row ? [this.withCatalogJoin(row)] : [] };
    }

    // Lock single game account by id
    if (
      normalized ===
      'SELECT * FROM public.game_accounts WHERE id = $1 FOR UPDATE'
    ) {
      const id = String(values[0] ?? '');
      const row = this.gameAccounts.get(id);
      return { rows: row ? [{ ...row }] : [] };
    }

    // Lock existing game account by customer + (game_id or lower(btrim(game_title)))
    if (
      normalized.includes('FROM public.game_accounts') &&
      normalized.includes('WHERE customer_id = $1 AND (game_id = $2 OR lower(btrim(game_title)) = lower(btrim($3))) FOR UPDATE')
    ) {
      const customerId = String(values[0] ?? '');
      const gameId = String(values[1] ?? '');
      const gameTitle = String(values[2] ?? '').trim().toLowerCase();
      for (const row of this.gameAccounts.values()) {
        if (
          row.customer_id === customerId &&
          (row.game_id === gameId ||
            row.game_title.trim().toLowerCase() === gameTitle)
        ) {
          return { rows: [{ ...row }] };
        }
      }
      return { rows: [] };
    }

    // Count query
    if (
      normalized.startsWith(
        'SELECT COUNT(*)::int AS total FROM public.game_accounts ga',
      )
    ) {
      const filtered = this.filterAccountsForSql(normalized, values);
      return { rows: [{ total: filtered.length }] };
    }

    // List query
    if (
      normalized.includes('FROM public.game_accounts ga LEFT JOIN public.game_catalog gc') &&
      normalized.includes('LIMIT $')
    ) {
      const limit = Number(values[values.length - 2] ?? 50);
      const offset = Number(values[values.length - 1] ?? 0);
      const filterParams = values.slice(0, values.length - 2);
      const filtered = this.filterAccountsForSql(normalized, filterParams);

      const orderMatch =
        /ORDER BY (ga\.created_at|ga\.updated_at|ga\.game_title|ga\.status) (ASC|DESC)/.exec(
          normalized,
        );
      const sortExpr = orderMatch?.[1] ?? 'ga.created_at';
      const sortDir = orderMatch?.[2] === 'DESC' ? -1 : 1;

      filtered.sort((a, b) => {
        if (sortExpr === 'ga.created_at' || sortExpr === 'ga.updated_at') {
          const av = sortExpr === 'ga.created_at' ? a.created_at : a.updated_at;
          const bv = sortExpr === 'ga.created_at' ? b.created_at : b.updated_at;
          if (av.getTime() !== bv.getTime()) {
            return (av.getTime() - bv.getTime()) * sortDir;
          }
        } else if (sortExpr === 'ga.game_title') {
          const cmp = a.game_title.localeCompare(b.game_title);
          if (cmp !== 0) return cmp * sortDir;
        } else if (sortExpr === 'ga.status') {
          const cmp = a.status.localeCompare(b.status);
          if (cmp !== 0) return cmp * sortDir;
        }
        return a.id.localeCompare(b.id);
      });

      return {
        rows: filtered
          .slice(offset, offset + limit)
          .map((row) => this.withCatalogJoin(row)),
      };
    }

    // INSERT new_id_request (customer request)
    if (
      normalized.startsWith('INSERT INTO public.game_accounts') &&
      normalized.includes("'Pending Assignment'")
    ) {
      const [
        id,
        customerId,
        gameId,
        gameTitle,
        platformName,
        pin,
        timestampStr,
      ] = values as [string, string, string, string, string, string, string];

      for (const existing of this.gameAccounts.values()) {
        if (existing.customer_id === customerId && existing.game_id === gameId) {
          throw new Error(
            'duplicate key value violates unique constraint "idx_game_accounts_customer_game_unique"',
          );
        }
      }

      const ts = new Date(timestampStr);
      const row: InMemoryGameAccountRow = {
        id,
        customer_id: customerId,
        game_id: gameId,
        game_title: gameTitle,
        platform_name: platformName,
        username: 'Pending Assignment',
        password: '',
        pin,
        status: 'pending_assignment',
        balance: '0.00',
        free_play_balance: '0.00',
        request_type: 'new_id_request',
        assigned_by_agent_id: null,
        assigned_by_agent_name: null,
        created_at: ts,
        updated_at: ts,
      };
      this.gameAccounts.set(id, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    // INSERT direct provision
    if (normalized.startsWith('INSERT INTO public.game_accounts')) {
      const [
        id,
        customerId,
        gameId,
        gameTitle,
        platformName,
        username,
        password,
        pin,
        status,
        agentId,
        agentName,
        timestampStr,
      ] = values as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string | null,
        string,
        string,
        string,
        string,
      ];

      for (const existing of this.gameAccounts.values()) {
        if (existing.customer_id === customerId && existing.game_id === gameId) {
          throw new Error(
            'duplicate key value violates unique constraint "idx_game_accounts_customer_game_unique"',
          );
        }
      }

      const ts = new Date(timestampStr);
      const row: InMemoryGameAccountRow = {
        id,
        customer_id: customerId,
        game_id: gameId,
        game_title: gameTitle,
        platform_name: platformName,
        username,
        password,
        pin: pin ?? null,
        status,
        balance: '0.00',
        free_play_balance: '0.00',
        request_type: null,
        assigned_by_agent_id: agentId,
        assigned_by_agent_name: agentName,
        created_at: ts,
        updated_at: ts,
      };
      this.gameAccounts.set(id, row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    // UPDATE requestPasswordReset
    if (
      normalized.startsWith('UPDATE public.game_accounts SET status = \'pending_reset\'')
    ) {
      const [id, timestampStr] = values as [string, string];
      const row = this.gameAccounts.get(id);
      if (!row) return { rows: [], rowCount: 0 };
      row.status = 'pending_reset';
      row.request_type = 'password_reset_request';
      row.updated_at = new Date(timestampStr);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    // UPDATE provisionGameAccount (existing)
    if (
      normalized.startsWith('UPDATE public.game_accounts SET game_id = $2')
    ) {
      const [
        id,
        gameId,
        gameTitle,
        platformName,
        username,
        password,
        pin,
        status,
        agentId,
        agentName,
        timestampStr,
      ] = values as [
        string,
        string,
        string,
        string,
        string,
        string,
        string | null,
        string,
        string,
        string,
        string,
      ];
      const row = this.gameAccounts.get(id);
      if (!row) return { rows: [], rowCount: 0 };
      row.game_id = gameId;
      row.game_title = gameTitle;
      row.platform_name = platformName;
      row.username = username;
      row.password = password;
      row.pin = pin ?? null;
      row.status = status;
      row.request_type = null;
      row.assigned_by_agent_id = agentId;
      row.assigned_by_agent_name = agentName;
      row.updated_at = new Date(timestampStr);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    // UPDATE updateCredentials
    if (
      normalized.startsWith('UPDATE public.game_accounts SET username = $2')
    ) {
      const [
        id,
        username,
        password,
        pin,
        status,
        agentId,
        agentName,
        timestampStr,
      ] = values as [
        string,
        string,
        string,
        string | null,
        string,
        string,
        string,
        string,
      ];
      const row = this.gameAccounts.get(id);
      if (!row) return { rows: [], rowCount: 0 };
      row.username = username;
      row.password = password;
      row.pin = pin ?? null;
      row.status = status;
      row.request_type = null;
      row.assigned_by_agent_id = agentId;
      row.assigned_by_agent_name = agentName;
      row.updated_at = new Date(timestampStr);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    // DELETE
    if (normalized === 'DELETE FROM public.game_accounts WHERE id = $1') {
      const id = String(values[0] ?? '');
      const existed = this.gameAccounts.delete(id);
      return { rows: [], rowCount: existed ? 1 : 0 };
    }

    throw new Error(`Unhandled SQL query in InMemoryGameAccountDatabase: ${normalized}`);
  }

  private withCatalogJoin(row: InMemoryGameAccountRow) {
    const cat = this.games.get(row.game_id);
    return {
      ...row,
      game_url: cat?.game_url ?? null,
      catalog_category: cat?.category ?? null,
    };
  }

  private filterAccountsForSql(
    normalizedSql: string,
    params: unknown[],
  ): InMemoryGameAccountRow[] {
    let rows = Array.from(this.gameAccounts.values());

    const eqCustomerMatch = /ga\.customer_id = \$(\d+)/.exec(normalizedSql);
    if (eqCustomerMatch) {
      const cid = String(params[Number(eqCustomerMatch[1]) - 1] ?? '');
      rows = rows.filter((r) => r.customer_id === cid);
    }

    const anyCustomerMatch = /ga\.customer_id = ANY\(\$(\d+)::text\[\]\)/.exec(
      normalizedSql,
    );
    if (anyCustomerMatch) {
      const cids = (params[Number(anyCustomerMatch[1]) - 1] as string[]) ?? [];
      const set = new Set(cids);
      rows = rows.filter((r) => set.has(r.customer_id));
    }

    const statusMatch = /ga\.status = \$(\d+)/.exec(normalizedSql);
    if (statusMatch) {
      const st = String(params[Number(statusMatch[1]) - 1] ?? '');
      rows = rows.filter((r) => r.status === st);
    }

    const gameIdMatch = /ga\.game_id = \$(\d+)/.exec(normalizedSql);
    if (gameIdMatch) {
      const gid = String(params[Number(gameIdMatch[1]) - 1] ?? '');
      rows = rows.filter((r) => r.game_id === gid);
    }

    const searchMatch = /ga\.game_title ILIKE \$(\d+)/.exec(normalizedSql);
    if (searchMatch) {
      const rawPattern = String(params[Number(searchMatch[1]) - 1] ?? '');
      const needle = rawPattern
        .replace(/^%|%$/g, '')
        .replace(/\\(.)/g, '$1')
        .toLowerCase();
      rows = rows.filter(
        (r) =>
          r.game_title.toLowerCase().includes(needle) ||
          r.username.toLowerCase().includes(needle) ||
          r.customer_id.toLowerCase().includes(needle) ||
          r.id.toLowerCase().includes(needle),
      );
    }

    return rows;
  }

  private toJoinedRow(
    user: InMemoryUserRow,
    link?: InMemoryAuthLinkRow,
  ) {
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
      auth_user_id: link?.auth_user_id ?? null,
      legacy_supabase_uid: link?.legacy_supabase_uid ?? null,
      migration_source: link?.migration_source ?? 'self_hosted_signup',
      password_reset_required: link?.password_reset_required ?? false,
      linked_at: link?.linked_at ?? null,
    };
  }
}

function createCaptureEmailAdapter(): {
  adapter: EmailDeliveryAdapter;
  otps: SendOtpEmailPayload[];
} {
  const otps: SendOtpEmailPayload[] = [];
  return {
    otps,
    adapter: {
      providerName: 'test-capture',
      isConfigured: () => true,
      async sendVerificationEmail(_payload: SendVerificationEmailPayload) {},
      async sendOtpEmail(payload: SendOtpEmailPayload) {
        otps.push(payload);
      },
      async sendPasswordResetEmail(_payload: SendPasswordResetEmailPayload) {},
    },
  };
}

function createTestConfig(): ServerConfig {
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
    logLevel: 'error',
    shutdownTimeoutMs: 2_000,
    authSecret: 'test-auth-secret-value-at-least-32-chars-9988',
    authCookiePrefix: 'swiftsweeps_auth',
    authSessionExpiresInSec: 604_800,
    authSessionUpdateAgeSec: 86_400,
    authSessionFreshAgeSec: 900,
    authRequireEmailVerification: true,
    authRateLimitEnabled: false,
    authRateLimitWindowSec: 60,
    authRateLimitMax: 100,
    emailProvider: 'smtp',
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'smtp-user',
    smtpPass: 'smtp-pass',
    emailFromAddress: 'no-reply@swiftsweeps.example.com',
    emailFromName: 'SwiftSweeps',
  };
}

async function withGameAccountServer(
  run: (ctx: {
    baseUrl: string;
    db: InMemoryGameAccountDatabase;
    otps: SendOtpEmailPayload[];
  }) => Promise<void>,
): Promise<void> {
  const db = new InMemoryGameAccountDatabase();
  const { adapter, otps } = createCaptureEmailAdapter();
  const authMemoryDb = {
    ba_user: [],
    ba_session: [],
    ba_account: [],
    ba_verification: [],
    ba_rate_limit: [],
  };

  const app = createApiApp({
    config: createTestConfig(),
    logger: createLogger({ level: 'error', writeStdout: () => {}, writeStderr: () => {} }),
    pool: db,
    authDatabaseOverride: memoryAdapter(authMemoryDb),
    emailDeliveryOverride: adapter,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    await run({ baseUrl, db, otps });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function extractCookies(res: Response): string {
  const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie;
  const raw = typeof getSetCookie === 'function' ? getSetCookie.call(res.headers) : [];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

async function signupAndSignIn(
  baseUrl: string,
  otps: SendOtpEmailPayload[],
  params: { name: string; email: string; password: string },
): Promise<{ cookie: string; userId: string }> {
  const signUpRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      Origin: 'https://swiftsweeps.example.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  assert.equal(signUpRes.status, 200);

  const otpEntry = [...otps]
    .reverse()
    .find((o) => o.to === params.email.toLowerCase());
  assert.ok(otpEntry?.otp, 'Expected OTP email for signup');

  const verifyRes = await fetch(`${baseUrl}/api/auth/email-otp/verify-email`, {
    method: 'POST',
    headers: {
      Origin: 'https://swiftsweeps.example.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email.toLowerCase(),
      otp: otpEntry.otp,
    }),
  });
  assert.equal(verifyRes.status, 200);

  const signInRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      Origin: 'https://swiftsweeps.example.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email.toLowerCase(),
      password: params.password,
    }),
  });
  assert.equal(signInRes.status, 200);
  const cookie = extractCookies(signInRes);
  assert.ok(cookie.length > 0);

  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  assert.equal(meRes.status, 200);
  const meJson = (await meRes.json()) as { user: { id: string } };
  return { cookie, userId: meJson.user.id };
}

function seedCatalog(db: InMemoryGameAccountDatabase) {
  db.games.set('gc_firekirin', {
    id: 'gc_firekirin',
    title: 'Fire Kirin',
    category: 'Fire Kirin Online',
    is_active: true,
    game_url: 'https://firekirin.example.com',
  });
  db.games.set('gc_juwa', {
    id: 'gc_juwa',
    title: 'Juwa',
    category: 'Juwa777',
    is_active: true,
    game_url: 'https://juwa.example.com',
  });
  db.games.set('gc_disabled', {
    id: 'gc_disabled',
    title: 'Legacy Slots',
    category: 'Classic',
    is_active: false,
    game_url: null,
  });
}

test('anonymous access and suspended/password-reset-required accounts are rejected on all /api/game-accounts endpoints', async () => {
  await withGameAccountServer(async ({ baseUrl, db, otps }) => {
    seedCatalog(db);

    const endpoints: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'GET', path: '/api/game-accounts' },
      { method: 'GET', path: '/api/game-accounts/ga_1' },
      {
        method: 'POST',
        path: '/api/game-accounts/requests',
        body: { gameCatalogId: 'gc_firekirin' },
      },
      {
        method: 'POST',
        path: '/api/game-accounts/ga_1/reset-request',
        body: {},
      },
      {
        method: 'POST',
        path: '/api/game-accounts/provision',
        body: {
          customerId: 'usr_1',
          gameCatalogId: 'gc_firekirin',
          username: 'fk_1',
          password: 'pw',
        },
      },
      {
        method: 'PATCH',
        path: '/api/game-accounts/ga_1/credentials',
        body: { username: 'fk_1', password: 'pw' },
      },
      { method: 'DELETE', path: '/api/game-accounts/ga_1' },
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers:
          ep.body !== undefined
            ? {
                Origin: 'https://swiftsweeps.example.com',
                'Content-Type': 'application/json',
              }
            : undefined,
        body: ep.body !== undefined ? JSON.stringify(ep.body) : undefined,
      });
      assert.equal(res.status, 401, `Expected 401 for anonymous ${ep.method} ${ep.path}`);
    }

    const user = await signupAndSignIn(baseUrl, otps, {
      name: 'Blocked Player',
      email: 'blocked@example.com',
      password: 'Password123!',
    });

    db.users.get(user.userId)!.status = 'suspended';
    const suspendedRes = await fetch(`${baseUrl}/api/game-accounts`, {
      headers: { Cookie: user.cookie },
    });
    assert.equal(suspendedRes.status, 403);

    db.users.get(user.userId)!.status = 'active';
    db.authLinks.get(user.userId)!.password_reset_required = true;
    const resetReqRes = await fetch(`${baseUrl}/api/game-accounts`, {
      headers: { Cookie: user.cookie },
    });
    assert.equal(resetReqRes.status, 403);
  });
});

test('customer happy path: request new gaming ID, enforce 1-ID-per-game concurrency, list own accounts, and request password reset', async () => {
  await withGameAccountServer(async ({ baseUrl, db, otps }) => {
    seedCatalog(db);

    const customer = await signupAndSignIn(baseUrl, otps, {
      name: 'Alice Player',
      email: 'alice@example.com',
      password: 'Password123!',
    });
    const otherCustomer = await signupAndSignIn(baseUrl, otps, {
      name: 'Bob Player',
      email: 'bob@example.com',
      password: 'Password123!',
    });

    // Empty results initially
    const initialList = await fetch(`${baseUrl}/api/game-accounts`, {
      headers: { Cookie: customer.cookie },
    });
    assert.equal(initialList.status, 200);
    const initialJson = (await initialList.json()) as {
      accounts: unknown[];
      total: number;
      hasMore: boolean;
    };
    assert.deepEqual(initialJson.accounts, []);
    assert.equal(initialJson.total, 0);
    assert.equal(initialJson.hasMore, false);

    // Concurrent requests for the same game must serialize cleanly -> 1 created (201), 1 conflict (409)
    db.delayInsideTxMs = 20;
    const [r1, r2] = await Promise.all([
      fetch(`${baseUrl}/api/game-accounts/requests`, {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          'Content-Type': 'application/json',
          Cookie: customer.cookie,
        },
        body: JSON.stringify({ gameCatalogId: 'gc_firekirin' }),
      }),
      fetch(`${baseUrl}/api/game-accounts/requests`, {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          'Content-Type': 'application/json',
          Cookie: customer.cookie,
        },
        body: JSON.stringify({ gameCatalogId: 'gc_firekirin' }),
      }),
    ]);
    db.delayInsideTxMs = 0;

    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [201, 409]);

    const createdRes = r1.status === 201 ? r1 : r2;
    const createdJson = (await createdRes.json()) as {
      success: boolean;
      account: {
        id: string;
        customerId: string;
        gameCatalogId: string;
        gameName: string;
        platformName: string;
        username: string;
        status: string;
        requestType: string;
        balance: number;
        freePlayBalance: number;
        gameUrl: string;
      };
    };
    assert.equal(createdJson.success, true);
    assert.equal(createdJson.account.customerId, customer.userId);
    assert.equal(createdJson.account.gameCatalogId, 'gc_firekirin');
    assert.equal(createdJson.account.gameName, 'Fire Kirin');
    assert.equal(createdJson.account.platformName, 'Fire Kirin Online');
    assert.equal(createdJson.account.username, 'Pending Assignment');
    assert.equal(createdJson.account.status, 'pending_assignment');
    assert.equal(createdJson.account.requestType, 'new_id_request');
    assert.equal(createdJson.account.balance, 0);
    assert.equal(createdJson.account.freePlayBalance, 0);
    assert.equal(createdJson.account.gameUrl, 'https://firekirin.example.com');

    // Audit log written
    assert.ok(
      db.auditLogs.some(
        (l) =>
          l.action === 'GAME_ID_REQUESTED' &&
          l.entity_type === 'game_account' &&
          l.entity_id === createdJson.account.id &&
          l.actor_id === customer.userId,
      ),
    );

    // Disabled / missing catalog game rejected with 404
    const disabledGameRes = await fetch(`${baseUrl}/api/game-accounts/requests`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
        Cookie: customer.cookie,
      },
      body: JSON.stringify({ gameCatalogId: 'gc_disabled' }),
    });
    assert.equal(disabledGameRes.status, 404);

    // Cannot request password reset while status is still pending_assignment -> 409
    const resetBeforeActive = await fetch(
      `${baseUrl}/api/game-accounts/${createdJson.account.id}/reset-request`,
      {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          'Content-Type': 'application/json',
          Cookie: customer.cookie,
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(resetBeforeActive.status, 409);

    // Simulate active account (with balance) to test password reset & wrong-owner protection
    const stored = db.gameAccounts.get(createdJson.account.id)!;
    stored.status = 'active';
    stored.request_type = null;
    stored.username = 'alice_fk_77';
    stored.password = 'SecretPass!';
    stored.balance = '42.50';

    // Another customer cannot read or reset Alice's account
    const wrongOwnerGet = await fetch(
      `${baseUrl}/api/game-accounts/${createdJson.account.id}`,
      { headers: { Cookie: otherCustomer.cookie } },
    );
    assert.equal(wrongOwnerGet.status, 403);

    const wrongOwnerList = await fetch(
      `${baseUrl}/api/game-accounts?customerId=${customer.userId}`,
      { headers: { Cookie: otherCustomer.cookie } },
    );
    assert.equal(wrongOwnerList.status, 403);

    const wrongOwnerListMulti = await fetch(
      `${baseUrl}/api/game-accounts?customerIds=${otherCustomer.userId},${customer.userId}`,
      { headers: { Cookie: otherCustomer.cookie } },
    );
    assert.equal(wrongOwnerListMulti.status, 403);

    const wrongOwnerReset = await fetch(
      `${baseUrl}/api/game-accounts/${createdJson.account.id}/reset-request`,
      {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          'Content-Type': 'application/json',
          Cookie: otherCustomer.cookie,
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(wrongOwnerReset.status, 403);

    // Owner requests password reset -> 200
    const resetOk = await fetch(
      `${baseUrl}/api/game-accounts/${createdJson.account.id}/reset-request`,
      {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          'Content-Type': 'application/json',
          Cookie: customer.cookie,
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(resetOk.status, 200);
    const resetJson = (await resetOk.json()) as {
      account: { status: string; requestType: string; balance: number };
    };
    assert.equal(resetJson.account.status, 'pending_reset');
    assert.equal(resetJson.account.requestType, 'password_reset_request');
    assert.equal(resetJson.account.balance, 42.5);

    // Duplicate reset request -> 409
    const resetDup = await fetch(
      `${baseUrl}/api/game-accounts/${createdJson.account.id}/reset-request`,
      {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          'Content-Type': 'application/json',
          Cookie: customer.cookie,
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(resetDup.status, 409);
  });
});

test('staff role authorization, provisioning/updating preserves balance without leaking passwords, credentials assignment, and deletion', async () => {
  await withGameAccountServer(async ({ baseUrl, db, otps }) => {
    seedCatalog(db);

    const customer = await signupAndSignIn(baseUrl, otps, {
      name: 'Player Three',
      email: 'p3@example.com',
      password: 'Password123!',
    });
    const agent = await signupAndSignIn(baseUrl, otps, {
      name: 'Agent Two',
      email: 'agent2@example.com',
      password: 'Password123!',
    });
    db.users.get(agent.userId)!.role = 'agent';

    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Admin Two',
      email: 'admin2@example.com',
      password: 'Password123!',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // Customer cannot call staff-only routes -> 403
    const custProvision = await fetch(`${baseUrl}/api/game-accounts/provision`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
        Cookie: customer.cookie,
      },
      body: JSON.stringify({
        customerId: customer.userId,
        gameCatalogId: 'gc_firekirin',
        username: 'hacked',
        password: 'pw',
      }),
    });
    assert.equal(custProvision.status, 403);

    const custAssign = await fetch(
      `${baseUrl}/api/game-accounts/ga_missing/credentials`,
      {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          'Content-Type': 'application/json',
          Cookie: customer.cookie,
        },
        body: JSON.stringify({ username: 'hacked', password: 'pw' }),
      },
    );
    assert.equal(custAssign.status, 403);

    const custDelete = await fetch(`${baseUrl}/api/game-accounts/ga_missing`, {
      method: 'DELETE',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: customer.cookie,
      },
    });
    assert.equal(custDelete.status, 403);

    // Agent directly provisions a new gaming ID -> 201
    const provRes = await fetch(`${baseUrl}/api/game-accounts/provision`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
        Cookie: agent.cookie,
      },
      body: JSON.stringify({
        customerId: customer.userId,
        gameCatalogId: 'gc_firekirin',
        username: 'p3_fk_01',
        password: 'InitialSecretPassword!99',
        notes: 'VIP room',
      }),
    });
    assert.equal(provRes.status, 201);
    const provJson = (await provRes.json()) as {
      created: boolean;
      account: {
        id: string;
        username: string;
        password: string;
        status: string;
        assignedByAgentId: string;
        assignedByAgentName: string;
      };
    };
    assert.equal(provJson.created, true);
    assert.equal(provJson.account.username, 'p3_fk_01');
    assert.equal(provJson.account.password, 'InitialSecretPassword!99');
    assert.equal(provJson.account.status, 'active');
    assert.equal(provJson.account.assignedByAgentId, agent.userId);
    assert.equal(provJson.account.assignedByAgentName, 'Agent Two');

    // Audit log must never contain plaintext password
    for (const log of db.auditLogs) {
      assert.ok(
        !String(log.details ?? '').includes('InitialSecretPassword!99'),
        'Audit log details must not leak game account passwords',
      );
    }

    // Simulate player having a real wallet balance & free play on that game account
    db.gameAccounts.get(provJson.account.id)!.balance = '125.75';
    db.gameAccounts.get(provJson.account.id)!.free_play_balance = '15.25';

    // Re-provisioning same customer + game updates existing ID and preserves balances (200)
    const updateViaProv = await fetch(`${baseUrl}/api/game-accounts/provision`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        customerId: customer.userId,
        gameCatalogId: 'gc_firekirin',
        username: 'p3_fk_02',
        password: 'UpdatedSecretPassword!88',
      }),
    });
    assert.equal(updateViaProv.status, 200);
    const updateViaProvJson = (await updateViaProv.json()) as {
      created: boolean;
      account: {
        id: string;
        username: string;
        balance: number;
        freePlayBalance: number;
        assignedByAgentId: string;
      };
    };
    assert.equal(updateViaProvJson.created, false);
    assert.equal(updateViaProvJson.account.id, provJson.account.id);
    assert.equal(updateViaProvJson.account.username, 'p3_fk_02');
    assert.equal(updateViaProvJson.account.balance, 125.75);
    assert.equal(updateViaProvJson.account.freePlayBalance, 15.25);
    assert.equal(updateViaProvJson.account.assignedByAgentId, admin.userId);

    // Staff PATCH credentials without password preserves existing password & balances
    const patchRes = await fetch(
      `${baseUrl}/api/game-accounts/${provJson.account.id}/credentials`,
      {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          'Content-Type': 'application/json',
          Cookie: agent.cookie,
        },
        body: JSON.stringify({
          username: 'p3_fk_03',
          notes: null,
          status: 'suspended',
        }),
      },
    );
    assert.equal(patchRes.status, 200);
    const patchJson = (await patchRes.json()) as {
      account: {
        username: string;
        password: string;
        status: string;
        balance: number;
        notes?: string;
      };
    };
    assert.equal(patchJson.account.username, 'p3_fk_03');
    assert.equal(patchJson.account.password, 'UpdatedSecretPassword!88');
    assert.equal(patchJson.account.status, 'suspended');
    assert.equal(patchJson.account.balance, 125.75);
    assert.equal(patchJson.account.notes, undefined);

    // Provisioning for unknown customer or unknown catalog game -> 404
    const missingUserRes = await fetch(`${baseUrl}/api/game-accounts/provision`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        customerId: 'usr_does_not_exist',
        gameCatalogId: 'gc_firekirin',
        username: 'x1',
        password: 'pw1',
      }),
    });
    assert.equal(missingUserRes.status, 404);

    // Customer pending_assignment account requires password when activating via PATCH -> 400
    const reqRes = await fetch(`${baseUrl}/api/game-accounts/requests`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
        Cookie: customer.cookie,
      },
      body: JSON.stringify({ gameCatalogId: 'gc_juwa' }),
    });
    assert.equal(reqRes.status, 201);
    const reqJson = (await reqRes.json()) as { account: { id: string } };

    const missingPwAssign = await fetch(
      `${baseUrl}/api/game-accounts/${reqJson.account.id}/credentials`,
      {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          'Content-Type': 'application/json',
          Cookie: admin.cookie,
        },
        body: JSON.stringify({ username: 'juwa_p3' }),
      },
    );
    assert.equal(missingPwAssign.status, 400);

    // Staff deletes account -> 200, second delete -> 404
    const delRes = await fetch(
      `${baseUrl}/api/game-accounts/${provJson.account.id}`,
      {
        method: 'DELETE',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
        },
      },
    );
    assert.equal(delRes.status, 200);
    assert.ok(!db.gameAccounts.has(provJson.account.id));
    assert.ok(
      db.auditLogs.some(
        (l) =>
          l.action === 'GAME_ACCOUNT_DELETED' &&
          l.entity_id === provJson.account.id &&
          !String(l.details ?? '').includes('UpdatedSecretPassword!88'),
      ),
    );

    const delAgain = await fetch(
      `${baseUrl}/api/game-accounts/${provJson.account.id}`,
      {
        method: 'DELETE',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
        },
      },
    );
    assert.equal(delAgain.status, 404);
  });
});

test('validation, forbidden client field overrides, bounded pagination/filtering/sorting, and DB error masking', async () => {
  await withGameAccountServer(async ({ baseUrl, db, otps }) => {
    seedCatalog(db);

    const p1 = await signupAndSignIn(baseUrl, otps, {
      name: 'One',
      email: 'one@example.com',
      password: 'Password123!',
    });
    const p2 = await signupAndSignIn(baseUrl, otps, {
      name: 'Two',
      email: 'two@example.com',
      password: 'Password123!',
    });
    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Admin Three',
      email: 'admin3@example.com',
      password: 'Password123!',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // Privileged fields rejected with 403
    const spoofCustomerReq = await fetch(`${baseUrl}/api/game-accounts/requests`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
        Cookie: p1.cookie,
      },
      body: JSON.stringify({
        gameCatalogId: 'gc_firekirin',
        customerId: p2.userId,
      }),
    });
    assert.equal(spoofCustomerReq.status, 403);

    const spoofBalanceProv = await fetch(`${baseUrl}/api/game-accounts/provision`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        customerId: p1.userId,
        gameCatalogId: 'gc_firekirin',
        username: 'u1',
        password: 'pw1',
        balance: 9999,
      }),
    });
    assert.equal(spoofBalanceProv.status, 403);

    // Invalid inputs -> 400
    const badLimit = await fetch(`${baseUrl}/api/game-accounts?limit=500`, {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(badLimit.status, 400);

    const badSort = await fetch(`${baseUrl}/api/game-accounts?sortBy=password`, {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(badSort.status, 400);

    const badReserved = await fetch(`${baseUrl}/api/game-accounts/transfer`, {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(badReserved.status, 400);

    const badUsername = await fetch(`${baseUrl}/api/game-accounts/provision`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        customerId: p1.userId,
        gameCatalogId: 'gc_firekirin',
        username: 'Pending Assignment',
        password: 'pw1',
      }),
    });
    assert.equal(badUsername.status, 400);

    // Seed 3 accounts for pagination/filtering/sorting tests
    db.gameAccounts.set('ga_a', {
      id: 'ga_a',
      customer_id: p1.userId,
      game_id: 'gc_firekirin',
      game_title: 'Fire Kirin',
      platform_name: 'Fire Kirin Online',
      username: 'alpha_fk',
      password: 'pw',
      pin: null,
      status: 'active',
      balance: '10.00',
      free_play_balance: '0.00',
      request_type: null,
      assigned_by_agent_id: admin.userId,
      assigned_by_agent_name: 'Admin Three',
      created_at: new Date('2026-02-01T00:00:00.000Z'),
      updated_at: new Date('2026-02-01T00:00:00.000Z'),
    });
    db.gameAccounts.set('ga_b', {
      id: 'ga_b',
      customer_id: p1.userId,
      game_id: 'gc_juwa',
      game_title: 'Juwa',
      platform_name: 'Juwa777',
      username: 'beta_jw',
      password: 'pw',
      pin: null,
      status: 'pending_reset',
      balance: '0.00',
      free_play_balance: '0.00',
      request_type: 'password_reset_request',
      assigned_by_agent_id: admin.userId,
      assigned_by_agent_name: 'Admin Three',
      created_at: new Date('2026-02-02T00:00:00.000Z'),
      updated_at: new Date('2026-02-02T00:00:00.000Z'),
    });
    db.gameAccounts.set('ga_c', {
      id: 'ga_c',
      customer_id: p2.userId,
      game_id: 'gc_firekirin',
      game_title: 'Fire Kirin',
      platform_name: 'Fire Kirin Online',
      username: 'gamma_fk',
      password: 'pw',
      pin: null,
      status: 'active',
      balance: '5.00',
      free_play_balance: '0.00',
      request_type: null,
      assigned_by_agent_id: admin.userId,
      assigned_by_agent_name: 'Admin Three',
      created_at: new Date('2026-02-03T00:00:00.000Z'),
      updated_at: new Date('2026-02-03T00:00:00.000Z'),
    });

    // Pagination page 1 & page 2
    const page1 = await fetch(
      `${baseUrl}/api/game-accounts?sortBy=createdAt&sortOrder=asc&limit=2&offset=0`,
      { headers: { Cookie: admin.cookie } },
    );
    assert.equal(page1.status, 200);
    const p1Json = (await page1.json()) as {
      accounts: Array<{ id: string }>;
      total: number;
      hasMore: boolean;
    };
    assert.equal(p1Json.total, 3);
    assert.equal(p1Json.hasMore, true);
    assert.deepEqual(
      p1Json.accounts.map((a) => a.id),
      ['ga_a', 'ga_b'],
    );

    const page2 = await fetch(
      `${baseUrl}/api/game-accounts?sortBy=createdAt&sortOrder=asc&limit=2&offset=2`,
      { headers: { Cookie: admin.cookie } },
    );
    assert.equal(page2.status, 200);
    const p2Json = (await page2.json()) as {
      accounts: Array<{ id: string }>;
      total: number;
      hasMore: boolean;
    };
    assert.equal(p2Json.total, 3);
    assert.equal(p2Json.hasMore, false);
    assert.deepEqual(
      p2Json.accounts.map((a) => a.id),
      ['ga_c'],
    );

    // Filtering by status + customerIds + search
    const filtered = await fetch(
      `${baseUrl}/api/game-accounts?customerIds=${p1.userId},${p2.userId}&status=active&q=gamma`,
      { headers: { Cookie: admin.cookie } },
    );
    assert.equal(filtered.status, 200);
    const filteredJson = (await filtered.json()) as {
      accounts: Array<{ id: string }>;
      total: number;
    };
    assert.equal(filteredJson.total, 1);
    assert.deepEqual(
      filteredJson.accounts.map((a) => a.id),
      ['ga_c'],
    );

    // DB failure returns masked 500 without leaking SQL/internal details
    db.failNextGameAccountQuery = true;
    const dbErrRes = await fetch(`${baseUrl}/api/game-accounts`, {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(dbErrRes.status, 500);
    const dbErrText = await dbErrRes.text();
    assert.ok(!dbErrText.includes('pg_game_accounts_error'));
    assert.ok(!dbErrText.includes('relation lock timeout'));
  });
});
