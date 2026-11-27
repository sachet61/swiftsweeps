import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { UserDirectoryRepo } from '../auth/userDirectoryRepo.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';
import {
  ReferralConflictError,
  ReferralForbiddenError,
  ReferralNotFoundError,
  ReferralValidationError,
  type ReferralRepo,
} from '../referrals/referralRepo.js';
import {
  normalizeReferralCodeInput,
  normalizeReferralConfig,
} from '../referrals/referralLogic.js';

export interface ReferralRouterDeps {
  referralRepo: ReferralRepo;
  userRepo: UserDirectoryRepo;
  requireAuth: RequestHandler;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,120}$/;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

const PRIVILEGED_BODY_FIELDS = new Set([
  'actorId',
  'actorName',
  'actorRole',
  'role',
  'status',
  'referrerRewardAmount',
  'refereeRewardAmount',
  'referrer_reward_amount',
  'referee_reward_amount',
  'qualifyingDepositAmount',
  'qualifyingDepositId',
  'fraudFlags',
  'fraud_flags',
  'reviewedBy',
  'reviewedByName',
  'assignedBy',
  'assignedByName',
  'rewardedAt',
  'txId',
]);

const ALLOWED_ADMIN_LEDGER_STATUSES = new Set([
  'all',
  'registered',
  'pending_deposit',
  'processing',
  'held_for_review',
  'rewarded',
  'rejected',
  'capped',
]);

const ALLOWED_SUMMARY_QUERY_KEYS = new Set(['userId']);
const ALLOWED_ADMIN_LEDGER_QUERY_KEYS = new Set([
  'status',
  'search',
  'limit',
  'offset',
  'userId',
]);

function assertNoControlChars(value: string, fieldName: string): void {
  if (CONTROL_CHAR_REGEX.test(value)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} contains invalid control characters.`,
    );
  }
}

function assertObjectBody(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (PRIVILEGED_BODY_FIELDS.has(key)) {
      throw new HttpError(
        403,
        'FORBIDDEN',
        `Field "${key}" cannot be supplied by client requests.`,
      );
    }
  }
  return obj;
}

function assertAllowedKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unexpected request field "${key}".`,
      );
    }
  }
}

function validateOptionalId(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!ID_REGEX.test(trimmed)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `Invalid ${fieldName} format.`);
  }
  return trimmed;
}

function validateRequiredId(value: unknown, fieldName: string): string {
  const id = validateOptionalId(value, fieldName);
  if (!id) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} is required.`);
  }
  return id;
}

function validateOptionalText(
  value: unknown,
  fieldName: string,
  maxLen: number,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  assertNoControlChars(trimmed, fieldName);
  if (trimmed.length > maxLen) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must not exceed ${maxLen} characters.`,
    );
  }
  return trimmed;
}

function validateAttributeBody(raw: unknown): {
  refereeId?: string;
  referralCode?: string;
  deviceFingerprint?: string;
} {
  const obj = assertObjectBody(raw);
  assertAllowedKeys(obj, new Set(['refereeId', 'referralCode', 'deviceFingerprint']));
  const refereeId = validateOptionalId(obj.refereeId, 'refereeId');
  const referralCodeRaw = validateOptionalText(obj.referralCode, 'referralCode', 32);
  const referralCode = referralCodeRaw
    ? normalizeReferralCodeInput(referralCodeRaw)
    : undefined;
  const deviceFingerprint = validateOptionalText(
    obj.deviceFingerprint,
    'deviceFingerprint',
    128,
  );
  return { refereeId, referralCode, deviceFingerprint };
}

function validateEvaluateBody(raw: unknown): { refereeId?: string } {
  if (raw === undefined || raw === null) return {};
  const obj = assertObjectBody(raw);
  assertAllowedKeys(obj, new Set(['refereeId']));
  const refereeId = validateOptionalId(obj.refereeId, 'refereeId');
  return { refereeId };
}

