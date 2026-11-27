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

interface InMemoryOfficialPartnerRow {
  id: string;
  name: string;
  icon_url: string | null;
  platform: 'facebook' | 'instagram' | 'telegram';
  page_url: string;
  message_link: string | null;
  game_id: string | null;
  note: string | null;
  is_visible: boolean;
  sort_order: number;
  updated_by: string | null;
  updated_at: Date;
}

interface InMemoryOfficialPartnerIconRow {
  id: string;
  content_type: 'image/png' | 'image/jpeg' | 'image/webp';
  image_data: Buffer;
  size_bytes: number;
  created_by: string | null;
  created_at: Date;
}

class InMemoryOfficialPartnersDatabase
  implements Pick<DatabasePool, 'query' | 'connect'>
{
  public readonly users = new Map<string, InMemoryUserRow>();
  public readonly authLinks = new Map<string, InMemoryAuthLinkRow>();
  public auditLogs: InMemoryAuditRow[] = [];
  public partners = new Map<string, InMemoryOfficialPartnerRow>();
  public icons = new Map<string, InMemoryOfficialPartnerIconRow>();
  public failNextPartnerQuery = false;

  private txSnapshot: {
    partners: Map<string, InMemoryOfficialPartnerRow>;
    auditLogs: InMemoryAuditRow[];
  } | null = null;

  public async connect(): Promise<DatabaseClient> {
    return {
      query: (text: string, values?: unknown[]) => this.query(text, values),
      release: () => {},
    };
  }

  public async query(
    sql: string,
    values: unknown[] = [],
  ): Promise<{ rows: unknown[]; rowCount?: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized === 'BEGIN') {
      this.txSnapshot = {
        partners: new Map(
          Array.from(this.partners.entries()).map(([k, v]) => [k, { ...v }]),
        ),
        auditLogs: [...this.auditLogs],
      };
      return { rows: [] };
    }

    if (normalized === 'COMMIT') {
      this.txSnapshot = null;
      return { rows: [] };
    }

    if (normalized === 'ROLLBACK') {
      if (this.txSnapshot) {
        this.partners = this.txSnapshot.partners;
        this.auditLogs = this.txSnapshot.auditLogs;
        this.txSnapshot = null;
      }
      return { rows: [] };
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
      if (normalized.includes("'official_partner'")) {
        const [
          id,
          actor_id,
          actor_name,
          actor_role,
          action,
          entity_id,
          details,
          timestampRaw,
        ] = values as [
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
          entity_type: 'official_partner',
          entity_id,
          details,
          timestamp: new Date(timestampRaw),
        });
      } else {
        const [
          id,
          actor_id,
          actor_name,
          actor_role,
          action,
          entity_type,
          entity_id,
          details,
        ] = values as [
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
      }
      return { rows: [], rowCount: 1 };
    }

    if (
      (normalized.includes('public.official_partners') ||
        normalized.includes('public.official_partner_icons')) &&
      this.failNextPartnerQuery
    ) {
      this.failNextPartnerQuery = false;
      throw new Error('pg_partners_error: relation lock timeout');
    }

    if (
      normalized.startsWith(
        'SELECT COUNT(*)::int AS total FROM public.official_partners',
      )
    ) {
      const filtered = this.filterPartnersForSql(normalized, values);
      return { rows: [{ total: filtered.length }] };
    }

    if (
      normalized.startsWith(
        'SELECT id, name, icon_url, platform, page_url, message_link, game_id, note, is_visible, sort_order, updated_by, updated_at FROM public.official_partners WHERE id = $1',
      )
    ) {
      const id = String(values[0] ?? '').toLowerCase();
      const row = this.partners.get(id);
      return { rows: row ? [row] : [] };
    }

    if (
      normalized.startsWith(
        'SELECT id FROM public.official_partners WHERE id = ANY($1::uuid[])',
      )
    ) {
      const ids = Array.isArray(values[0])
        ? values[0].map((v) => String(v).toLowerCase())
        : [];
      const rows = ids
        .map((id) => this.partners.get(id))
        .filter((r): r is InMemoryOfficialPartnerRow => Boolean(r))
        .map((r) => ({ id: r.id }));
      return { rows };
    }

    if (
      normalized.startsWith(
        'SELECT id, name, icon_url, platform, page_url, message_link, game_id, note, is_visible, sort_order, updated_by, updated_at FROM public.official_partners',
      )
    ) {
      const hasLimit = normalized.includes('LIMIT');
      const limit = hasLimit && values.length >= 2
        ? Number(values[values.length - 2] ?? 200)
        : 200;
      const offset = hasLimit && values.length >= 2
        ? Number(values[values.length - 1] ?? 0)
        : 0;
      const filterParams = hasLimit ? values.slice(0, values.length - 2) : [];
      const filtered = this.filterPartnersForSql(normalized, filterParams);

      if (normalized.includes('ORDER BY lower(name)')) {
        const dir = normalized.includes('lower(name) DESC') ? -1 : 1;
        filtered.sort(
          (a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase()) * dir ||
            a.sort_order - b.sort_order ||
            a.id.localeCompare(b.id),
        );
      } else if (normalized.includes('ORDER BY platform')) {
        const dir = normalized.includes('ORDER BY platform DESC') ? -1 : 1;
        filtered.sort(
          (a, b) =>
            a.platform.localeCompare(b.platform) * dir ||
            a.sort_order - b.sort_order ||
            a.name.localeCompare(b.name) ||
            a.id.localeCompare(b.id),
        );
      } else if (normalized.includes('ORDER BY updated_at')) {
        const dir = normalized.includes('ORDER BY updated_at DESC') ? -1 : 1;
        filtered.sort(
          (a, b) =>
            (a.updated_at.getTime() - b.updated_at.getTime()) * dir ||
            a.sort_order - b.sort_order ||
            a.id.localeCompare(b.id),
        );
      } else {
        const dir = normalized.includes('ORDER BY sort_order DESC') ? -1 : 1;
        filtered.sort(
          (a, b) =>
            (a.sort_order - b.sort_order) * dir ||
            a.name.localeCompare(b.name) ||
            a.id.localeCompare(b.id),
        );
      }

      return { rows: filtered.slice(offset, offset + limit) };
    }

    if (
      normalized ===
      'SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order FROM public.official_partners'
    ) {
      let max = -1;
      for (const row of this.partners.values()) {
        if (row.sort_order > max) max = row.sort_order;
      }
      return { rows: [{ max_sort_order: max }] };
    }

    if (normalized.startsWith('INSERT INTO public.official_partners')) {
      const [
        id,
        name,
        iconUrl,
        platform,
        pageUrl,
        messageLink,
        gameId,
        note,
        isVisible,
        sortOrder,
        updatedBy,
        updatedAtRaw,
      ] = values as [
        string,
        string,
        string | null,
        'facebook' | 'instagram' | 'telegram',
        string,
        string | null,
        string | null,
        string | null,
        boolean,
        number,
        string | null,
        string,
      ];
      const row: InMemoryOfficialPartnerRow = {
        id: id.toLowerCase(),
        name,
        icon_url: iconUrl,
        platform,
        page_url: pageUrl,
        message_link: messageLink,
        game_id: gameId,
        note,
        is_visible: isVisible,
        sort_order: sortOrder,
        updated_by: updatedBy,
        updated_at: new Date(updatedAtRaw),
      };
      this.partners.set(row.id, row);
      return { rows: [row], rowCount: 1 };
    }

    if (
      normalized.startsWith(
        'UPDATE public.official_partners SET name = $2',
      )
    ) {
      const [
        id,
        name,
        iconUrl,
        platform,
        pageUrl,
        messageLink,
        gameId,
        note,
        isVisible,
        updatedBy,
        updatedAtRaw,
      ] = values as [
        string,
        string,
        string | null,
        'facebook' | 'instagram' | 'telegram',
        string,
        string | null,
        string | null,
        string | null,
        boolean,
        string | null,
        string,
      ];
      const row = this.partners.get(id.toLowerCase());
      if (!row) return { rows: [], rowCount: 0 };
      row.name = name;
      row.icon_url = iconUrl;
      row.platform = platform;
      row.page_url = pageUrl;
      row.message_link = messageLink;
      row.game_id = gameId;
      row.note = note;
      row.is_visible = isVisible;
      row.updated_by = updatedBy;
      row.updated_at = new Date(updatedAtRaw);
      return { rows: [row], rowCount: 1 };
    }

    if (
      normalized.startsWith(
        'UPDATE public.official_partners SET sort_order = $2',
      )
    ) {
      const [id, sortOrder, updatedBy, updatedAtRaw] = values as [
        string,
        number,
        string | null,
        string,
      ];
      const row = this.partners.get(id.toLowerCase());
      if (!row) return { rows: [], rowCount: 0 };
      row.sort_order = sortOrder;
      row.updated_by = updatedBy;
      row.updated_at = new Date(updatedAtRaw);
      return { rows: [row], rowCount: 1 };
    }

    if (
      normalized.startsWith('DELETE FROM public.official_partners WHERE id = $1')
    ) {
      const id = String(values[0] ?? '').toLowerCase();
      const existed = this.partners.delete(id);
      return { rows: [], rowCount: existed ? 1 : 0 };
    }

    if (normalized.startsWith('INSERT INTO public.official_partner_icons')) {
      const [id, contentType, imageData, sizeBytes, createdBy, createdAtRaw] =
        values as [
          string,
          'image/png' | 'image/jpeg' | 'image/webp',
          Buffer,
          number,
          string | null,
          string,
        ];
      this.icons.set(id, {
        id,
        content_type: contentType,
        image_data: Buffer.from(imageData),
        size_bytes: sizeBytes,
        created_by: createdBy,
        created_at: new Date(createdAtRaw),
      });
      return { rows: [], rowCount: 1 };
    }

    if (
      normalized.startsWith(
        'SELECT id, content_type, image_data, size_bytes, created_by, created_at FROM public.official_partner_icons WHERE id = $1',
      )
    ) {
      const id = String(values[0] ?? '');
      const row = this.icons.get(id);
      return { rows: row ? [row] : [] };
    }

    throw new Error(
      `Unexpected SQL in InMemoryOfficialPartnersDatabase: ${normalized}`,
    );
  }

  private filterPartnersForSql(
    normalizedSql: string,
    params: unknown[],
  ): InMemoryOfficialPartnerRow[] {
    let rows = Array.from(this.partners.values());
    if (normalizedSql.includes('is_visible = true')) {
      rows = rows.filter((p) => p.is_visible);
    }

    let paramIdx = 0;
    if (normalizedSql.includes('platform = $')) {
      const targetPlatform = String(params[paramIdx++] ?? '');
      rows = rows.filter((p) => p.platform === targetPlatform);
    }

    if (normalizedSql.includes('name ILIKE')) {
      const rawLike = String(params[paramIdx++] ?? '');
      const term = rawLike
        .replace(/^%/, '')
        .replace(/%$/, '')
        .replace(/\\([%_\\])/g, '$1')
        .toLowerCase();
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.note ?? '').toLowerCase().includes(term) ||
          p.page_url.toLowerCase().includes(term),
      );
    }

    return rows;
  }

  private toJoinedRow(
    user: InMemoryUserRow,
    link: InMemoryAuthLinkRow | undefined,
  ) {
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
    databaseUrl:
      'postgres://staging_user:not_a_real_secret@127.0.0.1:5432/staging_db',
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

async function withOfficialPartnersServer(
  run: (ctx: {
    baseUrl: string;
    db: InMemoryOfficialPartnersDatabase;
    otps: SendOtpEmailPayload[];
  }) => Promise<void>,
): Promise<void> {
  const db = new InMemoryOfficialPartnersDatabase();
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
    logger: createLogger({
      level: 'error',
      writeStdout: () => {},
      writeStderr: () => {},
    }),
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
  const getSetCookie = (
    res.headers as unknown as { getSetCookie?: () => string[] }
  ).getSetCookie;
  const raw =
    typeof getSetCookie === 'function' ? getSetCookie.call(res.headers) : [];
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

const PARTNER_ID_1 = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID_2 = '22222222-2222-4222-8222-222222222222';
const PARTNER_ID_3 = '33333333-3333-4333-8333-333333333333';

function seedSamplePartners(db: InMemoryOfficialPartnersDatabase) {
  db.partners.set(PARTNER_ID_1, {
    id: PARTNER_ID_1,
    name: 'VIP Desk FB',
    icon_url: 'https://cdn.example.com/fb.png',
    platform: 'facebook',
    page_url: 'https://www.facebook.com/SwiftSweepsVIP',
    message_link: 'https://m.me/SwiftSweepsVIP',
    game_id: 'gc_firekirin',
    note: 'Fast 100% VIP support',
    is_visible: true,
    sort_order: 0,
    updated_by: 'admin-seed',
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
  });
  db.partners.set(PARTNER_ID_2, {
    id: PARTNER_ID_2,
    name: 'Hidden TG Desk',
    icon_url: null,
    platform: 'telegram',
    page_url: 'https://t.me/hidden_desk',
    message_link: null,
    game_id: null,
    note: 'Internal preview only',
    is_visible: false,
    sort_order: 1,
    updated_by: 'admin-seed',
    updated_at: new Date('2026-01-02T00:00:00.000Z'),
  });
  db.partners.set(PARTNER_ID_3, {
    id: PARTNER_ID_3,
    name: 'Alpha IG Support',
    icon_url: null,
    platform: 'instagram',
    page_url: 'https://www.instagram.com/alpha_support',
    message_link: null,
    game_id: null,
    note: '24/7 IG chat',
    is_visible: true,
    sort_order: 2,
    updated_by: 'admin-seed',
    updated_at: new Date('2026-01-03T00:00:00.000Z'),
  });
}

test('GET /api/official-partners and /api/admin/official-partners handle empty DB, role visibility, filtering, pagination, and sorting', async () => {
  await withOfficialPartnersServer(async ({ baseUrl, db, otps }) => {
    const customer = await signupAndSignIn(baseUrl, otps, {
      name: 'Player One',
      email: 'player-op@example.com',
      password: 'Password123!',
    });
    const agent = await signupAndSignIn(baseUrl, otps, {
      name: 'Agent One',
      email: 'agent-op@example.com',
      password: 'Password123!',
    });
    db.users.get(agent.userId)!.role = 'agent';

    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Admin One',
      email: 'admin-op@example.com',
      password: 'Password123!',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // Empty result set returns [] cleanly
    const emptyRes = await fetch(`${baseUrl}/api/official-partners`, {
      headers: { Cookie: customer.cookie },
    });
    assert.equal(emptyRes.status, 200);
    const emptyJson = (await emptyRes.json()) as {
      success: boolean;
      partners: unknown[];
      total: number;
      hasMore: boolean;
    };
    assert.equal(emptyJson.success, true);
    assert.deepEqual(emptyJson.partners, []);
    assert.equal(emptyJson.total, 0);
    assert.equal(emptyJson.hasMore, false);

    seedSamplePartners(db);

    // Customer sees only visible partners in manual order
    const custRes = await fetch(`${baseUrl}/api/official-partners`, {
      headers: { Cookie: customer.cookie },
    });
    assert.equal(custRes.status, 200);
    const custJson = (await custRes.json()) as {
      partners: Array<{ id: string; isVisible: boolean }>;
      total: number;
    };
    assert.equal(custJson.total, 2);
    assert.deepEqual(
      custJson.partners.map((p) => p.id),
      [PARTNER_ID_1, PARTNER_ID_3],
    );
    assert.ok(custJson.partners.every((p) => p.isVisible === true));

    // Agent sees visible partners normally, blocked from hidden
    const agentRes = await fetch(`${baseUrl}/api/official-partners`, {
      headers: { Cookie: agent.cookie },
    });
    assert.equal(agentRes.status, 200);
    const agentJson = (await agentRes.json()) as {
      partners: Array<{ id: string }>;
    };
    assert.deepEqual(
      agentJson.partners.map((p) => p.id),
      [PARTNER_ID_1, PARTNER_ID_3],
    );

    // Admin endpoint returns all 3 including hidden
    const adminRes = await fetch(`${baseUrl}/api/admin/official-partners`, {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(adminRes.status, 200);
    const adminJson = (await adminRes.json()) as {
      partners: Array<{ id: string }>;
      total: number;
    };
    assert.equal(adminJson.total, 3);
    assert.deepEqual(
      adminJson.partners.map((p) => p.id),
      [PARTNER_ID_1, PARTNER_ID_2, PARTNER_ID_3],
    );

    // Pagination + sorting by name ascending
    const pageRes = await fetch(
      `${baseUrl}/api/admin/official-partners?sortBy=name&sortOrder=asc&limit=2&offset=1`,
      { headers: { Cookie: admin.cookie } },
    );
    assert.equal(pageRes.status, 200);
    const pageJson = (await pageRes.json()) as {
      partners: Array<{ id: string }>;
      total: number;
      hasMore: boolean;
    };
    assert.equal(pageJson.total, 3);
    assert.equal(pageJson.hasMore, false);
    assert.deepEqual(
      pageJson.partners.map((p) => p.id),
      [PARTNER_ID_2, PARTNER_ID_1],
    );

    // Filtering by platform and search with wildcard escaping
    const searchRes = await fetch(
      `${baseUrl}/api/admin/official-partners?platform=facebook&q=${encodeURIComponent('100%')}`,
      { headers: { Cookie: admin.cookie } },
    );
    assert.equal(searchRes.status, 200);
    const searchJson = (await searchRes.json()) as {
      partners: Array<{ id: string }>;
    };
    assert.deepEqual(
      searchJson.partners.map((p) => p.id),
      [PARTNER_ID_1],
    );
  });
});

test('Official partners enforces 401 anonymous, 403 customer/agent RBAC, CSRF checks, spoofing blocks, and suspended admin block', async () => {
  await withOfficialPartnersServer(async ({ baseUrl, db, otps }) => {
    seedSamplePartners(db);

    const customer = await signupAndSignIn(baseUrl, otps, {
      name: 'Customer Authz',
      email: 'cust-authz-op@example.com',
      password: 'Password123!',
    });
    const agent = await signupAndSignIn(baseUrl, otps, {
      name: 'Agent Authz',
      email: 'agent-authz-op@example.com',
      password: 'Password123!',
    });
    db.users.get(agent.userId)!.role = 'agent';

    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Admin Authz',
      email: 'admin-authz-op@example.com',
      password: 'Password123!',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // 1. Anonymous rejected (401) across reads and mutations
    assert.equal((await fetch(`${baseUrl}/api/official-partners`)).status, 401);
    assert.equal(
      (await fetch(`${baseUrl}/api/admin/official-partners`)).status,
      401,
    );

    for (const [method, path, body] of [
      [
        'POST',
        '/api/admin/official-partners',
        { name: 'Anon', platform: 'telegram', pageUrl: 'https://t.me/anon' },
      ],
      ['PATCH', `/api/admin/official-partners/${PARTNER_ID_1}`, { isVisible: false }],
      [
        'PUT',
        `/api/admin/official-partners/${PARTNER_ID_1}`,
        { name: 'Anon', platform: 'facebook', pageUrl: 'https://fb.com/anon' },
      ],
      [
        'POST',
        '/api/admin/official-partners/reorder',
        { orderedIds: [PARTNER_ID_1] },
      ],
      ['DELETE', `/api/admin/official-partners/${PARTNER_ID_1}`, undefined],
      [
        'POST',
        '/api/admin/official-partners/icon',
        { fileName: 'a.png', contentType: 'image/png', fileBase64: 'AA==' },
      ],
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

    // 2. Customer & Agent blocked from hidden partner views and all admin endpoints -> 403
    for (const cookie of [customer.cookie, agent.cookie]) {
      assert.equal(
        (
          await fetch(`${baseUrl}/api/official-partners?includeHidden=1`, {
            headers: { Cookie: cookie },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(`${baseUrl}/api/official-partners?scope=admin`, {
            headers: { Cookie: cookie },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(`${baseUrl}/api/admin/official-partners`, {
            headers: { Cookie: cookie },
          })
        ).status,
        403,
      );

      for (const [method, path, body] of [
        [
          'POST',
          '/api/admin/official-partners',
          { name: 'Hack', platform: 'telegram', pageUrl: 'https://t.me/hack' },
        ],
        [
          'PATCH',
          `/api/admin/official-partners/${PARTNER_ID_1}`,
          { isVisible: false },
        ],
        [
          'PUT',
          `/api/admin/official-partners/${PARTNER_ID_1}`,
          { name: 'Hack', platform: 'facebook', pageUrl: 'https://fb.com/hack' },
        ],
        [
          'POST',
          '/api/admin/official-partners/reorder',
          { orderedIds: [PARTNER_ID_1] },
        ],
        ['DELETE', `/api/admin/official-partners/${PARTNER_ID_1}`, undefined],
        [
          'POST',
          '/api/admin/official-partners/icon',
          { fileName: 'a.png', contentType: 'image/png', fileBase64: 'AA==' },
        ],
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

    // 3. Client-supplied privileged body fields rejected -> 403
    for (const spoofField of [
      { actorId: 'other-admin' },
      { actorRole: 'superadmin' },
      { actingUserId: 'other-admin' },
      { updatedBy: 'other-admin' },
      { sortOrder: 99 },
      { id: PARTNER_ID_2 },
    ]) {
      const spoofRes = await fetch(`${baseUrl}/api/admin/official-partners`, {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Spoofed Partner',
          platform: 'telegram',
          pageUrl: 'https://t.me/spoofed_partner',
          ...spoofField,
        }),
      });
      assert.equal(spoofRes.status, 403);
    }

    // 4. CSRF / missing Origin on cookie mutation -> 403
    const csrfRes = await fetch(
      `${baseUrl}/api/admin/official-partners/${PARTNER_ID_1}`,
      {
        method: 'PATCH',
        headers: {
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isVisible: false }),
      },
    );
    assert.equal(csrfRes.status, 403);

    // 5. Suspended admin blocked -> 403
    db.users.get(admin.userId)!.status = 'suspended';
    assert.equal(
      (
        await fetch(`${baseUrl}/api/admin/official-partners`, {
          headers: { Cookie: admin.cookie },
        })
      ).status,
      403,
    );
  });
});

test('Admin CRUD, atomic reorder rollback, icon upload/serve, and audit trail logging work end to end', async () => {
  await withOfficialPartnersServer(async ({ baseUrl, db, otps }) => {
    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Directory Admin',
      email: 'dir-admin@example.com',
      password: 'Password123!',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // 1. Upload valid PNG icon -> served via /api/official-partners/icons/:id
    const validPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
    ]);
    const uploadRes = await fetch(`${baseUrl}/api/admin/official-partners/icon`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: 'vip-logo.png',
        contentType: 'image/png',
        fileBase64: validPng.toString('base64'),
      }),
    });
    assert.equal(uploadRes.status, 200);
    const uploadJson = (await uploadRes.json()) as {
      success: boolean;
      url: string;
      path: string;
      size: number;
    };
    assert.equal(uploadJson.success, true);
    assert.match(
      uploadJson.url,
      /^\/api\/official-partners\/icons\/[a-zA-Z0-9_-]+\.png$/,
    );
    assert.equal(uploadJson.size, validPng.length);

    // Fetch uploaded icon bytes
    const serveRes = await fetch(`${baseUrl}${uploadJson.url}`);
    assert.equal(serveRes.status, 200);
    assert.equal(serveRes.headers.get('content-type'), 'image/png');
    assert.equal(serveRes.headers.get('x-content-type-options'), 'nosniff');
    const servedBuf = Buffer.from(await serveRes.arrayBuffer());
    assert.deepEqual(servedBuf, validPng);

    // 2. Create two partners
    const create1 = await fetch(`${baseUrl}/api/admin/official-partners`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Partner Alpha',
        platform: 'facebook',
        pageUrl: 'https://www.facebook.com/PartnerAlpha',
        iconUrl: uploadJson.url,
        note: 'Fast verification',
        isVisible: true,
      }),
    });
    assert.equal(create1.status, 201);
    const created1 = (
      (await create1.json()) as {
        partner: { id: string; sortOrder: number; iconUrl: string };
      }
    ).partner;
    assert.equal(created1.sortOrder, 0);
    assert.equal(created1.iconUrl, uploadJson.url);

    const create2 = await fetch(`${baseUrl}/api/admin/official-partners`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: admin.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Partner Beta',
        platform: 'telegram',
        pageUrl: 'https://t.me/PartnerBeta',
        isVisible: true,
      }),
    });
    assert.equal(create2.status, 201);
    const created2 = (
      (await create2.json()) as { partner: { id: string; sortOrder: number } }
    ).partner;
    assert.equal(created2.sortOrder, 1);

    // 3. PATCH partner visibility & note
    const patchRes = await fetch(
      `${baseUrl}/api/admin/official-partners/${created1.id}`,
      {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isVisible: false, note: 'Updated note' }),
      },
    );
    assert.equal(patchRes.status, 200);
    const patched = (
      (await patchRes.json()) as {
        partner: { isVisible: boolean; note: string; pageUrl: string };
      }
    ).partner;
    assert.equal(patched.isVisible, false);
    assert.equal(patched.note, 'Updated note');
    assert.equal(patched.pageUrl, 'https://www.facebook.com/PartnerAlpha');

    // 4. Reorder fails atomically and rolls back when unknown UUID is included
    const badReorder = await fetch(
      `${baseUrl}/api/admin/official-partners/reorder`,
      {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderedIds: [created2.id, '99999999-9999-4999-8999-999999999999'],
        }),
      },
    );
    assert.equal(badReorder.status, 404);
    assert.equal(db.partners.get(created2.id)?.sort_order, 1);

    // Valid reorder
    const reorderRes = await fetch(
      `${baseUrl}/api/admin/official-partners/reorder`,
      {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderedIds: [created2.id, created1.id],
        }),
      },
    );
    assert.equal(reorderRes.status, 200);
    const reorderJson = (await reorderRes.json()) as {
      partners: Array<{ id: string; sortOrder: number }>;
    };
    assert.deepEqual(
      reorderJson.partners.map((p) => [p.id, p.sortOrder]),
      [
        [created2.id, 0],
        [created1.id, 1],
      ],
    );

    // 5. Delete partner + repeat delete returns 404
    const del1 = await fetch(
      `${baseUrl}/api/admin/official-partners/${created1.id}`,
      {
        method: 'DELETE',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
        },
      },
    );
    assert.equal(del1.status, 200);

    const del2 = await fetch(
      `${baseUrl}/api/admin/official-partners/${created1.id}`,
      {
        method: 'DELETE',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
        },
      },
    );
    assert.equal(del2.status, 404);

    // Verify server-side audit logs recorded all 4 actions with verified admin actor
    const partnerAuditLogs = db.auditLogs.filter(
      (a) => a.entity_type === 'official_partner',
    );
    assert.deepEqual(
      partnerAuditLogs.map((a) => a.action),
      [
        'PARTNER_CREATED',
        'PARTNER_CREATED',
        'PARTNER_UPDATED',
        'PARTNER_REORDERED',
        'PARTNER_DELETED',
      ],
    );
    assert.ok(
      partnerAuditLogs.every(
        (a) =>
          a.actor_id === admin.userId &&
          a.actor_name === 'Directory Admin' &&
          a.actor_role === 'admin' &&
          a.entity_type === 'official_partner',
      ),
    );
  });
});

