import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createApiApp } from '../app.js';
import {
  createEmailDeliveryAdapter,
  EmailDeliveryUnavailableError,
  type EmailDeliveryAdapter,
  type SendOtpEmailPayload,
  type SendPasswordResetEmailPayload,
  type SendVerificationEmailPayload,
} from '../auth/emailDelivery.js';
import { ConfigValidationError, loadServerConfig, type ServerConfig } from '../config/env.js';
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

class InMemoryAppDatabase implements Pick<DatabasePool, 'query'> {
  public readonly users = new Map<string, InMemoryUserRow>();
  public readonly authLinks = new Map<string, InMemoryAuthLinkRow>();
  public readonly auditLogs: InMemoryAuditRow[] = [];

  public async query(sql: string, values: unknown[] = []): Promise<{ rows: unknown[]; rowCount?: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized === 'SELECT 1 AS ok') {
      return { rows: [{ ok: 1 }] };
    }

    if (normalized.includes('FROM public.auth_user_links l INNER JOIN public.users u') && normalized.includes('WHERE l.auth_user_id = $1')) {
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

    if (normalized.includes('FROM public.users u LEFT JOIN public.auth_user_links l') && normalized.includes('WHERE u.id = $1')) {
      const appUserId = String(values[0] ?? '');
      const user = this.users.get(appUserId);
      if (!user) return { rows: [] };
      const link = this.authLinks.get(appUserId);
      return { rows: [this.toJoinedRow(user, link)] };
    }

    if (normalized.includes('FROM public.users u LEFT JOIN public.auth_user_links l') && normalized.includes('WHERE lower(u.email) = $1')) {
      const cleanEmail = String(values[0] ?? '').toLowerCase();
      for (const user of this.users.values()) {
        if (user.email.toLowerCase() === cleanEmail) {
          const link = this.authLinks.get(user.id);
          return { rows: [this.toJoinedRow(user, link)] };
        }
      }
      return { rows: [] };
    }

    if (normalized.startsWith('SELECT COUNT(*)::int AS total FROM public.users')) {
      return { rows: [{ total: this.users.size }] };
    }

    if (normalized.includes('FROM public.wallets') && normalized.includes('customer_id = ANY')) {
      return { rows: [] };
    }

    if (normalized.includes('FROM public.game_accounts') && normalized.includes('customer_id = ANY')) {
      return { rows: [] };
    }

    if (normalized.includes('FROM public.users u LEFT JOIN public.auth_user_links l') && normalized.includes('ORDER BY u.created_at DESC')) {
      const limit = Number(values[0] ?? 50);
      const offset = Number(values[1] ?? 0);
      const sorted = [...this.users.values()].sort((a, b) => {
        const dt = b.created_at.getTime() - a.created_at.getTime();
        return dt !== 0 ? dt : a.id.localeCompare(b.id);
      });
      const sliced = sorted.slice(offset, offset + limit).map((u) => this.toJoinedRow(u, this.authLinks.get(u.id)));
      return { rows: sliced };
    }

    if (normalized.startsWith('DELETE FROM public.users WHERE id = $1')) {
      const id = String(values[0] ?? '');
      const existed = this.users.delete(id);
      this.authLinks.delete(id);
      return { rows: [], rowCount: existed ? 1 : 0 };
    }

    if (normalized.startsWith('INSERT INTO public.users')) {
      if (normalized.includes('role, status,')) {
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

    if (normalized.startsWith('UPDATE public.auth_user_links SET password_reset_required = false')) {
      const authUserId = String(values[0]);
      for (const link of this.authLinks.values()) {
        if (link.auth_user_id === authUserId) {
          link.password_reset_required = false;
          link.updated_at = new Date();
        }
      }
      return { rows: [], rowCount: 1 };
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

    throw new Error(`Unexpected SQL in InMemoryAppDatabase: ${normalized}`);
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
    logLevel: 'debug',
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

function createSilentLogger(stdoutLines: string[] = [], stderrLines: string[] = []) {
  return createLogger({
    level: 'debug',
    writeStdout: (line) => stdoutLines.push(line),
    writeStderr: (line) => stderrLines.push(line),
  });
}

function createMemoryBetterAuthDb() {
  const store: Record<string, unknown[]> = {
    ba_user: [],
    ba_session: [],
    ba_account: [],
    ba_verification: [],
    ba_rate_limit: [],
  };
  return { store, adapter: memoryAdapter(store) };
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

async function withTestServer(
  options: {
    config?: Partial<ServerConfig>;
    emailDeliveryOverride?: EmailDeliveryAdapter;
  } = {},
  fn: (ctx: {
    baseUrl: string;
    appDb: InMemoryAppDatabase;
    authStore: Record<string, unknown[]>;
    stdoutLines: string[];
    stderrLines: string[];
  }) => Promise<void>,
): Promise<void> {
  const appDb = new InMemoryAppDatabase();
  const { store: authStore, adapter: authDatabaseOverride } = createMemoryBetterAuthDb();
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  const app = createApiApp({
    config: createTestConfig(options.config),
    logger: createSilentLogger(stdoutLines, stderrLines),
    pool: appDb,
    authDatabaseOverride,
    emailDeliveryOverride: options.emailDeliveryOverride,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await fn({ baseUrl, appDb, authStore, stdoutLines, stderrLines });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function signUpAndVerifyCustomer(
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

  const otpRecord = [...emailCapture.otps]
    .reverse()
    .find((entry) => entry.to === input.email.toLowerCase() && entry.purpose === 'email-verification');
  assert.ok(otpRecord, 'expected verification OTP email to be captured');

  const verifyRes = await fetch(`${baseUrl}/api/auth/email-otp/verify-email`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      otp: otpRecord.otp,
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
      email: input.email,
      password: input.password,
    }),
  });
  assert.equal(signInRes.status, 200);
  const cookies = extractSetCookies(signInRes);
  assert.ok(cookies.length > 0, 'expected session cookies on sign-in');
  return toCookieHeader(cookies);
}

test('loadServerConfig enforces production AUTH_SECRET and Brevo email config without leaking secrets', () => {
  assert.throws(
    () =>
      loadServerConfig({
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://swiftsweeps.example.com',
        DATABASE_URL: 'postgres://app:pass@127.0.0.1:5432/swiftsweeps',
      }),
    (err: unknown) => {
      assert.ok(err instanceof ConfigValidationError);
      assert.match(err.message, /AUTH_SECRET is required in production/);
      return true;
    },
  );

  const shortSecret = 'too-short-secret-value';
  assert.throws(
    () =>
      loadServerConfig({
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://swiftsweeps.example.com',
        DATABASE_URL: 'postgres://app:pass@127.0.0.1:5432/swiftsweeps',
        AUTH_SECRET: shortSecret,
      }),
    (err: unknown) => {
      assert.ok(err instanceof ConfigValidationError);
      assert.match(err.message, /at least 32 characters/);
      assert.ok(!err.message.includes(shortSecret));
      return true;
    },
  );

  assert.throws(
    () =>
      loadServerConfig({
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://swiftsweeps.example.com',
        DATABASE_URL: 'postgres://app:pass@127.0.0.1:5432/swiftsweeps',
        AUTH_SECRET: 'a-strong-random-production-secret-string-32chars',
        EMAIL_PROVIDER: 'brevo',
      }),
    (err: unknown) => {
      assert.ok(err instanceof ConfigValidationError);
      assert.match(err.message, /BREVO_API_KEY is required/);
      assert.match(err.message, /EMAIL_FROM_ADDRESS/);
      return true;
    },
  );
});

test('fail-closed email behavior rejects verification/reset flows with 503 when EMAIL_PROVIDER=disabled', async () => {
  await withTestServer(
    {
      config: { emailProvider: 'disabled' },
    },
    async ({ baseUrl }) => {
      const resetReqRes = await fetch(`${baseUrl}/api/auth/email-otp/request-password-reset`, {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'missing@example.com' }),
      });
      assert.equal(resetReqRes.status, 503);

      const signUpRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Blocked User',
          email: 'blocked@example.com',
          password: 'Password123',
        }),
      });
      assert.equal(signUpRes.status, 503);
    },
  );
});

