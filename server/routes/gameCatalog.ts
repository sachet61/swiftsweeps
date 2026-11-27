import crypto from 'node:crypto';
import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { UserDirectoryRepo } from '../auth/userDirectoryRepo.js';
import type {
  GameCatalogLinkRecord,
  GameCatalogRecord,
  GameCatalogRepo,
  GameCatalogSortField,
  GameCatalogSortOrder,
  UpsertGameCatalogInput,
} from '../catalog/gameCatalogRepo.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';
import type { RealtimeEventBroker } from '../realtime/realtimeEvents.js';

export interface GameCatalogRouterDeps {
  gameCatalogRepo: GameCatalogRepo;
  userRepo: UserDirectoryRepo;
  requireAuth: RequestHandler;
  optionalAuth: RequestHandler;
  realtimeEvents?: RealtimeEventBroker;
}

const GAME_ID_REGEX = /^[a-zA-Z0-9_-]{1,80}$/;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;
const DESCRIPTION_CONTROL_CHAR_REGEX =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const DATA_IMAGE_REGEX =
  /^data:image\/(webp|png|jpeg|jpg);base64,([A-Za-z0-9+/]+={0,2})$/i;

const MAX_TITLE_LEN = 120;
const MAX_PLATFORM_LEN = 80;
const MAX_DESCRIPTION_LEN = 1000;
const MAX_URL_LEN = 2048;
const MAX_LINK_LABEL_LEN = 60;
const MAX_LINKS_PER_GAME = 20;
const MAX_CONFIG_BATCH_SIZE = 100;
const MAX_IMAGE_DECODED_BYTES = 512 * 1024;

const ALLOWED_QUERY_KEYS = new Set([
  'includeDisabled',
  'category',
  'q',
  'limit',
  'offset',
  'sortBy',
  'sortOrder',
]);

const ALLOWED_SORT_FIELDS = new Set<GameCatalogSortField>([
  'createdAt',
  'title',
  'category',
  'updatedAt',
]);

const PRIVILEGED_BODY_FIELDS = new Set([
  'actorId',
  'actorName',
  'actorRole',
  'role',
  'createdBy',
  'updatedBy',
]);

const ALLOWED_GAME_BODY_KEYS = new Set([
  'id',
  'title',
  'platform',
  'category',
  'description',
  'minLoad',
  'min_load',
  'bonusPct',
  'bonus_pct',
  'enabled',
  'isActive',
  'is_active',
  'iconUrl',
  'icon_url',
  'imageUrl',
  'image_url',
  'gameUrl',
  'game_url',
  'downloadUrl',
  'download_url',
  'links',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
]);

export interface ValidatedGameCatalogQuery {
  includeDisabled: boolean;
  category?: string;
  search?: string;
  limit: number;
  offset: number;
  sortBy: GameCatalogSortField;
  sortOrder: GameCatalogSortOrder;
}

export interface ValidatedGamePayload {
  id?: string;
  title: string;
  platform: string;
  description: string | null;
  minLoad: number;
  bonusPct: number;
  enabled: boolean;
  iconUrl: string | null;
  imageUrl: string | null;
  gameUrl: string | null;
  downloadUrl: string | null;
  links: GameCatalogLinkRecord[];
  createdAt?: string;
}

export interface ValidatedGamePatchPayload {
  id?: string;
  title?: string;
  platform?: string;
  description?: string | null;
  minLoad?: number;
  bonusPct?: number;
  enabled?: boolean;
  iconUrl?: string | null;
  imageUrl?: string | null;
  gameUrl?: string | null;
  downloadUrl?: string | null;
  links?: GameCatalogLinkRecord[];
}

export interface ValidatedGameCatalogBatchBody {
  games: ValidatedGamePayload[];
}

function assertObjectRecord(
  raw: unknown,
  message = 'Request body must be a JSON object.',
): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }
  return raw as Record<string, unknown>;
}

