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
import { InMemoryDatabasePool, type QueryResult } from '../db/inMemoryPool.js';
import { createLogger } from '../logging/logger.js';
import {
  validateAuditLogsQuery,
  validateCreateAuditLogBody,
} from '../routes/auditLogs.js';

class TestAuditDatabasePool extends InMemoryDatabasePool {
  public failNextAuditQuery = false;

  public override async query(
    sql: string,
    values: unknown[] = [],
  ): Promise<QueryResult> {
    if (this.failNextAuditQuery && /\bpublic\.audit_logs\b/i.test(sql)) {
      this.failNextAuditQuery = false;
      throw new Error('simulated_pg_permission_or_connection_error');
    }
    return super.query(sql, values);
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

async function withAuditLogServer(
  run: (ctx: {
    baseUrl: string;
    db: TestAuditDatabasePool;
    otps: SendOtpEmailPayload[];
  }) => Promise<void>,
): Promise<void> {
  const db = new TestAuditDatabasePool();
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
    server.closeAllConnections();
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

test('audit logs validators enforce query caps, allowed keys, and reject immutable fields', () => {
  const q1 = validateAuditLogsQuery({
    limit: '250',
    format: 'csv',
    entityType: 'TOPUP',
    search: '  TOPUP_APPROVED  ',
    fromDate: '2026-11-01',
    toDate: '2026-11-26',
    userId: 'ignored_legacy_param',
  });
  assert.equal(q1.limit, 250);
  assert.equal(q1.entityType, 'topup');
  assert.equal(q1.search, 'TOPUP_APPROVED');
  assert.equal(q1.fromIso, '2026-11-01T00:00:00.000Z');
  assert.equal(q1.toIso, '2026-11-26T23:59:59.999Z');

  const q2 = validateAuditLogsQuery({ limit: '500' });
  assert.equal(q2.limit, 100);

  const q3 = validateAuditLogsQuery({ limit: '999', export: '1' });
  assert.equal(q3.limit, 500);

  assert.throws(
    () => validateAuditLogsQuery({ limit: '0' }),
    (err: unknown) => (err as { statusCode?: number }).statusCode === 400,
  );
  assert.throws(
    () => validateAuditLogsQuery({ fromDate: 'not-a-date' }),
    (err: unknown) => (err as { statusCode?: number }).statusCode === 400,
  );
  assert.throws(
    () => validateAuditLogsQuery({ actorRole: 'admin' }),
    (err: unknown) => (err as { statusCode?: number }).statusCode === 400,
  );

  assert.throws(
    () =>
      validateCreateAuditLogBody({
        id: 'aud_spoofed',
        action: 'TEST',
      }),
    (err: unknown) => (err as { statusCode?: number }).statusCode === 403,
  );
  assert.throws(
    () =>
      validateCreateAuditLogBody({
        timestamp: '2026-11-26T00:00:00.000Z',
        action: 'TEST',
      }),
    (err: unknown) => (err as { statusCode?: number }).statusCode === 403,
  );
  assert.throws(
    () => validateCreateAuditLogBody({ action: '   ' }),
    (err: unknown) => (err as { statusCode?: number }).statusCode === 400,
  );
});

test('GET /api/audit-logs fails closed for unauthenticated, customer, agent, and suspended callers', async () => {
  await withAuditLogServer(async ({ baseUrl, db, otps }) => {
    const cust = await signupAndSignIn(baseUrl, otps, {
      name: 'Player One',
      email: 'player1@example.com',
      password: 'Password123!',
    });
    const agent = await signupAndSignIn(baseUrl, otps, {
      name: 'Support Agent',
      email: 'agent@example.com',
      password: 'Password123!',
    });
    const suspendedAdmin = await signupAndSignIn(baseUrl, otps, {
      name: 'Suspended Admin',
      email: 'suspended-admin@example.com',
      password: 'Password123!',
    });

    await db.query(`UPDATE public.users SET role = $2 WHERE id = $1`, [
      agent.userId,
      'agent',
    ]);
    await db.query(`UPDATE public.users SET role = $2 WHERE id = $1`, [
      suspendedAdmin.userId,
      'admin',
    ]);
    await db.query(`UPDATE public.users SET status = $2 WHERE id = $1`, [
      suspendedAdmin.userId,
      'suspended',
    ]);

    const anonRes = await fetch(`${baseUrl}/api/audit-logs`);
    assert.equal(anonRes.status, 401);
    assert.equal(anonRes.headers.get('cache-control'), 'no-store');

    const custRes = await fetch(
      `${baseUrl}/api/audit-logs?userId=${encodeURIComponent(cust.userId)}`,
      { headers: { Cookie: cust.cookie } },
    );
    assert.equal(custRes.status, 403);

    const agentRes = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: { Cookie: agent.cookie },
    });
    assert.equal(agentRes.status, 403);

    const suspendedRes = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: { Cookie: suspendedAdmin.cookie },
    });
    assert.equal(suspendedRes.status, 403);
  });
});

