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
import { InMemoryDatabasePool } from '../db/inMemoryPool.js';
import { createLogger } from '../logging/logger.js';
import {
  signStorageUrlToken,
  verifyStorageUrlToken,
} from '../storage/storageRepo.js';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const TINY_GIF_BASE64 =
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const TEST_AUTH_SECRET = 'storage-test-auth-secret-key-minimum-32-chars';

function createTestConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 4000,
    appOrigin: 'https://swiftsweeps.example.com',
    trustedOrigins: ['https://swiftsweeps.example.com'],
    trustProxy: 'loopback',
    databaseUrl: 'postgres://user:pass@localhost:5432/swiftsweeps_test',
    pgPoolMax: 5,
    pgPoolMin: 0,
    pgIdleTimeoutMs: 10_000,
    pgConnectionTimeoutMs: 5_000,
    pgStatementTimeoutMs: 10_000,
    pgSslMode: 'disable',
    requestBodyLimit: '1mb',
    requestBodyLimitBytes: 1024 * 1024,
    logLevel: 'error',
    shutdownTimeoutMs: 5_000,
    authSecret: TEST_AUTH_SECRET,
    authCookiePrefix: 'swiftsweeps_auth',
    authSessionExpiresInSec: 3600,
    authSessionUpdateAgeSec: 900,
    authSessionFreshAgeSec: 300,
    authRequireEmailVerification: false,
    authRateLimitEnabled: false,
    authRateLimitWindowSec: 60,
    authRateLimitMax: 100,
    emailProvider: 'disabled',
    smtpPort: 587,
    smtpSecure: false,
    emailFromName: 'SwiftSweeps',
    ...overrides,
  };
}

function createCaptureEmailAdapter(): EmailDeliveryAdapter {
  return {
    providerName: 'test-capture',
    isConfigured: () => true,
    async sendVerificationEmail(_payload: SendVerificationEmailPayload) {},
    async sendOtpEmail(_payload: SendOtpEmailPayload) {},
    async sendPasswordResetEmail(_payload: SendPasswordResetEmailPayload) {},
  };
}