test('Official partners rejects invalid payloads, SVG/oversize/spoofed icons, bad query/path params, and hides DB error internals', async () => {
  await withOfficialPartnersServer(async ({ baseUrl, db, otps }) => {
    seedSamplePartners(db);

    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Validation Admin',
      email: 'val-admin-op@example.com',
      password: 'Password123!',
    });
    db.users.get(admin.userId)!.role = 'admin';

    // Invalid query params (including client-supplied userId)
    for (const qs of [
      '?userId=cust_spoof',
      '?limit=0',
      '?limit=201',
      '?offset=-1',
      '?sortBy=password',
      '?sortOrder=random',
      '?includeHidden=yes',
      '?platform=tiktok',
      '?unknown=1',
    ]) {
      const res = await fetch(`${baseUrl}/api/official-partners${qs}`, {
        headers: { Cookie: admin.cookie },
      });
      assert.equal(res.status, 400, `Expected 400 for query ${qs}`);
    }

    // Invalid create bodies
    for (const badBody of [
      {},
      { name: '   ', platform: 'facebook', pageUrl: 'https://fb.com/x' },
      { name: 'x'.repeat(81), platform: 'facebook', pageUrl: 'https://fb.com/x' },
      { name: 'Bad\nName', platform: 'facebook', pageUrl: 'https://fb.com/x' },
      { name: 'Bad Plat', platform: 'discord', pageUrl: 'https://discord.gg/x' },
      { name: 'HTTP URL', platform: 'facebook', pageUrl: 'http://facebook.com/x' },
      { name: 'Wrong Host', platform: 'facebook', pageUrl: 'https://t.me/wrong' },
      {
        name: 'Creds URL',
        platform: 'telegram',
        pageUrl: 'https://user:pass@t.me/x',
      },
      {
        name: 'Long Note',
        platform: 'telegram',
        pageUrl: 'https://t.me/ok',
        note: 'n'.repeat(81),
      },
      {
        name: 'SVG Icon',
        platform: 'telegram',
        pageUrl: 'https://t.me/ok',
        iconUrl: 'https://cdn.example.com/bad.svg',
      },
      {
        name: 'Data Icon',
        platform: 'telegram',
        pageUrl: 'https://t.me/ok',
        iconUrl: 'data:image/png;base64,AAAA',
      },
      {
        name: 'Traversal Icon',
        platform: 'telegram',
        pageUrl: 'https://t.me/ok',
        iconUrl: '/api/official-partners/icons/../evil.png',
      },
      {
        name: 'Extra Key',
        platform: 'telegram',
        pageUrl: 'https://t.me/ok',
        unknownField: 123,
      },
    ]) {
      const res = await fetch(`${baseUrl}/api/admin/official-partners`, {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(badBody),
      });
      assert.equal(res.status, 400);
    }

    // Bad UUID param, empty patch, missing record 404, invalid reorder
    assert.equal(
      (
        await fetch(`${baseUrl}/api/admin/official-partners/not-a-uuid`, {
          method: 'PATCH',
          headers: {
            Origin: 'https://swiftsweeps.example.com',
            Cookie: admin.cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ isVisible: false }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/admin/official-partners/${PARTNER_ID_1}`, {
          method: 'PATCH',
          headers: {
            Origin: 'https://swiftsweeps.example.com',
            Cookie: admin.cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(
          `${baseUrl}/api/admin/official-partners/99999999-9999-4999-8999-999999999999`,
          {
            method: 'PATCH',
            headers: {
              Origin: 'https://swiftsweeps.example.com',
              Cookie: admin.cookie,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ isVisible: false }),
          },
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/admin/official-partners/reorder`, {
          method: 'POST',
          headers: {
            Origin: 'https://swiftsweeps.example.com',
            Cookie: admin.cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ orderedIds: [PARTNER_ID_1, PARTNER_ID_1] }),
        })
      ).status,
      400,
    );

    // Invalid icon uploads: SVG, spoofed PNG, oversize > 512 KB
    for (const badIcon of [
      {
        fileName: 'icon.svg',
        contentType: 'image/svg+xml',
        fileBase64: Buffer.from('<svg></svg>').toString('base64'),
      },
      {
        fileName: 'icon.png',
        contentType: 'image/png',
        fileBase64: Buffer.from('<svg onload=alert(1)></svg>').toString('base64'),
      },
      {
        fileName: 'big.png',
        contentType: 'image/png',
        fileBase64: Buffer.concat([
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          Buffer.alloc(512 * 1024 + 10),
        ]).toString('base64'),
      },
    ]) {
      const res = await fetch(`${baseUrl}/api/admin/official-partners/icon`, {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(badIcon),
      });
      assert.equal(res.status, 400);
    }

    // Bad icon path param & missing icon 404
    assert.equal(
      (
        await fetch(
          `${baseUrl}/api/official-partners/icons/bad-icon.svg`,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(
          `${baseUrl}/api/official-partners/icons/missing_icon_123.png`,
        )
      ).status,
      404,
    );

    // DB failure hides SQL internals
    db.failNextPartnerQuery = true;
    const dbErrRes = await fetch(`${baseUrl}/api/official-partners`, {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(dbErrRes.status, 500);
    const dbErrText = await dbErrRes.text();
    assert.equal(dbErrText.includes('pg_partners_error'), false);
    assert.equal(dbErrText.includes('relation lock timeout'), false);
  });
});