test('POST /api/audit-logs derives actor identity from session, overwrites spoofed fields, and gates system alias to admin', async () => {
  await withAuditLogServer(async ({ baseUrl, db, otps }) => {
    const anonRes = await fetch(`${baseUrl}/api/audit-logs`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'ANON_ATTEMPT' }),
    });
    assert.equal(anonRes.status, 401);

    const customer = await signupAndSignIn(baseUrl, otps, {
      name: 'Player Two',
      email: 'player2@example.com',
      password: 'Password123!',
    });
    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Master Admin',
      email: 'admin@example.com',
      password: 'Password123!',
    });
    await db.query(`UPDATE public.users SET role = $2 WHERE id = $1`, [
      admin.userId,
      'admin',
    ]);

    // Customer sending spoofed admin identity or 'system' alias must be overwritten with customer identity
    const spoofRes = await fetch(`${baseUrl}/api/audit-logs`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
        Cookie: customer.cookie,
      },
      body: JSON.stringify({
        actorId: 'system',
        actorName: 'Fake Root Admin',
        actorRole: 'admin',
        action: 'topup_submitted',
        entityType: 'topup',
        entityId: 'top_101',
        details: 'Submitted 50% receipt',
      }),
    });
    assert.equal(spoofRes.status, 201);
    assert.equal(spoofRes.headers.get('cache-control'), 'no-store');
    const spoofJson = (await spoofRes.json()) as {
      success: boolean;
      log: {
        id: string;
        actorId: string;
        actorName: string;
        actorRole: string;
        action: string;
        entityType: string;
        entityId: string;
        details: string;
      };
    };
    assert.equal(spoofJson.success, true);
    assert.equal(spoofJson.log.actorId, customer.userId);
    assert.equal(spoofJson.log.actorName, 'Player Two');
    assert.equal(spoofJson.log.actorRole, 'customer');
    assert.equal(spoofJson.log.action, 'TOPUP_SUBMITTED');
    assert.equal(spoofJson.log.entityType, 'topup');
    assert.equal(spoofJson.log.entityId, 'top_101');

    // Verified admin using actorId='system' retains system alias with admin role
    const sysRes = await fetch(`${baseUrl}/api/audit-logs`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        actorId: 'system',
        actorName: 'Treasury Monitor',
        action: 'RULE_CHECKED',
        entityType: 'settings',
        entityId: 'cfg_main',
        details: 'Verified threshold',
      }),
    });
    assert.equal(sysRes.status, 201);
    const sysJson = (await sysRes.json()) as {
      log: { actorId: string; actorName: string; actorRole: string };
    };
    assert.equal(sysJson.log.actorId, 'system');
    assert.equal(sysJson.log.actorName, 'Treasury Monitor');
    assert.equal(sysJson.log.actorRole, 'admin');

    // Immutable fields rejected with 403
    const immutableRes = await fetch(`${baseUrl}/api/audit-logs`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
        Cookie: admin.cookie,
      },
      body: JSON.stringify({
        id: 'aud_fixed',
        action: 'OVERRIDE_ATTEMPT',
      }),
    });
    assert.equal(immutableRes.status, 403);
  });
});