test('signup creates customer role only, enforces email verification OTP, sets secure HttpOnly cookies, and resolves GET /api/auth/me', async () => {
  const emailCapture = createCaptureEmailAdapter();
  const origin = 'https://swiftsweeps.example.com';

  await withTestServer(
    {
      config: { appOrigin: origin },
      emailDeliveryOverride: emailCapture.adapter,
    },
    async ({ baseUrl, appDb, stdoutLines, stderrLines }) => {
      const rawPassword = 'CustomerSecret99!';

      // Attempt role escalation during public registration
      const signUpRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Alice Player',
          email: 'Alice@Example.com',
          password: rawPassword,
          role: 'admin',
        }),
      });
      assert.equal(signUpRes.status, 200);
      const signUpBody = (await signUpRes.json()) as { token: string | null; user: Record<string, unknown> };
      assert.equal(signUpBody.token, null);
      assert.equal(extractSetCookies(signUpRes).length, 0);

      // App profile created with forced customer role and unverified email
      const createdAppUser = [...appDb.users.values()].find((u) => u.email === 'alice@example.com');
      assert.ok(createdAppUser);
      assert.equal(createdAppUser.role, 'customer');
      assert.equal(createdAppUser.email_verified, false);

      // Sign-in rejected before OTP verification
      const unverifiedSignInRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'alice@example.com',
          password: rawPassword,
        }),
      });
      assert.equal(unverifiedSignInRes.status, 403);

      // Verify OTP sent during signup
      assert.equal(emailCapture.otps.length >= 1, true);
      const latestOtp = emailCapture.otps[emailCapture.otps.length - 1]!;
      assert.equal(latestOtp.purpose, 'email-verification');

      const verifyRes = await fetch(`${baseUrl}/api/auth/email-otp/verify-email`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'alice@example.com',
          otp: latestOtp.otp,
        }),
      });
      assert.equal(verifyRes.status, 200);
      assert.equal(createdAppUser.email_verified, true);

      // Sign-in succeeds and issues HttpOnly SameSite=Lax cookie
      const signInRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'alice@example.com',
          password: rawPassword,
        }),
      });
      assert.equal(signInRes.status, 200);
      const setCookies = extractSetCookies(signInRes);
      assert.ok(setCookies.length > 0);
      const sessionCookieHeader = setCookies.find((c) => c.includes('swiftsweeps_auth.session_token'));
      assert.ok(sessionCookieHeader);
      assert.match(sessionCookieHeader, /HttpOnly/i);
      assert.match(sessionCookieHeader, /SameSite=Lax/i);
      assert.match(sessionCookieHeader, /Path=\//i);

      const cookiePair = toCookieHeader(setCookies);

      // /api/auth/get-session returns active session
      const getSessionRes = await fetch(`${baseUrl}/api/auth/get-session`, {
        headers: { Cookie: cookiePair },
      });
      assert.equal(getSessionRes.status, 200);
      const sessionJson = (await getSessionRes.json()) as { user: { email: string } };
      assert.equal(sessionJson.user.email, 'alice@example.com');

      // /api/auth/me returns server-resolved profile and ignores spoofed headers
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: cookiePair,
          'x-user-id': 'usr_admin_master',
          'x-user-role': 'admin',
        },
      });
      assert.equal(meRes.status, 200);
      const meJson = (await meRes.json()) as { user: { role: string; email: string } };
      assert.equal(meJson.user.email, 'alice@example.com');
      assert.equal(meJson.user.role, 'customer');

      // Duplicate signup returns 200 with synthetic user (anti-enumeration)
      const duplicateSignUpRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Duplicate Attempt',
          email: 'alice@example.com',
          password: 'AnotherPassword123!',
        }),
      });
      assert.equal(duplicateSignUpRes.status, 200);
      const duplicateBody = (await duplicateSignUpRes.json()) as { token: string | null };
      assert.equal(duplicateBody.token, null);

      // Sign-out revokes the session token
      const signOutRes = await fetch(`${baseUrl}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: cookiePair,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(signOutRes.status, 200);

      const postSignOutMeRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: cookiePair },
      });
      assert.equal(postSignOutMeRes.status, 401);

      // Verify logs never leaked plaintext password or cookie value
      const allLogs = [...stdoutLines, ...stderrLines].join('\n');
      assert.ok(!allLogs.includes(rawPassword));
      assert.ok(!allLogs.includes(cookiePair));
    },
  );
});

test('CSRF origin & Fetch Metadata enforcement blocks cross-site and cookie-without-origin mutations', async () => {
  const emailCapture = createCaptureEmailAdapter();
  const origin = 'https://swiftsweeps.example.com';

  await withTestServer(
    {
      config: { appOrigin: origin },
      emailDeliveryOverride: emailCapture.adapter,
    },
    async ({ baseUrl }) => {
      const cookie = await signUpAndVerifyCustomer(baseUrl, origin, emailCapture, {
        name: 'Csrf Test User',
        email: 'csrf@example.com',
        password: 'Password123!',
      });

      // Cookie-authenticated POST without Origin/Referer/Sec-Fetch-Site must be rejected
      const missingOriginSignOut = await fetch(`${baseUrl}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(missingOriginSignOut.status, 403);

      // Cross-site Fetch Metadata blocked
      const crossSiteRes = await fetch(`${baseUrl}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Sec-Fetch-Site': 'cross-site',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(crossSiteRes.status, 403);

      // Foreign Origin blocked
      const foreignOriginRes = await fetch(`${baseUrl}/api/admin/users`, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          Origin: 'https://attacker.invalid',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(foreignOriginRes.status, 403);

      // Session still valid after rejected CSRF attempts
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: cookie },
      });
      assert.equal(meRes.status, 200);
    },
  );
});

test('unauthenticated, tampered cookies, and spoofed x-user headers are rejected on protected endpoints', async () => {
  const emailCapture = createCaptureEmailAdapter();
  const origin = 'https://swiftsweeps.example.com';

  await withTestServer(
    {
      config: { appOrigin: origin },
      emailDeliveryOverride: emailCapture.adapter,
    },
    async ({ baseUrl }) => {
      const unauthMe = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          'x-user-id': 'usr_admin_master',
          'x-user-role': 'admin',
        },
      });
      assert.equal(unauthMe.status, 401);

      const tamperedCookieMe = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: 'swiftsweeps_auth.session_token=tampered.invalid-signature',
        },
      });
      assert.equal(tamperedCookieMe.status, 401);

      const unauthAdminList = await fetch(`${baseUrl}/api/admin/users`, {
        headers: {
          'x-user-id': 'usr_admin_master',
          'x-user-role': 'admin',
        },
      });
      assert.equal(unauthAdminList.status, 401);
    },
  );
});

test('password reset prevents email enumeration, revokes existing sessions, and clears password_reset_required', async () => {
  const emailCapture = createCaptureEmailAdapter();
  const origin = 'https://swiftsweeps.example.com';

  await withTestServer(
    {
      config: { appOrigin: origin },
      emailDeliveryOverride: emailCapture.adapter,
    },
    async ({ baseUrl, appDb }) => {
      const cookie = await signUpAndVerifyCustomer(baseUrl, origin, emailCapture, {
        name: 'Reset User',
        email: 'resetuser@example.com',
        password: 'OldPassword123!',
      });

      // Unknown email returns 200 without sending email (anti-enumeration)
      const unknownResetReq = await fetch(`${baseUrl}/api/auth/email-otp/request-password-reset`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'nobody-here@example.com' }),
      });
      assert.equal(unknownResetReq.status, 200);
      assert.equal(
        emailCapture.otps.some((entry) => entry.to === 'nobody-here@example.com'),
        false,
      );

      // Existing user gets OTP
      const knownResetReq = await fetch(`${baseUrl}/api/auth/email-otp/request-password-reset`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'resetuser@example.com' }),
      });
      assert.equal(knownResetReq.status, 200);
      const resetOtp = [...emailCapture.otps]
        .reverse()
        .find((entry) => entry.to === 'resetuser@example.com' && entry.purpose === 'forget-password');
      assert.ok(resetOtp);

      // Simulate migrated user flag before reset completion
      const appUser = [...appDb.users.values()].find((u) => u.email === 'resetuser@example.com');
      assert.ok(appUser);
      const link = appDb.authLinks.get(appUser.id);
      assert.ok(link);
      link.password_reset_required = true;

      // Complete password reset with OTP
      const resetCompleteRes = await fetch(`${baseUrl}/api/auth/email-otp/reset-password`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'resetuser@example.com',
          otp: resetOtp.otp,
          password: 'NewPassword456!',
        }),
      });
      assert.equal(resetCompleteRes.status, 200);
      assert.equal(link.password_reset_required, false);

      // Existing session was revoked on password reset
      const oldSessionRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: cookie },
      });
      assert.equal(oldSessionRes.status, 401);

      // Old password rejected, new password succeeds
      const oldPasswordSignIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'resetuser@example.com',
          password: 'OldPassword123!',
        }),
      });
      assert.equal(oldPasswordSignIn.status, 401);

      const newPasswordSignIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'resetuser@example.com',
          password: 'NewPassword456!',
        }),
      });
      assert.equal(newPasswordSignIn.status, 200);
    },
  );
});

test('server-side RBAC enforces customer/agent/admin permissions, parent-admin protection, suspension revocation, and admin provisioning', async () => {
  const emailCapture = createCaptureEmailAdapter();
  const origin = 'https://swiftsweeps.example.com';

  await withTestServer(
    {
      config: { appOrigin: origin },
      emailDeliveryOverride: emailCapture.adapter,
    },
    async ({ baseUrl, appDb }) => {
      const customerCookie = await signUpAndVerifyCustomer(baseUrl, origin, emailCapture, {
        name: 'Regular Customer',
        email: 'customer@example.com',
        password: 'Password123!',
      });

      const parentAdminCookie = await signUpAndVerifyCustomer(baseUrl, origin, emailCapture, {
        name: 'Parent Admin',
        email: 'sachet61@gmail.com',
        password: 'AdminPassword123!',
      });

      // Elevate parent admin row in DB (simulating seeded/migrated parent admin)
      const parentUser = [...appDb.users.values()].find((u) => u.email === 'sachet61@gmail.com');
      assert.ok(parentUser);
      parentUser.role = 'admin';

      // Customer blocked from /api/admin/users
      const customerListRes = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Cookie: customerCookie },
      });
      assert.equal(customerListRes.status, 403);

      // Admin provisions an agent with password_reset_required = true
      const provisionAgentRes = await fetch(`${baseUrl}/api/admin/users`, {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: parentAdminCookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'agent1@example.com',
          displayName: 'Agent One',
          role: 'agent',
          temporaryPassword: 'TempAgentPassword123!',
        }),
      });
      assert.equal(provisionAgentRes.status, 201);
      const provisionedJson = (await provisionAgentRes.json()) as {
        user: { id: string; role: string; passwordResetRequired: boolean };
      };
      assert.equal(provisionedJson.user.role, 'agent');
      assert.equal(provisionedJson.user.passwordResetRequired, true);

      // Admin-provisioned user cannot sign in until password reset is completed
      const blockedSignInRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'agent1@example.com',
          password: 'TempAgentPassword123!',
        }),
      });
      assert.equal(blockedSignInRes.status, 403);

      // Agent resets password with OTP, then signs in
      await fetch(`${baseUrl}/api/auth/email-otp/request-password-reset`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'agent1@example.com' }),
      });
      const agentOtp = [...emailCapture.otps]
        .reverse()
        .find((entry) => entry.to === 'agent1@example.com' && entry.purpose === 'forget-password');
      assert.ok(agentOtp);

      const agentResetRes = await fetch(`${baseUrl}/api/auth/email-otp/reset-password`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'agent1@example.com',
          otp: agentOtp.otp,
          password: 'AgentNewPassword123!',
        }),
      });
      assert.equal(agentResetRes.status, 200);

      const agentSignInRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'agent1@example.com',
          password: 'AgentNewPassword123!',
        }),
      });
      assert.equal(agentSignInRes.status, 200);
      const agentCookie = toCookieHeader(extractSetCookies(agentSignInRes));

      // Agent can list users, but CANNOT provision users or modify roles
      const agentListRes = await fetch(`${baseUrl}/api/admin/users?limit=10&offset=0`, {
        headers: { Cookie: agentCookie },
      });
      assert.equal(agentListRes.status, 200);

      const agentCreateRes = await fetch(`${baseUrl}/api/admin/users`, {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: agentCookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'unauthorized@example.com',
          displayName: 'Unauthorized',
          role: 'customer',
          temporaryPassword: 'Password123!',
        }),
      });
      assert.equal(agentCreateRes.status, 403);

      // Parent admin cannot be demoted or suspended
      const demoteParentRes = await fetch(
        `${baseUrl}/api/admin/users/${encodeURIComponent(parentUser.id)}/role`,
        {
          method: 'PATCH',
          headers: {
            Origin: origin,
            Cookie: parentAdminCookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ newRole: 'customer' }),
        },
      );
      assert.equal(demoteParentRes.status, 403);

      const suspendParentRes = await fetch(
        `${baseUrl}/api/admin/users/${encodeURIComponent(parentUser.id)}/status`,
        {
          method: 'PATCH',
          headers: {
            Origin: origin,
            Cookie: parentAdminCookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'suspended' }),
        },
      );
      assert.equal(suspendParentRes.status, 403);

      // Suspending customer revokes active customer session and blocks re-login
      const customerRow = [...appDb.users.values()].find((u) => u.email === 'customer@example.com');
      assert.ok(customerRow);
      const suspendCustomerRes = await fetch(
        `${baseUrl}/api/admin/users/${encodeURIComponent(customerRow.id)}/status`,
        {
          method: 'PATCH',
          headers: {
            Origin: origin,
            Cookie: parentAdminCookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'suspended' }),
        },
      );
      assert.equal(suspendCustomerRes.status, 200);

      const suspendedMeRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: customerCookie },
      });
      assert.equal(suspendedMeRes.status, 401);

      const suspendedSignInRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'customer@example.com',
          password: 'Password123!',
        }),
      });
      assert.equal(suspendedSignInRes.status, 403);
    },
  );
});

test('database-backed rate limiting throttles repeated sign-in attempts with HTTP 429', async () => {
  const emailCapture = createCaptureEmailAdapter();
  const origin = 'https://swiftsweeps.example.com';

  await withTestServer(
    {
      config: {
        appOrigin: origin,
        authRateLimitEnabled: true,
        authRateLimitWindowSec: 60,
        authRateLimitMax: 30,
      },
      emailDeliveryOverride: emailCapture.adapter,
    },
    async ({ baseUrl, authStore }) => {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: {
            Origin: origin,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'ratelimit@example.com',
            password: 'WrongPassword123!',
          }),
        });
        statuses.push(res.status);
      }

      // /sign-in/email custom rule permits 5 requests in 60s, 6th must be 429
      assert.equal(statuses[5], 429);
      assert.ok(authStore.ba_rate_limit.length >= 1);
    },
  );
});

test('production HTTPS configuration sets Secure cookie attribute', async () => {
  const emailCapture = createCaptureEmailAdapter();
  const origin = 'https://swiftsweeps.example.com';

  await withTestServer(
    {
      config: {
        nodeEnv: 'production',
        appOrigin: origin,
      },
      emailDeliveryOverride: emailCapture.adapter,
    },
    async ({ baseUrl }) => {
      const signUpRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Prod Cookie User',
          email: 'prodcookie@example.com',
          password: 'ProdPassword123!',
        }),
      });
      assert.equal(signUpRes.status, 200);

      const otp = emailCapture.otps[emailCapture.otps.length - 1]!;
      await fetch(`${baseUrl}/api/auth/email-otp/verify-email`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'prodcookie@example.com',
          otp: otp.otp,
        }),
      });

      const signInRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'prodcookie@example.com',
          password: 'ProdPassword123!',
        }),
      });
      assert.equal(signInRes.status, 200);
      const cookies = extractSetCookies(signInRes);
      const sessionCookie = cookies.find((c) => c.includes('__Secure-swiftsweeps_auth.session_token'));
      assert.ok(sessionCookie, 'expected __Secure- prefixed cookie in production');
      assert.match(sessionCookie, /Secure/i);
      assert.match(sessionCookie, /HttpOnly/i);
    },
  );
});

test('auth endpoints allow configured secondary trustedOrigins and reject unconfigured origins', async () => {
  const emailCapture = createCaptureEmailAdapter();
  const primaryOrigin = 'https://swiftsweeps.example.com';
  const secondaryOrigin = 'https://www.swiftsweeps.example.com';

  await withTestServer(
    {
      config: {
        nodeEnv: 'production',
        appOrigin: primaryOrigin,
        trustedOrigins: [primaryOrigin, secondaryOrigin],
      },
      emailDeliveryOverride: emailCapture.adapter,
    },
    async ({ baseUrl }) => {
      const blockedSignUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: {
          Origin: 'https://untrusted.example.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Blocked Origin User',
          email: 'blocked-origin@example.com',
          password: 'Password123!',
        }),
      });
      assert.equal(blockedSignUp.status, 403);
      const blockedJson = (await blockedSignUp.json()) as {
        error: { code: string; message: string };
      };
      assert.equal(blockedJson.error.code, 'ORIGIN_FORBIDDEN');
      assert.equal(blockedJson.error.message, 'Origin is not allowed.');

      const cookie = await signUpAndVerifyCustomer(
        baseUrl,
        secondaryOrigin,
        emailCapture,
        {
          name: 'Blithe Sweeps',
          email: 'blithesweeps@example.com',
          password: 'Password123!',
        },
      );

      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Origin: secondaryOrigin,
          Cookie: cookie,
        },
      });
      assert.equal(meRes.status, 200);
      assert.equal(
        meRes.headers.get('access-control-allow-origin'),
        secondaryOrigin,
      );
      const meJson = (await meRes.json()) as { user: { email: string } };
      assert.equal(meJson.user.email, 'blithesweeps@example.com');

      const signOutRes = await fetch(`${baseUrl}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          Origin: secondaryOrigin,
          Cookie: cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(signOutRes.status, 200);
    },
  );
});

