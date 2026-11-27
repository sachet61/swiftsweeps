import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import {
  ALLOWED_AUDIT_ENTITY_TYPES,
  type AuditLogRepo,
} from '../auditLogs/auditLogRepo.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';
import type { RealtimeEventBroker } from '../realtime/realtimeEvents.js';

export interface AuditLogRouterDeps {
  auditLogRepo: AuditLogRepo;
  requireAuth: RequestHandler;
  realtimeEvents?: RealtimeEventBroker;
}

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;
const NUL_BYTE_REGEX = /\u0000/g;

const MAX_STANDARD_LIMIT = 100;
const MAX_EXPORT_LIMIT = 500;
const MAX_SEARCH_LEN = 200;
const MAX_ACTION_LEN = 100;
const MAX_ENTITY_ID_LEN = 160;
const MAX_DETAILS_LEN = 1000;
const MAX_ACTOR_NAME_LEN = 120;

const ALLOWED_QUERY_KEYS = new Set([
  'limit',
  'entityType',
  'search',
  'fromDate',
  'toDate',
  'beforeTimestamp',
  'format',
  'export',
  // Legacy frontend query key retained for wire compatibility; never trusted for identity/authz.
  'userId',
]);

const ALLOWED_POST_BODY_KEYS = new Set([
  'action',
  'entityType',
  'entityId',
  'details',
  // Legacy client payload keys ignored/overwritten from verified session context.
  'actorId',
  'actorName',
  'actorRole',
]);

const FORBIDDEN_IMMUTABLE_FIELDS = new Set([
  'id',
  'timestamp',
  'created_at',
  'createdAt',
  'role',
  'actingUserId',
]);

export interface ValidatedAuditLogsQuery {
  limit: number;
  entityType?: string;
  search?: string;
  fromIso?: string;
  toIso?: string;
  beforeTimestamp?: string;
}

export interface ValidatedCreateAuditLogInput {
  action: string;
  entityType: string;
  entityId?: string;
  details: string;
  requestedActorId?: string;
  requestedActorName?: string;
}

function assertSingleQueryString(
  raw: unknown,
  fieldName: string,
): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be a single string value.`,
    );
  }
  return raw;
}

function parseBoundIsoDate(
  raw: string,
  fieldName: string,
  boundary: 'start' | 'end' | 'exact',
): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 64 || CONTROL_CHAR_REGEX.test(trimmed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be a valid ISO date or timestamp.`,
    );
  }

  let candidate = trimmed;
  if (boundary !== 'exact' && !trimmed.includes('T')) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `${fieldName} must be formatted as YYYY-MM-DD or an ISO-8601 timestamp.`,
      );
    }
    candidate =
      boundary === 'start'
        ? `${trimmed}T00:00:00.000Z`
        : `${trimmed}T23:59:59.999Z`;
  }

  const parsedMs = Date.parse(candidate);
  if (!Number.isFinite(parsedMs)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} is not a valid date.`,
    );
  }

  return new Date(parsedMs).toISOString();
}

export function validateAuditLogsQuery(
  rawQuery: Record<string, unknown>,
): ValidatedAuditLogsQuery {
  for (const key of Object.keys(rawQuery)) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported query parameter: "${key}".`,
      );
    }
  }

  const rawFormat = assertSingleQueryString(rawQuery.format, 'format');
  let isExport = false;
  if (rawFormat !== undefined && rawFormat !== '') {
    const cleanFormat = rawFormat.trim().toLowerCase();
    if (cleanFormat !== 'json' && cleanFormat !== 'csv') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'format must be "json" or "csv".',
      );
    }
    isExport = cleanFormat === 'csv';
  }

  const rawExport = assertSingleQueryString(rawQuery.export, 'export');
  if (rawExport !== undefined && rawExport !== '') {
    const cleanExport = rawExport.trim().toLowerCase();
    if (
      cleanExport !== '1' &&
      cleanExport !== 'true' &&
      cleanExport !== '0' &&
      cleanExport !== 'false'
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'export must be "1", "true", "0", or "false".',
      );
    }
    if (cleanExport === '1' || cleanExport === 'true') {
      isExport = true;
    }
  }

  const maxAllowed = isExport ? MAX_EXPORT_LIMIT : MAX_STANDARD_LIMIT;
  let limit = MAX_STANDARD_LIMIT;
  const rawLimit = assertSingleQueryString(rawQuery.limit, 'limit');
  if (rawLimit !== undefined && rawLimit.trim() !== '') {
    const cleanLimit = rawLimit.trim();
    if (!/^\d+$/.test(cleanLimit)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'limit must be a positive integer.',
      );
    }
    const parsed = Number.parseInt(cleanLimit, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'limit must be a positive integer.',
      );
    }
    limit = Math.min(parsed, maxAllowed);
  }

  let entityType: string | undefined;
  const rawEntity = assertSingleQueryString(rawQuery.entityType, 'entityType');
  if (rawEntity !== undefined && rawEntity.trim() !== '') {
    const cleanEntity = rawEntity.trim().toLowerCase();
    if (cleanEntity !== 'all') {
      if (!ALLOWED_AUDIT_ENTITY_TYPES.has(cleanEntity)) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          `Unsupported entityType filter: "${cleanEntity}".`,
        );
      }
      entityType = cleanEntity;
    }
  }

  let search: string | undefined;
  const rawSearch = assertSingleQueryString(rawQuery.search, 'search');
  if (rawSearch !== undefined) {
    if (CONTROL_CHAR_REGEX.test(rawSearch)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'search contains invalid control characters.',
      );
    }
    const trimmed = rawSearch.replace(/\s+/g, ' ').trim();
    if (trimmed.length > MAX_SEARCH_LEN) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `search must be ${MAX_SEARCH_LEN} characters or fewer.`,
      );
    }
    if (trimmed) {
      search = trimmed;
    }
  }

  const rawFromDate = assertSingleQueryString(rawQuery.fromDate, 'fromDate');
  const fromIso =
    rawFromDate !== undefined && rawFromDate.trim() !== ''
      ? parseBoundIsoDate(rawFromDate, 'fromDate', 'start')
      : undefined;

  const rawToDate = assertSingleQueryString(rawQuery.toDate, 'toDate');
  const toIso =
    rawToDate !== undefined && rawToDate.trim() !== ''
      ? parseBoundIsoDate(rawToDate, 'toDate', 'end')
      : undefined;

  const rawBefore = assertSingleQueryString(
    rawQuery.beforeTimestamp,
    'beforeTimestamp',
  );
  const beforeTimestamp =
    rawBefore !== undefined && rawBefore.trim() !== ''
      ? parseBoundIsoDate(rawBefore, 'beforeTimestamp', 'exact')
      : undefined;

  return {
    limit,
    entityType,
    search,
    fromIso,
    toIso,
    beforeTimestamp,
  };
}