function validateManualAssignBody(raw: unknown): {
  refereeId: string;
  referrerQuery: string;
  mode: 'link_only' | 'link_and_reward';
  reason?: string;
} {
  const obj = assertObjectBody(raw);
  assertAllowedKeys(
    obj,
    new Set(['refereeId', 'referrerQuery', 'referrerId', 'mode', 'reason', 'actingUserId']),
  );
  const refereeId = validateRequiredId(obj.refereeId, 'refereeId');
  const rawQuery = obj.referrerQuery ?? obj.referrerId;
  const referrerQuery = validateOptionalText(rawQuery, 'referrerQuery', 120);
  if (!referrerQuery) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Player ID and Referrer (email, ID, or code) are required.',
    );
  }
  const rawMode = obj.mode;
  if (rawMode !== undefined && rawMode !== 'link_only' && rawMode !== 'link_and_reward') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'mode must be "link_only" or "link_and_reward".',
    );
  }
  const mode: 'link_only' | 'link_and_reward' =
    rawMode === 'link_and_reward' ? 'link_and_reward' : 'link_only';
  const reason = validateOptionalText(obj.reason, 'reason', 500);
  return { refereeId, referrerQuery, mode, reason };
}

function validateVanityCodeBody(raw: unknown): {
  userId: string;
  vanityCode: string;
} {
  const obj = assertObjectBody(raw);
  assertAllowedKeys(obj, new Set(['userId', 'vanityCode', 'actingUserId']));
  const userId = validateRequiredId(obj.userId, 'userId');
  const rawCode = validateOptionalText(obj.vanityCode, 'vanityCode', 32);
  if (!rawCode) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'userId and vanityCode are required.');
  }
  const vanityCode = normalizeReferralCodeInput(rawCode);
  return { userId, vanityCode };
}

function validateReviewBody(raw: unknown): {
  awardId: string;
  decision: 'approve' | 'reject';
  reviewNotes?: string;
} {
  const obj = assertObjectBody(raw);
  assertAllowedKeys(obj, new Set(['awardId', 'decision', 'reviewNotes', 'actingUserId']));
  const awardId = validateRequiredId(obj.awardId, 'awardId');
  if (obj.decision !== 'approve' && obj.decision !== 'reject') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'awardId and decision (approve or reject) are required.',
    );
  }
  const reviewNotes = validateOptionalText(obj.reviewNotes, 'reviewNotes', 500);
  return { awardId, decision: obj.decision, reviewNotes };
}

function validateReconcileBody(raw: unknown): {
  userId?: string;
  awardIds?: string[];
  limit: number;
} {
  if (raw === undefined || raw === null) return { limit: 50 };
  const obj = assertObjectBody(raw);
  assertAllowedKeys(obj, new Set(['userId', 'awardIds', 'limit', 'actingUserId']));
  const userId = validateOptionalId(obj.userId, 'userId');
  let awardIds: string[] | undefined;
  if (obj.awardIds !== undefined) {
    if (!Array.isArray(obj.awardIds) || obj.awardIds.length > 100) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'awardIds must be an array of at most 100 award IDs.',
      );
    }
    awardIds = obj.awardIds.map((item, idx) =>
      validateRequiredId(item, `awardIds[${idx}]`),
    );
  }
  let limit = 50;
  if (obj.limit !== undefined) {
    const parsed = Number(obj.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'limit must be an integer between 1 and 100.',
      );
    }
    limit = parsed;
  }
  return { userId, awardIds, limit };
}

function validateConfigBody(raw: unknown): { referralProgram: unknown } {
  const obj = assertObjectBody(raw);
  assertAllowedKeys(obj, new Set(['referralProgram', 'actingUserId']));
  const target = obj.referralProgram ?? obj;
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'referralProgram settings object is required.',
    );
  }
  const normalized = normalizeReferralConfig(target);
  return { referralProgram: normalized };
}

function validateSummaryQuery(query: Request['query']): { userId?: string } {
  for (const key of Object.keys(query)) {
    if (!ALLOWED_SUMMARY_QUERY_KEYS.has(key)) {
      throw new HttpError(400, 'VALIDATION_ERROR', `Unknown query parameter "${key}".`);
    }
  }
  const userId = validateOptionalId(
    Array.isArray(query.userId) ? query.userId[0] : query.userId,
    'userId',
  );
  return { userId };
}