test('loadServerConfig validates EMAIL_PROVIDER=smtp settings without leaking SMTP_PASS', () => {
  assert.throws(
    () =>
      loadServerConfig({
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://swiftsweeps.example.com',
        DATABASE_URL: 'postgres://app:pass@127.0.0.1:5432/swiftsweeps',
        AUTH_SECRET: 'a-strong-random-production-secret-string-32chars',
        EMAIL_PROVIDER: 'smtp',
      }),
    (err: unknown) => {
      assert.ok(err instanceof ConfigValidationError);
      assert.match(err.message, /SMTP_HOST is required/);
      assert.match(err.message, /SMTP_USER is required/);
      assert.match(err.message, /SMTP_PASS is required/);
      assert.match(err.message, /EMAIL_FROM_ADDRESS/);
      return true;
    },
  );

  const cfg587 = loadServerConfig({
    NODE_ENV: 'production',
    APP_ORIGIN: 'https://swiftsweeps.example.com',
    DATABASE_URL: 'postgres://app:pass@127.0.0.1:5432/swiftsweeps',
    AUTH_SECRET: 'a-strong-random-production-secret-string-32chars',
    EMAIL_PROVIDER: 'smtp',
    SMTP_HOST: 'smtp-relay.brevo.com',
    SMTP_PORT: '587',
    SMTP_USER: 'mailer@swiftsweeps.example.com',
    SMTP_PASS: 'xsmtpsib-secret-smtp-key',
    EMAIL_FROM_ADDRESS: 'no-reply@swiftsweeps.example.com',
  });
  assert.equal(cfg587.emailProvider, 'smtp');
  assert.equal(cfg587.smtpPort, 587);
  assert.equal(cfg587.smtpSecure, false);

  const cfg465 = loadServerConfig({
    NODE_ENV: 'production',
    APP_ORIGIN: 'https://swiftsweeps.example.com',
    DATABASE_URL: 'postgres://app:pass@127.0.0.1:5432/swiftsweeps',
    AUTH_SECRET: 'a-strong-random-production-secret-string-32chars',
    EMAIL_PROVIDER: 'smtp',
    SMTP_HOST: 'smtp-relay.brevo.com',
    SMTP_PORT: '465',
    SMTP_USER: 'mailer@swiftsweeps.example.com',
    SMTP_PASS: 'xsmtpsib-secret-smtp-key',
    EMAIL_FROM_ADDRESS: 'no-reply@swiftsweeps.example.com',
  });
  assert.equal(cfg465.smtpPort, 465);
  assert.equal(cfg465.smtpSecure, true);
});

