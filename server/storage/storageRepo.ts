import crypto from 'node:crypto';
import type { AppUserRole } from '../auth/userDirectoryRepo.js';
import type { DatabaseClient, DatabasePool } from '../db/pool.js';

export type StorageBucketName = 'chat_attachments' | 'avatars' | 'partner-icons';
export type AllowedStorageImageMime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif';

export const ALLOWED_STORAGE_BUCKETS = new Set<StorageBucketName>([
  'chat_attachments',
  'avatars',
  'partner-icons',
]);

export const MAX_STORAGE_OBJECT_BYTES = 3 * 1024 * 1024; // 3 MB server binary upload cap
export const MAX_PARTNER_ICON_BYTES = 512 * 1024; // 512 KB (matches 0008_official_partners)
export const MAX_SIGNED_URL_TTL_SECONDS = 3600; // 1 hour max expiry
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 300; // 5 minutes default expiry

export interface StorageObjectRecord {
  bucket: StorageBucketName;
  objectPath: string;
  ownerUserId: string | null;
  uploadedBy: string;
  isPublic: boolean;
  contentType: AllowedStorageImageMime;
  imageData: Buffer;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaveStorageObjectInput {
  bucket: StorageBucketName;
  objectPath: string;
  ownerUserId: string | null;
  uploadedBy: string;
  actorRole: AppUserRole;
  isPublic: boolean;
  contentType: AllowedStorageImageMime;
  imageData: Buffer;
  updateUserAvatar?: boolean;
}

export class StorageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageValidationError';
  }
}

export class StorageForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageForbiddenError';
  }
}

export class StorageNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageNotFoundError';
  }
}

export function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeStorageBucket(rawBucket: unknown): StorageBucketName {
  if (typeof rawBucket !== 'string') {
    throw new StorageValidationError('Storage bucket must be a string.');
  }
  const clean = safeDecodeUri(rawBucket).trim();
  if (!ALLOWED_STORAGE_BUCKETS.has(clean as StorageBucketName)) {
    throw new StorageValidationError(
      `Unsupported storage bucket "${clean || '(empty)'}".`,
    );
  }
  return clean as StorageBucketName;
}

export function normalizeStorageObjectPath(rawPath: unknown): string {
  if (typeof rawPath !== 'string') {
    throw new StorageValidationError('Storage path must be a string.');
  }
  const stripped = safeDecodeUri(rawPath)
    .split('?')[0]!
    .split('#')[0]!
    .trim()
    .replace(/^\/+/, '');

  if (!stripped || stripped.length > 512) {
    throw new StorageValidationError(
      'Storage path must be between 1 and 512 characters.',
    );
  }

  if (
    /[\u0000-\u001F\u007F]/.test(stripped) ||
    stripped.includes('\\') ||
    stripped.includes('//')
  ) {
    throw new StorageValidationError('Invalid characters in storage path.');
  }

  const segments = stripped.split('/');
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..' || segment.includes('..')) {
      throw new StorageValidationError('Storage path traversal is not allowed.');
    }
  }

  return stripped;
}

export function extractStorageLocationFromUrl(
  rawUrl?: string | null,
  depth = 0,
): { bucket: StorageBucketName; path: string } | null {
  if (!rawUrl || typeof rawUrl !== 'string' || depth > 2) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return null;
  }

  if (trimmed.includes('/api/storage/file')) {
    try {
      const parsed = new URL(trimmed, 'https://localhost');
      const paramPath = parsed.searchParams.get('path') ?? '';
      const paramBucket = parsed.searchParams.get('bucket') ?? 'chat_attachments';
      const paramUrl = (parsed.searchParams.get('url') ?? '').trim();
      if (paramPath.trim()) {
        return {
          bucket: normalizeStorageBucket(paramBucket),
          path: normalizeStorageObjectPath(paramPath),
        };
      }
      if (paramUrl) {
        return extractStorageLocationFromUrl(paramUrl, depth + 1);
      }
    } catch {
      return null;
    }
  }

  const match = trimmed.match(
    /\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/i,
  );
  if (match && match[1] && match[2]) {
    try {
      return {
        bucket: normalizeStorageBucket(match[1]),
        path: normalizeStorageObjectPath(match[2]),
      };
    } catch {
      return null;
    }
  }

  return null;
}

