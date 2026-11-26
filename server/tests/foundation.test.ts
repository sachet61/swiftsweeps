import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApiApp } from '../app.js';
import {
  ConfigValidationError,
  loadServerConfig,
  type ServerConfig,
} from '../config/env.js';
import { loadLocalDotEnv } from '../config/loadDotEnv.js';
import { closePgPool, type DatabasePool } from '../db/pool.js';
import { createLogger } from '../logging/logger.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';

function createTestConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 0,
    appOrigin: 'https://app.example.com',
    trustProxy: 'loopback',
    databaseUrl: 'postgres://staging_user:not_a_real_secret@127.0.0.1:5432/staging_db',
    pgPoolMax: 5,
    pgPoolMin: 0,
    pgIdleTimeoutMs: 10_000,
    pgConnectionTimeoutMs: 2_000,
    pgStatementTimeoutMs: 5_000,
    pgSslMode: 'disable',
    requestBodyLimit: '1kb',
    requestBodyLimitBytes: 1024,
    logLevel: 'debug',
    shutdownTimeoutMs: 2_000,
    authSecret: 'test-only-auth-secret-minimum-32-characters-long',
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

function createSilentLogger(
  stdoutLines: string[] = [],
  stderrLines: string[] = [],
) {
  return createLogger({
    level: 'debug',
    writeStdout: (line) => stdoutLines.push(line),
    writeStderr: (line) => stderrLines.push(line),
  });
}

async function withServer(
  app: ReturnType<typeof createApiApp>,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('loadServerConfig rejects missing DATABASE_URL without leaking secrets', () => {
  assert.throws(
    () =>
      loadServerConfig({
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://swiftsweeps.example.com',
      }),
    (err: unknown) => {
      assert.ok(err instanceof ConfigValidationError);
      assert.match(err.message, /DATABASE_URL is required/);
      return true;
    },
  );
});

test('loadServerConfig rejects invalid DATABASE_URL without echoing credentials', () => {
  const secretToken = 'super_secret_pw_9988';
  assert.throws(
    () =>
      loadServerConfig({
        NODE_ENV: 'development',
        DATABASE_URL: `mysql://admin:${secretToken}@db.internal:3306/app`,
      }),
    (err: unknown) => {
      assert.ok(err instanceof ConfigValidationError);
      assert.match(err.message, /DATABASE_URL must use postgres/);
      assert.ok(!err.message.includes(secretToken));
      return true;
    },
  );
});

test('loadServerConfig enforces strict APP_ORIGIN in production and rejects wildcards', () => {
  assert.throws(
    () =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/app',
      }),
    (err: unknown) => {
      assert.ok(err instanceof ConfigValidationError);
      assert.match(err.message, /APP_ORIGIN is required in production/);
      return true;
    },
  );

  assert.throws(
    () =>
      loadServerConfig({
        NODE_ENV: 'development',
        APP_ORIGIN: '*',
        DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/app',
      }),
    (err: unknown) => {
      assert.ok(err instanceof ConfigValidationError);
      assert.match(err.message, /wildcard/);
      return true;
    },
  );
});

test('loadServerConfig rejects unsafe TRUST_PROXY values', () => {
  assert.throws(
    () =>
      loadServerConfig({
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://swiftsweeps.example.com',
        TRUST_PROXY: 'true',
        DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/app',
      }),
    ConfigValidationError,
  );
});

test('logger redacts secrets, passwords, authorization headers, and Postgres URIs', () => {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const logger = createSilentLogger(stdoutLines, stderrLines);

  logger.info('auth_check', {
    password: 'my-plain-password',
    authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
    nested: {
      databaseUrl: 'postgresql://appuser:topsecret@10.0.0.5:5432/prod',
      note: 'failed connecting to postgres://appuser:topsecret@10.0.0.5:5432/prod',
    },
  });

  logger.error('db_err', {
    error: new Error('connect postgres://user:secretpass@127.0.0.1:5432/db failed'),
  });

  assert.equal(stdoutLines.length, 1);
  assert.equal(stderrLines.length, 1);

  const infoLog = stdoutLines[0]!;
  const errLog = stderrLines[0]!;

  assert.ok(!infoLog.includes('my-plain-password'));
  assert.ok(!infoLog.includes('eyJhbGciOiJIUzI1NiJ9'));
  assert.ok(!infoLog.includes('topsecret'));
  assert.ok(!errLog.includes('secretpass'));
  assert.match(infoLog, /"password":"\[REDACTED\]"/);
  assert.match(errLog, /postgres:\/\/\[REDACTED\]/);
});

