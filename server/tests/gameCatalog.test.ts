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
import type { DatabasePool } from '../db/pool.js';
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

interface InMemoryGameCatalogRow {
  id: string;
  title: string;
  category: string;
  description: string | null;
  min_load: number;
  bonus_pct: number;
  is_active: boolean;
  icon_url: string | null;
  image_url: string | null;
  game_url: string | null;
  download_url: string | null;
  links: unknown;
  created_at: Date;
  updated_at: Date;
}

class InMemoryGameCatalogDatabase implements Pick<DatabasePool, 'query'> {
  public readonly users = new Map<string, InMemoryUserRow>();
  public readonly authLinks = new Map<string, InMemoryAuthLinkRow>();
  public readonly auditLogs: InMemoryAuditRow[] = [];
  public readonly games = new Map<string, InMemoryGameCatalogRow>();
  public failNextCatalogQuery = false;

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
      const [id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details] =
        values as [string, string, string, string, string, string, string, string];
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

    if (normalized.includes('public.game_catalog') && this.failNextCatalogQuery) {
      this.failNextCatalogQuery = false;
      throw new Error('pg_catalog_error: relation lock timeout');
    }

    if (normalized === 'SELECT EXISTS (SELECT 1 FROM public.game_catalog) AS populated') {
      return { rows: [{ populated: this.games.size > 0 }] };
    }

    if (normalized.startsWith('SELECT COUNT(*)::int AS total FROM public.game_catalog')) {
      const filtered = this.filterGamesForSql(normalized, values);
      return { rows: [{ total: filtered.length }] };
    }

    if (
      normalized.startsWith('SELECT id, title, category, description, min_load') &&
      normalized.includes('WHERE id = $1 LIMIT 1')
    ) {
      const id = String(values[0] ?? '');
      const row = this.games.get(id);
      return { rows: row ? [row] : [] };
    }

    if (
      normalized.startsWith('SELECT id, title, category, description, min_load') &&
      normalized.includes('FROM public.game_catalog')
    ) {
      const limit = Number(values[values.length - 2] ?? 100);
      const offset = Number(values[values.length - 1] ?? 0);
      const filterParams = values.slice(0, values.length - 2);
      const filtered = this.filterGamesForSql(normalized, filterParams);

      const orderMatch = /ORDER BY (created_at|title|category|updated_at) (ASC|DESC)/.exec(
        normalized,
      );
      const sortCol = (orderMatch?.[1] ?? 'created_at') as
        | 'created_at'
        | 'title'
        | 'category'
        | 'updated_at';
      const sortDir = orderMatch?.[2] === 'DESC' ? -1 : 1;

      filtered.sort((a, b) => {
        const av = a[sortCol];
        const bv = b[sortCol];
        if (av instanceof Date && bv instanceof Date) {
          if (av.getTime() !== bv.getTime()) {
            return (av.getTime() - bv.getTime()) * sortDir;
          }
        } else {
          const cmp = String(av).localeCompare(String(bv));
          if (cmp !== 0) return cmp * sortDir;
        }
        return a.id.localeCompare(b.id);
      });

      return { rows: filtered.slice(offset, offset + limit) };
    }

    if (normalized.startsWith('INSERT INTO public.game_catalog')) {
      const fieldsPerRow = 13;
      const rowCount = Math.floor(values.length / fieldsPerRow);
      const returned: Array<InMemoryGameCatalogRow & { was_inserted?: boolean }> = [];

      for (let i = 0; i < rowCount; i += 1) {
        const base = i * fieldsPerRow;
        const [
          id,
          title,
          category,
          description,
          minLoad,
          bonusPct,
          isActive,
          iconUrl,
          imageUrl,
          gameUrl,
          downloadUrl,
          linksJson,
          createdAtRaw,
        ] = values.slice(base, base + fieldsPerRow) as [
          string,
          string,
          string,
          string | null,
          number,
          number,
          boolean,
          string | null,
          string | null,
          string | null,
          string | null,
          string,
          string | null,
        ];

        const existing = this.games.get(id);
        const now = new Date();
        const createdAt = existing
          ? existing.created_at
          : createdAtRaw
            ? new Date(createdAtRaw)
            : now;

        const row: InMemoryGameCatalogRow = {
          id,
          title,
          category,
          description,
          min_load: Number(minLoad),
          bonus_pct: Number(bonusPct),
          is_active: Boolean(isActive),
          icon_url: iconUrl,
          image_url: imageUrl,
          game_url: gameUrl,
          download_url: downloadUrl,
          links: JSON.parse(linksJson),
          created_at: createdAt,
          updated_at: now,
        };
        this.games.set(id, row);
        returned.push({ ...row, was_inserted: !existing });
      }

      return { rows: returned, rowCount: returned.length };
    }