export function buildProxyStorageUrl(
  bucket: StorageBucketName,
  objectPath: string,
): string {
  return `/api/storage/file?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(objectPath)}`;
}

export function detectStorageImageMime(
  buffer: Buffer,
): AllowedStorageImageMime | null {
  if (buffer.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // GIF: GIF87a / GIF89a
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return 'image/gif';
  }
  // WebP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function isPrivateStorageObjectPath(
  bucket: StorageBucketName,
  objectPath: string,
): boolean {
  if (bucket === 'partner-icons' || bucket === 'avatars') {
    return false;
  }
  // In chat_attachments, only qr/* catalog/payment QR assets are public.
  // receipts/* and conv_*/* (and any other prefix) are private.
  return !objectPath.startsWith('qr/');
}

export function sanitizeUserIdForStoragePath(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function canUserReadStorageObject(
  record: Pick<StorageObjectRecord, 'bucket' | 'objectPath' | 'ownerUserId' | 'uploadedBy' | 'isPublic'>,
  user: { appUserId: string; role: AppUserRole } | null | undefined,
): boolean {
  if (record.isPublic) {
    return true;
  }
  if (!user) {
    return false;
  }
  if (user.role === 'admin' || user.role === 'agent') {
    return true;
  }
  if (record.ownerUserId && record.ownerUserId === user.appUserId) {
    return true;
  }
  if (record.uploadedBy === user.appUserId && !record.ownerUserId) {
    return true;
  }
  if (record.ownerUserId === null) {
    const cleanId = sanitizeUserIdForStoragePath(user.appUserId);
    if (
      record.objectPath.startsWith(`receipts/${cleanId}_`) ||
      record.objectPath.startsWith(`conv_${user.appUserId}/`) ||
      record.objectPath.startsWith(`conv_${cleanId}/`)
    ) {
      return true;
    }
  }
  return false;
}

export function signStorageUrlToken(params: {
  secret: string;
  bucket: StorageBucketName;
  objectPath: string;
  expiresAtUnixSec: number;
}): string {
  const payload = `${params.bucket}\n${params.objectPath}\n${params.expiresAtUnixSec}`;
  return crypto
    .createHmac('sha256', params.secret)
    .update(payload, 'utf8')
    .digest('hex');
}

export function verifyStorageUrlToken(params: {
  secret: string;
  bucket: StorageBucketName;
  objectPath: string;
  expiresRaw: string;
  sigRaw: string;
  nowUnixSec?: number;
}): { valid: true } | { valid: false; reason: 'invalid' | 'expired' } {
  const expiresStr = params.expiresRaw.trim();
  const sigStr = params.sigRaw.trim().toLowerCase();
  if (!/^\d{1,12}$/.test(expiresStr) || !/^[0-9a-f]{64}$/.test(sigStr)) {
    return { valid: false, reason: 'invalid' };
  }

  const expiresAt = Number.parseInt(expiresStr, 10);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    return { valid: false, reason: 'invalid' };
  }

  const expectedHex = signStorageUrlToken({
    secret: params.secret,
    bucket: params.bucket,
    objectPath: params.objectPath,
    expiresAtUnixSec: expiresAt,
  });

  const providedBuf = Buffer.from(sigStr, 'hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return { valid: false, reason: 'invalid' };
  }

  const nowSec = params.nowUnixSec ?? Math.floor(Date.now() / 1000);
  if (expiresAt < nowSec) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true };
}

function toIsoString(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string' && val.trim()) return val;
  return new Date().toISOString();
}

function toBuffer(val: unknown): Buffer {
  if (Buffer.isBuffer(val)) return val;
  if (val instanceof Uint8Array) return Buffer.from(val);
  if (typeof val === 'string') return Buffer.from(val, 'base64');
  return Buffer.alloc(0);
}

