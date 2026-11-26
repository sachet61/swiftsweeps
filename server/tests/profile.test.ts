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

class InMemoryProfileDatabase implements Pick<DatabasePool, 'query'> {
  public readonly users = new Map<string, InMemoryUserRow>();
  public readonly authLinks = new Map<string, InMemoryAuthLinkRow>();
  public readonly auditLogs: InMemoryAuditRow[] = [];
  public failNextWrite = false;

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

    if (
      normalized.startsWith('SELECT display_name FROM public.users') &&
      normalized.includes('upper(referral_code) = upper($1)')
    ) {
      const ref = String(values[0] ?? '').trim();
      const upperRef = ref.toUpperCase();
      const lowerRef = ref.toLowerCase();
      for (const user of this.users.values()) {
        if (
          user.id === ref ||
          (user.referral_code && user.referral_code.toUpperCase() === upperRef) ||
          user.email.toLowerCase() === lowerRef
        ) {
          return { rows: [{ display_name: user.display_name }] };
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

    if (normalized.startsWith('UPDATE public.users SET display_name = $2, phone = $3')) {
      if (this.failNextWrite) {
        this.failNextWrite = false;
        throw new Error('pg_write_failure: disk full');
      }
      const [id, displayName, phone] = values as [string, string, string | null];
      const user = this.users.get(id);
      if (user) {
        user.display_name = displayName;
        user.phone = phone;
        user.updated_at = new Date();
      }
      return { rows: [], rowCount: user ? 1 : 0 };
    }

    if (normalized.startsWith('UPDATE public.users SET display_name = $2')) {
      if (this.failNextWrite) {
        this.failNextWrite = false;
        throw new Error('pg_write_failure: connection lost');
      }
      const [id, displayName] = values as [string, string];
      const user = this.users.get(id);
      if (user) {
        user.display_name = displayName;
        user.updated_at = new Date();
      }
      return { rows: [], rowCount: user ? 1 : 0 };
    }

    if (normalized.startsWith('UPDATE public.users SET phone = $2')) {
      const [id, phone] = values as [string, string | null];
      const user = this.users.get(id);
      if (user) {
        user.phone = phone;
        user.updated_at = new Date();
      }
      return { rows: [], rowCount: user ? 1 : 0 };
    }

    if (normalized.startsWith('UPDATE public.users SET avatar_url = $2')) {
      const [id, avatarUrl] = values as [string, string | null];
      const user = this.users.get(id);
      if (user) {
        user.avatar_url = avatarUrl;
        user.updated_at = new Date();
      }
      return { rows: [], rowCount: user ? 1 : 0 };
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

    throw new Error(`Unexpected SQL in InMemoryProfileDatabase: ${normalized}`);
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

async function withProfileTestServer(
  run: (ctx: {
    baseUrl: string;
    db: InMemoryProfileDatabase;
    otps: SendOtpEmailPayload[];
  }) => Promise<void>,
): Promise<void> {
  const db = new InMemoryProfileDatabase();
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

// Valid minimal 12-byte WebP RIFF/WEBP header for magic-byte check
const VALID_WEBP_DATA_URI = `data:image/webp;base64,${Buffer.from([
  0x52, 0x49, 0x46, 0x46,
  0x10, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x20,
]).toString('base64')}`;

const VALID_PNG_DATA_URI = `data:image/png;base64,${Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
]).toString('base64')}`;

test('GET /api/profile and /api/auth/me return full profile fields and safely resolve referrerDisplayName without leaking referrer email', async () => {
  await withProfileTestServer(async ({ baseUrl, db, otps }) => {
    const referrer = await signupAndSignIn(baseUrl, otps, {
      name: 'Elena Referrer',
      email: 'referrer-secret@example.com',
      password: 'Password123!',
    });
    const referrerRow = db.users.get(referrer.userId)!;
    assert.ok(referrerRow.referral_code);

    const player = await signupAndSignIn(baseUrl, otps, {
      name: 'Marcus Player',
      email: 'marcus@example.com',
      password: 'Password123!',
    });

    // Empty referredBy returns null cleanly
    const emptyProfileRes = await fetch(`${baseUrl}/api/profile`, {
      headers: { Cookie: player.cookie },
    });
    assert.equal(emptyProfileRes.status, 200);
    const emptyProfileJson = (await emptyProfileRes.json()) as { user: Record<string, unknown> };
    assert.equal(emptyProfileJson.user.id, player.userId);
    assert.equal(emptyProfileJson.user.referredBy, null);
    assert.equal(emptyProfileJson.user.referrerDisplayName, null);
    assert.equal(emptyProfileJson.user.phone, null);
    assert.equal(emptyProfileJson.user.avatarUrl, null);
    assert.ok(typeof emptyProfileJson.user.referralCode === 'string');

    // Link player to referrer by referrer's email and confirm only displayName is returned
    const playerRow = db.users.get(player.userId)!;
    playerRow.referred_by = referrerRow.referral_code;

    const linkedMeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: player.cookie },
    });
    assert.equal(linkedMeRes.status, 200);
    const linkedMeJson = (await linkedMeRes.json()) as { user: Record<string, unknown> };
    assert.equal(linkedMeJson.user.referredBy, referrerRow.referral_code);
    assert.equal(linkedMeJson.user.referrerDisplayName, 'Elena Referrer');
    assert.equal(JSON.stringify(linkedMeJson).includes('referrer-secret@example.com'), false);
  });
});

test('PATCH /api/profile updates displayName/phone, writes audit log, is idempotent, and persists across GET /api/profile and /api/auth/me', async () => {
  await withProfileTestServer(async ({ baseUrl, db, otps }) => {
    const player = await signupAndSignIn(baseUrl, otps, {
      name: 'Initial Name',
      email: 'edit-player@example.com',
      password: 'Password123!',
    });

    const patchRes = await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: player.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: '  Marcus Updated  ',
        phone: '+1 (555) 890-1234',
      }),
    });
    assert.equal(patchRes.status, 200);
    const patchJson = (await patchRes.json()) as { user: Record<string, unknown> };
    assert.equal(patchJson.user.displayName, 'Marcus Updated');
    assert.equal(patchJson.user.phone, '+1 (555) 890-1234');

    // Repeated identical PATCH succeeds idempotently
    const repeatRes = await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: player.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'Marcus Updated',
        phone: '+1 (555) 890-1234',
      }),
    });
    assert.equal(repeatRes.status, 200);

    // Clearing phone with null or empty string resets phone to null
    const clearPhoneRes = await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: player.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone: '' }),
    });
    assert.equal(clearPhoneRes.status, 200);
    const clearedJson = (await clearPhoneRes.json()) as { user: Record<string, unknown> };
    assert.equal(clearedJson.user.phone, null);
    assert.equal(clearedJson.user.displayName, 'Marcus Updated');

    // Confirm audit trail logged PROFILE_UPDATED without leaking phone value
    const profileAudits = db.auditLogs.filter((a) => a.action === 'PROFILE_UPDATED');
    assert.equal(profileAudits.length, 3);
    assert.equal(profileAudits.every((a) => !a.details.includes('890-1234')), true);

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: player.cookie },
    });
    const meJson = (await meRes.json()) as { user: Record<string, unknown> };
    assert.equal(meJson.user.displayName, 'Marcus Updated');
    assert.equal(meJson.user.phone, null);
  });
});