test('GET /api/healthz and /api/readyz return minimal safe responses', async () => {
  let dbHealthy = true;
  let shuttingDown = false;

  const mockPool: DatabasePool = {
    async query(sql: string) {
      assert.equal(sql, 'SELECT 1 AS ok');
      if (!dbHealthy) {
        throw new Error('ECONNREFUSED postgres://secret:pass@10.0.0.2:5432/db');
      }
      return { rows: [{ ok: 1 }] };
    },
    async end() {},
  } as DatabasePool & { connect: () => Promise<never> };
  (mockPool as unknown as { connect: () => Promise<never> }).connect = async () => {
    throw new Error('connect not used in health test');
  };

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const app = createApiApp({
    config: createTestConfig(),
    logger: createSilentLogger(stdoutLines, stderrLines),
    pool: mockPool,
    isShuttingDown: () => shuttingDown,
  });

  await withServer(app, async (baseUrl) => {
    const healthRes = await fetch(`${baseUrl}/api/healthz`);
    assert.equal(healthRes.status, 200);
    assert.deepEqual(await healthRes.json(), { status: 'ok' });
    assert.ok(healthRes.headers.get('x-request-id'));
    assert.equal(healthRes.headers.get('x-powered-by'), null);
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthRes.headers.get('x-frame-options'), 'DENY');
    assert.equal(healthRes.headers.get('cache-control'), 'no-store');

    const readyRes = await fetch(`${baseUrl}/api/readyz`);
    assert.equal(readyRes.status, 200);
    assert.deepEqual(await readyRes.json(), { status: 'ready' });

    dbHealthy = false;
    const unhealthyRes = await fetch(`${baseUrl}/api/readyz`);
    assert.equal(unhealthyRes.status, 503);
    const unhealthyBody = await unhealthyRes.json();
    assert.deepEqual(unhealthyBody, { status: 'unavailable' });

    dbHealthy = true;
    shuttingDown = true;
    const drainingRes = await fetch(`${baseUrl}/api/readyz`);
    assert.equal(drainingRes.status, 503);
    assert.deepEqual(await drainingRes.json(), { status: 'unavailable' });
  });
});