function validateAdminLedgerQuery(query: Request['query']): {
  status: string;
  search?: string;
  limit: number;
  offset: number;
} {
  for (const key of Object.keys(query)) {
    if (!ALLOWED_ADMIN_LEDGER_QUERY_KEYS.has(key)) {
      throw new HttpError(400, 'VALIDATION_ERROR', `Unknown query parameter "${key}".`);
    }
  }
  const rawStatus = Array.isArray(query.status) ? query.status[0] : query.status;
  const status = typeof rawStatus === 'string' && rawStatus.trim()
    ? rawStatus.trim().toLowerCase()
    : 'all';
  if (!ALLOWED_ADMIN_LEDGER_STATUSES.has(status)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid referral status filter.');
  }

  const rawSearch = Array.isArray(query.search) ? query.search[0] : query.search;
  const search = validateOptionalText(rawSearch, 'search', 120);

  const rawLimit = Array.isArray(query.limit) ? query.limit[0] : query.limit;
  let limit = 100;
  if (rawLimit !== undefined && rawLimit !== '') {
    const parsed = Number.parseInt(String(rawLimit), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'limit must be an integer between 1 and 100.',
      );
    }
    limit = parsed;
  }

  const rawOffset = Array.isArray(query.offset) ? query.offset[0] : query.offset;
  let offset = 0;
  if (rawOffset !== undefined && rawOffset !== '') {
    const parsed = Number.parseInt(String(rawOffset), 10);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100000) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'offset must be an integer between 0 and 100000.',
      );
    }
    offset = parsed;
  }

  return { status, search, limit, offset };
}

function extractRequestOrigin(req: Request): string {
  const originHeader = req.get('origin');
  if (originHeader) return originHeader;
  const host = req.get('host');
  if (!host) return '';
  return `${req.protocol || 'https'}://${host}`;
}

function mapRepoError(err: unknown): unknown {
  if (err instanceof HttpError) return err;
  if (err instanceof ReferralValidationError) {
    return new HttpError(400, err.code, err.message);
  }
  if (err instanceof ReferralForbiddenError) {
    return new HttpError(403, 'FORBIDDEN', err.message);
  }
  if (err instanceof ReferralNotFoundError) {
    return new HttpError(404, 'NOT_FOUND', err.message);
  }
  if (err instanceof ReferralConflictError) {
    return new HttpError(409, err.code, err.message);
  }
  return err;
}