function extractCookies(setCookieHeader: string[] | undefined): string {
  if (!setCookieHeader) return '';
  return setCookieHeader
    .map((entry) => entry.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

async function httpRequest(params: {
  baseUrl: string;
  method: string;
  path: string;
  cookie?: string;
  body?: unknown;
}): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
  rawBuffer: Buffer;
}> {
  const url = new URL(params.path, params.baseUrl);
  const payload =
    params.body !== undefined ? JSON.stringify(params.body) : undefined;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: params.method,
        headers: {
          Origin: 'https://swiftsweeps.example.com',
          ...(params.cookie ? { Cookie: params.cookie } : {}),
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        );
        res.on('end', () => {
          const rawBuffer = Buffer.concat(chunks);
          let parsed: Record<string, unknown> = {};
          const contentType = String(res.headers['content-type'] ?? '');
          if (contentType.includes('application/json') && rawBuffer.length > 0) {
            try {
              parsed = JSON.parse(rawBuffer.toString('utf8')) as Record<
                string,
                unknown
              >;
            } catch {
              parsed = {};
            }
          }
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: parsed,
            rawBuffer,
          });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function createStorageTestServer() {
  const pool = new InMemoryDatabasePool();
  const authMemoryDb: Record<string, unknown[]> = {
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
    pool,
    authDatabaseOverride: memoryAdapter(authMemoryDb),
    emailDeliveryOverride: createCaptureEmailAdapter(),
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', resolve),
  );
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function signupAndLogin(params: {
    email: string;
    name: string;
    role?: 'customer' | 'agent' | 'admin';
  }): Promise<{ userId: string; cookie: string }> {
    const password = 'Password123!';
    const signup = await httpRequest({
      baseUrl,
      method: 'POST',
      path: '/api/auth/sign-up/email',
      body: { email: params.email, password, name: params.name },
    });
    assert.equal(signup.status, 200);

    const signin = await httpRequest({
      baseUrl,
      method: 'POST',
      path: '/api/auth/sign-in/email',
      body: { email: params.email, password },
    });
    assert.equal(signin.status, 200);
    const cookie = extractCookies(signin.headers['set-cookie']);
    assert.ok(cookie);

    const me = await httpRequest({
      baseUrl,
      method: 'GET',
      path: '/api/auth/me',
      cookie,
    });
    assert.equal(me.status, 200);
    const userId = String((me.body.user as Record<string, unknown>).id);

    if (params.role && params.role !== 'customer') {
      await pool.query(`UPDATE public.users SET role = $2 WHERE id = $1`, [
        userId,
        params.role,
      ]);
    }

    return { userId, cookie };
  }

  return {
    baseUrl,
    pool,
    signupAndLogin,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

test('self-hosted storage enforces upload auth, ownership, private receipt access control, and cross-customer isolation', async () => {
  const ctx = await createStorageTestServer();
  try {
    const alice = await ctx.signupAndLogin({
      email: 'alice@example.com',
      name: 'Alice',
    });
    const bob = await ctx.signupAndLogin({
      email: 'bob@example.com',
      name: 'Bob',
    });
    const agent = await ctx.signupAndLogin({
      email: 'agent@example.com',
      name: 'Agent',
      role: 'agent',
    });
    const admin = await ctx.signupAndLogin({
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });

    // 1. Unauthenticated upload rejected
    const unauthUpload = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/api/storage/upload',
      body: {
        bucket: 'chat_attachments',
        path: `receipts/${alice.userId}_unauth.png`,
        contentType: 'image/png',
        fileBase64: TINY_PNG_BASE64,
      },
    });
    assert.equal(unauthUpload.status, 401);

    // 2. Bob cannot spoof Alice's userId or upload under Alice's receipts path
    const spoofUserUpload = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/api/storage/upload',
      cookie: bob.cookie,
      body: {
        bucket: 'chat_attachments',
        path: `receipts/${alice.userId}_spoof.png`,
        contentType: 'image/png',
        fileBase64: TINY_PNG_BASE64,
        userId: alice.userId,
      },
    });
    assert.equal(spoofUserUpload.status, 403);

    const spoofPathUpload = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/api/storage/upload',
      cookie: bob.cookie,
      body: {
        bucket: 'chat_attachments',
        path: `receipts/${alice.userId}_spoof2.png`,
        contentType: 'image/png',
        fileBase64: TINY_PNG_BASE64,
      },
    });
    assert.equal(spoofPathUpload.status, 403);

    // 3. Alice uploads her own private payment receipt
    const receiptPath = `receipts/${alice.userId}_1700000.png`;
    const aliceUpload = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/api/storage/upload',
      cookie: alice.cookie,
      body: {
        bucket: 'chat_attachments',
        path: receiptPath,
        contentType: 'image/png',
        fileBase64: TINY_PNG_BASE64,
        userId: alice.userId,
      },
    });
    assert.equal(aliceUpload.status, 200);
    assert.equal(aliceUpload.body.success, true);
    assert.equal(aliceUpload.body.isPublic, false);
    const receiptUrl = String(aliceUpload.body.url);
    assert.equal(
      receiptUrl,
      `/api/storage/file?bucket=chat_attachments&path=${encodeURIComponent(receiptPath)}`,
    );

    // 4. Unauthenticated fetch of private receipt MUST be rejected (never made public)
    const unauthRead = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'GET',
      path: receiptUrl,
    });
    assert.equal(unauthRead.status, 401);

    // 5. Different customer (Bob) reading Alice's receipt MUST be forbidden
    const bobRead = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'GET',
      path: receiptUrl,
      cookie: bob.cookie,
    });
    assert.equal(bobRead.status, 403);

    // 6. Owner (Alice), agent, and admin CAN read Alice's private receipt with private cache headers
    for (const actorCookie of [alice.cookie, agent.cookie, admin.cookie]) {
      const okRead = await httpRequest({
        baseUrl: ctx.baseUrl,
        method: 'GET',
        path: receiptUrl,
        cookie: actorCookie,
      });
      assert.equal(okRead.status, 200);
      assert.equal(okRead.headers['content-type'], 'image/png');
      assert.equal(okRead.headers['x-content-type-options'], 'nosniff');
      assert.match(String(okRead.headers['cache-control']), /^private,/);
      assert.deepEqual(
        okRead.rawBuffer,
        Buffer.from(TINY_PNG_BASE64, 'base64'),
      );
    }

    // 7. Legacy Supabase object URL reference passed via ?url= preserves private access control
    const legacySupabaseUrl = `https://example.supabase.co/storage/v1/object/sign/chat_attachments/${receiptPath}?token=legacy_tok`;
    const legacyParamPath = `/api/storage/file?url=${encodeURIComponent(legacySupabaseUrl)}`;

    const legacyUnauth = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'GET',
      path: legacyParamPath,
    });
    assert.equal(legacyUnauth.status, 401);

    const legacyOwner = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'GET',
      path: legacyParamPath,
      cookie: alice.cookie,
    });
    assert.equal(legacyOwner.status, 200);
    assert.deepEqual(
      legacyOwner.rawBuffer,
      Buffer.from(TINY_PNG_BASE64, 'base64'),
    );
  } finally {
    await ctx.close();
  }
});