test('security middleware enforces same-origin policy without wildcard CORS', async () => {
  const mockPool: DatabasePool = {
    async query() {
      return { rows: [{ ok: 1 }] };
    },
    async end() {},
  };
  (mockPool as unknown as { connect: () => Promise<never> }).connect = async () => {
    throw new Error('connect not used in security test');
  };

  const app = createApiApp({
    config: createTestConfig({ appOrigin: 'https://swiftsweeps.example.com' }),
    logger: createSilentLogger(),
    pool: mockPool,
  });

  await withServer(app, async (baseUrl) => {
    const allowedOriginRes = await fetch(`${baseUrl}/api/healthz`, {
      headers: { Origin: 'https://swiftsweeps.example.com' },
    });
    assert.equal(allowedOriginRes.status, 200);
    assert.equal(
      allowedOriginRes.headers.get('access-control-allow-origin'),
      'https://swiftsweeps.example.com',
    );
    assert.equal(
      allowedOriginRes.headers.get('access-control-allow-credentials'),
      'true',
    );

    const foreignGetRes = await fetch(`${baseUrl}/api/healthz`, {
      headers: { Origin: 'https://evil.example.net' },
    });
    assert.equal(foreignGetRes.status, 200);
    assert.equal(foreignGetRes.headers.get('access-control-allow-origin'), null);

    const foreignPostRes = await fetch(`${baseUrl}/api/healthz`, {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example.net',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(foreignPostRes.status, 403);
    const postErr = (await foreignPostRes.json()) as {
      error: { code: string };
    };
    assert.equal(postErr.error.code, 'ORIGIN_FORBIDDEN');
  });
});

test('centralized validation and error handling return safe structured responses', async () => {
  const mockPool: DatabasePool = {
    async query() {
      return { rows: [{ ok: 1 }] };
    },
    async end() {},
  };
  (mockPool as unknown as { connect: () => Promise<never> }).connect = async () => {
    throw new Error('connect not used in validation test');
  };

  const app = createApiApp({
    config: createTestConfig(),
    logger: createSilentLogger(),
    pool: mockPool,
  });

  await withServer(app, async (baseUrl) => {
    const notFoundRes = await fetch(`${baseUrl}/api/does-not-exist`);
    assert.equal(notFoundRes.status, 404);
    const notFoundBody = (await notFoundRes.json()) as {
      error: { code: string; requestId?: string };
    };
    assert.equal(notFoundBody.error.code, 'ENDPOINT_NOT_FOUND');
    assert.ok(notFoundBody.error.requestId);

    const badJsonRes = await fetch(`${baseUrl}/api/healthz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"broken": ',
    });
    assert.equal(badJsonRes.status, 400);
    const badJsonBody = (await badJsonRes.json()) as {
      error: { code: string };
    };
    assert.equal(badJsonBody.error.code, 'INVALID_JSON');

    const tooLargeRes = await fetch(`${baseUrl}/api/healthz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pad: 'x'.repeat(2048) }),
    });
    assert.equal(tooLargeRes.status, 413);
    const tooLargeBody = (await tooLargeRes.json()) as {
      error: { code: string };
    };
    assert.equal(tooLargeBody.error.code, 'PAYLOAD_TOO_LARGE');
  });
});

test('validateRequestBody rejects invalid input via HttpError and closePgPool closes pool', async () => {
  const middleware = validateRequestBody((body) => {
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as { name?: unknown }).name !== 'string'
    ) {
      throw new Error('name must be a string');
    }
    return body as { name: string };
  });

  let capturedError: unknown;
  middleware(
    { body: { name: 42 } } as never,
    {} as never,
    (err?: unknown) => {
      capturedError = err;
    },
  );
  assert.ok(capturedError instanceof HttpError);
  assert.equal(capturedError.statusCode, 400);
  assert.equal(capturedError.code, 'VALIDATION_ERROR');

  let ended = false;
  await closePgPool(
    {
      async end() {
        ended = true;
      },
    },
    createSilentLogger(),
  );
  assert.equal(ended, true);
});

test('loadServerConfig prefers API_PORT over container PORT when both are provided', () => {
  const cfg = loadServerConfig({
    NODE_ENV: 'development',
    PORT: '8080',
    API_PORT: '4000',
    DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/app',
  });
  assert.equal(cfg.port, 4000);
});

test('loadServerConfig parses comma-separated APP_ORIGIN and TRUSTED_ORIGINS and rejects wildcards', () => {
  const cfg = loadServerConfig({
    NODE_ENV: 'production',
    APP_ORIGIN: ' "https://swiftsweeps.example.com/" , https://app.swiftsweeps.example.com ',
    TRUSTED_ORIGINS: 'https://www.swiftsweeps.example.com/, https://swiftsweeps.example.com',
    ALLOWED_ORIGINS: 'https://admin.swiftsweeps.example.com',
    DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/app',
    AUTH_SECRET: 'a-strong-random-production-secret-string-32chars',
  });

  assert.equal(cfg.appOrigin, 'https://swiftsweeps.example.com');
  assert.deepEqual(cfg.trustedOrigins, [
    'https://swiftsweeps.example.com',
    'https://app.swiftsweeps.example.com',
    'https://www.swiftsweeps.example.com',
    'https://admin.swiftsweeps.example.com',
  ]);

  assert.throws(
    () =>
      loadServerConfig({
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://swiftsweeps.example.com',
        TRUSTED_ORIGINS: 'https://*.swiftsweeps.example.com',
        DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/app',
        AUTH_SECRET: 'a-strong-random-production-secret-string-32chars',
      }),
    (err: unknown) => {
      assert.ok(err instanceof ConfigValidationError);
      assert.match(err.message, /TRUSTED_ORIGINS must not contain wildcards/);
      return true;
    },
  );
});