function validateGameIdValue(raw: unknown, fieldName = 'gameId'): string {
  if (typeof raw !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be a non-empty string.`,
    );
  }
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed === 'config' ||
    !GAME_ID_REGEX.test(trimmed) ||
    CONTROL_CHAR_REGEX.test(trimmed)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must match ^[a-zA-Z0-9_-]{1,80}$ and cannot be "config".`,
    );
  }
  return trimmed;
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

function validateCatalogImageUrl(
  raw: unknown,
  fieldName: string,
): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be a valid image path, HTTPS URL, PNG/JPEG/WebP data URI, or null.`,
    );
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (CONTROL_CHAR_REGEX.test(trimmed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} contains invalid control characters.`,
    );
  }

  if (trimmed.toLowerCase().startsWith('data:')) {
    const match = DATA_IMAGE_REGEX.exec(trimmed);
    if (!match) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `${fieldName} data URIs must be base64-encoded PNG, JPEG, or WebP.`,
      );
    }
    const subtype = match[1]!.toLowerCase();
    const base64Body = match[2]!;
    const decoded = Buffer.from(base64Body, 'base64');
    if (decoded.length === 0 || decoded.length > MAX_IMAGE_DECODED_BYTES) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `${fieldName} image must be 512 KB or smaller.`,
      );
    }
    if (!verifyImageMagicBytes(subtype, decoded)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `${fieldName} image content does not match a valid PNG, JPEG, or WebP file.`,
      );
    }
    return `data:image/${subtype === 'jpg' ? 'jpeg' : subtype};base64,${base64Body}`;
  }

  if (trimmed.startsWith('/')) {
    if (
      (!trimmed.startsWith('/images/') && !trimmed.startsWith('/api/')) ||
      trimmed.startsWith('//') ||
      trimmed.includes('..') ||
      trimmed.includes('\\') ||
      /\s/.test(trimmed) ||
      trimmed.length > MAX_URL_LEN
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `${fieldName} relative path must start with /images/ or /api/.`,
      );
    }
    return trimmed;
  }

  if (trimmed.length > MAX_URL_LEN) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} exceeds maximum URL length.`,
    );
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `${fieldName} external URLs must use HTTPS.`,
      );
    }
    if (parsed.username || parsed.password) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `${fieldName} URL must not contain embedded credentials.`,
      );
    }
    return parsed.toString();
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be a valid /images/ path, HTTPS URL, or PNG/JPEG/WebP data URI.`,
    );
  }
}

function validatePlayOrDownloadUrl(
  raw: unknown,
  fieldName: string,
): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be an http(s) URL string or null.`,
    );
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (CONTROL_CHAR_REGEX.test(trimmed) || trimmed.length > MAX_URL_LEN) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} is invalid or exceeds maximum length.`,
    );
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `${fieldName} must use http:// or https://.`,
      );
    }
    if (parsed.username || parsed.password) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `${fieldName} must not contain embedded credentials.`,
      );
    }
    return parsed.toString();
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be a valid http:// or https:// URL.`,
    );
  }
}

function validateLinksArray(raw: unknown): GameCatalogLinkRecord[] {
  if (!Array.isArray(raw)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'links must be an array of { label, url } objects.',
    );
  }
  if (raw.length > MAX_LINKS_PER_GAME) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `A game may have at most ${MAX_LINKS_PER_GAME} links.`,
    );
  }

  const normalized: GameCatalogLinkRecord[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = assertObjectRecord(
      raw[i],
      `links[${i}] must be a JSON object.`,
    );
    for (const key of Object.keys(entry)) {
      if (key !== 'label' && key !== 'url') {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          `Unsupported field "${key}" in links[${i}].`,
        );
      }
    }
    if (typeof entry.label !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `links[${i}].label must be a non-empty string.`,
      );
    }
    const label = entry.label.trim();
    if (
      !label ||
      label.length > MAX_LINK_LABEL_LEN ||
      CONTROL_CHAR_REGEX.test(label)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `links[${i}].label must be between 1 and ${MAX_LINK_LABEL_LEN} valid characters.`,
      );
    }
    const url = validatePlayOrDownloadUrl(entry.url, `links[${i}].url`);
    if (!url) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `links[${i}].url must be a valid http:// or https:// URL.`,
      );
    }
    normalized.push({ label, url });
  }
  return normalized;
}