test('self-hosted storage enforces signed URL expiry, admin RBAC on public QR/partner assets, size limits, and magic-byte validation', async () => {
  const ctx = await createStorageTestServer();
  try {
    const customer = await ctx.signupAndLogin({
      email: 'cust@example.com',
      name: 'Customer',
    });
    const other = await ctx.signupAndLogin({
      email: 'other@example.com',
      name: 'Other',
    });
    const admin = await ctx.signupAndLogin({
      email: 'admin2@example.com',
      name: 'Admin Two',
      role: 'admin',
    });

    // 1. Customer cannot upload QR/catalog assets or partner icons
    const custQr = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/api/storage/upload',
      cookie: customer.cookie,
      body: {
        bucket: 'chat_attachments',
        path: 'qr/chime_qr_1.png',
        contentType: 'image/png',
        fileBase64: TINY_PNG_BASE64,
      },
    });
    assert.equal(custQr.status, 403);

    const custPartnerIcon = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/api/storage/upload',
      cookie: customer.cookie,
      body: {
        bucket: 'partner-icons',
        path: 'icon.png',
        contentType: 'image/png',
        fileBase64: TINY_PNG_BASE64,
      },
    });
    assert.equal(custPartnerIcon.status, 403);

    // 2. Reject SVG / spoofed non-image payloads, oversized partner icons, GIF partner icons, and path traversal
    const fakePng = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8').toString('base64');
    const svgRes = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/api/storage/upload',
      cookie: admin.cookie,
      body: {
        bucket: 'chat_attachments',
        path: 'qr/bad.png',
        contentType: 'image/png',
        fileBase64: fakePng,
      },
    });
    assert.equal(svgRes.status, 400);

    const gifPartnerIcon = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/api/storage/upload',
      cookie: admin.cookie,
      body: {
        bucket: 'partner-icons',
        path: 'anim.gif',
        contentType: 'image/png',
        fileBase64: TINY_GIF_BASE64,
      },
    });
    assert.equal(gifPartnerIcon.status, 400);

    const oversizedIconBuf = Buffer.concat([
      Buffer.from(TINY_PNG_BASE64, 'base64'),
      Buffer.alloc(524_289, 0),
    ]);
    const oversizedIcon = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/api/storage/upload',
      cookie: admin.cookie,
      body: {
        bucket: 'partner-icons',
        path: 'huge.png',
        contentType: 'image/png',
        fileBase64: oversizedIconBuf.toString('base64'),
      },
    });
    assert.equal(oversizedIcon.status, 400);

    const traversalUpload = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/api/storage/upload',
      cookie: admin.cookie,
      body: {
        bucket: 'chat_attachments',
        path: '../etc/passwd.png',
        contentType: 'image/png',
        fileBase64: TINY_PNG_BASE64,
      },
    });
    assert.equal(traversalUpload.status, 400);

    // 3. Admin uploads public QR asset -> readable without authentication
    const adminQr = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/api/storage/upload',
      cookie: admin.cookie,
      body: {
        bucket: 'chat_attachments',
        path: 'qr/cashapp_qr_1.png',
        contentType: 'image/png',
        fileBase64: TINY_PNG_BASE64,
      },
    });
    assert.equal(adminQr.status, 200);
    assert.equal(adminQr.body.isPublic, true);

    const publicQrRead = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'GET',
      path: String(adminQr.body.url),
    });
    assert.equal(publicQrRead.status, 200);
    assert.match(String(publicQrRead.headers['cache-control']), /^public,/);

    // 4. Signed URL generation and expiry enforcement on private receipts
    const receiptPath = `receipts/${customer.userId}_signed.png`;
    const receiptUpload = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/api/storage/upload',
      cookie: customer.cookie,
      body: {
        bucket: 'chat_attachments',
        path: receiptPath,
        contentType: 'image/png',
        fileBase64: TINY_PNG_BASE64,
      },
    });
    assert.equal(receiptUpload.status, 200);

    // Another customer cannot mint a signed URL for someone else's receipt
    const otherSign = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/api/storage/signed-url',
      cookie: other.cookie,
      body: {
        bucket: 'chat_attachments',
        path: receiptPath,
        expiresInSeconds: 120,
      },
    });
    assert.equal(otherSign.status, 403);

    // Owner mints signed URL -> works unauthenticated with private, no-store cache
    const ownerSign = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'POST',
      path: '/api/storage/signed-url',
      cookie: customer.cookie,
      body: {
        bucket: 'chat_attachments',
        path: receiptPath,
        expiresInSeconds: 120,
      },
    });
    assert.equal(ownerSign.status, 200);
    const signedUrl = String(ownerSign.body.signedUrl);
    assert.ok(signedUrl.includes('&sig='));

    const signedRead = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'GET',
      path: signedUrl,
    });
    assert.equal(signedRead.status, 200);
    assert.equal(signedRead.headers['cache-control'], 'private, no-store');

    // Tampered signature rejected
    const tamperedUrl = signedUrl.replace(/&sig=[0-9a-f]+$/, `&sig=${'a'.repeat(64)}`);
    const tamperedRead = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'GET',
      path: tamperedUrl,
    });
    assert.equal(tamperedRead.status, 403);

    // Expired signature rejected
    const pastExpires = Math.floor(Date.now() / 1000) - 30;
    const pastSig = signStorageUrlToken({
      secret: TEST_AUTH_SECRET,
      bucket: 'chat_attachments',
      objectPath: receiptPath,
      expiresAtUnixSec: pastExpires,
    });
    const expiredRead = await httpRequest({
      baseUrl: ctx.baseUrl,
      method: 'GET',
      path: `/api/storage/file?bucket=chat_attachments&path=${encodeURIComponent(receiptPath)}&expires=${pastExpires}&sig=${pastSig}`,
    });
    assert.equal(expiredRead.status, 403);
    assert.equal(
      (expiredRead.body.error as Record<string, unknown>).code,
      'SIGNED_URL_EXPIRED',
    );
  } finally {
    await ctx.close();
  }
});