export function validateCreateAuditLogBody(
  raw: unknown,
): ValidatedCreateAuditLogInput {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  }
  const body = raw as Record<string, unknown>;

  for (const key of Object.keys(body)) {
    if (FORBIDDEN_IMMUTABLE_FIELDS.has(key)) {
      throw new HttpError(
        403,
        'FORBIDDEN_FIELD_MODIFICATION',
        `Field "${key}" cannot be supplied by client requests.`,
      );
    }
    if (!ALLOWED_POST_BODY_KEYS.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported audit log field: "${key}".`,
      );
    }
  }

  if (typeof body.action !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'A valid action name is required.',
    );
  }
  const action = body.action.trim().toUpperCase();
  if (
    !action ||
    action.length > MAX_ACTION_LEN ||
    CONTROL_CHAR_REGEX.test(action)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'A valid action name is required.',
    );
  }

  if (
    body.entityType !== undefined &&
    body.entityType !== null &&
    typeof body.entityType !== 'string'
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'entityType must be a string.',
    );
  }
  const rawEntityType =
    typeof body.entityType === 'string'
      ? body.entityType.trim().toLowerCase()
      : 'settings';
  const entityType = ALLOWED_AUDIT_ENTITY_TYPES.has(rawEntityType)
    ? rawEntityType
    : 'settings';

  let entityId: string | undefined;
  if (body.entityId !== undefined && body.entityId !== null) {
    if (typeof body.entityId !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'entityId must be a string.',
      );
    }
    const cleanEntityId = body.entityId.replace(NUL_BYTE_REGEX, '').trim();
    if (CONTROL_CHAR_REGEX.test(cleanEntityId)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'entityId contains invalid control characters.',
      );
    }
    entityId = cleanEntityId.slice(0, MAX_ENTITY_ID_LEN);
  }

  let details = '';
  if (body.details !== undefined && body.details !== null) {
    if (typeof body.details !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'details must be a string.');
    }
    details = body.details
      .replace(NUL_BYTE_REGEX, '')
      .trim()
      .slice(0, MAX_DETAILS_LEN);
  }

  let requestedActorId: string | undefined;
  if (body.actorId !== undefined && body.actorId !== null) {
    if (typeof body.actorId !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'actorId must be a string.');
    }
    requestedActorId = body.actorId.replace(NUL_BYTE_REGEX, '').trim();
  }

  let requestedActorName: string | undefined;
  if (body.actorName !== undefined && body.actorName !== null) {
    if (typeof body.actorName !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'actorName must be a string.',
      );
    }
    const cleanActorName = body.actorName
      .replace(NUL_BYTE_REGEX, '')
      .trim()
      .slice(0, MAX_ACTOR_NAME_LEN);
    if (cleanActorName && !CONTROL_CHAR_REGEX.test(cleanActorName)) {
      requestedActorName = cleanActorName;
    }
  }

  return {
    action,
    entityType,
    entityId,
    details,
    requestedActorId,
    requestedActorName,
  };
}

export function createAuditLogRouter({
  auditLogRepo,
  requireAuth,
  realtimeEvents,
}: AuditLogRouterDeps): Router {
  const router = Router();
  const requireAdmin = requireRole('admin');

  // Replaces legacy Supabase RLS policy "Admins can read audit_logs" with server-enforced admin RBAC
  router.get(
    '/audit-logs',
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const query = validateAuditLogsQuery(
          req.query as Record<string, unknown>,
        );
        const result = await auditLogRepo.listAuditLogs(query);
        res.status(200).json({
          success: true,
          logs: result.logs,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Records authenticated audit events with server-derived actor identity and role
  router.post(
    '/audit-logs',
    requireAuth,
    validateRequestBody(validateCreateAuditLogBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const caller = req.authContext!.user;
        const input = req.body as ValidatedCreateAuditLogInput;

        const allowSystemAlias =
          caller.role === 'admin' && input.requestedActorId === 'system';

        const createdLog = await auditLogRepo.createAuditLog({
          actorId: allowSystemAlias ? 'system' : caller.appUserId,
          actorName: allowSystemAlias
            ? input.requestedActorName || 'System Engine'
            : caller.displayName,
          actorRole: allowSystemAlias ? 'admin' : caller.role,
          action: input.action,
          entityType: input.entityType,
          entityId:
            input.entityId !== undefined ? input.entityId : caller.appUserId,
          details: input.details,
        });

        realtimeEvents?.emitAuditLog(createdLog);

        res.status(201).json({
          success: true,
          log: createdLog,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
