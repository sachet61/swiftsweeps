import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { UserDirectoryRepo } from '../auth/userDirectoryRepo.js';
import type { ServerConfig } from '../config/env.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  buildProxyStorageUrl,
  canUserReadStorageObject,
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  detectStorageImageMime,
  extractStorageLocationFromUrl,
  isPrivateStorageObjectPath,
  MAX_PARTNER_ICON_BYTES,
  MAX_SIGNED_URL_TTL_SECONDS,
  MAX_STORAGE_OBJECT_BYTES,
  normalizeStorageBucket,
  normalizeStorageObjectPath,
  sanitizeUserIdForStoragePath,
  signStorageUrlToken,
  StorageForbiddenError,
  StorageNotFoundError,
  StorageRepo,
  StorageValidationError,
  verifyStorageUrlToken,
  type AllowedStorageImageMime,
  type StorageBucketName,
} from '../storage/storageRepo.js';

export interface StorageRouterDeps {
  config: Pick<ServerConfig, 'authSecret'>;
  storageRepo: StorageRepo;
  userRepo: UserDirectoryRepo;
  requireAuth: RequestHandler;
  optionalAuth: RequestHandler;
}

const ALLOWED_UPLOAD_BODY_KEYS = new Set([
  'bucket',
  'path',
  'fileBase64',
  'contentType',
  'userId',
]);

const ALLOWED_SIGNED_URL_BODY_KEYS = new Set([
  'bucket',
  'path',
  'url',
  'expiresInSeconds',
]);

function assertPlainObject(
  raw: unknown,
  message = 'Request body must be a JSON object.',
): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }
  return raw as Record<string, unknown>;
}

