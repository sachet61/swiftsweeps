import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type {
  ResolvedAppUser,
  UserDirectoryRepo,
} from '../auth/userDirectoryRepo.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';

export interface ProfileRouterDeps {
  userRepo: UserDirectoryRepo;
  requireAuth: RequestHandler;
}

export interface ValidatedProfilePatchBody {
  targetUserId?: string;
  displayName?: string;
  phone?: string | null;
}

export interface ValidatedAvatarBody {
  targetUserId?: string;
  avatarUrl: string | null;
}

const MAX_DISPLAY_NAME_LEN = 120;
const MAX_PHONE_LEN = 32;
const MAX_AVATAR_URL_LEN = 2048;
const MAX_AVATAR_DECODED_BYTES = 300 * 1024;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;
const PHONE_CHAR_REGEX = /^[+0-9()\-\s.]{5,32}$/;
const DATA_IMAGE_REGEX =
  /^data:image\/(webp|png|jpeg|jpg);base64,([A-Za-z0-9+/]+={0,2})$/i;

const PRIVILEGED_FIELDS = new Set([
  'role',
  'status',
  'email',
  'emailVerified',
  'email_verified',
  'isParentAdmin',
  'is_parent_admin',
  'passwordResetRequired',
  'password_reset_required',
  'referralCode',
  'referral_code',
  'referredBy',
  'referred_by',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
]);

const ALLOWED_PATCH_KEYS = new Set([
  'displayName',
  'phone',
  'userId',
  'id',
  'appUserId',
]);

const ALLOWED_AVATAR_KEYS = new Set([
  'avatarUrl',
  'userId',
  'id',
  'appUserId',
]);

function assertObjectBody(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.',
    );
  }
  return raw as Record<string, unknown>;
}

function extractRequestedTargetUserId(
  body: Record<string, unknown>,
): string | undefined {
  for (const key of ['userId', 'id', 'appUserId']) {
    if (key in body) {
      const val = body[key];
      if (typeof val !== 'string' || !val.trim()) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          `${key} must be a non-empty string.`,
        );
      }
      return val.trim();
    }
  }
  return undefined;
}

function assertSelfOwnership(
  actorUserId: string,
  requestedUserId: string | undefined,
): void {
  if (requestedUserId !== undefined && requestedUserId !== actorUserId) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'You can only view or modify your own profile.',
    );
  }
}

