import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApiApp } from '../app.js';
import {
  ConfigValidationError,
  loadServerConfig,
  type ServerConfig,
} from '../config/env.js';
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
    logLevel: 'debug',
    shutdownTimeoutMs: 2_000,
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