test('security middleware allows configured trustedOrigins, echoes exact Origin, and logs blocked origins', async () => {
  const mockPool: DatabasePool = {
    async query() {
      return { rows: [{ ok: 1 }] };
    },
    async end() {},
  };
  (mockPool as unknown as { connect: () => Promise<never> }).connect = async () => {
    throw new Error('connect not used in multi-origin security test');
  };

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const app = createApiApp({
    config: createTestConfig({
      appOrigin: 'https://swiftsweeps.example.com',
      trustedOrigins: [
        'https://swiftsweeps.example.com',
        'https://www.swiftsweeps.example.com',
      ],
    }),
    logger: createSilentLogger(stdoutLines, stderrLines),
    pool: mockPool,
  });

  await withServer(app, async (baseUrl) => {
    const preflightRes = await fetch(`${baseUrl}/api/healthz`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://www.swiftsweeps.example.com' },
    });
    assert.equal(preflightRes.status, 204);
    assert.equal(
      preflightRes.headers.get('access-control-allow-origin'),
      'https://www.swiftsweeps.example.com',
    );
    assert.equal(
      preflightRes.headers.get('access-control-allow-credentials'),
      'true',
    );

    const allowedPostRes = await fetch(`${baseUrl}/api/does-not-exist`, {
      method: 'POST',
      headers: {
        Origin: 'https://www.swiftsweeps.example.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    // Passed security middleware and hit API 404 handler instead of 403 ORIGIN_FORBIDDEN
    assert.equal(allowedPostRes.status, 404);
    assert.equal(
      allowedPostRes.headers.get('access-control-allow-origin'),
      'https://www.swiftsweeps.example.com',
    );

    const blockedRes = await fetch(`${baseUrl}/api/healthz`, {
      method: 'POST',
      headers: {
        Origin: 'https://rogue.example.net',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(blockedRes.status, 403);
    const logs = [...stdoutLines, ...stderrLines].join('\n');
    assert.match(logs, /"event":"origin_forbidden"/);
    assert.match(logs, /https:\/\/rogue\.example\.net/);
  });
});

test('loadLocalDotEnv loads variables from .env without overwriting existing process.env', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swiftsweeps-env-'));
  const prevExisting = process.env.SWIFTSWEEPS_TEST_EXISTING;
  const prevLoaded = process.env.SWIFTSWEEPS_TEST_LOADED;

  try {
    fs.writeFileSync(
      path.join(tempDir, '.env'),
      'SWIFTSWEEPS_TEST_EXISTING=from_dotenv\nSWIFTSWEEPS_TEST_LOADED=from_dotenv\n',
      'utf8',
    );
    process.env.SWIFTSWEEPS_TEST_EXISTING = 'from_process';
    delete process.env.SWIFTSWEEPS_TEST_LOADED;

    loadLocalDotEnv(tempDir);

    assert.equal(process.env.SWIFTSWEEPS_TEST_EXISTING, 'from_process');
    assert.equal(process.env.SWIFTSWEEPS_TEST_LOADED, 'from_dotenv');
  } finally {
    if (prevExisting === undefined) {
      delete process.env.SWIFTSWEEPS_TEST_EXISTING;
    } else {
      process.env.SWIFTSWEEPS_TEST_EXISTING = prevExisting;
    }
    if (prevLoaded === undefined) {
      delete process.env.SWIFTSWEEPS_TEST_LOADED;
    } else {
      process.env.SWIFTSWEEPS_TEST_LOADED = prevLoaded;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