function assertAllowedKeys(
  body: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  noun: string,
): void {
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported field "${key}" in ${noun}.`,
      );
    }
  }
}

function readSingleQueryParam(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
}

function mapStorageError(err: unknown): unknown {
  if (err instanceof HttpError) return err;
  if (err instanceof StorageValidationError) {
    return new HttpError(400, 'VALIDATION_ERROR', err.message);
  }
  if (err instanceof StorageForbiddenError) {
    return new HttpError(403, 'FORBIDDEN', err.message);
  }
  if (err instanceof StorageNotFoundError) {
    return new HttpError(404, 'STORAGE_OBJECT_NOT_FOUND', err.message);
  }
  return err;
}

function decodeBase64Payload(rawBase64: unknown): Buffer {
  if (typeof rawBase64 !== 'string' || !rawBase64.trim()) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'bucket, path, and fileBase64 are required.',
    );
  }
  const stripped = rawBase64.includes(',')
    ? rawBase64.split(',').pop()!
    : rawBase64;
  const clean = stripped.replace(/\s+/g, '');
  if (!clean || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'fileBase64 must be a valid base64-encoded image.',
    );
  }
  return Buffer.from(clean, 'base64');
}

function validateDeclaredContentType(
  rawContentType: unknown,
  bucket: StorageBucketName,
): void {
  if (rawContentType === undefined || rawContentType === null || rawContentType === '') {
    return;
  }
  if (typeof rawContentType !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'contentType must be a string.');
  }
  const norm = rawContentType.trim().toLowerCase();
  if (norm === 'image/svg+xml' || norm.includes('svg')) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'SVG uploads are not allowed.',
    );
  }
  const allowed =
    bucket === 'partner-icons'
      ? new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
      : new Set([
          'image/png',
          'image/jpeg',
          'image/jpg',
          'image/webp',
          'image/gif',
        ]);
  if (!allowed.has(norm)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      bucket === 'partner-icons'
        ? 'Only PNG, JPG, and WebP icons are allowed.'
        : 'Only PNG, JPEG, WebP, and GIF images are allowed.',
    );
  }
}

export function createStorageRouter({
  config,
  storageRepo,
  userRepo,
  requireAuth,
  optionalAuth,
}: StorageRouterDeps): Router {
  const router = Router();

  // 1. Authenticated Object Upload (enforces bucket/path RBAC, ownership, size, and magic bytes)
  router.post(
    '/storage/upload',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authUser = req.authContext!.user;
        const body = assertPlainObject(req.body);
        assertAllowedKeys(body, ALLOWED_UPLOAD_BODY_KEYS, 'storage upload');

        if (!body.bucket || !body.path || !body.fileBase64) {
          throw new HttpError(
            400,
            'VALIDATION_ERROR',
            'bucket, path, and fileBase64 are required.',
          );
        }

        const bucket = normalizeStorageBucket(body.bucket);
        const objectPath = normalizeStorageObjectPath(body.path);
        validateDeclaredContentType(body.contentType, bucket);

        const buffer = decodeBase64Payload(body.fileBase64);
        const maxBytes =
          bucket === 'partner-icons'
            ? MAX_PARTNER_ICON_BYTES
            : MAX_STORAGE_OBJECT_BYTES;

        if (buffer.length === 0 || buffer.length > maxBytes) {
          throw new HttpError(
            400,
            'VALIDATION_ERROR',
            bucket === 'partner-icons'
              ? 'Partner icon exceeds 512 KB limit.'
              : 'Uploaded image must be between 1 byte and 3 MB.',
          );
        }

        const detectedMime = detectStorageImageMime(buffer);
        if (!detectedMime) {
          throw new HttpError(
            400,
            'VALIDATION_ERROR',
            'Uploaded file content is not a valid PNG, JPEG, WebP, or GIF image.',
          );
        }
        if (bucket === 'partner-icons' && detectedMime === 'image/gif') {
          throw new HttpError(
            400,
            'VALIDATION_ERROR',
            'Only PNG, JPG, and WebP icons are allowed.',
          );
        }

        const requestedUserId =
          typeof body.userId === 'string' && body.userId.trim()
            ? body.userId.trim()
            : undefined;

        let ownerUserId: string | null = authUser.appUserId;
        let updateUserAvatar = false;
        const isPublic = !isPrivateStorageObjectPath(bucket, objectPath);

        if (bucket === 'partner-icons') {
          if (authUser.role !== 'admin') {
            throw new HttpError(
              403,
              'FORBIDDEN',
              'Only Platform Administrators can upload partner icons.',
            );
          }
          ownerUserId = authUser.appUserId;
        } else if (bucket === 'avatars') {
          if (requestedUserId && requestedUserId !== authUser.appUserId) {
            if (authUser.role !== 'admin') {
              throw new HttpError(
                403,
                'FORBIDDEN',
                'You can only upload avatars for your own account.',
              );
            }
            const targetUser = await userRepo.findByAppUserId(requestedUserId);
            if (!targetUser) {
              throw new HttpError(
                404,
                'USER_NOT_FOUND',
                'Target user was not found.',
              );
            }
            ownerUserId = targetUser.appUserId;
          } else {
            ownerUserId = authUser.appUserId;
          }
          updateUserAvatar = Boolean(requestedUserId);
        } else {
          // bucket === 'chat_attachments'
          if (objectPath.startsWith('qr/')) {
            if (authUser.role !== 'admin') {
              throw new HttpError(
                403,
                'FORBIDDEN',
                'Only Platform Administrators can upload catalog or payment QR assets.',
              );
            }
            ownerUserId = authUser.appUserId;
          } else if (objectPath.startsWith('receipts/')) {
            if (authUser.role === 'customer') {
              if (requestedUserId && requestedUserId !== authUser.appUserId) {
                throw new HttpError(
                  403,
                  'FORBIDDEN',
                  'You can only upload payment receipts for your own account.',
                );
              }
              const cleanCustomerId = sanitizeUserIdForStoragePath(
                authUser.appUserId,
              );
              if (!objectPath.startsWith(`receipts/${cleanCustomerId}_`)) {
                throw new HttpError(
                  403,
                  'FORBIDDEN',
                  'Receipt path must match your authenticated customer account.',
                );
              }
              ownerUserId = authUser.appUserId;
            } else if (requestedUserId) {
              const targetUser = await userRepo.findByAppUserId(requestedUserId);
              if (!targetUser) {
                throw new HttpError(
                  404,
                  'USER_NOT_FOUND',
                  'Target customer was not found.',
                );
              }
              ownerUserId = targetUser.appUserId;
            } else {
              ownerUserId = authUser.appUserId;
            }
          } else if (objectPath.startsWith('conv_')) {
            const firstSlash = objectPath.indexOf('/');
            const convPrefix =
              firstSlash > 0 ? objectPath.slice(5, firstSlash) : '';
            if (authUser.role === 'customer') {
              const cleanCustomerId = sanitizeUserIdForStoragePath(
                authUser.appUserId,
              );
              if (
                convPrefix !== authUser.appUserId &&
                convPrefix !== cleanCustomerId
              ) {
                throw new HttpError(
                  403,
                  'FORBIDDEN',
                  'You can only upload files to your own support conversation.',
                );
              }
              ownerUserId = authUser.appUserId;
            } else if (requestedUserId) {
              const targetUser = await userRepo.findByAppUserId(requestedUserId);
              if (!targetUser) {
                throw new HttpError(
                  404,
                  'USER_NOT_FOUND',
                  'Target customer was not found.',
                );
              }
              ownerUserId = targetUser.appUserId;
            } else if (convPrefix) {
              const targetUser = await userRepo.findByAppUserId(convPrefix);
              ownerUserId = targetUser ? targetUser.appUserId : authUser.appUserId;
            } else {
              ownerUserId = authUser.appUserId;
            }
          } else {
            // Any other path inside chat_attachments defaults to private
            if (authUser.role === 'customer') {
              if (requestedUserId && requestedUserId !== authUser.appUserId) {
                throw new HttpError(
                  403,
                  'FORBIDDEN',
                  'You do not have permission to upload to another user path.',
                );
              }
              const cleanCustomerId = sanitizeUserIdForStoragePath(
                authUser.appUserId,
              );
              if (
                !objectPath.startsWith(`${authUser.appUserId}/`) &&
                !objectPath.startsWith(`${cleanCustomerId}/`)
              ) {
                throw new HttpError(
                  403,
                  'FORBIDDEN',
                  'Unsupported customer storage path.',
                );
              }
              ownerUserId = authUser.appUserId;
            } else if (requestedUserId) {
              const targetUser = await userRepo.findByAppUserId(requestedUserId);
              if (!targetUser) {
                throw new HttpError(
                  404,
                  'USER_NOT_FOUND',
                  'Target customer was not found.',
                );
              }
              ownerUserId = targetUser.appUserId;
            } else {
              ownerUserId = authUser.appUserId;
            }
          }
        }

        const saved = await storageRepo.saveObject({
          bucket,
          objectPath,
          ownerUserId,
          uploadedBy: authUser.appUserId,
          actorRole: authUser.role,
          isPublic,
          contentType: detectedMime as AllowedStorageImageMime,
          imageData: buffer,
          updateUserAvatar,
        });

        const proxyUrl = buildProxyStorageUrl(saved.bucket, saved.objectPath);
        res.status(200).json({
          success: true,
          url: proxyUrl,
          proxyUrl,
          publicUrl: proxyUrl,
          path: saved.objectPath,
          bucket: saved.bucket,
          isPublic: saved.isPublic,
        });
      } catch (err) {
        next(mapStorageError(err));
      }
    },
  );

  // 2. Issue Short-Lived Signed URL for Authorized Private Object Reads
  router.post(
    '/storage/signed-url',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authUser = req.authContext!.user;
        const body = assertPlainObject(req.body);
        assertAllowedKeys(
          body,
          ALLOWED_SIGNED_URL_BODY_KEYS,
          'signed url request',
        );

        let bucket: StorageBucketName;
        let objectPath: string;
        if (typeof body.url === 'string' && body.url.trim()) {
          const loc = extractStorageLocationFromUrl(body.url);
          if (!loc) {
            throw new HttpError(
              400,
              'VALIDATION_ERROR',
              'Invalid storage url reference.',
            );
          }
          bucket = loc.bucket;
          objectPath = loc.path;
        } else {
          bucket = normalizeStorageBucket(body.bucket ?? 'chat_attachments');
          objectPath = normalizeStorageObjectPath(body.path);
        }

        let ttlSec = DEFAULT_SIGNED_URL_TTL_SECONDS;
        if (body.expiresInSeconds !== undefined) {
          if (
            typeof body.expiresInSeconds !== 'number' ||
            !Number.isSafeInteger(body.expiresInSeconds) ||
            body.expiresInSeconds < 30 ||
            body.expiresInSeconds > MAX_SIGNED_URL_TTL_SECONDS
          ) {
            throw new HttpError(
              400,
              'VALIDATION_ERROR',
              `expiresInSeconds must be an integer between 30 and ${MAX_SIGNED_URL_TTL_SECONDS}.`,
            );
          }
          ttlSec = body.expiresInSeconds;
        }

        const record = await storageRepo.getObject(bucket, objectPath);
        if (!record) {
          throw new HttpError(404, 'STORAGE_OBJECT_NOT_FOUND', 'File not found.');
        }

        if (!canUserReadStorageObject(record, authUser)) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'You do not have permission to sign a URL for this object.',
          );
        }

        const expiresAtUnixSec = Math.floor(Date.now() / 1000) + ttlSec;
        const sig = signStorageUrlToken({
          secret: config.authSecret,
          bucket: record.bucket,
          objectPath: record.objectPath,
          expiresAtUnixSec,
        });

        const baseUrl = buildProxyStorageUrl(record.bucket, record.objectPath);
        const signedUrl = `${baseUrl}&expires=${expiresAtUnixSec}&sig=${sig}`;

        res.status(200).json({
          success: true,
          signedUrl,
          expiresAt: new Date(expiresAtUnixSec * 1000).toISOString(),
        });
      } catch (err) {
        next(mapStorageError(err));
      }
    },
  );

  // 3. Object Retrieval Proxy (public for qr/avatars/partner-icons; private auth/ownership or HMAC signed URL for receipts/conv)
  router.get(
    '/storage/file',
    optionalAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const rawBucket = readSingleQueryParam(req.query.bucket);
        const rawPath = readSingleQueryParam(req.query.path);
        const rawUrl = readSingleQueryParam(req.query.url);
        const expiresParam = readSingleQueryParam(req.query.expires);
        const sigParam = readSingleQueryParam(req.query.sig);

        let targetBucket: StorageBucketName;
        let targetPath: string;

        if (rawPath) {
          targetBucket = normalizeStorageBucket(rawBucket || 'chat_attachments');
          targetPath = normalizeStorageObjectPath(rawPath);
        } else if (rawUrl) {
          const extracted = extractStorageLocationFromUrl(rawUrl);
          if (!extracted) {
            throw new HttpError(
              400,
              'VALIDATION_ERROR',
              'Invalid storage url parameter.',
            );
          }
          targetBucket = extracted.bucket;
          targetPath = extracted.path;
        } else {
          throw new HttpError(
            400,
            'VALIDATION_ERROR',
            'path or url parameter is required.',
          );
        }

        const record = await storageRepo.getObject(targetBucket, targetPath);
        if (!record) {
          throw new HttpError(404, 'STORAGE_OBJECT_NOT_FOUND', 'File not found.');
        }

        let usedSignedUrl = false;
        if (!record.isPublic) {
          if (expiresParam || sigParam) {
            if (!expiresParam || !sigParam) {
              throw new HttpError(
                403,
                'SIGNED_URL_INVALID',
                'Incomplete storage URL signature.',
              );
            }
            const verified = verifyStorageUrlToken({
              secret: config.authSecret,
              bucket: record.bucket,
              objectPath: record.objectPath,
              expiresRaw: expiresParam,
              sigRaw: sigParam,
            });
            if (verified.valid === false) {
              const reason = 'reason' in verified ? verified.reason : 'invalid';
              throw new HttpError(
                403,
                reason === 'expired'
                  ? 'SIGNED_URL_EXPIRED'
                  : 'SIGNED_URL_INVALID',
                reason === 'expired'
                  ? 'Signed storage URL has expired.'
                  : 'Invalid signed storage URL.',
              );
            }
            usedSignedUrl = true;
          } else {
            if (req.optionalAuthError) {
              throw req.optionalAuthError;
            }
            const authUser = req.authContext?.user;
            if (!authUser) {
              throw new HttpError(
                401,
                'UNAUTHENTICATED',
                'Authentication is required to access this private file.',
              );
            }
            if (!canUserReadStorageObject(record, authUser)) {
              throw new HttpError(
                403,
                'FORBIDDEN',
                'You do not have permission to view this private file.',
              );
            }
          }
        }

        res.setHeader('Content-Type', record.contentType);
        res.setHeader('Content-Length', String(record.imageData.length));
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader(
          'Cache-Control',
          record.isPublic
            ? 'public, max-age=604800, immutable'
            : usedSignedUrl
              ? 'private, no-store'
              : 'private, max-age=3600',
        );
        res.status(200).send(record.imageData);
      } catch (err) {
        next(mapStorageError(err));
      }
    },
  );

  return router;
}
