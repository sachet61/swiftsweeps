import type { Express } from 'express';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createApiApp } from './app.js';
import type { EmailDeliveryAdapter } from './auth/emailDelivery.js';
import { loadServerConfig, type ServerConfig } from './config/env.js';
import { InMemoryDatabasePool } from './db/inMemoryPool.js';
import { createLogger } from './logging/logger.js';

function buildMockServerConfig(): ServerConfig {
  const fallbackConfig = loadServerConfig({
    NODE_ENV: 'development',
    HOST: '0.0.0.0',
    PORT: '3000',
    APP_ORIGIN: process.env.APP_ORIGIN?.trim() || 'http://localhost:3000',
    DATABASE_URL: 'postgres://localhost:5432/swiftsweeps_mock',
    AUTH_SECRET:
      process.env.AUTH_SECRET?.trim() ||
      'swiftsweeps-local-in-memory-mock-auth-secret-key-2026',
    AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
    AUTH_RATE_LIMIT_ENABLED: 'false',
    REQUEST_BODY_LIMIT: '4mb',
  });

  return {
    ...fallbackConfig,
    nodeEnv: 'development',
    allowSameHostOrigin: true,
    authRequireEmailVerification: false,
    authRateLimitEnabled: false,
    requestBodyLimit: '4mb',
    requestBodyLimitBytes: 4 * 1024 * 1024,
  };
}

function createDevMockAppInstance(): Express {
  const config = buildMockServerConfig();
  const logger = createLogger({ level: 'warn' });
  const pool = new InMemoryDatabasePool();

  const authStore: Record<string, unknown[]> = {
    ba_user: [],
    ba_session: [],
    ba_account: [],
    ba_verification: [],
    ba_rate_limit: [],
  };
  const authDatabaseOverride = memoryAdapter(authStore);

  const emailDeliveryOverride: EmailDeliveryAdapter = {
    providerName: 'in-memory-dev',
    isConfigured: () => true,
    async sendVerificationEmail(payload) {
      logger.info('mock_verification_email', { to: payload.to });
    },
    async sendOtpEmail(payload) {
      logger.info('mock_otp_email', {
        to: payload.to,
        purpose: payload.purpose,
        otp: payload.otp,
      });
    },
    async sendPasswordResetEmail(payload) {
      logger.info('mock_password_reset_email', { to: payload.to });
    },
  };

  return createApiApp({
    config,
    logger,
    pool,
    authDatabaseOverride,
    emailDeliveryOverride,
  });
}

let cachedDevMockApp: Promise<Express> | null = null;

export async function getDevMockApp(): Promise<Express> {
  if (!cachedDevMockApp) {
    cachedDevMockApp = Promise.resolve(createDevMockAppInstance());
  }
  return cachedDevMockApp;
}