interface RawStorageObjectRow {
  bucket: string;
  object_path: string;
  owner_user_id: string | null;
  uploaded_by: string;
  is_public: boolean;
  content_type: string;
  image_data: unknown;
  size_bytes: number | string;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapStorageRow(row: RawStorageObjectRow): StorageObjectRecord {
  return {
    bucket: row.bucket as StorageBucketName,
    objectPath: row.object_path,
    ownerUserId: row.owner_user_id ?? null,
    uploadedBy: row.uploaded_by,
    isPublic: Boolean(row.is_public),
    contentType: row.content_type as AllowedStorageImageMime,
    imageData: toBuffer(row.image_data),
    sizeBytes: Number(row.size_bytes ?? 0),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export class StorageRepo {
  private readonly pool: Pick<DatabasePool, 'query'> &
    Partial<Pick<DatabasePool, 'connect'>>;

  constructor(
    pool: Pick<DatabasePool, 'query'> & Partial<Pick<DatabasePool, 'connect'>>,
  ) {
    this.pool = pool;
  }

  private async withTransaction<T>(
    fn: (client: DatabaseClient) => Promise<T>,
  ): Promise<T> {
    if (typeof this.pool.connect === 'function') {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Ignore secondary rollback error
        }
        throw err;
      } finally {
        client.release();
      }
    }

    const fallbackClient: DatabaseClient = {
      query: (text, values) => this.pool.query(text, values),
      release: () => {},
    };
    await fallbackClient.query('BEGIN');
    try {
      const result = await fn(fallbackClient);
      await fallbackClient.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await fallbackClient.query('ROLLBACK');
      } catch {
        // Ignore secondary rollback error
      }
      throw err;
    }
  }

  public async getObject(
    bucket: StorageBucketName,
    objectPath: string,
  ): Promise<StorageObjectRecord | null> {
    const res = (await this.pool.query(
      `SELECT bucket, object_path, owner_user_id, uploaded_by, is_public,
              content_type, image_data, size_bytes, created_at, updated_at
       FROM public.storage_objects
       WHERE bucket = $1 AND object_path = $2
       LIMIT 1`,
      [bucket, objectPath],
    )) as { rows: RawStorageObjectRow[] };
    const row = res.rows[0];
    return row ? mapStorageRow(row) : null;
  }

  public async saveObject(
    input: SaveStorageObjectInput,
  ): Promise<StorageObjectRecord> {
    return this.withTransaction(async (client) => {
      const existingRes = (await client.query(
        `SELECT owner_user_id, uploaded_by
         FROM public.storage_objects
         WHERE bucket = $1 AND object_path = $2
         LIMIT 1
         FOR UPDATE`,
        [input.bucket, input.objectPath],
      )) as {
        rows: Array<{
          owner_user_id: string | null;
          uploaded_by: string;
        }>;
      };
      const existing = existingRes.rows[0];
      if (existing && input.actorRole !== 'admin') {
        const existingOwner = existing.owner_user_id ?? existing.uploaded_by;
        const canOverwrite =
          existingOwner === input.uploadedBy ||
          (input.actorRole === 'agent' &&
            input.ownerUserId !== null &&
            existingOwner === input.ownerUserId);
        if (!canOverwrite) {
          throw new StorageForbiddenError(
            'You do not have permission to overwrite this storage object.',
          );
        }
      }

      const upsertRes = (await client.query(
        `INSERT INTO public.storage_objects (
           bucket,
           object_path,
           owner_user_id,
           uploaded_by,
           is_public,
           content_type,
           image_data,
           size_bytes,
           created_at,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, timezone('utc'::text, now()), timezone('utc'::text, now()))
         ON CONFLICT (bucket, object_path)
         DO UPDATE SET
           owner_user_id = EXCLUDED.owner_user_id,
           uploaded_by = EXCLUDED.uploaded_by,
           is_public = EXCLUDED.is_public,
           content_type = EXCLUDED.content_type,
           image_data = EXCLUDED.image_data,
           size_bytes = EXCLUDED.size_bytes,
           updated_at = timezone('utc'::text, now())
         RETURNING bucket, object_path, owner_user_id, uploaded_by, is_public,
                   content_type, image_data, size_bytes, created_at, updated_at`,
        [
          input.bucket,
          input.objectPath,
          input.ownerUserId,
          input.uploadedBy,
          input.isPublic,
          input.contentType,
          input.imageData,
          input.imageData.length,
        ],
      )) as { rows: RawStorageObjectRow[] };

      if (input.updateUserAvatar && input.ownerUserId) {
        const avatarProxyUrl = buildProxyStorageUrl(
          input.bucket,
          input.objectPath,
        );
        await client.query(
          `UPDATE public.users
           SET avatar_url = $2, updated_at = timezone('utc'::text, now())
           WHERE id = $1`,
          [input.ownerUserId, avatarProxyUrl],
        );
      }

      return mapStorageRow(upsertRes.rows[0]!);
    });
  }
}
