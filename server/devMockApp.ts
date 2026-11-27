import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createApiApp } from './app.js';
import type { EmailDeliveryAdapter } from './auth/emailDelivery.js';
import { loadServerConfig, type ServerConfig } from './config/env.js';
import { InMemoryDatabasePool } from './db/inMemoryPool.js';
import { createLogger } from './logging/logger.js';

const ALLOWED_AUDIT_ENTITY_TYPES = new Set([
  'topup',
  'withdrawal',
  'wallet',
  'game_account',
  'settings',
  'user',
  'chat',
  'auth',
  'official_partner',
]);

function normalizeAuditRow(raw: Record<string, unknown>) {
  const rawRole = String(raw.actor_role ?? 'customer')
    .trim()
    .toLowerCase();
  const actorRole =
    rawRole === 'admin' || rawRole === 'agent' || rawRole === 'customer'
      ? rawRole
      : 'customer';
  const rawTs = raw.timestamp ?? new Date().toISOString();
  const parsedMs = Date.parse(String(rawTs));
  return {
    id: String(raw.id ?? ''),
    actorId: String(raw.actor_id ?? 'system'),
    actorName: String(raw.actor_name ?? 'System'),
    actorRole,
    action: String(raw.action ?? 'UNKNOWN_ACTION'),
    entityType: String(raw.entity_type ?? 'settings'),
    entityId: String(raw.entity_id ?? ''),
    details: String(raw.details ?? ''),
    timestamp: Number.isFinite(parsedMs)
      ? new Date(parsedMs).toISOString()
      : new Date().toISOString(),
  };
}

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
    extraRoutes: (app, { requireAuth }) => {
      app.get('/api/audit-logs', requireAuth, async (req: Request, res: Response) => {
        try {
          if (req.authContext?.user.role !== 'admin') {
            res.status(403).json({
              error:
                'Access Denied: Only Platform Administrators can view system audit logs.',
            });
            return;
          }

          const isExport =
            req.query.format === 'csv' || req.query.export === '1';
          const maxAllowed = isExport ? 500 : 100;
          const rawLimit = Number.parseInt(
            String(req.query.limit ?? '100'),
            10,
          );
          const limit =
            Number.isFinite(rawLimit) && rawLimit > 0
              ? Math.min(rawLimit, maxAllowed)
              : 100;

          const entityType = String(req.query.entityType ?? 'all')
            .trim()
            .toLowerCase();
          const search = String(req.query.search ?? '')
            .replace(/[,()*%\\]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const fromDate = String(req.query.fromDate ?? '').trim();
          const toDate = String(req.query.toDate ?? '').trim();
          const beforeTimestamp = String(req.query.beforeTimestamp ?? '').trim();

          const clauses: string[] = [];
          const values: unknown[] = [];

          if (
            entityType &&
            entityType !== 'all' &&
            ALLOWED_AUDIT_ENTITY_TYPES.has(entityType)
          ) {
            values.push(entityType);
            clauses.push(`entity_type = $${values.length}`);
          }
          if (beforeTimestamp) {
            values.push(beforeTimestamp);
            clauses.push(`timestamp < $${values.length}`);
          }
          if (fromDate) {
            const startIso = fromDate.includes('T')
              ? fromDate
              : `${fromDate}T00:00:00.000Z`;
            if (Number.isFinite(Date.parse(startIso))) {
              values.push(startIso);
              clauses.push(`timestamp >= $${values.length}`);
            }
          }
          if (toDate) {
            const endIso = toDate.includes('T')
              ? toDate
              : `${toDate}T23:59:59.999Z`;
            if (Number.isFinite(Date.parse(endIso))) {
              values.push(endIso);
              clauses.push(`timestamp <= $${values.length}`);
            }
          }
          if (search) {
            values.push(`%${search}%`);
            const idx = values.length;
            clauses.push(
              `(action ILIKE $${idx} OR actor_name ILIKE $${idx} OR entity_id ILIKE $${idx} OR details ILIKE $${idx})`,
            );
          }

          const whereSql =
            clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
          values.push(limit + 1);
          const result = (await pool.query(
            `SELECT id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, timestamp
             FROM public.audit_logs
             ${whereSql}
             ORDER BY timestamp DESC, id DESC
             LIMIT $${values.length}`,
            values,
          )) as { rows: Record<string, unknown>[] };

          const hasMore = result.rows.length > limit;
          const sliced = hasMore ? result.rows.slice(0, limit) : result.rows;
          const logs = sliced.map(normalizeAuditRow);
          const nextCursor =
            logs.length > 0 ? logs[logs.length - 1]!.timestamp : null;

          res.status(200).json({
            success: true,
            logs,
            hasMore,
            nextCursor,
          });
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Failed to retrieve audit logs';
          res.status(500).json({ error: message });
        }
      });

      app.post('/api/audit-logs', requireAuth, async (req: Request, res: Response) => {
        try {
          const caller = req.authContext?.user;
          if (!caller) {
            res.status(401).json({
              error: 'Authentication required to record audit events.',
            });
            return;
          }

          const body = (req.body ?? {}) as Record<string, unknown>;
          const action = String(body.action ?? '').trim().toUpperCase();
          if (!action || action.length > 100) {
            res.status(400).json({ error: 'A valid action name is required.' });
            return;
          }

          const rawEntityType = String(body.entityType ?? 'settings')
            .trim()
            .toLowerCase();
          const entityType = ALLOWED_AUDIT_ENTITY_TYPES.has(rawEntityType)
            ? rawEntityType
            : 'settings';
          const entityId = String(body.entityId ?? caller.appUserId)
            .trim()
            .slice(0, 160);
          const details = String(body.details ?? '').trim().slice(0, 1000);
          const allowSystemAlias =
            caller.role === 'admin' &&
            String(body.actorId ?? '').trim() === 'system';

          const id = `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          const nowIso = new Date().toISOString();
          const actorId = allowSystemAlias ? 'system' : caller.appUserId;
          const actorName = allowSystemAlias
            ? String(body.actorName ?? 'System Engine').trim()
            : caller.displayName;
          const actorRole = allowSystemAlias ? 'admin' : caller.role;

          await pool.query(
            `INSERT INTO public.audit_logs (
               id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, timestamp
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              id,
              actorId,
              actorName,
              actorRole,
              action,
              entityType,
              entityId,
              details,
              nowIso,
            ],
          );

          res.status(201).json({
            success: true,
            log: {
              id,
              actorId,
              actorName,
              actorRole,
              action,
              entityType,
              entityId,
              details,
              timestamp: nowIso,
            },
          });
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Failed to persist audit log';
          res.status(500).json({ error: message });
        }
      });
    },
  });
}

let cachedDevMockApp: Promise<Express> | null = null;

export async function getDevMockApp(): Promise<Express> {
  if (!cachedDevMockApp) {
    cachedDevMockApp = Promise.resolve(createDevMockAppInstance());
  }
  return cachedDevMockApp;
}