test('SMTP email adapter integrates with Better Auth OTP signup flow and fails safely on transport error', async () => {
  const sentMessages: Array<{
    from: { name: string; address: string };
    to: string;
    subject: string;
    text: string;
    html: string;
  }> = [];
  let shouldFail = false;

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const logger = createSilentLogger(stdoutLines, stderrLines);
  const smtpSecretPass = 'xsmtpsib-super-secret-smtp-password';
  const smtpConfig = createTestConfig({
    appOrigin: 'https://swiftsweeps.example.com',
    emailProvider: 'smtp',
    smtpHost: 'smtp-relay.brevo.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '9a0011@smtp-brevo.com',
    smtpPass: smtpSecretPass,
    emailFromAddress: 'no-reply@swiftsweeps.example.com',
    emailFromName: 'SwiftSweeps',
  });

  const adapter = createEmailDeliveryAdapter(smtpConfig, logger, {
    smtpTransporter: {
      async sendMail(mailOptions) {
        if (shouldFail) {
          throw new Error(`535 Authentication failed password=${smtpSecretPass}`);
        }
        sentMessages.push(mailOptions);
      },
    },
  });

  assert.equal(adapter.providerName, 'smtp');
  assert.equal(adapter.isConfigured(), true);

  await withTestServer(
    {
      config: smtpConfig,
      emailDeliveryOverride: adapter,
    },
    async ({ baseUrl }) => {
      const signUpRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'SMTP Player',
          email: 'smtp-player@example.com',
          password: 'Password123!',
        }),
      });
      assert.equal(signUpRes.status, 200);
      assert.equal(sentMessages.length, 1);
      assert.deepEqual(sentMessages[0]?.from, {
        name: 'SwiftSweeps',
        address: 'no-reply@swiftsweeps.example.com',
      });
      assert.equal(sentMessages[0]?.to, 'smtp-player@example.com');
      assert.match(sentMessages[0]?.text ?? '', /\b\d{6}\b/);
    },
  );

  shouldFail = true;
  await assert.rejects(
    () =>
      adapter.sendOtpEmail({
        to: 'smtp-player@example.com',
        otp: '123456',
        purpose: 'email-verification',
      }),
    EmailDeliveryUnavailableError,
  );
  const allLogs = [...stdoutLines, ...stderrLines].join('\n');
  assert.ok(!allLogs.includes(smtpSecretPass));
});