function validateMoneyOrPct(
  raw: unknown,
  fieldName: string,
  min: number,
  max: number,
): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be a finite number.`,
    );
  }
  const rounded = Math.round(raw * 100) / 100;
  if (rounded < min || rounded > max) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be between ${min} and ${max}.`,
    );
  }
  return rounded;
}

function validateOptionalTimestamp(
  raw: unknown,
  fieldName: string,
): string | undefined {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be a valid ISO timestamp.`,
    );
  }
  return new Date(raw).toISOString();
}

function assertAllowedGameObjectKeys(body: Record<string, unknown>): void {
  for (const key of Object.keys(body)) {
    if (PRIVILEGED_BODY_FIELDS.has(key)) {
      throw new HttpError(
        403,
        'FORBIDDEN_FIELD_MODIFICATION',
        `Field "${key}" cannot be supplied by client requests.`,
      );
    }
    if (!ALLOWED_GAME_BODY_KEYS.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported game catalog field: "${key}".`,
      );
    }
  }
}

export function validateGameCatalogQuery(
  rawQuery: Record<string, unknown>,
): ValidatedGameCatalogQuery {
  for (const key of Object.keys(rawQuery)) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported query parameter: "${key}".`,
      );
    }
  }

  let includeDisabled = false;
  if (rawQuery.includeDisabled !== undefined) {
    if (
      rawQuery.includeDisabled !== 'true' &&
      rawQuery.includeDisabled !== 'false'
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'includeDisabled must be "true" or "false".',
      );
    }
    includeDisabled = rawQuery.includeDisabled === 'true';
  }

  let category: string | undefined;
  if (rawQuery.category !== undefined) {
    if (typeof rawQuery.category !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'category must be a string.',
      );
    }
    const trimmed = rawQuery.category.trim();
    if (trimmed.length > MAX_PLATFORM_LEN || CONTROL_CHAR_REGEX.test(trimmed)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'category contains invalid characters or exceeds maximum length.',
      );
    }
    if (trimmed) {
      category = trimmed;
    }
  }

  let search: string | undefined;
  if (rawQuery.q !== undefined) {
    if (typeof rawQuery.q !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'q must be a string.');
    }
    const trimmed = rawQuery.q.trim();
    if (trimmed.length > 120 || CONTROL_CHAR_REGEX.test(trimmed)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'q contains invalid characters or exceeds maximum length.',
      );
    }
    if (trimmed) {
      search = trimmed;
    }
  }

  let limit = 100;
  if (rawQuery.limit !== undefined) {
    const parsed = Number(rawQuery.limit);
    if (
      typeof rawQuery.limit !== 'string' ||
      !/^\d+$/.test(rawQuery.limit.trim()) ||
      !Number.isInteger(parsed) ||
      parsed < 1 ||
      parsed > 100
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'limit must be an integer between 1 and 100.',
      );
    }
    limit = parsed;
  }

  let offset = 0;
  if (rawQuery.offset !== undefined) {
    const parsed = Number(rawQuery.offset);
    if (
      typeof rawQuery.offset !== 'string' ||
      !/^\d+$/.test(rawQuery.offset.trim()) ||
      !Number.isInteger(parsed) ||
      parsed < 0 ||
      parsed > 10_000
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'offset must be an integer between 0 and 10000.',
      );
    }
    offset = parsed;
  }

  let sortBy: GameCatalogSortField = 'createdAt';
  if (rawQuery.sortBy !== undefined) {
    if (
      typeof rawQuery.sortBy !== 'string' ||
      !ALLOWED_SORT_FIELDS.has(rawQuery.sortBy as GameCatalogSortField)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'sortBy must be one of createdAt, title, category, or updatedAt.',
      );
    }
    sortBy = rawQuery.sortBy as GameCatalogSortField;
  }

  let sortOrder: GameCatalogSortOrder = 'asc';
  if (rawQuery.sortOrder !== undefined) {
    if (rawQuery.sortOrder !== 'asc' && rawQuery.sortOrder !== 'desc') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'sortOrder must be "asc" or "desc".',
      );
    }
    sortOrder = rawQuery.sortOrder;
  }

  return {
    includeDisabled,
    category,
    search,
    limit,
    offset,
    sortBy,
    sortOrder,
  };
}

export function validateSingleGameBody(raw: unknown): ValidatedGamePayload {
  const body = assertObjectRecord(raw);
  assertAllowedGameObjectKeys(body);

  const id =
    body.id !== undefined ? validateGameIdValue(body.id, 'id') : undefined;

  if (typeof body.title !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Game title is required and must be a string.',
    );
  }
  const title = body.title.trim();
  if (!title || title.length > MAX_TITLE_LEN || CONTROL_CHAR_REGEX.test(title)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Game title must be between 1 and ${MAX_TITLE_LEN} valid characters.`,
    );
  }

  const rawPlatform = body.platform ?? body.category;
  let platform = 'General';
  if (rawPlatform !== undefined && rawPlatform !== null) {
    if (typeof rawPlatform !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'platform/category must be a string.',
      );
    }
    const trimmed = rawPlatform.trim();
    if (
      trimmed.length > MAX_PLATFORM_LEN ||
      CONTROL_CHAR_REGEX.test(trimmed)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `platform/category must be ${MAX_PLATFORM_LEN} characters or fewer without control characters.`,
      );
    }
    if (trimmed) {
      platform = trimmed;
    }
  }

  let description: string | null = null;
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'description must be a string or null.',
      );
    }
    const trimmed = body.description.trim();
    if (
      trimmed.length > MAX_DESCRIPTION_LEN ||
      DESCRIPTION_CONTROL_CHAR_REGEX.test(trimmed)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `description must be ${MAX_DESCRIPTION_LEN} characters or fewer without control characters.`,
      );
    }
    description = trimmed || null;
  }

  const rawMinLoad = body.minLoad ?? body.min_load;
  const minLoad =
    rawMinLoad !== undefined
      ? validateMoneyOrPct(rawMinLoad, 'minLoad', 0, 1_000_000)
      : 5.0;

  const rawBonusPct = body.bonusPct ?? body.bonus_pct;
  const bonusPct =
    rawBonusPct !== undefined
      ? validateMoneyOrPct(rawBonusPct, 'bonusPct', 0, 1000)
      : 0.0;

  const rawEnabled = body.enabled ?? body.isActive ?? body.is_active;
  let enabled = true;
  if (rawEnabled !== undefined) {
    if (typeof rawEnabled !== 'boolean') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'enabled/isActive must be a boolean.',
      );
    }
    enabled = rawEnabled;
  }

  const hasIcon = 'iconUrl' in body || 'icon_url' in body;
  const hasImage = 'imageUrl' in body || 'image_url' in body;
  const validatedIcon = hasIcon
    ? validateCatalogImageUrl(body.iconUrl ?? body.icon_url, 'iconUrl')
    : null;
  const validatedImage = hasImage
    ? validateCatalogImageUrl(body.imageUrl ?? body.image_url, 'imageUrl')
    : null;
  const iconUrl = validatedIcon ?? validatedImage;
  const imageUrl = validatedImage ?? validatedIcon;

  const links =
    body.links !== undefined ? validateLinksArray(body.links) : [];

  const rawGameUrl = body.gameUrl ?? body.game_url;
  const explicitGameUrl =
    rawGameUrl !== undefined
      ? validatePlayOrDownloadUrl(rawGameUrl, 'gameUrl')
      : null;

  const rawDownloadUrl = body.downloadUrl ?? body.download_url;
  const explicitDownloadUrl =
    rawDownloadUrl !== undefined
      ? validatePlayOrDownloadUrl(rawDownloadUrl, 'downloadUrl')
      : null;

  const gameUrl = explicitGameUrl ?? links[0]?.url ?? null;
  const downloadUrl =
    explicitDownloadUrl ??
    links.find((l) => l.label.toLowerCase().includes('download'))?.url ??
    links[1]?.url ??
    gameUrl;

  const normalizedLinks =
    links.length > 0
      ? links
      : gameUrl
        ? [{ label: 'Web Play', url: gameUrl }]
        : [];

  const createdAt = validateOptionalTimestamp(
    body.createdAt ?? body.created_at,
    'createdAt',
  );

  return {
    id,
    title,
    platform,
    description,
    minLoad,
    bonusPct,
    enabled,
    iconUrl,
    imageUrl,
    gameUrl,
    downloadUrl,
    links: normalizedLinks,
    createdAt,
  };
}