    if (normalized.startsWith('DELETE FROM public.game_catalog WHERE id = $1')) {
      const id = String(values[0] ?? '');
      const existing = this.games.get(id);
      if (!existing) {
        return { rows: [], rowCount: 0 };
      }
      this.games.delete(id);
      return { rows: [existing], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL in InMemoryGameCatalogDatabase: ${normalized}`);
  }

  private filterGamesForSql(
    normalizedSql: string,
    params: unknown[],
  ): InMemoryGameCatalogRow[] {
    let rows = Array.from(this.games.values());
    if (normalizedSql.includes('is_active = true')) {
      rows = rows.filter((g) => g.is_active);
    }

    let paramIdx = 0;
    if (normalizedSql.includes('lower(category) = lower(')) {
      const targetCat = String(params[paramIdx++] ?? '').toLowerCase();
      rows = rows.filter((g) => g.category.toLowerCase() === targetCat);
    }

    if (normalizedSql.includes('title ILIKE')) {
      const rawLike = String(params[paramIdx++] ?? '');
      const term = rawLike
        .replace(/^%/, '')
        .replace(/%$/, '')
        .replace(/\\([%_\\])/g, '$1')
        .toLowerCase();
      rows = rows.filter(
        (g) =>
          g.title.toLowerCase().includes(term) ||
          g.category.toLowerCase().includes(term) ||
          (g.description ?? '').toLowerCase().includes(term),
      );
    }

    return rows;
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

async function withGameCatalogServer(
  run: (ctx: {
    baseUrl: string;
    db: InMemoryGameCatalogDatabase;
    otps: SendOtpEmailPayload[];
  }) => Promise<void>,
): Promise<void> {
  const db = new InMemoryGameCatalogDatabase();
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
  const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
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

  const otpEntry = [...otps].reverse().find((o) => o.to === params.email.toLowerCase());
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

function seedSampleGames(db: InMemoryGameCatalogDatabase) {
  const t1 = new Date('2026-01-01T00:00:00.000Z');
  const t2 = new Date('2026-01-02T00:00:00.000Z');
  const t3 = new Date('2026-01-03T00:00:00.000Z');

  db.games.set('gc_firekirin', {
    id: 'gc_firekirin',
    title: 'Fire Kirin',
    category: 'Fire Kirin Online',
    description: 'Fish arcade battles',
    min_load: 5,
    bonus_pct: 10,
    is_active: true,
    icon_url: '/images/games/firekirin-v2.webp',
    image_url: '/images/games/firekirin-v2.webp',
    game_url: 'http://start.firekirin.xyz:8580/index.html',
    download_url: 'http://start.firekirin.xyz:8580/index.html',
    links: [{ label: 'Web Play', url: 'http://start.firekirin.xyz:8580/index.html' }],
    created_at: t1,
    updated_at: t1,
  });

  db.games.set('gc_juwa', {
    id: 'gc_juwa',
    title: 'Juwa',
    category: 'Juwa777',
    description: '100% Fish tables',
    min_load: 10,
    bonus_pct: 0,
    is_active: false,
    icon_url: '/images/games/juwa-v2.webp',
    image_url: '/images/games/juwa-v2.webp',
    game_url: 'https://dl.juwa777.com/',
    download_url: 'https://dl.juwa777.com/',
    links: [{ label: 'Web Play', url: 'https://dl.juwa777.com/' }],
    created_at: t2,
    updated_at: t2,
  });

  db.games.set('gc_milkyway', {
    id: 'gc_milkyway',
    title: 'Milky Way',
    category: 'Milkyway Gaming',
    description: 'Galactic slot reels',
    min_load: 5,
    bonus_pct: 5,
    is_active: true,
    icon_url: '/images/games/milkyway-v2.webp',
    image_url: '/images/games/milkyway-v2.webp',
    game_url: 'https://milkywayapp.xyz/',
    download_url: 'https://milkywayapp.xyz/',
    links: [{ label: 'Web Play', url: 'https://milkywayapp.xyz/' }],
    created_at: t3,
    updated_at: t3,
  });
}

const VALID_PNG_DATA_URI = `data:image/png;base64,${Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
]).toString('base64')}`;

test('GET /api/game-catalog handles empty DB, active-only public/customer views, staff includeDisabled, and pagination/sorting/filtering', async () => {
  await withGameCatalogServer(async ({ baseUrl, db, otps }) => {
    // 1. Empty unpopulated DB
    const emptyRes = await fetch(`${baseUrl}/api/game-catalog`);
    assert.equal(emptyRes.status, 200);
    const emptyJson = (await emptyRes.json()) as {
      games: unknown[];
      total: number;
      catalogPopulated: boolean;
    };
    assert.deepEqual(emptyJson.games, []);
    assert.equal(emptyJson.total, 0);
    assert.equal(emptyJson.catalogPopulated, false);

    // 2. Populated DB with 2 active and 1 disabled
    seedSampleGames(db);

    const customer = await signupAndSignIn(baseUrl, otps, {
      name: 'Player One',
      email: 'player1@example.com',
      password: 'Password123!',
    });
    const agent = await signupAndSignIn(baseUrl, otps, {
      name: 'Agent One',
      email: 'agent1@example.com',
      password: 'Password123!',
    });
    db.users.get(agent.userId)!.role = 'agent';

    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Admin One',
      email: 'admin1@example.com',
      password: 'Password123!',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // Public sees only active games
    const anonList = await fetch(`${baseUrl}/api/game-catalog`);
    assert.equal(anonList.status, 200);
    const anonJson = (await anonList.json()) as {
      games: Array<{ id: string; enabled: boolean }>;
      total: number;
      catalogPopulated: boolean;
    };
    assert.deepEqual(
      anonJson.games.map((g) => g.id),
      ['gc_firekirin', 'gc_milkyway'],
    );
    assert.equal(anonJson.total, 2);
    assert.equal(anonJson.catalogPopulated, true);

    // Customer sees only active games
    const custList = await fetch(`${baseUrl}/api/game-catalog`, {
      headers: { Cookie: customer.cookie },
    });
    assert.equal(custList.status, 200);
    const custJson = (await custList.json()) as { games: Array<{ id: string }> };
    assert.deepEqual(
      custJson.games.map((g) => g.id),
      ['gc_firekirin', 'gc_milkyway'],
    );

    // Agent & Admin with includeDisabled=true see all 3
    for (const staffCookie of [agent.cookie, admin.cookie]) {
      const staffRes = await fetch(`${baseUrl}/api/game-catalog?includeDisabled=true`, {
        headers: { Cookie: staffCookie },
      });
      assert.equal(staffRes.status, 200);
      const staffJson = (await staffRes.json()) as {
        games: Array<{ id: string; enabled: boolean }>;
        total: number;
      };
      assert.equal(staffJson.total, 3);
      assert.deepEqual(
        staffJson.games.map((g) => g.id),
        ['gc_firekirin', 'gc_juwa', 'gc_milkyway'],
      );
      assert.equal(staffJson.games[1]!.enabled, false);
    }

    // Pagination + sorting
    const pagedRes = await fetch(
      `${baseUrl}/api/game-catalog?includeDisabled=true&sortBy=title&sortOrder=desc&limit=2&offset=1`,
      { headers: { Cookie: admin.cookie } },
    );
    assert.equal(pagedRes.status, 200);
    const pagedJson = (await pagedRes.json()) as {
      games: Array<{ id: string }>;
      total: number;
      limit: number;
      offset: number;
    };
    assert.equal(pagedJson.total, 3);
    assert.equal(pagedJson.limit, 2);
    assert.equal(pagedJson.offset, 1);
    assert.deepEqual(
      pagedJson.games.map((g) => g.id),
      ['gc_juwa', 'gc_firekirin'],
    );

    // Search escapes % wildcards rather than matching everything
    const wildcardSearch = await fetch(
      `${baseUrl}/api/game-catalog?includeDisabled=true&q=${encodeURIComponent('100%')}`,
      { headers: { Cookie: admin.cookie } },
    );
    assert.equal(wildcardSearch.status, 200);
    const wildcardJson = (await wildcardSearch.json()) as {
      games: Array<{ id: string }>;
    };
    assert.deepEqual(
      wildcardJson.games.map((g) => g.id),
      ['gc_juwa'],
    );

    // Single-game visibility: disabled game hidden (404) from anon/customer, visible (200) to staff
    assert.equal((await fetch(`${baseUrl}/api/game-catalog/gc_juwa`)).status, 404);
    assert.equal(
      (
        await fetch(`${baseUrl}/api/game-catalog/gc_juwa`, {
          headers: { Cookie: customer.cookie },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/game-catalog/gc_juwa`, {
          headers: { Cookie: agent.cookie },
        })
      ).status,
      200,
    );

    // All-disabled populated catalog returns [] with catalogPopulated=true
    db.games.get('gc_firekirin')!.is_active = false;
    db.games.get('gc_milkyway')!.is_active = false;
    const allDisabledRes = await fetch(`${baseUrl}/api/game-catalog`);
    assert.equal(allDisabledRes.status, 200);
    const allDisabledJson = (await allDisabledRes.json()) as {
      games: unknown[];
      total: number;
      catalogPopulated: boolean;
    };
    assert.deepEqual(allDisabledJson.games, []);
    assert.equal(allDisabledJson.total, 0);
    assert.equal(allDisabledJson.catalogPopulated, true);
  });
});