test('Email delivery adapter builds beautified SwiftSweeps HTML templates with OTP in subject and safe escaping', async () => {
  const sentMessages: Array<{
    from: { name: string; address: string };
    to: string;
    subject: string;
    text: string;
    html: string;
  }> = [];

  const logger = createSilentLogger([], []);
  const smtpConfig = createTestConfig({
    appOrigin: 'https://swiftsweeps.example.com',
    emailProvider: 'smtp',
    smtpHost: 'smtp-relay.brevo.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'mailer@smtp-brevo.com',
    smtpPass: 'secret-pass',
    emailFromAddress: 'no-reply@swiftsweeps.example.com',
    emailFromName: 'SwiftSweeps',
  });

  const adapter = createEmailDeliveryAdapter(smtpConfig, logger, {
    smtpTransporter: {
      async sendMail(mailOptions) {
        sentMessages.push(mailOptions);
      },
    },
  });

  const otpCases = [
    {
      purpose: 'email-verification' as const,
      otp: '482913',
      expectedSubject: '482913 is your SwiftSweeps verification code',
      expectedHeading: 'Welcome to SwiftSweeps!',
    },
    {
      purpose: 'forget-password' as const,
      otp: '917304',
      expectedSubject: '917304 is your SwiftSweeps password reset code',
      expectedHeading: 'Reset Your Password',
    },
    {
      purpose: 'change-email' as const,
      otp: '605128',
      expectedSubject: '605128 is your SwiftSweeps email change code',
      expectedHeading: 'Confirm Your Email Change',
    },
    {
      purpose: 'sign-in' as const,
      otp: '334890',
      expectedSubject: '334890 is your SwiftSweeps sign-in code',
      expectedHeading: 'Sign-In Security Code',
    },
  ];

  for (const item of otpCases) {
    await adapter.sendOtpEmail({
      to: 'player@example.com',
      otp: item.otp,
      purpose: item.purpose,
    });
    const msg = sentMessages.at(-1);
    assert.ok(msg);
    assert.equal(msg.subject, item.expectedSubject);
    assert.ok(msg.html.includes('SWIFT <span style="color:#F59E0B;">SWEEPS</span>'));
    assert.ok(msg.html.includes('background-color:#131C2E'));
    assert.ok(msg.html.includes('color:#F59E0B'));
    assert.ok(msg.html.includes(item.expectedHeading));
    assert.ok(msg.html.includes(`>${item.otp}<`));
    assert.ok(msg.html.includes('5 minutes'));
    assert.ok(msg.text.includes(item.otp));
    assert.ok(msg.text.includes('5 minutes'));
  }

  await adapter.sendVerificationEmail({
    to: 'player@example.com',
    recipientName: 'Alex <script>alert(1)</script>\r\nBcc:evil@example.com',
    url: 'https://swiftsweeps.example.com/verify?token=tok123',
  });
  const verifyMsg = sentMessages.at(-1);
  assert.ok(verifyMsg);
  assert.equal(verifyMsg.subject, 'Verify your SwiftSweeps email address');
  assert.ok(verifyMsg.html.includes('Welcome to SwiftSweeps!'));
  assert.ok(verifyMsg.html.includes('Verify Email Address'));
  assert.ok(verifyMsg.html.includes('https://swiftsweeps.example.com/verify?token=tok123'));
  assert.ok(verifyMsg.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!verifyMsg.html.includes('<script>'));
  assert.ok(verifyMsg.html.includes('5 minutes'));

  await adapter.sendPasswordResetEmail({
    to: 'player@example.com',
    recipientName: 'Alex',
    url: 'https://swiftsweeps.example.com/reset?token=rst456',
  });
  const resetLinkMsg = sentMessages.at(-1);
  assert.ok(resetLinkMsg);
  assert.equal(resetLinkMsg.subject, 'Reset your SwiftSweeps password');
  assert.ok(resetLinkMsg.html.includes('Reset Your Password'));
  assert.ok(resetLinkMsg.html.includes('https://swiftsweeps.example.com/reset?token=rst456'));
  assert.ok(resetLinkMsg.html.includes('1 hour'));

  await adapter.sendOtpEmail({
    to: 'player@example.com',
    otp: '123456\r\nBcc: attacker@evil.test',
    purpose: 'forget-password',
  });
  const headerInjectionMsg = sentMessages.at(-1);
  assert.ok(headerInjectionMsg);
  assert.ok(!/[\r\n]/.test(headerInjectionMsg.subject));

  await adapter.sendPasswordResetEmail({
    to: 'player@example.com',
    recipientName: 'Alex',
    url: 'javascript:alert(1)',
  });
  const unsafeUrlMsg = sentMessages.at(-1);
  assert.ok(unsafeUrlMsg);
  assert.ok(!unsafeUrlMsg.html.includes('javascript:alert(1)'));
  assert.ok(unsafeUrlMsg.html.includes('href="#"'));
});