test('GET /api/audit-logs supports cursor pagination, entityType, date range, safe ILIKE escaping, CSV export cap, and masked DB errors', async () => {
  await withAuditLogServer(async ({ baseUrl, db, otps }) => {
    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Audit Admin',
      email: 'audit-admin@example.com',
      password: 'Password123!',
    });
    await db.query(`UPDATE public.users SET role = $2 WHERE id = $1`, [
      admin.userId,
      'admin',
    ]);

    const seedRows = [
      {
        id: 'aud_a',
        actorId: 'usr_1',
        actorName: 'Alice Player',
        actorRole: 'customer',
        action: 'TOPUP_APPROVED',
        entityType: 'topup',
        entityId: 'top_alpha',
        details: '100% match bonus',
        ts: '2027-01-10T10:00:00.000Z',
      },
      {
        id: 'aud_b',
        actorId: 'usr_2',
        actorName: 'Bob Agent',
        actorRole: 'agent',
        action: 'WITHDRAWAL_PAID',
        entityType: 'withdrawal',
        entityId: 'wd_beta',
        details: 'Paid via CashApp',
        ts: '2027-01-15T12:00:00.000Z',
      },
      {
        id: 'aud_c',
        actorId: admin.userId,
        actorName: 'Audit Admin',
        actorRole: 'admin',
        action: 'PARTNER_UPDATED',
        entityType: 'official_partner',
        entityId: 'ptr_gamma',
        details: 'Updated link_check',
        ts: '2027-01-20T14:00:00.000Z',
      },
    ];

    for (const row of seedRows) {
      await db.query(
        `INSERT INTO public.audit_logs (
           id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, timestamp
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.id,
          row.actorId,
          row.actorName,
          row.actorRole,
          row.action,
          row.entityType,
          row.entityId,
          row.details,
          row.ts,
        ],
      );
    }

    // 1. Cursor pagination (limit=2)
    const page1Res = await fetch(`${baseUrl}/api/audit-logs?limit=2`, {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(page1Res.status, 200);
    const page1 = (await page1Res.json()) as {
      logs: Array<{ id: string; timestamp: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };
    assert.equal(page1.logs.length, 2);
    assert.equal(page1.logs[0]!.id, 'aud_c');
    assert.equal(page1.logs[1]!.id, 'aud_b');
    assert.equal(page1.hasMore, true);
    assert.equal(page1.nextCursor, '2027-01-15T12:00:00.000Z');

    const page2Res = await fetch(
      `${baseUrl}/api/audit-logs?limit=1&beforeTimestamp=${encodeURIComponent(page1.nextCursor!)}`,
      { headers: { Cookie: admin.cookie } },
    );
    assert.equal(page2Res.status, 200);
    const page2 = (await page2Res.json()) as {
      logs: Array<{ id: string }>;
      hasMore: boolean;
    };
    assert.equal(page2.logs.length, 1);
    assert.equal(page2.logs[0]!.id, 'aud_a');
    assert.equal(page2.hasMore, true);

    // 2. Entity filter + date bounds
    const entityRes = await fetch(
      `${baseUrl}/api/audit-logs?entityType=official_partner&fromDate=2027-01-18&toDate=2027-01-22`,
      { headers: { Cookie: admin.cookie } },
    );
    assert.equal(entityRes.status, 200);
    const entityJson = (await entityRes.json()) as {
      logs: Array<{ id: string }>;
    };
    assert.deepEqual(
      entityJson.logs.map((l) => l.id),
      ['aud_c'],
    );

    // 3. Literal ILIKE wildcard characters (% and _) are escaped cleanly
    const literalPercentRes = await fetch(
      `${baseUrl}/api/audit-logs?search=${encodeURIComponent('100%')}`,
      { headers: { Cookie: admin.cookie } },
    );
    assert.equal(literalPercentRes.status, 200);
    const literalPercentJson = (await literalPercentRes.json()) as {
      logs: Array<{ id: string }>;
    };
    assert.deepEqual(
      literalPercentJson.logs.map((l) => l.id),
      ['aud_a'],
    );

    // 4. Invalid query parameters rejected 400
    const badRes = await fetch(
      `${baseUrl}/api/audit-logs?entityType=unknown_table`,
      { headers: { Cookie: admin.cookie } },
    );
    assert.equal(badRes.status, 400);

    // 5. DB error returns masked 500 without leaking raw error text
    db.failNextAuditQuery = true;
    const dbErrRes = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: { Cookie: admin.cookie },
    });
    assert.equal(dbErrRes.status, 500);
    const dbErrJson = (await dbErrRes.json()) as {
      error: { code: string; message: string };
    };
    assert.equal(dbErrJson.error.code, 'INTERNAL_SERVER_ERROR');
    assert.ok(!dbErrJson.error.message.includes('simulated_pg'));
  });
});

test('POST /api/audit-logs emits SSE audit_log to admin subscribers only after DB persistence succeeds', async () => {
  await withAuditLogServer(async ({ baseUrl, db, otps }) => {
    const admin = await signupAndSignIn(baseUrl, otps, {
      name: 'Stream Admin',
      email: 'stream-admin@example.com',
      password: 'Password123!',
    });
    const customer = await signupAndSignIn(baseUrl, otps, {
      name: 'Stream Customer',
      email: 'stream-customer@example.com',
      password: 'Password123!',
    });
    await db.query(`UPDATE public.users SET role = $2 WHERE id = $1`, [
      admin.userId,
      'admin',
    ]);

    const ac = new AbortController();
    const sseRes = await fetch(`${baseUrl}/api/realtime/stream`, {
      headers: {
        Cookie: admin.cookie,
        Accept: 'text/event-stream',
      },
      signal: ac.signal,
    });
    assert.equal(sseRes.status, 200);
    const reader = sseRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const readUntil = async (predicate: (text: string) => boolean) => {
      const deadline = Date.now() + 2000;
      while (!predicate(buffer) && Date.now() < deadline) {
        const chunk = await Promise.race([
          reader.read(),
          new Promise<{ done: boolean; value?: Uint8Array }>((resolve) =>
            setTimeout(() => resolve({ done: false }), 150),
          ),
        ]);
        if (chunk.value) {
          buffer += decoder.decode(chunk.value, { stream: true });
        }
      }
    };

    // Wait for initial stream hello ('event: ready')
    await readUntil((txt) => txt.includes('event: ready'));

    // Failing DB insert must NOT emit audit_log SSE
    db.failNextAuditQuery = true;
    const failedPost = await fetch(`${baseUrl}/api/audit-logs`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
        Cookie: customer.cookie,
      },
      body: JSON.stringify({
        action: 'SHOULD_NOT_EMIT',
        entityType: 'wallet',
        details: 'Simulated failure',
      }),
    });
    assert.equal(failedPost.status, 500);

    // Succeeding DB insert emits audit_log SSE
    const okPost = await fetch(`${baseUrl}/api/audit-logs`, {
      method: 'POST',
      headers: {
        Origin: 'https://swiftsweeps.example.com',
        'Content-Type': 'application/json',
        Cookie: customer.cookie,
      },
      body: JSON.stringify({
        action: 'WALLET_VIEWED',
        entityType: 'wallet',
        details: 'Player opened wallet',
      }),
    });
    assert.equal(okPost.status, 201);

    await readUntil((txt) => txt.includes('WALLET_VIEWED'));
    assert.ok(!buffer.includes('SHOULD_NOT_EMIT'));
    assert.ok(buffer.includes('event: audit_log'));
    assert.ok(buffer.includes('WALLET_VIEWED'));

    ac.abort();
    try {
      await reader.cancel();
    } catch {
      // Ignore abort cancellation noise
    }
  });
});
