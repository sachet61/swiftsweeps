import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins';
import type pg from 'pg';
import type { ServerConfig } from '../config/env.js';
import type { Logger } from '../logging/logger.js';
import {
  EmailDeliveryUnavailableError,
  type EmailDeliveryAdapter,
} from './emailDelivery.js';
import type { UserDirectoryRepo } from './userDirectoryRepo.js';

export interface CreateAuthInstanceDeps {
  config: ServerConfig;
  logger: Logger;
  pool: pg.Pool | unknown;
  userRepo: UserDirectoryRepo;
  emailDelivery: EmailDeliveryAdapter;
  /**
   * Optional adapter override strictly for isolated automated tests (e.g.
   * Better Auth's `memoryAdapter`). Never set in production runtime.
   */
  authDatabaseOverride?: BetterAuthOptions['database'];
}

export interface AuthRuntime {
  auth: ReturnType<typeof betterAuth>;
  runWithoutAutoCustomerSignup: <T>(
    email: string,
    fn: () => Promise<T>,
  ) => Promise<T>;
}

const EMAIL_DELIVERY_REQUIRED_PATHS = new Set([
  '/send-verification-email',
  '/request-password-reset',
  '/email-otp/send-verification-otp',
  '/email-otp/request-password-reset',
  '/forget-password/email-otp',
]);

function normalizeAuthPath(rawPath: string | undefined): string {
  if (!rawPath) {
    return '';
  }
  return rawPath.endsWith('/') && rawPath.length > 1
    ? rawPath.slice(0, -1)
    : rawPath;
}