export function createReferralRouter({
  referralRepo,
  requireAuth,
}: ReferralRouterDeps): Router {
  const router = Router();
  const requireStaff = requireRole('admin', 'agent');
  const requireAdmin = requireRole('admin');

  function resolveActor(req: Request) {
    const actor = req.authContext?.user;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
    }
    return actor;
  }

  router.post(
    '/referrals/attribute',
    requireAuth,
    validateRequestBody(validateAttributeBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = await resolveActor(req);
        const body = req.body as ReturnType<typeof validateAttributeBody>;
        const targetRefereeId = body.refereeId || actor.appUserId;

        const fpHeader = req.get('x-device-fingerprint');
        const fp =
          body.deviceFingerprint ||
          (typeof fpHeader === 'string' && !CONTROL_CHAR_REGEX.test(fpHeader)
            ? fpHeader.trim().slice(0, 128)
            : null);

        const result = await referralRepo.attributeSignupReferral({
          refereeId: targetRefereeId,
          referralCode: body.referralCode,
          deviceFingerprint: fp,
          signupIp: req.ip || null,
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
        });

        res.status(200).json(result);
      } catch (err) {
        next(mapRepoError(err));
      }
    },
  );

  router.post(
    '/referrals/evaluate',
    requireAuth,
    validateRequestBody(validateEvaluateBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = await resolveActor(req);
        const body = req.body as ReturnType<typeof validateEvaluateBody>;
        const targetRefereeId = body.refereeId || actor.appUserId;
        const isStaff = actor.role === 'admin' || actor.role === 'agent';

        if (!isStaff && targetRefereeId !== actor.appUserId) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Forbidden: cannot evaluate another player.',
          );
        }

        const fpHeader = req.get('x-device-fingerprint');
        const result = await referralRepo.evaluateReferralQualification({
          refereeId: targetRefereeId,
          contextIp: req.ip || null,
          contextFingerprint:
            typeof fpHeader === 'string' && !CONTROL_CHAR_REGEX.test(fpHeader)
              ? fpHeader.trim().slice(0, 128)
              : null,
        });

        res.status(200).json(result);
      } catch (err) {
        next(mapRepoError(err));
      }
    },
  );

  router.get(
    '/referrals/summary',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = await resolveActor(req);
        const query = validateSummaryQuery(req.query);
        const isStaff = actor.role === 'admin' || actor.role === 'agent';

        if (query.userId && query.userId !== actor.appUserId && !isStaff) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Access Denied: You can only view your own referral summary.',
          );
        }

        const targetUserId =
          isStaff && query.userId ? query.userId : actor.appUserId;
        const summary = await referralRepo.getReferralSummary({
          targetUserId,
          requestOrigin: extractRequestOrigin(req),
          contextIp: req.ip || null,
        });

        res.status(200).json({ success: true, summary });
      } catch (err) {
        next(mapRepoError(err));
      }
    },
  );

  router.get(
    '/referrals/admin-ledger',
    requireAuth,
    requireStaff,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = await resolveActor(req);
        const query = validateAdminLedgerQuery(req.query);
        const result = await referralRepo.getAdminReferralLedger({
          ...query,
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
        });
        res.status(200).json(result);
      } catch (err) {
        next(mapRepoError(err));
      }
    },
  );

  router.post(
    '/referrals/manual-assign',
    requireAuth,
    requireStaff,
    validateRequestBody(validateManualAssignBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = await resolveActor(req);
        const body = req.body as ReturnType<typeof validateManualAssignBody>;
        const result = await referralRepo.manualAssignReferral({
          ...body,
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
        });
        res.status(200).json(result);
      } catch (err) {
        next(mapRepoError(err));
      }
    },
  );

  router.patch(
    '/referrals/vanity-code',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateVanityCodeBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = await resolveActor(req);
        const body = req.body as ReturnType<typeof validateVanityCodeBody>;
        const result = await referralRepo.setVanityReferralCode({
          ...body,
          actorId: actor.appUserId,
          actorName: actor.displayName,
        });
        res.status(200).json(result);
      } catch (err) {
        next(mapRepoError(err));
      }
    },
  );

  router.post(
    '/referrals/review',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateReviewBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = await resolveActor(req);
        const body = req.body as ReturnType<typeof validateReviewBody>;
        const result = await referralRepo.reviewHeldReferral({
          ...body,
          actorId: actor.appUserId,
          actorName: actor.displayName,
        });
        res.status(200).json(result);
      } catch (err) {
        next(mapRepoError(err));
      }
    },
  );

  router.post(
    '/referrals/reconcile',
    requireAuth,
    requireStaff,
    validateRequestBody(validateReconcileBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = await resolveActor(req);
        const body = req.body as ReturnType<typeof validateReconcileBody>;
        const result = await referralRepo.reconcileMissingReferralRewards({
          ...body,
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
        });
        res.status(200).json(result);
      } catch (err) {
        next(mapRepoError(err));
      }
    },
  );

  router.post(
    '/admin/referral-config',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateConfigBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        const actor = await resolveActor(req);
        const body = req.body as ReturnType<typeof validateConfigBody>;
        const saved = await referralRepo.saveReferralProgramConfig({
          referralProgram: body.referralProgram,
          actorId: actor.appUserId,
          actorName: actor.displayName,
        });
        res.status(200).json({
          success: true,
          referralProgram: saved,
        });
      } catch (err) {
        next(mapRepoError(err));
      }
    },
  );

  return router;
}