function verifyImageMagicBytes(
  mimeSubtype: string,
  buffer: Buffer,
): boolean {
  if (buffer.length < 12) {
    return false;
  }

  const subtype = mimeSubtype.toLowerCase();
  if (subtype === 'png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (subtype === 'jpeg' || subtype === 'jpg') {
    return (
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (subtype === 'webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  return false;
}

export function validateProfilePatchBody(
  raw: unknown,
): ValidatedProfilePatchBody {
  const body = assertObjectBody(raw);

  for (const key of Object.keys(body)) {
    if (PRIVILEGED_FIELDS.has(key)) {
      throw new HttpError(
        403,
        'FORBIDDEN_FIELD_MODIFICATION',
        `Field "${key}" cannot be modified via profile settings.`,
      );
    }
    if (!ALLOWED_PATCH_KEYS.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported profile field: "${key}".`,
      );
    }
  }

  const targetUserId = extractRequestedTargetUserId(body);

  let displayName: string | undefined;
  if ('displayName' in body) {
    if (typeof body.displayName !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Display name must be a string.',
      );
    }
    const trimmed = body.displayName.trim();
    if (
      !trimmed ||
      trimmed.length > MAX_DISPLAY_NAME_LEN ||
      CONTROL_CHAR_REGEX.test(trimmed)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Display name must be between 1 and 120 valid characters.',
      );
    }
    displayName = trimmed;
  }

  let phone: string | null | undefined;
  if ('phone' in body) {
    if (body.phone === null) {
      phone = null;
    } else if (typeof body.phone === 'string') {
      const trimmed = body.phone.trim();
      if (!trimmed) {
        phone = null;
      } else {
        const digitsCount = trimmed.replace(/\D/g, '').length;
        if (
          trimmed.length > MAX_PHONE_LEN ||
          CONTROL_CHAR_REGEX.test(trimmed) ||
          !PHONE_CHAR_REGEX.test(trimmed) ||
          digitsCount < 5
        ) {
          throw new HttpError(
            400,
            'VALIDATION_ERROR',
            'Please provide a valid phone number (5 to 32 characters).',
          );
        }
        phone = trimmed;
      }
    } else {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Phone number must be a string or null.',
      );
    }
  }

  if (displayName === undefined && phone === undefined) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'At least one editable profile field (displayName or phone) is required.',
    );
  }

  return {
    targetUserId,
    displayName,
    phone,
  };
}

export function validateAvatarUpdateBody(raw: unknown): ValidatedAvatarBody {
  const body = assertObjectBody(raw);

  for (const key of Object.keys(body)) {
    if (PRIVILEGED_FIELDS.has(key)) {
      throw new HttpError(
        403,
        'FORBIDDEN_FIELD_MODIFICATION',
        `Field "${key}" cannot be modified via avatar upload.`,
      );
    }
    if (!ALLOWED_AVATAR_KEYS.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported field: "${key}".`,
      );
    }
  }

  const targetUserId = extractRequestedTargetUserId(body);

  if (!('avatarUrl' in body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'avatarUrl is required.',
    );
  }

  if (body.avatarUrl === null) {
    return { targetUserId, avatarUrl: null };
  }

  if (typeof body.avatarUrl !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'avatarUrl must be a valid image data URI, HTTPS URL, or null.',
    );
  }

  const trimmed = body.avatarUrl.trim();
  if (!trimmed || CONTROL_CHAR_REGEX.test(trimmed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'avatarUrl must not be empty or contain control characters.',
    );
  }

  if (trimmed.toLowerCase().startsWith('data:')) {
    const match = DATA_IMAGE_REGEX.exec(trimmed);
    if (!match) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Avatar images must be base64-encoded PNG, JPEG, or WebP.',
      );
    }
    const subtype = match[1]!.toLowerCase();
    const base64Body = match[2]!;
    const decoded = Buffer.from(base64Body, 'base64');
    if (decoded.length === 0 || decoded.length > MAX_AVATAR_DECODED_BYTES) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Avatar image must be 300 KB or smaller.',
      );
    }
    if (!verifyImageMagicBytes(subtype, decoded)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Avatar image content does not match a valid PNG, JPEG, or WebP file.',
      );
    }
    return {
      targetUserId,
      avatarUrl: `data:image/${subtype === 'jpg' ? 'jpeg' : subtype};base64,${base64Body}`,
    };
  }

  if (trimmed.startsWith('/')) {
    if (
      !trimmed.startsWith('/api/') ||
      trimmed.startsWith('//') ||
      trimmed.includes('..') ||
      /\s/.test(trimmed) ||
      trimmed.length > MAX_AVATAR_URL_LEN
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Relative avatar path must be a valid /api/ resource.',
      );
    }
    return { targetUserId, avatarUrl: trimmed };
  }

  if (trimmed.length > MAX_AVATAR_URL_LEN) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'avatarUrl exceeds maximum URL length.',
    );
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'External avatar URLs must use HTTPS.',
      );
    }
    if (parsed.username || parsed.password) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Avatar URL must not contain embedded credentials.',
      );
    }
    return { targetUserId, avatarUrl: parsed.toString() };
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'avatarUrl must be a valid PNG/JPEG/WebP data URI or HTTPS URL.',
    );
  }
}