export function validatePatchGameBody(raw: unknown): ValidatedGamePatchPayload {
  const body = assertObjectRecord(raw);
  assertAllowedGameObjectKeys(body);

  const patch: ValidatedGamePatchPayload = {};
  let hasEditableField = false;

  if (body.id !== undefined) {
    patch.id = validateGameIdValue(body.id, 'id');
  }

  if ('title' in body) {
    if (typeof body.title !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Game title must be a string.',
      );
    }
    const title = body.title.trim();
    if (!title || title.length > MAX_TITLE_LEN || CONTROL_CHAR_REGEX.test(title)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Game title must be between 1 and ${MAX_TITLE_LEN} valid characters.`,
      );
    }
    patch.title = title;
    hasEditableField = true;
  }

  if ('platform' in body || 'category' in body) {
    const rawPlatform = body.platform ?? body.category;
    if (typeof rawPlatform !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'platform/category must be a string.',
      );
    }
    const trimmed = rawPlatform.trim();
    if (
      !trimmed ||
      trimmed.length > MAX_PLATFORM_LEN ||
      CONTROL_CHAR_REGEX.test(trimmed)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `platform/category must be between 1 and ${MAX_PLATFORM_LEN} valid characters.`,
      );
    }
    patch.platform = trimmed;
    hasEditableField = true;
  }

  if ('description' in body) {
    if (body.description === null) {
      patch.description = null;
    } else if (typeof body.description === 'string') {
      const trimmed = body.description.trim();
      if (
        trimmed.length > MAX_DESCRIPTION_LEN ||
        DESCRIPTION_CONTROL_CHAR_REGEX.test(trimmed)
      ) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          `description must be ${MAX_DESCRIPTION_LEN} characters or fewer without control characters.`,
        );
      }
      patch.description = trimmed || null;
    } else {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'description must be a string or null.',
      );
    }
    hasEditableField = true;
  }

  if ('minLoad' in body || 'min_load' in body) {
    patch.minLoad = validateMoneyOrPct(
      body.minLoad ?? body.min_load,
      'minLoad',
      0,
      1_000_000,
    );
    hasEditableField = true;
  }

  if ('bonusPct' in body || 'bonus_pct' in body) {
    patch.bonusPct = validateMoneyOrPct(
      body.bonusPct ?? body.bonus_pct,
      'bonusPct',
      0,
      1000,
    );
    hasEditableField = true;
  }

  if ('enabled' in body || 'isActive' in body || 'is_active' in body) {
    const rawEnabled = body.enabled ?? body.isActive ?? body.is_active;
    if (typeof rawEnabled !== 'boolean') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'enabled/isActive must be a boolean.',
      );
    }
    patch.enabled = rawEnabled;
    hasEditableField = true;
  }

  if ('iconUrl' in body || 'icon_url' in body) {
    patch.iconUrl = validateCatalogImageUrl(
      body.iconUrl ?? body.icon_url,
      'iconUrl',
    );
    hasEditableField = true;
  }

  if ('imageUrl' in body || 'image_url' in body) {
    patch.imageUrl = validateCatalogImageUrl(
      body.imageUrl ?? body.image_url,
      'imageUrl',
    );
    hasEditableField = true;
  }

  if ('links' in body) {
    patch.links = validateLinksArray(body.links);
    hasEditableField = true;
  }

  if ('gameUrl' in body || 'game_url' in body) {
    patch.gameUrl = validatePlayOrDownloadUrl(
      body.gameUrl ?? body.game_url,
      'gameUrl',
    );
    hasEditableField = true;
  }

  if ('downloadUrl' in body || 'download_url' in body) {
    patch.downloadUrl = validatePlayOrDownloadUrl(
      body.downloadUrl ?? body.download_url,
      'downloadUrl',
    );
    hasEditableField = true;
  }

  if (!hasEditableField) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'At least one editable game catalog field is required.',
    );
  }

  return patch;
}

export function validateConfigBatchBody(
  raw: unknown,
): ValidatedGameCatalogBatchBody {
  const body = assertObjectRecord(raw);
  for (const key of Object.keys(body)) {
    if (PRIVILEGED_BODY_FIELDS.has(key)) {
      throw new HttpError(
        403,
        'FORBIDDEN_FIELD_MODIFICATION',
        `Field "${key}" cannot be supplied by client requests.`,
      );
    }
    if (key !== 'games') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported request field: "${key}". Expected { games: [...] }.`,
      );
    }
  }

  if (!Array.isArray(body.games) || body.games.length === 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'games must be a non-empty array of game catalog items.',
    );
  }
  if (body.games.length > MAX_CONFIG_BATCH_SIZE) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Batch size cannot exceed ${MAX_CONFIG_BATCH_SIZE} games.`,
    );
  }

  const seenIds = new Set<string>();
  const games: ValidatedGamePayload[] = [];
  for (const rawItem of body.games) {
    const validated = validateSingleGameBody(rawItem);
    if (!validated.id) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Every game in a catalog config batch must include a valid id.',
      );
    }
    if (seenIds.has(validated.id)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Duplicate game id in config batch: "${validated.id}".`,
      );
    }
    seenIds.add(validated.id);
    games.push(validated);
  }

  return { games };
}