test('POST and DELETE /api/profile/avatar validate image format/magic bytes, persist avatarUrl, and write audit logs', async () => {
  await withProfileTestServer(async ({ baseUrl, db, otps }) => {
    const player = await signupAndSignIn(baseUrl, otps, {
      name: 'Avatar Player',
      email: 'avatar@example.com',
      password: 'Password123!',
    });

    // Valid WebP data URI
    const webpRes = await fetch(`${baseUrl}/api/profile/avatar`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: player.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ avatarUrl: VALID_WEBP_DATA_URI }),
    });
    assert.equal(webpRes.status, 200);
    const webpJson = (await webpRes.json()) as {
      success: boolean;
      avatarUrl: string;
      user: Record<string, unknown>;
    };
    assert.equal(webpJson.success, true);
    assert.equal(webpJson.avatarUrl, VALID_WEBP_DATA_URI);
    assert.equal(webpJson.user.avatarUrl, VALID_WEBP_DATA_URI);

    // Valid PNG data URI
    const pngRes = await fetch(`${baseUrl}/api/profile/avatar`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: player.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ avatarUrl: VALID_PNG_DATA_URI }),
    });
    assert.equal(pngRes.status, 200);

    // Confirm /api/auth/me persists latest avatarUrl
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: player.cookie },
    });
    const meJson = (await meRes.json()) as { user: Record<string, unknown> };
    assert.equal(meJson.user.avatarUrl, VALID_PNG_DATA_URI);

    // Delete avatar
    const delRes = await fetch(`${baseUrl}/api/profile/avatar`, {
      method: 'DELETE',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: player.cookie,
      },
    });
    assert.equal(delRes.status, 200);
    const delJson = (await delRes.json()) as { avatarUrl: null; user: Record<string, unknown> };
    assert.equal(delJson.avatarUrl, null);
    assert.equal(delJson.user.avatarUrl, null);

    const avatarAudits = db.auditLogs.filter((a) => a.action === 'AVATAR_UPDATED');
    assert.equal(avatarAudits.length, 3);
  });
});

