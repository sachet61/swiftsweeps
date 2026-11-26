import type { UserProfile, UserRole } from '../types';

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'anonymous'
  | 'expired'
  | 'api_unavailable';

export interface ServerAuthUser {
  id: string;
  email: string;
  displayName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  status: string;
  emailVerified: boolean;
  referralCode?: string | null;
  referredBy?: string | null;
  referrerDisplayName?: string | null;
  passwordResetRequired?: boolean;
  isParentAdmin?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthMeResponsePayload {
  user: ServerAuthUser;
  session: {
    expiresAt: string;
  };
}

export interface AuthStateSnapshot {
  status: AuthStatus;
  user: UserProfile | null;
  sessionExpiresAt: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  expiredReason: string | null;
}

export interface ParsedAuthHttpPayload {
  ok: boolean;
  status: number;
  isJson: boolean;
  isHtmlFallback: boolean;
  code: string | null;
  message: string | null;
  retryAfterSec: number | null;
  data: any;
}

export interface MappedAuthFailure {
  code: string;
  message: string;
  isUnavailable: boolean;
  isUnverified: boolean;
  isSuspended: boolean;
  passwordResetRequired: boolean;
  retryAfterSec: number | null;
}

const DEFAULT_EXPIRED_REASON =
  'Your login session has expired or was signed out. Please sign in again to continue.';

const DEFAULT_UNAVAILABLE_MESSAGE =
  'Authentication service is currently unavailable. Please check your connection and try again.';

export function normalizeAuthRole(rawRole: unknown): UserRole {
  if (rawRole === 'admin' || rawRole === 'agent' || rawRole === 'customer') {
    return rawRole;
  }
  return 'customer';
}

export function buildUserProfileFromAuthMe(
  serverUser: ServerAuthUser,
  existingProfile?: Partial<UserProfile> | null
): UserProfile {
  const email = String(serverUser.email || '').trim().toLowerCase();
  const id = String(serverUser.id || '').trim();
  const displayName =
    String(serverUser.displayName || '').trim() ||
    email.split('@')[0] ||
    'Player';

  const sameUserExisting =
    existingProfile &&
    (existingProfile.id === id ||
      (existingProfile.email &&
        existingProfile.email.trim().toLowerCase() === email))
      ? existingProfile
      : undefined;

  const resolvedPhone =
    'phone' in serverUser
      ? serverUser.phone?.trim() || undefined
      : sameUserExisting?.phone;
  const resolvedAvatarUrl =
    'avatarUrl' in serverUser
      ? serverUser.avatarUrl?.trim() || undefined
      : sameUserExisting?.avatarUrl;
  const resolvedReferralCode =
    'referralCode' in serverUser
      ? serverUser.referralCode?.trim() ||
        sameUserExisting?.referralCode ||
        `REF_${id.slice(-5).toUpperCase()}`
      : sameUserExisting?.referralCode || `REF_${id.slice(-5).toUpperCase()}`;
  const resolvedReferredBy =
    'referredBy' in serverUser
      ? serverUser.referredBy?.trim() || undefined
      : sameUserExisting?.referredBy;
  const resolvedReferrerDisplayName =
    'referrerDisplayName' in serverUser
      ? serverUser.referrerDisplayName?.trim() || undefined
      : sameUserExisting?.referrerDisplayName;

  return {
    ...(sameUserExisting || {}),
    id,
    email,
    displayName,
    phone: resolvedPhone,
    avatarUrl: resolvedAvatarUrl,
    role: normalizeAuthRole(serverUser.role),
    status: String(serverUser.status || 'active'),
    emailVerified: Boolean(serverUser.emailVerified),
    passwordResetRequired: Boolean(serverUser.passwordResetRequired),
    isParentAdmin: Boolean(serverUser.isParentAdmin),
    referralCode: resolvedReferralCode,
    referredBy: resolvedReferredBy,
    referrerDisplayName: resolvedReferrerDisplayName,
    createdAt: serverUser.createdAt || sameUserExisting?.createdAt || new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };
}

export function looksLikeHtmlDocument(rawText: string): boolean {
  const trimmed = rawText.trim().toLowerCase();
  return (
    trimmed.startsWith('<!doctype html') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<?xml')
  );
}

export function parseAuthHttpPayload(params: {
  ok: boolean;
  status: number;
  contentType: string | null;
  rawText: string;
  retryAfterHeader?: string | null;
}): ParsedAuthHttpPayload {
  const { ok, status, contentType, rawText, retryAfterHeader } = params;
  const trimmed = rawText.trim();
  const ctLower = (contentType || '').toLowerCase();
  const isHtml = ctLower.includes('text/html') || looksLikeHtmlDocument(trimmed);

  let retryAfterSec: number | null = null;
  if (retryAfterHeader) {
    const parsedNum = Number(retryAfterHeader);
    if (Number.isFinite(parsedNum) && parsedNum > 0) {
      retryAfterSec = Math.ceil(parsedNum);
    }
  }

  if (isHtml) {
    return {
      ok: false,
      status,
      isJson: false,
      isHtmlFallback: true,
      code: 'API_UNAVAILABLE',
      message: DEFAULT_UNAVAILABLE_MESSAGE,
      retryAfterSec,
      data: null,
    };
  }

  let data: any = null;
  let isJson = false;
  if (trimmed.length > 0) {
    try {
      data = JSON.parse(trimmed);
      isJson = true;
    } catch {
      isJson = false;
      data = null;
    }
  }

  // An empty 204/200 on POST sign-out is valid, whereas non-JSON text on an API route is unexpected.
  const code =
    data && typeof data === 'object'
      ? typeof data.code === 'string'
        ? data.code
        : typeof data.error?.code === 'string'
        ? data.error.code
        : null
      : null;

  const message =
    data && typeof data === 'object'
      ? typeof data.message === 'string'
        ? data.message
        : typeof data.error === 'string'
        ? data.error
        : typeof data.error?.message === 'string'
        ? data.error.message
        : null
      : null;

  return {
    ok,
    status,
    isJson,
    isHtmlFallback: false,
    code,
    message,
    retryAfterSec,
    data,
  };
}

export function mapAuthErrorResponse(parsed: ParsedAuthHttpPayload): MappedAuthFailure {
  const rawCode = (parsed.code || '').trim().toUpperCase();
  const rawMsg = (parsed.message || '').trim();
  const lowerMsg = rawMsg.toLowerCase();

  const isUnavailable =
    parsed.isHtmlFallback ||
    parsed.status >= 500 ||
    parsed.status === 0 ||
    rawCode === 'API_UNAVAILABLE' ||
    rawCode === 'EMAIL_DELIVERY_UNAVAILABLE';

  const isUnverified =
    rawCode === 'EMAIL_NOT_VERIFIED' ||
    lowerMsg.includes('email is not verified') ||
    lowerMsg.includes('email not verified') ||
    lowerMsg.includes('verify your email');

  const isSuspended =
    rawCode === 'ACCOUNT_SUSPENDED' ||
    lowerMsg.includes('account is suspended') ||
    lowerMsg.includes('suspended or inactive');

  const passwordResetRequired =
    rawCode === 'PASSWORD_RESET_REQUIRED' ||
    lowerMsg.includes('password reset is required');

  let message = rawMsg;
  if (parsed.status === 429) {
    message =
      parsed.retryAfterSec && !rawMsg
        ? `Too many requests. Please wait ${parsed.retryAfterSec} seconds and try again.`
        : rawMsg || 'Too many authentication attempts. Please wait a moment and try again.';
  } else if (rawCode === 'EMAIL_DELIVERY_UNAVAILABLE') {
    message =
      rawMsg ||
      'Transactional email delivery is currently unavailable. Verification and reset emails cannot be sent right now.';
  } else if (parsed.isHtmlFallback || (parsed.status >= 500 && !rawMsg)) {
    message = DEFAULT_UNAVAILABLE_MESSAGE;
  } else if (parsed.status === 401 && !rawMsg) {
    message = 'Invalid email or password.';
  } else if (!message) {
    message = `Authentication request failed (HTTP ${parsed.status}).`;
  }

  return {
    code: rawCode || `HTTP_${parsed.status}`,
    message,
    isUnavailable,
    isUnverified,
    isSuspended,
    passwordResetRequired,
    retryAfterSec: parsed.retryAfterSec,
  };
}

export function deriveAuthMeTransition(params: {
  wasAuthenticated: boolean;
  parsed?: ParsedAuthHttpPayload;
  networkError?: boolean;
  existingProfile?: Partial<UserProfile> | null;
}): AuthStateSnapshot {
  const { wasAuthenticated, parsed, networkError, existingProfile } = params;

  if (networkError || !parsed) {
    return {
      status: 'api_unavailable',
      user: null,
      sessionExpiresAt: null,
      errorCode: 'API_UNAVAILABLE',
      errorMessage: DEFAULT_UNAVAILABLE_MESSAGE,
      expiredReason: null,
    };
  }

  if (parsed.isHtmlFallback || parsed.status >= 500 || parsed.status === 404) {
    return {
      status: 'api_unavailable',
      user: null,
      sessionExpiresAt: null,
      errorCode: parsed.code || 'API_UNAVAILABLE',
      errorMessage: parsed.message || DEFAULT_UNAVAILABLE_MESSAGE,
      expiredReason: null,
    };
  }

  if (parsed.status === 200) {
    const userObj = parsed.data?.user;
    if (
      !parsed.isJson ||
      !userObj ||
      typeof userObj.id !== 'string' ||
      !userObj.id.trim() ||
      typeof userObj.email !== 'string' ||
      !userObj.email.trim()
    ) {
      return {
        status: 'api_unavailable',
        user: null,
        sessionExpiresAt: null,
        errorCode: 'INVALID_AUTH_PAYLOAD',
        errorMessage: 'Authentication API returned an invalid session payload.',
        expiredReason: null,
      };
    }

    return {
      status: 'authenticated',
      user: buildUserProfileFromAuthMe(userObj as ServerAuthUser, existingProfile),
      sessionExpiresAt:
        typeof parsed.data?.session?.expiresAt === 'string'
          ? parsed.data.session.expiresAt
          : null,
      errorCode: null,
      errorMessage: null,
      expiredReason: null,
    };
  }

  if (parsed.status === 401) {
    if (wasAuthenticated) {
      return {
        status: 'expired',
        user: null,
        sessionExpiresAt: null,
        errorCode: 'SESSION_EXPIRED',
        errorMessage: null,
        expiredReason: DEFAULT_EXPIRED_REASON,
      };
    }

    return {
      status: 'anonymous',
      user: null,
      sessionExpiresAt: null,
      errorCode: null,
      errorMessage: null,
      expiredReason: null,
    };
  }

  if (parsed.status === 403) {
    const mapped = mapAuthErrorResponse(parsed);
    return {
      status: 'anonymous',
      user: null,
      sessionExpiresAt: null,
      errorCode: mapped.code,
      errorMessage: mapped.message,
      expiredReason: mapped.message,
    };
  }

  return {
    status: 'api_unavailable',
    user: null,
    sessionExpiresAt: null,
    errorCode: parsed.code || `HTTP_${parsed.status}`,
    errorMessage: parsed.message || DEFAULT_UNAVAILABLE_MESSAGE,
    expiredReason: null,
  };
}