test('verifyStorageUrlToken validates HMAC integrity and clock expiration', () => {
  const expiresAt = 1_800_000_100;
  const sig = signStorageUrlToken({
    secret: TEST_AUTH_SECRET,
    bucket: 'chat_attachments',
    objectPath: 'receipts/u1_1.png',
    expiresAtUnixSec: expiresAt,
  });

  assert.deepEqual(
    verifyStorageUrlToken({
      secret: TEST_AUTH_SECRET,
      bucket: 'chat_attachments',
      objectPath: 'receipts/u1_1.png',
      expiresRaw: String(expiresAt),
      sigRaw: sig,
      nowUnixSec: expiresAt - 10,
    }),
    { valid: true },
  );

  assert.deepEqual(
    verifyStorageUrlToken({
      secret: TEST_AUTH_SECRET,
      bucket: 'chat_attachments',
      objectPath: 'receipts/u1_1.png',
      expiresRaw: String(expiresAt),
      sigRaw: sig,
      nowUnixSec: expiresAt + 1,
    }),
    { valid: false, reason: 'expired' },
  );

  assert.deepEqual(
    verifyStorageUrlToken({
      secret: TEST_AUTH_SECRET,
      bucket: 'chat_attachments',
      objectPath: 'receipts/u2_1.png',
      expiresRaw: String(expiresAt),
      sigRaw: sig,
      nowUnixSec: expiresAt - 10,
    }),
    { valid: false, reason: 'invalid' },
  );
});