test('Profile endpoints reject anonymous, wrong-owner spoofing, privilege escalation, suspended accounts, and missing-origin CSRF', async () => {
  await withProfileTestServer(async ({ baseUrl, db, otps }) => {
    const victim = await signupAndSignIn(baseUrl, otps, {
      name: 'Victim User',
      email: 'victim@example.com',
      password: 'Password123!',
    });
    const attacker = await signupAndSignIn(baseUrl, otps, {
      name: 'Attacker User',
      email: 'attacker@example.com',
      password: 'Password123!',
    });

    // 1. Anonymous rejected with 401
    for (const req of [
      fetch(`${baseUrl}/api/profile`),
      fetch(`${baseUrl}/api/profile`, {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName: 'Anon' }),
      }),
      fetch(`${baseUrl}/api/profile/avatar`, {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ avatarUrl: VALID_PNG_DATA_URI }),
      }),
    ]) {
      const res = await req;
      assert.equal(res.status, 401);
    }

    // 2. Wrong-owner spoofing rejected with 403 and victim unchanged
    const spoofPatch = await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: attacker.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: victim.userId,
        displayName: 'Hacked Victim',
      }),
    });
    assert.equal(spoofPatch.status, 403);
    assert.equal(db.users.get(victim.userId)?.display_name, 'Victim User');

    const spoofAvatar = await fetch(`${baseUrl}/api/profile/avatar`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: attacker.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: victim.userId,
        avatarUrl: VALID_WEBP_DATA_URI,
      }),
    });
    assert.equal(spoofAvatar.status, 403);
    assert.equal(db.users.get(victim.userId)?.avatar_url, null);

    // 3. Privilege / immutable field tampering rejected with 403
    for (const payload of [
      { displayName: 'Attacker', role: 'admin' },
      { displayName: 'Attacker', status: 'suspended' },
      { displayName: 'Attacker', emailVerified: true },
      { displayName: 'Attacker', isParentAdmin: true },
      { displayName: 'Attacker', referralCode: 'REF_ADMIN' },
      { displayName: 'Attacker', referredBy: victim.userId },
    ]) {
      const res = await fetch(`${baseUrl}/api/profile`, {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: attacker.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 403);
      assert.equal(db.users.get(attacker.userId)?.role, 'customer');
    }

    // 4. Missing Origin / CSRF rejected on cookie-authenticated mutation
    const csrfMissingRes = await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH',
      headers: {
        Cookie: attacker.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'No Origin' }),
    });
    assert.equal(csrfMissingRes.status, 403);

    // 5. Suspended account blocked even with existing session cookie
    db.users.get(attacker.userId)!.status = 'suspended';
    const suspendedGet = await fetch(`${baseUrl}/api/profile`, {
      headers: { Cookie: attacker.cookie },
    });
    assert.equal(suspendedGet.status, 403);
  });
});

test('Profile endpoints reject invalid inputs, SVG/XSS/spoofed avatar payloads, and hide DB error internals', async () => {
  await withProfileTestServer(async ({ baseUrl, db, otps }) => {
    const player = await signupAndSignIn(baseUrl, otps, {
      name: 'Validation Player',
      email: 'validate@example.com',
      password: 'Password123!',
    });

    const invalidPatches = [
      {},
      { displayName: '   ' },
      { displayName: 'x'.repeat(121) },
      { displayName: 'Bad\nName' },
      { phone: '12' },
      { phone: 'invalid-alpha-phone!' },
      { unknownField: 'abc' },
      { avatarUrl: 'https://example.com/a.png' }, // must use /api/profile/avatar
    ];

    for (const payload of invalidPatches) {
      const res = await fetch(`${baseUrl}/api/profile`, {
        method: 'PATCH',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: player.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 400, `Expected 400 for payload ${JSON.stringify(payload)}`);
    }

    const fakePngBase64 = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
    const oversizedWebp = `data:image/webp;base64,${Buffer.concat([
      Buffer.from([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
      Buffer.alloc(310 * 1024, 0x41),
    ]).toString('base64')}`;

    const invalidAvatars = [
      {},
      { avatarUrl: '' },
      { avatarUrl: 'javascript:alert(1)' },
      { avatarUrl: 'http://insecure.example.com/avatar.png' },
      { avatarUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
      { avatarUrl: `data:image/png;base64,${fakePngBase64}` },
      { avatarUrl: '//evil.example.com/a.png' },
      { avatarUrl: '/etc/passwd' },
      { avatarUrl: oversizedWebp },
    ];

    for (const payload of invalidAvatars) {
      const res = await fetch(`${baseUrl}/api/profile/avatar`, {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          Cookie: player.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 400, `Expected 400 for avatar payload ${JSON.stringify(payload).slice(0, 80)}`);
    }

    // DB failure returns structured 500 without leaking raw error message
    db.failNextWrite = true;
    const dbFailRes = await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        Cookie: player.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'Safe Name' }),
    });
    assert.equal(dbFailRes.status, 500);
    const dbFailText = await dbFailRes.text();
    assert.equal(dbFailText.includes('pg_write_failure'), false);
    assert.equal(dbFailText.includes('disk full'), false);
  });
});