export function toSafeProfileResponse(
  user: ResolvedAppUser,
  referrerDisplayName: string | null = null,
) {
  return {
    id: user.appUserId,
    email: user.email,
    displayName: user.displayName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    referralCode: user.referralCode,
    referredBy: user.referredBy,
    referrerDisplayName,
    passwordResetRequired: user.passwordResetRequired,
    isParentAdmin: user.isParentAdmin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function createProfileRouter({
  userRepo,
  requireAuth,
}: ProfileRouterDeps): Router {
  const router = Router();

  router.get(
    '/profile',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authUser = req.authContext!.user;
        const freshUser = await userRepo.findByAppUserId(authUser.appUserId);
        if (!freshUser) {
          throw new HttpError(404, 'USER_NOT_FOUND', 'User profile not found.');
        }

        const referrerDisplayName = await userRepo.resolveReferrerDisplayName(
          freshUser.referredBy,
        );

        res.status(200).json({
          user: toSafeProfileResponse(freshUser, referrerDisplayName),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/profile',
    requireAuth,
    validateRequestBody(validateProfilePatchBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const payload = req.body as ValidatedProfilePatchBody;

        assertSelfOwnership(actor.appUserId, payload.targetUserId);

        const updated = await userRepo.updateOwnProfile({
          appUserId: actor.appUserId,
          displayName: payload.displayName,
          phone: payload.phone,
        });

        if (!updated) {
          throw new HttpError(404, 'USER_NOT_FOUND', 'User profile not found.');
        }

        const changedFields: string[] = [];
        if (payload.displayName !== undefined) changedFields.push('displayName');
        if (payload.phone !== undefined) changedFields.push('phone');

        await userRepo.writeAuditLog({
          actorId: updated.appUserId,
          actorName: updated.displayName,
          actorRole: updated.role,
          action: 'PROFILE_UPDATED',
          entityType: 'user',
          entityId: updated.appUserId,
          details: `Updated self-service profile fields: ${changedFields.join(', ')}.`,
        });

        const referrerDisplayName = await userRepo.resolveReferrerDisplayName(
          updated.referredBy,
        );

        res.status(200).json({
          user: toSafeProfileResponse(updated, referrerDisplayName),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/profile/avatar',
    requireAuth,
    validateRequestBody(validateAvatarUpdateBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const payload = req.body as ValidatedAvatarBody;

        assertSelfOwnership(actor.appUserId, payload.targetUserId);

        const updated = await userRepo.updateOwnAvatar(
          actor.appUserId,
          payload.avatarUrl,
        );

        if (!updated) {
          throw new HttpError(404, 'USER_NOT_FOUND', 'User profile not found.');
        }

        await userRepo.writeAuditLog({
          actorId: updated.appUserId,
          actorName: updated.displayName,
          actorRole: updated.role,
          action: 'AVATAR_UPDATED',
          entityType: 'user',
          entityId: updated.appUserId,
          details: payload.avatarUrl
            ? 'Updated profile picture via self-hosted profile API.'
            : 'Cleared profile picture via self-hosted profile API.',
        });

        const referrerDisplayName = await userRepo.resolveReferrerDisplayName(
          updated.referredBy,
        );

        res.status(200).json({
          success: true,
          avatarUrl: updated.avatarUrl,
          user: toSafeProfileResponse(updated, referrerDisplayName),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/profile/avatar',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const updated = await userRepo.updateOwnAvatar(actor.appUserId, null);

        if (!updated) {
          throw new HttpError(404, 'USER_NOT_FOUND', 'User profile not found.');
        }

        await userRepo.writeAuditLog({
          actorId: updated.appUserId,
          actorName: updated.displayName,
          actorRole: updated.role,
          action: 'AVATAR_UPDATED',
          entityType: 'user',
          entityId: updated.appUserId,
          details: 'Cleared profile picture via self-hosted profile API.',
        });

        const referrerDisplayName = await userRepo.resolveReferrerDisplayName(
          updated.referredBy,
        );

        res.status(200).json({
          success: true,
          avatarUrl: null,
          user: toSafeProfileResponse(updated, referrerDisplayName),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