export function createAuthInstance({
  config,
  logger,
  pool,
  userRepo,
  emailDelivery,
  authDatabaseOverride,
}: CreateAuthInstanceDeps): AuthRuntime {
  const adminProvisioningEmails = new Set<string>();

  const runWithoutAutoCustomerSignup = async <T>(
    email: string,
    fn: () => Promise<T>,
  ): Promise<T> => {
    const cleanEmail = email.trim().toLowerCase();
    adminProvisioningEmails.add(cleanEmail);
    try {
      return await fn();
    } finally {
      adminProvisioningEmails.delete(cleanEmail);
    }
  };

  const throwEmailUnavailable = (): never => {
    throw APIError.from('SERVICE_UNAVAILABLE', {
      code: 'EMAIL_DELIVERY_UNAVAILABLE',
      message: 'Transactional email delivery is currently unavailable.',
    });
  };

  const databaseConfig: BetterAuthOptions['database'] =
    authDatabaseOverride ?? (pool as pg.Pool);

  const trustedProxies =
    config.trustProxy === 'loopback' ? ['127.0.0.1', '::1'] : undefined;

  const trustedOrigins = Array.from(
    new Set(
      [config.appOrigin, ...(config.trustedOrigins ?? [])].filter(Boolean),
    ),
  );

  const authOptions: BetterAuthOptions = {
    appName: 'SwiftSweeps',
    baseURL: config.appOrigin,
    basePath: '/api/auth',
    secret: config.authSecret,
    trustedOrigins,
    database: databaseConfig,
    disabledPaths: ['/sign-in/email-otp'],
    telemetry: {
      enabled: false,
      debug: false,
    },
    user: {
      modelName: 'ba_user',
    },
    session: {
      modelName: 'ba_session',
      expiresIn: config.authSessionExpiresInSec,
      updateAge: config.authSessionUpdateAgeSec,
      freshAge: config.authSessionFreshAgeSec,
    },
    account: {
      modelName: 'ba_account',
    },
    verification: {
      modelName: 'ba_verification',
      storeIdentifier: 'hashed',
    },
    emailVerification: {
      sendOnSignUp: config.authRequireEmailVerification,
      sendOnSignIn: config.authRequireEmailVerification,
      autoSignInAfterVerification: false,
      expiresIn: 300,
      afterEmailVerification: async (user) => {
        const appUser = await userRepo.markEmailVerifiedByAuthUserId(user.id);
        await userRepo.writeAuditLog({
          actorId: appUser?.appUserId ?? user.id,
          actorName: appUser?.displayName ?? user.name,
          actorRole: appUser?.role ?? 'customer',
          action: 'EMAIL_VERIFIED',
          entityType: 'user',
          entityId: appUser?.appUserId ?? user.id,
          details: 'User verified email address via self-hosted auth.',
        });
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: config.authRequireEmailVerification,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 3_600,
      sendResetPassword: async ({ user, url }) => {
        try {
          await emailDelivery.sendPasswordResetEmail({
            to: user.email,
            recipientName: user.name,
            url,
          });
        } catch (err) {
          if (err instanceof EmailDeliveryUnavailableError) {
            throwEmailUnavailable();
          }
          throw err;
        }
      },
      onPasswordReset: async ({ user }) => {
        const appUser = await userRepo.clearPasswordResetRequiredByAuthUserId(
          user.id,
        );
        await userRepo.writeAuditLog({
          actorId: appUser?.appUserId ?? user.id,
          actorName: appUser?.displayName ?? user.name,
          actorRole: appUser?.role ?? 'customer',
          action: 'PASSWORD_RESET_COMPLETED',
          entityType: 'user',
          entityId: appUser?.appUserId ?? user.id,
          details: 'User completed password reset and existing sessions were revoked.',
        });
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: config.authRequireEmailVerification,
        disableSignUp: true,
        rateLimit: {
          window: 60,
          max: 3,
        },
        sendVerificationOTP: async ({ email, otp, type }) => {
          try {
            await emailDelivery.sendOtpEmail({
              to: email,
              otp,
              purpose: type,
            });
          } catch (err) {
            if (err instanceof EmailDeliveryUnavailableError) {
              throwEmailUnavailable();
            }
            throw err;
          }
        },
      }),
    ],
    rateLimit: {
      enabled: config.authRateLimitEnabled,
      storage: 'database',
      modelName: 'ba_rate_limit',
      window: config.authRateLimitWindowSec,
      max: config.authRateLimitMax,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 300, max: 5 },
        '/request-password-reset': { window: 60, max: 3 },
        '/reset-password': { window: 300, max: 5 },
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/email-otp/verify-email': { window: 300, max: 5 },
        '/email-otp/request-password-reset': { window: 60, max: 3 },
        '/email-otp/reset-password': { window: 300, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: config.authCookiePrefix,
      useSecureCookies: config.nodeEnv === 'production',
      disableCSRFCheck: false,
      disableOriginCheck: false,
      trustedProxyHeaders: false,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      },
      ipAddress: {
        ipAddressHeaders:
          config.trustProxy === false ? [] : ['x-forwarded-for'],
        ...(trustedProxies ? { trustedProxies } : {}),
        ipv6Subnet: 64,
      },
      database: {
        validateSchema: false,
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const currentPath = normalizeAuthPath(ctx.path);

        if (
          !emailDelivery.isConfigured() &&
          (EMAIL_DELIVERY_REQUIRED_PATHS.has(currentPath) ||
            (currentPath === '/sign-up/email' &&
              config.authRequireEmailVerification))
        ) {
          throwEmailUnavailable();
        }

        if (currentPath === '/sign-up/email' && ctx.body && typeof ctx.body === 'object') {
          const body = ctx.body as Record<string, unknown>;
          const rawRole = body.role;
          if (rawRole !== undefined && rawRole !== 'customer') {
            logger.warn('signup_role_escalation_attempt_blocked');
          }
          delete body.role;
          delete body.status;
          delete body.emailVerified;
          delete body.isParentAdmin;

          if (typeof body.password === 'string' && body.password.trim().length === 0) {
            throw APIError.from('BAD_REQUEST', {
              code: 'INVALID_PASSWORD',
              message: 'Password must not be blank.',
            });
          }
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const cleanEmail = user.email.trim().toLowerCase();
            const cleanName =
              (typeof user.name === 'string' ? user.name.trim() : '') ||
              cleanEmail.split('@')[0] ||
              'Player';

            return {
              data: {
                ...user,
                email: cleanEmail,
                name: cleanName,
              },
            };
          },
          after: async (user) => {
            const cleanEmail = user.email.trim().toLowerCase();
            if (adminProvisioningEmails.has(cleanEmail)) {
              return;
            }

            const appUser = await userRepo.ensureUserForSelfHostedSignup({
              authUserId: user.id,
              email: cleanEmail,
              displayName: user.name,
              emailVerified: Boolean(user.emailVerified),
            });

            await userRepo.writeAuditLog({
              actorId: appUser.appUserId,
              actorName: appUser.displayName,
              actorRole: 'customer',
              action: 'USER_REGISTERED',
              entityType: 'user',
              entityId: appUser.appUserId,
              details: 'Self-hosted customer registration completed.',
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const appUser = await userRepo.findByAuthUserId(session.userId);
            if (!appUser) {
              throw APIError.from('FORBIDDEN', {
                code: 'USER_PROFILE_MISSING',
                message: 'Application account profile could not be resolved.',
              });
            }

            if (appUser.status !== 'active') {
              throw APIError.from('FORBIDDEN', {
                code: 'ACCOUNT_SUSPENDED',
                message: 'Account is suspended or inactive.',
              });
            }

            if (appUser.passwordResetRequired) {
              throw APIError.from('FORBIDDEN', {
                code: 'PASSWORD_RESET_REQUIRED',
                message: 'Password reset is required before signing in.',
              });
            }
          },
          after: async (session) => {
            const appUser = await userRepo.findByAuthUserId(session.userId);
            if (!appUser) {
              return;
            }
            await userRepo.writeAuditLog({
              actorId: appUser.appUserId,
              actorName: appUser.displayName,
              actorRole: appUser.role,
              action: 'USER_LOGGED_IN',
              entityType: 'session',
              entityId: appUser.appUserId,
              details: 'User authenticated with cookie session.',
            });
          },
        },
        delete: {
          after: async (session) => {
            const appUser = await userRepo.findByAuthUserId(session.userId);
            if (!appUser) {
              return;
            }
            await userRepo.writeAuditLog({
              actorId: appUser.appUserId,
              actorName: appUser.displayName,
              actorRole: appUser.role,
              action: 'USER_LOGGED_OUT',
              entityType: 'session',
              entityId: appUser.appUserId,
              details: 'User session revoked.',
            });
          },
        },
      },
    },
  };

  const auth = betterAuth(authOptions);
  return {
    auth,
    runWithoutAutoCustomerSignup,
  };
}