test('Admin catalog mutations create, update, patch, batch-save, delete, preserve idempotency, and record server-verified audit logs', async () => {
  await withGameCatalogServer(async ({ baseUrl, db, otps }) => {
    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Master Admin',
      email: 'master-admin@example.com',
      password: 'Password123!',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // 1. POST creates a game (201)
    const createRes = await fetch(`${baseUrl}/api/game-catalog`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 'gc_orion',
        title: 'Orion Stars',
        platform: 'Orion Play',
        description: 'Arcade fish & reels',
        iconUrl: '/images/games/orionstars-v2.webp',
        links: [
          { label: 'Web Play', url: 'http://start.orionstars.vip:8580/index.html' },
          { label: 'Download Link', url: 'https://download.orionstars.vip/app.apk' },
        ],
        enabled: true,
      }),
    });
    assert.equal(createRes.status, 201);
    const createJson = (await createRes.json()) as {
      created: boolean;
      game: { id: string; title: string; links: Array<{ label: string; url: string }> };
    };
    assert.equal(createJson.created, true);
    assert.equal(createJson.game.id, 'gc_orion');
    assert.equal(createJson.game.links.length, 2);

    // 2. PUT /:gameId updates idempotently (200)
    const putPayload = {
      id: 'gc_orion',
      title: 'Orion Stars Elite',
      platform: 'Orion Play VIP',
      description: 'Updated description',
      iconUrl: VALID_PNG_DATA_URI,
      links: [{ label: 'Web Play', url: 'https://orionstars.example.com' }],
      enabled: true,
    };
    const putRes1 = await fetch(`${baseUrl}/api/game-catalog/gc_orion`, {
      method: 'PUT',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(putPayload),
    });
    assert.equal(putRes1.status, 200);
    const putRes2 = await fetch(`${baseUrl}/api/game-catalog/gc_orion`, {
      method: 'PUT',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(putPayload),
    });
    assert.equal(putRes2.status, 200);
    assert.equal(db.games.size, 1);

    // 3. PATCH /:gameId toggles enabled while preserving links and iconUrl
    const patchRes = await fetch(`${baseUrl}/api/game-catalog/gc_orion`, {
      method: 'PATCH',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(patchRes.status, 200);
    const patchJson = (await patchRes.json()) as {
      game: { enabled: boolean; title: string; iconUrl: string; links: unknown[] };
    };
    assert.equal(patchJson.game.enabled, false);
    assert.equal(patchJson.game.title, 'Orion Stars Elite');
    assert.equal(patchJson.game.iconUrl, VALID_PNG_DATA_URI);
    assert.equal(patchJson.game.links.length, 1);

    // 4. PUT /api/game-catalog/config atomically batch-saves and preserves idempotency under concurrency
    const configPayload = {
      games: [
        {
          id: 'gc_orion',
          title: 'Orion Stars Elite',
          platform: 'Orion Play VIP',
          enabled: false,
          iconUrl: '/images/games/orionstars-v2.webp',
          links: [{ label: 'Web Play', url: 'https://orionstars.example.com' }],
        },
        {
          id: 'gc_juwa',
          title: 'Juwa',
          platform: 'Juwa777',
          enabled: true,
          iconUrl: '/images/games/juwa-v2.webp',
          links: [{ label: 'Web Play', url: 'https://dl.juwa777.com/' }],
        },
      ],
    };
    const [cfg1, cfg2] = await Promise.all([
      fetch(`${baseUrl}/api/game-catalog/config`, {
        method: 'PUT',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(configPayload),
      }),
      fetch(`${baseUrl}/api/game-catalog/config`, {
        method: 'PUT',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(configPayload),
      }),
    ]);
    assert.equal(cfg1.status, 200);
    assert.equal(cfg2.status, 200);
    assert.equal(db.games.size, 2);

    // 5. DELETE /:gameId removes game and returns 404 on repeat delete
    const del1 = await fetch(`${baseUrl}/api/game-catalog/gc_orion`, {
      method: 'DELETE',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: admin.cookie,
      },
    });
    assert.equal(del1.status, 200);
    const del2 = await fetch(`${baseUrl}/api/game-catalog/gc_orion`, {
      method: 'DELETE',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: admin.cookie,
      },
    });
    assert.equal(del2.status, 404);

    // Confirm server-side audit logs use verified admin actor
    const catalogAudits = db.auditLogs.filter((a) =>
      a.action.startsWith('GAME_CATALOG_'),
    );
    assert.ok(catalogAudits.length >= 6);
    assert.ok(
      catalogAudits.every(
        (a) =>
          a.actor_id === admin.userId &&
          a.actor_name === 'Master Admin' &&
          a.actor_role === 'admin',
      ),
    );
    assert.ok(catalogAudits.some((a) => a.action === 'GAME_CATALOG_CREATED'));
    assert.ok(catalogAudits.some((a) => a.action === 'GAME_CATALOG_CONFIG_SAVED'));
    assert.ok(catalogAudits.some((a) => a.action === 'GAME_CATALOG_DELETED'));
  });
});

