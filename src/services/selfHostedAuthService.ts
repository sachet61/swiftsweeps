import type { UserProfile } from '../types';
import {
  type AuthStateSnapshot,
  type ParsedAuthHttpPayload,
  deriveAuthMeTransition,
  mapAuthErrorResponse,
  parseAuthHttpPayload,
} from './authStateUtils';

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface LoginResult {
  success: boolean;
  user?: UserProfile;
  error?: string;
  code?: string;
  isUnverified?: boolean;
  isSuspended?: boolean;
  passwordResetRequired?: boolean;
  isUnavailable?: boolean;
  email?: string;
}

export interface RegisterResult {
  success: boolean;
  requiresEmailVerification?: boolean;
  email?: string;
  error?: string;
  code?: string;
  isUnavailable?: boolean;
  message?: string;
}

export interface VerifyEmailOtpResult {
  success: boolean;
  signedIn?: boolean;
  requiresSignIn?: boolean;
  user?: UserProfile;
  email?: string;
  message?: string;
  code?: string;
  isUnavailable?: boolean;
}

export interface SimpleAuthActionResult {
  success: boolean;
  message?: string;
  code?: string;
  isUnavailable?: boolean;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

function resolveDefaultFetch(): FetchLike {
  if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
    return (input, init) => globalThis.fetch(input, init);
  }
  throw new Error('Fetch API is not available in this runtime.');
}