function toGameCatalogDto(game: GameCatalogRecord) {
  return {
    id: game.id,
    title: game.title,
    platform: game.platform,
    category: game.platform,
    description: game.description,
    minLoad: game.minLoad,
    bonusPct: game.bonusPct,
    enabled: game.enabled,
    isActive: game.enabled,
    iconUrl: game.iconUrl,
    imageUrl: game.imageUrl,
    gameUrl: game.gameUrl,
    downloadUrl: game.downloadUrl,
    links: game.links,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
  };
}

function generateNewGameId(): string {
  return `gc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function toUpsertInput(
  id: string,
  payload: ValidatedGamePayload,
): UpsertGameCatalogInput {
  return {
    id,
    title: payload.title,
    platform: payload.platform,
    description: payload.description,
    minLoad: payload.minLoad,
    bonusPct: payload.bonusPct,
    enabled: payload.enabled,
    iconUrl: payload.iconUrl,
    imageUrl: payload.imageUrl,
    gameUrl: payload.gameUrl,
    downloadUrl: payload.downloadUrl,
    links: payload.links,
    createdAt: payload.createdAt,
  };
}

export function createGameCatalogRouter({
  gameCatalogRepo,
  userRepo,
  requireAuth,
  optionalAuth,
  realtimeEvents,
}: GameCatalogRouterDeps): Router {
  const router = Router();
  const requireAdmin = requireRole('admin');

  // Public (active-only) or Staff (includeDisabled=true) catalog listing
  router.get(
    '/game-catalog',
    optionalAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const query = validateGameCatalogQuery(
          req.query as Record<string, unknown>,
        );

        if (query.includeDisabled) {
          if (req.optionalAuthError) {
            throw req.optionalAuthError;
          }
          if (!req.authContext) {
            throw new HttpError(
              401,
              'UNAUTHENTICATED',
              'Authentication is required to inspect disabled catalog games.',
            );
          }
          const role = req.authContext.user.role;
          if (role !== 'admin' && role !== 'agent') {
            throw new HttpError(
              403,
              'FORBIDDEN',
              'Staff permission is required to view disabled games.',
            );
          }
        }

        const result = await gameCatalogRepo.listGames({
          includeDisabled: query.includeDisabled,
          category: query.category,
          search: query.search,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
          limit: query.limit,
          offset: query.offset,
        });

        res.status(200).json({
          games: result.items.map(toGameCatalogDto),
          total: result.total,
          limit: query.limit,
          offset: query.offset,
          catalogPopulated: result.catalogPopulated,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Batch save master game catalog config (Admin only) - registered before :gameId routes
  router.put(
    '/game-catalog/config',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateConfigBatchBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const body = req.body as ValidatedGameCatalogBatchBody;

        const saved = await gameCatalogRepo.upsertConfigBatch(
          body.games.map((g) => toUpsertInput(g.id!, g)),
        );

        const disabledTitles = saved
          .filter((g) => !g.enabled)
          .map((g) => g.title);

        await userRepo.writeAuditLog({
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
          action: 'GAME_CATALOG_CONFIG_SAVED',
          entityType: 'settings',
          entityId: 'game_catalog',
          details: `Admin saved master game catalog config (${saved.length} games, ${disabledTitles.length} disabled${disabledTitles.length > 0 ? `: ${disabledTitles.join(', ')}` : ''}).`,
        });

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'authenticated' },
          ['game_catalog', 'audit_logs'],
          'game_catalog_config_saved',
        );

        res.status(200).json({
          success: true,
          savedCount: saved.length,
          games: saved.map(toGameCatalogDto),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Single game lookup (active games public; disabled games restricted to staff)
  router.get(
    '/game-catalog/:gameId',
    optionalAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const gameId = validateGameIdValue(req.params.gameId);
        const game = await gameCatalogRepo.findById(gameId);
        if (!game) {
          throw new HttpError(404, 'GAME_NOT_FOUND', 'Game not found.');
        }

        const isStaff =
          req.authContext?.user.role === 'admin' ||
          req.authContext?.user.role === 'agent';

        if (!game.enabled && !isStaff) {
          throw new HttpError(404, 'GAME_NOT_FOUND', 'Game not found.');
        }

        res.status(200).json({
          game: toGameCatalogDto(game),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Create or upsert a single game catalog entry (Admin only)
  router.post(
    '/game-catalog',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateSingleGameBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const payload = req.body as ValidatedGamePayload;
        const targetId = payload.id ?? generateNewGameId();

        const { item, created } = await gameCatalogRepo.upsertGame(
          toUpsertInput(targetId, payload),
        );

        await userRepo.writeAuditLog({
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
          action: created ? 'GAME_CATALOG_CREATED' : 'GAME_CATALOG_UPDATED',
          entityType: 'settings',
          entityId: item.id,
          details: created
            ? `Admin added game "${item.title}" to platform catalog.`
            : `Admin updated game "${item.title}" (${item.enabled ? 'Active' : 'Disabled'}) in platform catalog.`,
        });

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'authenticated' },
          ['game_catalog', 'audit_logs'],
          created ? 'game_catalog_created' : 'game_catalog_updated',
        );

        res.status(created ? 201 : 200).json({
          success: true,
          created,
          game: toGameCatalogDto(item),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Idempotent full update / upsert by gameId (Admin only)
  router.put(
    '/game-catalog/:gameId',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateSingleGameBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const gameId = validateGameIdValue(req.params.gameId);
        const payload = req.body as ValidatedGamePayload;

        if (payload.id !== undefined && payload.id !== gameId) {
          throw new HttpError(
            400,
            'VALIDATION_ERROR',
            'Request body id must match path gameId.',
          );
        }

        const { item, created } = await gameCatalogRepo.upsertGame(
          toUpsertInput(gameId, payload),
        );

        await userRepo.writeAuditLog({
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
          action: created ? 'GAME_CATALOG_CREATED' : 'GAME_CATALOG_UPDATED',
          entityType: 'settings',
          entityId: item.id,
          details: created
            ? `Admin added game "${item.title}" to platform catalog.`
            : `Admin updated game "${item.title}" (${item.enabled ? 'Active' : 'Disabled'}) in platform catalog.`,
        });

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'authenticated' },
          ['game_catalog', 'audit_logs'],
          created ? 'game_catalog_created' : 'game_catalog_updated',
        );

        res.status(created ? 201 : 200).json({
          success: true,
          created,
          game: toGameCatalogDto(item),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Partial update by gameId (Admin only)
  router.patch(
    '/game-catalog/:gameId',
    requireAuth,
    requireAdmin,
    validateRequestBody(validatePatchGameBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const gameId = validateGameIdValue(req.params.gameId);
        const patch = req.body as ValidatedGamePatchPayload;

        if (patch.id !== undefined && patch.id !== gameId) {
          throw new HttpError(
            400,
            'VALIDATION_ERROR',
            'Request body id must match path gameId.',
          );
        }

        const existing = await gameCatalogRepo.findById(gameId);
        if (!existing) {
          throw new HttpError(404, 'GAME_NOT_FOUND', 'Game not found.');
        }

        const mergedLinks = patch.links ?? existing.links;
        const mergedGameUrl =
          patch.gameUrl !== undefined
            ? patch.gameUrl
            : patch.links !== undefined
              ? (mergedLinks[0]?.url ?? existing.gameUrl)
              : existing.gameUrl;
        const mergedDownloadUrl =
          patch.downloadUrl !== undefined
            ? patch.downloadUrl
            : patch.links !== undefined
              ? (mergedLinks.find((l) =>
                  l.label.toLowerCase().includes('download'),
                )?.url ??
                mergedLinks[1]?.url ??
                mergedGameUrl)
              : existing.downloadUrl;

        const mergedIconUrl =
          patch.iconUrl !== undefined ? patch.iconUrl : existing.iconUrl;
        const mergedImageUrl =
          patch.imageUrl !== undefined
            ? patch.imageUrl
            : patch.iconUrl !== undefined && existing.imageUrl === existing.iconUrl
              ? patch.iconUrl
              : existing.imageUrl;

        const { item } = await gameCatalogRepo.upsertGame({
          id: existing.id,
          title: patch.title ?? existing.title,
          platform: patch.platform ?? existing.platform,
          description:
            patch.description !== undefined
              ? patch.description
              : existing.description || null,
          minLoad: patch.minLoad ?? existing.minLoad,
          bonusPct: patch.bonusPct ?? existing.bonusPct,
          enabled: patch.enabled ?? existing.enabled,
          iconUrl: mergedIconUrl,
          imageUrl: mergedImageUrl,
          gameUrl: mergedGameUrl,
          downloadUrl: mergedDownloadUrl,
          links: mergedLinks,
          createdAt: existing.createdAt,
        });

        await userRepo.writeAuditLog({
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
          action: 'GAME_CATALOG_UPDATED',
          entityType: 'settings',
          entityId: item.id,
          details: `Admin updated game "${item.title}" (${item.enabled ? 'Active' : 'Disabled'}) in platform catalog.`,
        });

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'authenticated' },
          ['game_catalog', 'audit_logs'],
          'game_catalog_patched',
        );

        res.status(200).json({
          success: true,
          game: toGameCatalogDto(item),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Delete game by gameId (Admin only)
  router.delete(
    '/game-catalog/:gameId',
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const gameId = validateGameIdValue(req.params.gameId);

        const deleted = await gameCatalogRepo.deleteGame(gameId);
        if (!deleted) {
          throw new HttpError(404, 'GAME_NOT_FOUND', 'Game not found.');
        }

        await userRepo.writeAuditLog({
          actorId: actor.appUserId,
          actorName: actor.displayName,
          actorRole: actor.role,
          action: 'GAME_CATALOG_DELETED',
          entityType: 'settings',
          entityId: deleted.id,
          details: `Admin removed game "${deleted.title}" from platform catalog.`,
        });

        realtimeEvents?.emitDomainInvalidation(
          { scope: 'authenticated' },
          ['game_catalog', 'audit_logs'],
          'game_catalog_deleted',
        );

        res.status(200).json({
          success: true,
          deletedId: deleted.id,
          game: toGameCatalogDto(deleted),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