test('Game catalog enforces anonymous 401, customer/agent 403, CSRF checks, actor spoofing prevention, and suspended admin block', async () => {
  await withGameCatalogServer(async ({ baseUrl, db, otps }) => {
    seedSampleGames(db);

    const customer = await signupAndSignIn(baseUrl, otps, {
      name: 'Customer User',
      email: 'cust-authz@example.com',
      password: 'Password123!',
    });
    const agent = await signupAndSignIn(baseUrl, otps, {
      name: 'Agent User',
      email: 'agent-authz@example.com',
      password: 'Password123!',
    });
    db.users.get(agent.userId)!.role = 'agent';

    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Admin User',
      email: 'admin-authz@example.com',
      password: 'Password123!',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // 1. Anonymous includeDisabled & all mutations -> 401
    assert.equal(
      (await fetch(`${baseUrl}/api/game-catalog?includeDisabled=true`)).status,
      401,
    );
    for (const [method, path, body] of [
      ['POST', '/api/game-catalog', { title: 'Anon Game' }],
      ['PUT', '/api/game-catalog/gc_firekirin', { title: 'Anon Update' }],
      ['PATCH', '/api/game-catalog/gc_firekirin', { enabled: false }],
      ['PUT', '/api/game-catalog/config', { games: [{ id: 'gc_firekirin', title: 'X' }] }],
      ['DELETE', '/api/game-catalog/gc_firekirin', undefined],
    ] as const) {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(res.status, 401, `Expected 401 for anon ${method} ${path}`);
    }

    // 2. Customer includeDisabled -> 403
    assert.equal(
      (
        await fetch(`${baseUrl}/api/game-catalog?includeDisabled=true`, {
          headers: { Cookie: customer.cookie },
        })
      ).status,
      403,
    );

    // 3. Customer & Agent (read-only role) blocked from all mutations -> 403
    for (const cookie of [customer.cookie, agent.cookie]) {
      for (const [method, path, body] of [
        ['POST', '/api/game-catalog', { title: 'Unauthorized Game' }],
        ['PUT', '/api/game-catalog/gc_firekirin', { title: 'Unauthorized Update' }],
        ['PATCH', '/api/game-catalog/gc_firekirin', { enabled: false }],
        [
          'PUT',
          '/api/game-catalog/config',
          { games: [{ id: 'gc_firekirin', title: 'Unauthorized Batch' }] },
        ],
        ['DELETE', '/api/game-catalog/gc_firekirin', undefined],
      ] as const) {
        const res = await fetch(`${baseUrl}${path}`, {
          method,
          headers: {
            Origin: 'https://swiftsweeps.example.com',
            Cookie: cookie,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        assert.equal(res.status, 403, `Expected 403 for ${method} ${path}`);
      }
    }

    // 4. Client-supplied actor/role spoofing rejected -> 403
    const spoofRes = await fetch(`${baseUrl}/api/game-catalog`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Spoofed Actor Game',
        actorId: 'usr_other',
        actorRole: 'superadmin',
      }),
    });
    assert.equal(spoofRes.status, 403);

    // 5. Missing Origin / CSRF check on cookie mutation -> 403
    const csrfRes = await fetch(`${baseUrl}/api/game-catalog/gc_firekirin`, {
      method: 'PATCH',
      headers: {
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(csrfRes.status, 403);

    // 6. Suspended admin blocked from mutations and includeDisabled
    db.users.get(admin.userId)!.status = 'suspended';
    assert.equal(
      (
        await fetch(`${baseUrl}/api/game-catalog?includeDisabled=true`, {
          headers: { Cookie: admin.cookie },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/game-catalog/gc_firekirin`, {
          method: 'DELETE',
          headers: {
            Origin: 'https://swiftsweeps.example.com',
            Cookie: admin.cookie,
          },
        })
      ).status,
      403,
    );
  });
});

test('Game catalog rejects invalid inputs, XSS/spoofed image payloads, bad query params, and hides DB error internals', async () => {
  await withGameCatalogServer(async ({ baseUrl, db, otps }) => {
    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Validation Admin',
      email: 'validate-admin@example.com',
      password: 'Password123!',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // Invalid query parameters
    for (const qs of [
      '?includeDisabled=yes',
      '?limit=0',
      '?limit=101',
      '?limit=abc',
      '?offset=-1',
      '?sortBy=password',
      '?sortOrder=random',
      '?unknownParam=1',
    ]) {
      const res = await fetch(`${baseUrl}/api/game-catalog${qs}`, {
        headers: { Cookie: admin.cookie },
      });
      assert.equal(res.status, 400, `Expected 400 for query ${qs}`);
    }

    // Invalid game payloads
    const fakePng = Buffer.from('<svg onload=alert(1)>').toString('base64');
    const invalidBodies = [
      {},
      { title: '   ' },
      { title: 'x'.repeat(121) },
      { title: 'Bad\nTitle' },
      { id: 'config', title: 'Reserved' },
      { id: 'bad id!', title: 'Bad ID' },
      { title: 'XSS Link', links: [{ label: 'Play', url: 'javascript:alert(1)' }] },
      { title: 'Creds URL', gameUrl: 'https://user:pass@evil.example.com' },
      { title: 'SVG Icon', iconUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
      { title: 'Fake PNG', iconUrl: `data:image/png;base64,${fakePng}` },
      { title: 'HTTP Icon', iconUrl: 'http://insecure.example.com/icon.png' },
      { title: 'Traversal Icon', iconUrl: '/images/../etc/passwd' },
      { title: 'Unknown Key', unknownField: 123 },
    ];

    for (const payload of invalidBodies) {
      const res = await fetch(`${baseUrl}/api/game-catalog`, {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      assert.equal(
        res.status,
        400,
        `Expected 400 for body ${JSON.stringify(payload).slice(0, 80)}`,
      );
    }

    // Invalid config batches
    for (const batch of [
      { games: [] },
      {
        games: [
          { id: 'gc_a', title: 'Game A' },
          { id: 'gc_a', title: 'Duplicate A' },
        ],
      },
      { games: [{ title: 'Missing ID' }] },
      { extra: true, games: [{ id: 'gc_a', title: 'Game A' }] },
    ]) {
      const res = await fetch(`${baseUrl}/api/game-catalog/config`, {
        method: 'PUT',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });
      assert.equal(res.status, 400);
    }

    // Path/body ID mismatch and missing target on PATCH
    const mismatchRes = await fetch(`${baseUrl}/api/game-catalog/gc_one`, {
      method: 'PUT',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: 'gc_two', title: 'Mismatch' }),
    });
    assert.equal(mismatchRes.status, 400);

    const missingPatchRes = await fetch(`${baseUrl}/api/game-catalog/gc_nonexistent`, {
      method: 'PATCH',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(missingPatchRes.status, 404);

    // DB failure hides SQL internals
    db.failNextCatalogQuery = true;
    const dbErrRes = await fetch(`${baseUrl}/api/game-catalog`);
    assert.equal(dbErrRes.status, 500);
    const dbErrText = await dbErrRes.text();
    assert.equal(dbErrText.includes('pg_catalog_error'), false);
    assert.equal(dbErrText.includes('relation lock timeout'), false);
  });
});
