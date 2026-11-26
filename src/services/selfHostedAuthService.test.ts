import test from 'node:test';
import assert from 'node:assert/strict';
import { SelfHostedAuthService, type FetchLike } from './selfHostedAuthService';
import {
  deriveAuthMeTransition,
  mapAuthErrorResponse,
  parseAuthHttpPayload,
} from './authStateUtils';

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}

function htmlResponse(status: number, html = '<!doctype html><html><body>SPA</body></html>'): Response {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

test('initial bootstrap transitions cleanly from loading to authenticated and deduplicates concurrent calls', async () => {
  let meCalls = 0;
  let capturedInit: RequestInit | undefined;

  const fetchMock: FetchLike = async (url, init) => {
    if (String(url) === '/api/auth/me') {
      meCalls += 1;
      capturedInit = init;
      return jsonResponse(200, {
        user: {
          id: 'usr_12345',
          email: 'Player@Example.com',
          displayName: 'Marcus Vance',
          role: 'admin',
          status: 'active',
          emailVerified: true,
          passwordResetRequired: false,
          isParentAdmin: false,
        },
        session: {
          expiresAt: '2026-12-31T23:59:59.000Z',
        },
      });
    }
    throw new Error(`Unexpected URL: ${String(url)}`);
  };

  const auth = new SelfHostedAuthService({ fetchFn: fetchMock });
  assert.equal(auth.getSnapshot().status, 'loading');
  assert.equal(auth.getCurrentUser(), null);

  const [snapA, snapB] = await Promise.all([
    auth.bootstrapSession(),
    auth.bootstrapSession(),
  ]);

  assert.equal(meCalls, 1);
  assert.equal(capturedInit?.credentials, 'include');
  assert.equal(snapA.status, 'authenticated');
  assert.equal(snapB.status, 'authenticated');
  assert.equal(snapA.user?.id, 'usr_12345');
  assert.equal(snapA.user?.email, 'player@example.com');
  assert.equal(snapA.user?.role, 'admin');
  assert.equal(snapA.sessionExpiresAt, '2026-12-31T23:59:59.000Z');
  assert.equal(auth.getCurrentUser()?.id, 'usr_12345');

  // Calling bootstrapSession again after completion does not loop /api/auth/me
  const cached = await auth.bootstrapSession();
  assert.equal(meCalls, 1);
  assert.equal(cached.status, 'authenticated');
});

test('initial bootstrap transitions to anonymous on 401 and never shows a logged-in user', async () => {
  const fetchMock: FetchLike = async () =>
    jsonResponse(401, { error: 'Authentication required' });

  const auth = new SelfHostedAuthService({ fetchFn: fetchMock });
  const snap = await auth.bootstrapSession();

  assert.equal(snap.status, 'anonymous');
  assert.equal(snap.user, null);
  assert.equal(snap.expiredReason, null);
  assert.equal(auth.getCurrentUser(), null);
});

test('bootstrapSession fails closed as api_unavailable on 503, 404, HTML fallback, invalid payload, and network errors', async () => {
  const failureResponses: Array<() => Promise<Response>> = [
    async () => jsonResponse(503, { code: 'API_UNAVAILABLE', error: 'Service down' }),
    async () => jsonResponse(404, { error: 'Not found' }),
    async () => htmlResponse(200),
    async () => jsonResponse(200, { invalid: true }),
    async () => {
      throw new TypeError('Failed to fetch');
    },
  ];

  for (const responder of failureResponses) {
    const auth = new SelfHostedAuthService({
      fetchFn: async () => responder(),
    });
    const snap = await auth.bootstrapSession();
    assert.equal(snap.status, 'api_unavailable');
    assert.equal(snap.user, null);
    assert.equal(auth.getCurrentUser(), null);
    assert.ok(snap.errorMessage && snap.errorMessage.length > 0);
  }
});

test('401 after being authenticated transitions distinctly to expired with expiredReason', async () => {
  let authenticated = true;
  const auth = new SelfHostedAuthService({
    fetchFn: async () => {
      if (authenticated) {
        return jsonResponse(200, {
          user: {
            id: 'usr_cust_1',
            email: 'player@example.com',
            displayName: 'Player One',
            role: 'customer',
            status: 'active',
            emailVerified: true,
          },
          session: { expiresAt: '2026-12-01T00:00:00.000Z' },
        });
      }
      return jsonResponse(401, { error: 'Session expired' });
    },
  });

  const first = await auth.bootstrapSession();
  assert.equal(first.status, 'authenticated');

  authenticated = false;
  const second = await auth.fetchCurrentUser();
  assert.equal(second.status, 'expired');
  assert.equal(second.user, null);
  assert.equal(second.errorCode, 'SESSION_EXPIRED');
  assert.ok(second.expiredReason && second.expiredReason.toLowerCase().includes('expired'));
});

test('loginWithEmail handles success, invalid credentials, unverified, password reset required, suspended, and API failure', async () => {
  let nextSignInResponse: () => Promise<Response> = async () =>
    jsonResponse(200, { token: 'ok' });
  let nextMeResponse: () => Promise<Response> = async () =>
    jsonResponse(200, {
      user: {
        id: 'usr_cust_2',
        email: 'user@example.com',
        displayName: 'User Two',
        role: 'customer',
        status: 'active',
        emailVerified: true,
      },
      session: { expiresAt: '2026-12-10T00:00:00.000Z' },
    });

  const auth = new SelfHostedAuthService({
    fetchFn: async (url, init) => {
      assert.equal(init?.credentials, 'include');
      if (String(url) === '/api/auth/sign-in/email') {
        return nextSignInResponse();
      }
      if (String(url) === '/api/auth/me') {
        return nextMeResponse();
      }
      throw new Error(`Unexpected URL: ${String(url)}`);
    },
  });

  // 1. Success resolves authoritative /api/auth/me user
  const okRes = await auth.loginWithEmail('User@Example.com', 'Secret1234');
  assert.equal(okRes.success, true);
  assert.equal(okRes.user?.id, 'usr_cust_2');
  assert.equal(auth.getSnapshot().status, 'authenticated');

  // 2. Invalid credentials (401)
  nextSignInResponse = async () =>
    jsonResponse(401, { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' });
  const badCreds = await auth.loginWithEmail('user@example.com', 'wrongpass');
  assert.equal(badCreds.success, false);
  assert.equal(badCreds.isUnavailable, false);
  assert.equal(badCreds.error, 'Invalid email or password');

  // 3. Unverified email (403 EMAIL_NOT_VERIFIED)
  nextSignInResponse = async () =>
    jsonResponse(403, { code: 'EMAIL_NOT_VERIFIED', message: 'Email is not verified' });
  const unverified = await auth.loginWithEmail('user@example.com', 'Secret1234');
  assert.equal(unverified.success, false);
  assert.equal(unverified.isUnverified, true);
  assert.equal(unverified.email, 'user@example.com');

  // 4. Password reset required (403 PASSWORD_RESET_REQUIRED)
  nextSignInResponse = async () =>
    jsonResponse(403, {
      code: 'PASSWORD_RESET_REQUIRED',
      message: 'A password reset is required before signing in.',
    });
  const resetReq = await auth.loginWithEmail('user@example.com', 'Secret1234');
  assert.equal(resetReq.success, false);
  assert.equal(resetReq.passwordResetRequired, true);

  // 5. Account suspended (403 ACCOUNT_SUSPENDED)
  nextSignInResponse = async () =>
    jsonResponse(403, {
      code: 'ACCOUNT_SUSPENDED',
      message: 'This account is suspended or inactive.',
    });
  const suspended = await auth.loginWithEmail('user@example.com', 'Secret1234');
  assert.equal(suspended.success, false);
  assert.equal(suspended.isSuspended, true);

  // 6. Network outage
  nextSignInResponse = async () => {
    throw new Error('ECONNREFUSED');
  };
  const outage = await auth.loginWithEmail('user@example.com', 'Secret1234');
  assert.equal(outage.success, false);
  assert.equal(outage.isUnavailable, true);
});

test('registerWithEmail and verifyEmailOtp honor autoSignInAfterVerification=false', async () => {
  const calls: string[] = [];
  const auth = new SelfHostedAuthService({
    fetchFn: async (url) => {
      const path = String(url);
      calls.push(path);
      if (path === '/api/auth/sign-up/email') {
        return jsonResponse(200, { user: { id: 'usr_new', email: 'new@example.com' } });
      }
      if (path === '/api/auth/email-otp/verify-email') {
        return jsonResponse(200, { status: true });
      }
      if (path === '/api/auth/sign-in/email') {
        return jsonResponse(200, { status: true });
      }
      if (path === '/api/auth/me') {
        return jsonResponse(200, {
          user: {
            id: 'usr_new',
            email: 'new@example.com',
            displayName: 'New Player',
            role: 'customer',
            status: 'active',
            emailVerified: true,
          },
          session: { expiresAt: '2026-12-15T00:00:00.000Z' },
        });
      }
      throw new Error(`Unexpected URL: ${path}`);
    },
  });

  const regRes = await auth.registerWithEmail({
    email: 'New@Example.com',
    password: 'Password123',
    displayName: 'New Player',
  });
  assert.equal(regRes.success, true);
  assert.equal(regRes.requiresEmailVerification, true);
  // Registration must not prematurely authenticate user
  assert.equal(auth.getCurrentUser(), null);

  // Without in-memory password, verifyEmailOtp returns requiresSignIn=true cleanly
  const verifyOnly = await auth.verifyEmailOtp('new@example.com', '123456');
  assert.equal(verifyOnly.success, true);
  assert.equal(verifyOnly.requiresSignIn, true);
  assert.equal(verifyOnly.signedIn, false);

  // With in-memory password, verifyEmailOtp explicitly calls sign-in -> /api/auth/me
  const verifyAndSignIn = await auth.verifyEmailOtp('new@example.com', '123456', {
    password: 'Password123',
  });
  assert.equal(verifyAndSignIn.success, true);
  assert.equal(verifyAndSignIn.signedIn, true);
  assert.equal(verifyAndSignIn.user?.id, 'usr_new');
  assert.equal(auth.getSnapshot().status, 'authenticated');
  assert.deepEqual(calls, [
    '/api/auth/sign-up/email',
    '/api/auth/email-otp/verify-email',
    '/api/auth/email-otp/verify-email',
    '/api/auth/sign-in/email',
    '/api/auth/me',
  ]);
});

test('password reset endpoints and logout transitions work and fail closed on 503', async () => {
  const calls: Array<{ url: string; body: any }> = [];
  let failDelivery = false;

  const auth = new SelfHostedAuthService({
    fetchFn: async (url, init) => {
      const path = String(url);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: path, body });

      if (path === '/api/auth/me') {
        return jsonResponse(200, {
          user: {
            id: 'usr_99',
            email: 'cust@example.com',
            displayName: 'Cust',
            role: 'customer',
            status: 'active',
            emailVerified: true,
          },
          session: { expiresAt: '2026-12-31T00:00:00.000Z' },
        });
      }
      if (path === '/api/auth/email-otp/request-password-reset') {
        if (failDelivery) {
          return jsonResponse(503, {
            code: 'EMAIL_DELIVERY_UNAVAILABLE',
            message: 'Transactional email delivery is unavailable.',
          });
        }
        return jsonResponse(200, { status: true });
      }
      if (path === '/api/auth/email-otp/reset-password') {
        return jsonResponse(200, { status: true });
      }
      if (path === '/api/auth/reset-password') {
        return jsonResponse(200, { status: true });
      }
      if (path === '/api/auth/sign-out') {
        return jsonResponse(200, { success: true });
      }
      throw new Error(`Unexpected URL: ${path}`);
    },
  });

  await auth.bootstrapSession();
  assert.equal(auth.getSnapshot().status, 'authenticated');

  const logoutRes = await auth.logout('manual');
  assert.equal(logoutRes.success, true);
  assert.equal(auth.getSnapshot().status, 'anonymous');
  assert.equal(auth.getCurrentUser(), null);

  await auth.bootstrapSession({ force: true });
  const expiredLogout = await auth.logout('session_expired');
  assert.equal(expiredLogout.success, true);
  assert.equal(auth.getSnapshot().status, 'expired');
  assert.ok(auth.getSnapshot().expiredReason);

  failDelivery = true;
  const resetFail = await auth.requestPasswordReset('cust@example.com');
  assert.equal(resetFail.success, false);
  assert.equal(resetFail.code, 'EMAIL_DELIVERY_UNAVAILABLE');
  assert.equal(resetFail.isUnavailable, true);

  failDelivery = false;
  const resetReqOk = await auth.requestPasswordReset('cust@example.com');
  assert.equal(resetReqOk.success, true);

  const otpResetOk = await auth.resetPasswordWithOtp({
    email: 'cust@example.com',
    otp: '654321',
    newPassword: 'NewPassword123',
  });
  assert.equal(otpResetOk.success, true);

  const tokenResetOk = await auth.resetPasswordWithToken({
    token: 'tok_abc123',
    newPassword: 'NewPassword123',
  });
  assert.equal(tokenResetOk.success, true);

  assert.equal(
    calls.some((c) => c.url === '/api/auth/sign-out'),
    true
  );
  assert.equal(
    calls.some(
      (c) =>
        c.url === '/api/auth/email-otp/reset-password' &&
        c.body.otp === '654321' &&
        c.body.password === 'NewPassword123'
    ),
    true
  );
  assert.equal(
    calls.some(
      (c) =>
        c.url === '/api/auth/reset-password' &&
        c.body.token === 'tok_abc123' &&
        c.body.newPassword === 'NewPassword123'
    ),
    true
  );
});

test('authStateUtils surfaces rate limit retry-after and rejects HTML fallback cleanly', () => {
  const rateLimited = parseAuthHttpPayload({
    ok: false,
    status: 429,
    contentType: 'application/json',
    rawText: JSON.stringify({ code: 'TOO_MANY_REQUESTS' }),
    retryAfterHeader: '42',
  });
  const mapped429 = mapAuthErrorResponse(rateLimited);
  assert.equal(mapped429.retryAfterSec, 42);
  assert.ok(mapped429.message.includes('42'));

  const htmlPayload = parseAuthHttpPayload({
    ok: true,
    status: 200,
    contentType: 'text/html',
    rawText: '<!doctype html><html><body>Index</body></html>',
  });
  const transition = deriveAuthMeTransition({
    wasAuthenticated: true,
    parsed: htmlPayload,
  });
  assert.equal(transition.status, 'api_unavailable');
  assert.equal(transition.user, null);
});