function getStorageSafe(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export class SelfHostedAuthService {
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;
  private readonly listeners = new Set<(snapshot: AuthStateSnapshot) => void>();

  private snapshot: AuthStateSnapshot = {
    status: 'loading',
    user: null,
    sessionExpiresAt: null,
    errorMessage: null,
    errorCode: null,
    expiredReason: null,
  };

  private hasCompletedInitialBootstrap = false;
  private inFlightBootstrap: Promise<AuthStateSnapshot> | null = null;
  private cachedUserProfileHints: Partial<UserProfile> | null = null;

  constructor(options?: { fetchFn?: FetchLike; timeoutMs?: number }) {
    this.fetchFn = options?.fetchFn ?? resolveDefaultFetch();
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  public getSnapshot(): AuthStateSnapshot {
    return this.snapshot;
  }

  public getCurrentUser(): UserProfile | null {
    return this.snapshot.status === 'authenticated' ? this.snapshot.user : null;
  }

  public setUserProfileHints(profile: Partial<UserProfile> | null): void {
    this.cachedUserProfileHints = profile;
  }

  public subscribe(listener: (snapshot: AuthStateSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private commitSnapshot(next: AuthStateSnapshot): AuthStateSnapshot {
    this.snapshot = next;
    if (next.status === 'authenticated' && next.user) {
      this.cachedUserProfileHints = next.user;
    } else if (next.status === 'anonymous' || next.status === 'expired') {
      this.cachedUserProfileHints = null;
    }
    this.listeners.forEach((listener) => {
      try {
        listener(this.snapshot);
      } catch (err) {
        console.warn('[SelfHostedAuthService] listener error:', err);
      }
    });
    return this.snapshot;
  }

  private clearLegacyClientAuthArtifacts(): void {
    const storage = getStorageSafe();
    if (storage) {
      try {
        storage.removeItem('aetherpay_active_session');
      } catch {}
    }
    if (typeof document !== 'undefined') {
      try {
        document.cookie =
          'aetherpay_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      } catch {}
    }
  }

  private async requestJson(
    url: string,
    init: RequestInit = {}
  ): Promise<{ parsed?: ParsedAuthHttpPayload; networkError?: boolean }> {
    const controller = new AbortController();
    const externalSignal = init.signal;
    let timedOut = false;

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const headers = new Headers(init.headers);
      if (!headers.has('Accept')) {
        headers.set('Accept', 'application/json');
      }
      if (init.body !== undefined && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const response = await this.fetchFn(url, {
        ...init,
        headers,
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });

      const rawText = await response.text();
      const parsed = parseAuthHttpPayload({
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type'),
        rawText,
        retryAfterHeader: response.headers.get('retry-after'),
      });
      return { parsed };
    } catch (err: any) {
      if (err?.name === 'AbortError' && externalSignal?.aborted && !timedOut) {
        throw err;
      }
      return { networkError: true };
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  public async bootstrapSession(options?: {
    force?: boolean;
    signal?: AbortSignal;
  }): Promise<AuthStateSnapshot> {
    const force = Boolean(options?.force);

    if (
      !force &&
      this.hasCompletedInitialBootstrap &&
      this.snapshot.status !== 'loading'
    ) {
      return this.snapshot;
    }

    if (this.inFlightBootstrap && !force) {
      return this.inFlightBootstrap;
    }

    if (force && this.snapshot.status !== 'loading') {
      this.commitSnapshot({
        ...this.snapshot,
        status: 'loading',
        errorMessage: null,
        errorCode: null,
      });
    }

    const wasAuthenticated = this.snapshot.status === 'authenticated';

    const run = (async (): Promise<AuthStateSnapshot> => {
      try {
        const result = await this.requestJson('/api/auth/me', {
          method: 'GET',
          signal: options?.signal,
        });

        const nextSnapshot = deriveAuthMeTransition({
          wasAuthenticated,
          parsed: result.parsed,
          networkError: result.networkError,
          existingProfile: this.cachedUserProfileHints,
        });

        if (nextSnapshot.status === 'anonymous' || nextSnapshot.status === 'expired') {
          this.clearLegacyClientAuthArtifacts();
        }

        this.hasCompletedInitialBootstrap = true;
        return this.commitSnapshot(nextSnapshot);
      } finally {
        this.inFlightBootstrap = null;
      }
    })();

    this.inFlightBootstrap = run;
    return run;
  }

  public async fetchCurrentUser(options?: {
    preservePreviousStateOnUnavailable?: boolean;
  }): Promise<AuthStateSnapshot> {
    const prevSnapshot = this.snapshot;
    const wasAuthenticated = prevSnapshot.status === 'authenticated';
    const result = await this.requestJson('/api/auth/me', { method: 'GET' });
    const nextSnapshot = deriveAuthMeTransition({
      wasAuthenticated,
      parsed: result.parsed,
      networkError: result.networkError,
      existingProfile: this.cachedUserProfileHints,
    });

    if (
      options?.preservePreviousStateOnUnavailable &&
      nextSnapshot.status === 'api_unavailable' &&
      prevSnapshot.status === 'authenticated'
    ) {
      return prevSnapshot;
    }

    this.hasCompletedInitialBootstrap = true;
    if (nextSnapshot.status === 'anonymous' || nextSnapshot.status === 'expired') {
      this.clearLegacyClientAuthArtifacts();
    }
    return this.commitSnapshot(nextSnapshot);
  }

  public async loginWithEmail(
    emailInput: string,
    passwordInput: string
  ): Promise<LoginResult> {
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !passwordInput) {
      return {
        success: false,
        error: 'Please enter both your email address and password.',
      };
    }

    const signInResult = await this.requestJson('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({
        email: cleanEmail,
        password: passwordInput,
      }),
    });

    if (signInResult.networkError || !signInResult.parsed) {
      return {
        success: false,
        code: 'API_UNAVAILABLE',
        isUnavailable: true,
        error:
          'Unable to reach the authentication server. Please verify your connection and try again.',
      };
    }

    const parsed = signInResult.parsed;
    if (!parsed.ok) {
      const mapped = mapAuthErrorResponse(parsed);
      return {
        success: false,
        code: mapped.code,
        isUnverified: mapped.isUnverified,
        isSuspended: mapped.isSuspended,
        passwordResetRequired: mapped.passwordResetRequired,
        isUnavailable: mapped.isUnavailable,
        email: cleanEmail,
        error: mapped.message,
      };
    }

    // Always resolve authoritative application user from GET /api/auth/me
    const meSnapshot = await this.fetchCurrentUser();
    if (meSnapshot.status === 'authenticated' && meSnapshot.user) {
      return {
        success: true,
        user: meSnapshot.user,
      };
    }

    return {
      success: false,
      code: meSnapshot.errorCode || 'SESSION_VERIFICATION_FAILED',
      isUnavailable: meSnapshot.status === 'api_unavailable',
      passwordResetRequired: meSnapshot.errorCode === 'PASSWORD_RESET_REQUIRED',
      isSuspended: meSnapshot.errorCode === 'ACCOUNT_SUSPENDED',
      error:
        meSnapshot.errorMessage ||
        'Sign-in succeeded, but your session could not be verified. Please try again.',
    };
  }

  public async registerWithEmail(params: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<RegisterResult> {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName = params.displayName.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (!cleanName) {
      return { success: false, error: 'Please enter your full name or gamer tag.' };
    }
    if (!params.password || params.password.trim().length === 0 || params.password.length < 8) {
      return {
        success: false,
        error: 'Password must be at least 8 characters and not blank.',
      };
    }

    const signUpResult = await this.requestJson('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({
        name: cleanName,
        email: cleanEmail,
        password: params.password,
      }),
    });

    if (signUpResult.networkError || !signUpResult.parsed) {
      return {
        success: false,
        code: 'API_UNAVAILABLE',
        isUnavailable: true,
        error:
          'Unable to reach the authentication server. Account registration failed.',
      };
    }

    const parsed = signUpResult.parsed;
    if (!parsed.ok) {
      const mapped = mapAuthErrorResponse(parsed);
      return {
        success: false,
        code: mapped.code,
        isUnavailable: mapped.isUnavailable,
        error: mapped.message,
      };
    }

    return {
      success: true,
      requiresEmailVerification: true,
      email: cleanEmail,
      message:
        'Account created! Enter the 6-digit verification code sent to your email to verify your address.',
    };
  }

  public async verifyEmailOtp(
    emailInput: string,
    otpInput: string,
    options?: { password?: string }
  ): Promise<VerifyEmailOtpResult> {
    const cleanEmail = emailInput.trim().toLowerCase();
    const cleanOtp = otpInput.replace(/\s+/g, '').trim();

    if (!cleanEmail || !cleanOtp) {
      return {
        success: false,
        message: 'Email address and 6-digit verification code are required.',
      };
    }

    const verifyResult = await this.requestJson('/api/auth/email-otp/verify-email', {
      method: 'POST',
      body: JSON.stringify({
        email: cleanEmail,
        otp: cleanOtp,
      }),
    });

    if (verifyResult.networkError || !verifyResult.parsed) {
      return {
        success: false,
        code: 'API_UNAVAILABLE',
        isUnavailable: true,
        message: 'Unable to reach the verification server. Please try again.',
      };
    }

    if (!verifyResult.parsed.ok) {
      const mapped = mapAuthErrorResponse(verifyResult.parsed);
      return {
        success: false,
        code: mapped.code,
        isUnavailable: mapped.isUnavailable,
        message:
          mapped.message || 'Invalid or expired verification code. Please try again.',
      };
    }

    // If user is already signed in (e.g. verifying from profile/banner), refresh /api/auth/me.
    if (this.snapshot.status === 'authenticated') {
      const refreshed = await this.fetchCurrentUser();
      if (refreshed.status === 'authenticated' && refreshed.user) {
        return {
          success: true,
          signedIn: true,
          user: refreshed.user,
          email: cleanEmail,
          message: 'Email verified successfully!',
        };
      }
    }

    // Backend uses autoSignInAfterVerification: false; sign in explicitly if password was retained in memory.
    if (options?.password) {
      const loginRes = await this.loginWithEmail(cleanEmail, options.password);
      if (loginRes.success && loginRes.user) {
        return {
          success: true,
          signedIn: true,
          user: loginRes.user,
          email: cleanEmail,
          message: 'Email verified and signed in successfully!',
        };
      }
    }

    return {
      success: true,
      signedIn: false,
      requiresSignIn: true,
      email: cleanEmail,
      message: 'Email verified! Please sign in with your password to continue.',
    };
  }

  public async resendEmailOtp(emailInput: string): Promise<SimpleAuthActionResult> {
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, message: 'A valid email address is required.' };
    }

    const result = await this.requestJson('/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      body: JSON.stringify({
        email: cleanEmail,
        type: 'email-verification',
      }),
    });

    if (result.networkError || !result.parsed) {
      return {
        success: false,
        code: 'API_UNAVAILABLE',
        isUnavailable: true,
        message: 'Unable to reach the authentication server. Could not send code.',
      };
    }

    if (!result.parsed.ok) {
      const mapped = mapAuthErrorResponse(result.parsed);
      return {
        success: false,
        code: mapped.code,
        isUnavailable: mapped.isUnavailable,
        message: mapped.message,
      };
    }

    return {
      success: true,
      message: `A 6-digit verification code has been sent to ${cleanEmail}.`,
    };
  }

  public async requestPasswordReset(emailInput: string): Promise<SimpleAuthActionResult> {
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, message: 'Please enter a valid email address.' };
    }

    const result = await this.requestJson('/api/auth/email-otp/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email: cleanEmail }),
    });

    if (result.networkError || !result.parsed) {
      return {
        success: false,
        code: 'API_UNAVAILABLE',
        isUnavailable: true,
        message: 'Unable to reach the authentication server. Password reset request failed.',
      };
    }

    if (!result.parsed.ok) {
      const mapped = mapAuthErrorResponse(result.parsed);
      return {
        success: false,
        code: mapped.code,
        isUnavailable: mapped.isUnavailable,
        message: mapped.message,
      };
    }

    return {
      success: true,
      message: `If an account exists for ${cleanEmail}, a 6-digit password reset code has been sent.`,
    };
  }

  public async resetPasswordWithOtp(params: {
    email: string;
    otp: string;
    newPassword: string;
  }): Promise<SimpleAuthActionResult> {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanOtp = params.otp.replace(/\s+/g, '').trim();

    if (!cleanEmail || !cleanOtp || !params.newPassword) {
      return {
        success: false,
        message: 'Email, 6-digit reset code, and new password are required.',
      };
    }

    const result = await this.requestJson('/api/auth/email-otp/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: cleanEmail,
        otp: cleanOtp,
        password: params.newPassword,
      }),
    });

    if (result.networkError || !result.parsed) {
      return {
        success: false,
        code: 'API_UNAVAILABLE',
        isUnavailable: true,
        message: 'Unable to reach the authentication server. Password reset failed.',
      };
    }

    if (!result.parsed.ok) {
      const mapped = mapAuthErrorResponse(result.parsed);
      return {
        success: false,
        code: mapped.code,
        isUnavailable: mapped.isUnavailable,
        message: mapped.message,
      };
    }

    return {
      success: true,
      message: 'Password has been reset successfully. You can now sign in.',
    };
  }

  public async resetPasswordWithToken(params: {
    token: string;
    newPassword: string;
  }): Promise<SimpleAuthActionResult> {
    const cleanToken = params.token.trim();
    if (!cleanToken || !params.newPassword) {
      return {
        success: false,
        message: 'Reset token and new password are required.',
      };
    }

    const result = await this.requestJson('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: cleanToken,
        newPassword: params.newPassword,
      }),
    });

    if (result.networkError || !result.parsed) {
      return {
        success: false,
        code: 'API_UNAVAILABLE',
        isUnavailable: true,
        message: 'Unable to reach the authentication server. Password reset failed.',
      };
    }

    if (!result.parsed.ok) {
      const mapped = mapAuthErrorResponse(result.parsed);
      return {
        success: false,
        code: mapped.code,
        isUnavailable: mapped.isUnavailable,
        message: mapped.message,
      };
    }

    return {
      success: true,
      message: 'Password has been reset successfully. You can now sign in.',
    };
  }

  public async logout(
    reason: 'manual' | 'inactivity' | 'session_expired' = 'manual'
  ): Promise<SimpleAuthActionResult> {
    this.clearLegacyClientAuthArtifacts();
    this.hasCompletedInitialBootstrap = true;

    const expiredReason =
      reason === 'inactivity'
        ? 'Your session has timed out due to inactivity. Please enter your credentials to resume.'
        : reason === 'session_expired'
        ? 'Your login session has expired or was signed out. Please sign in again to continue.'
        : null;

    this.commitSnapshot({
      status: reason === 'manual' ? 'anonymous' : 'expired',
      user: null,
      sessionExpiresAt: null,
      errorMessage: null,
      errorCode: reason === 'manual' ? null : 'SESSION_EXPIRED',
      expiredReason,
    });

    const result = await this.requestJson('/api/auth/sign-out', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    if (result.networkError || !result.parsed) {
      return {
        success: false,
        isUnavailable: true,
        message: 'Signed out locally, but the server could not be reached.',
      };
    }

    if (!result.parsed.ok) {
      const mapped = mapAuthErrorResponse(result.parsed);
      return {
        success: false,
        code: mapped.code,
        isUnavailable: mapped.isUnavailable,
        message: mapped.message,
      };
    }

    return { success: true };
  }

  public markSessionExpired(reason?: string): void {
    this.clearLegacyClientAuthArtifacts();
    this.hasCompletedInitialBootstrap = true;
    this.commitSnapshot({
      status: 'expired',
      user: null,
      sessionExpiresAt: null,
      errorCode: 'SESSION_EXPIRED',
      errorMessage: null,
      expiredReason:
        reason?.trim() ||
        'Your login session has expired or was signed out. Please sign in again to continue.',
    });
  }

  public markApiUnavailable(message?: string): void {
    this.hasCompletedInitialBootstrap = true;
    this.commitSnapshot({
      status: 'api_unavailable',
      user: null,
      sessionExpiresAt: null,
      errorCode: 'API_UNAVAILABLE',
      errorMessage:
        message?.trim() ||
        'Authentication service is currently unavailable. Please check your connection and try again.',
      expiredReason: null,
    });
  }

  public applyAuthenticatedUser(user: UserProfile, sessionExpiresAt?: string | null): void {
    this.hasCompletedInitialBootstrap = true;
    this.commitSnapshot({
      status: 'authenticated',
      user,
      sessionExpiresAt: sessionExpiresAt ?? this.snapshot.sessionExpiresAt,
      errorCode: null,
      errorMessage: null,
      expiredReason: null,
    });
  }

  public updateVerificationStatus(verified: boolean): void {
    if (this.snapshot.status !== 'authenticated' || !this.snapshot.user) {
      return;
    }
    this.commitSnapshot({
      ...this.snapshot,
      user: {
        ...this.snapshot.user,
        emailVerified: Boolean(verified),
      },
    });
  }
}

export const selfHostedAuthService = new SelfHostedAuthService();
