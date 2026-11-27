import crypto from 'node:crypto';
import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { requireRole } from '../middleware/auth.js';
import { HttpError, validateRequestBody } from '../middleware/errorHandler.js';
import {
  OfficialPartnerNotFoundError,
  OfficialPartnerValidationError,
  type CreateOfficialPartnerInput,
  type OfficialPartnerRecord,
  type OfficialPartnerRepo,
  type OfficialPartnerSortField,
  type OfficialPartnerSortOrder,
  type PartnerPlatform,
} from '../officialPartners/officialPartnerRepo.js';

export interface OfficialPartnerRouterDeps {
  officialPartnerRepo: OfficialPartnerRepo;
  requireAuth: RequestHandler;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ICON_ID_REGEX = /^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/;
const SAFE_RELATIVE_ICON_PATH_REGEX =
  /^\/api\/official-partners\/icons\/[a-zA-Z0-9_-]+\.(png|jpg|webp)$/;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

const MAX_NAME_LEN = 80;
const MAX_NOTE_LEN = 80;
const MAX_GAME_ID_LEN = 80;
const MAX_URL_LEN = 2048;
const MAX_ICON_BYTES = 512 * 1024;
const MAX_REORDER_IDS = 200;

const ALLOWED_PLATFORMS = new Set<PartnerPlatform>([
  'facebook',
  'instagram',
  'telegram',
]);

const ALLOWED_PARTNER_HOSTS: Record<PartnerPlatform, readonly string[]> = {
  facebook: [
    'facebook.com',
    'www.facebook.com',
    'm.facebook.com',
    'fb.com',
    'm.me',
  ],
  instagram: ['instagram.com', 'www.instagram.com', 'ig.me'],
  telegram: ['t.me', 'telegram.me'],
};

const PLATFORM_LABELS: Record<PartnerPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  telegram: 'Telegram',
};

const ALLOWED_ICON_MIME_TYPES = new Set<
  'image/png' | 'image/jpeg' | 'image/webp'
>(['image/png', 'image/jpeg', 'image/webp']);

const ALLOWED_QUERY_KEYS = new Set([
  'includeHidden',
  'scope',
  'platform',
  'q',
  'sortBy',
  'sortOrder',
  'limit',
  'offset',
]);

const ALLOWED_SORT_FIELDS = new Set<OfficialPartnerSortField>([
  'manual',
  'name',
  'platform',
  'updatedAt',
]);

const PRIVILEGED_BODY_FIELDS = new Set([
  'id',
  'actorId',
  'actorName',
  'actorRole',
  'actingUserId',
  'role',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
  'sortOrder',
  'sort_order',
]);

const ALLOWED_PARTNER_BODY_KEYS = new Set([
  'name',
  'iconUrl',
  'icon_url',
  'platform',
  'pageUrl',
  'page_url',
  'messageLink',
  'message_link',
  'gameId',
  'game_id',
  'note',
  'isVisible',
  'is_visible',
]);

const ALLOWED_REORDER_BODY_KEYS = new Set(['orderedIds']);
const ALLOWED_ICON_UPLOAD_BODY_KEYS = new Set([
  'fileName',
  'contentType',
  'fileBase64',
]);

export interface ValidatedPartnerQuery {
  includeHidden: boolean;
  hasExplicitScopeOrHidden: boolean;
  platform?: PartnerPlatform;
  search?: string;
  sortBy: OfficialPartnerSortField;
  sortOrder: OfficialPartnerSortOrder;
  limit: number;
  offset: number;
}

export interface ValidatedPartnerPatch {
  name?: string;
  iconUrl?: string | null;
  platform?: PartnerPlatform;
  pageUrl?: string;
  messageLink?: string | null;
  gameId?: string | null;
  note?: string | null;
  isVisible?: boolean;
}

export interface ValidatedReorderBody {
  orderedIds: string[];
}

export interface ValidatedIconUploadBody {
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  buffer: Buffer;
  extension: 'png' | 'jpg' | 'webp';
  safePrefix: string;
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

function assertBodyKeysAllowed(
  body: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  errorNoun: string,
): void {
  for (const key of Object.keys(body)) {
    if (PRIVILEGED_BODY_FIELDS.has(key)) {
      throw new HttpError(
        403,
        'FORBIDDEN_FIELD_MODIFICATION',
        `Field "${key}" cannot be supplied by client requests.`,
      );
    }
    if (!allowedKeys.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported ${errorNoun} field: "${key}".`,
      );
    }
  }
}

function validatePartnerUuidParam(rawId: unknown): string {
  if (typeof rawId !== 'string' || !UUID_REGEX.test(rawId.trim())) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Invalid official partner identifier.',
    );
  }
  return rawId.trim().toLowerCase();
}

function validateIconIdParam(rawId: unknown): string {
  if (typeof rawId !== 'string' || !ICON_ID_REGEX.test(rawId.trim())) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Invalid partner icon identifier.',
    );
  }
  return rawId.trim();
}

function validatePartnerSocialUrl(
  rawUrl: unknown,
  platform: PartnerPlatform,
  options: { required: boolean; fieldLabel: string },
): string | null {
  if (rawUrl === undefined || rawUrl === null) {
    if (options.required) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `${options.fieldLabel} is required.`,
      );
    }
    return null;
  }

  if (typeof rawUrl !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${options.fieldLabel} must be a string.`,
    );
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    if (options.required) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `${options.fieldLabel} is required.`,
      );
    }
    return null;
  }

  if (
    /\s/.test(trimmed) ||
    CONTROL_CHAR_REGEX.test(trimmed) ||
    trimmed.length > MAX_URL_LEN
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${options.fieldLabel} contains invalid characters or exceeds maximum length.`,
    );
  }

  if (!/^https:\/\//i.test(trimmed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${options.fieldLabel} must start with https://`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Enter a valid https:// ${options.fieldLabel.toLowerCase()}.`,
    );
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${options.fieldLabel} must be a clean https:// URL without embedded credentials.`,
    );
  }

  const host = parsed.hostname.toLowerCase();
  const allowedHosts = ALLOWED_PARTNER_HOSTS[platform];
  if (!allowedHosts.includes(host)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Use an official ${PLATFORM_LABELS[platform]} domain (${allowedHosts.join(', ')}).`,
    );
  }

  return trimmed;
}

function validatePartnerIconUrlValue(rawUrl: unknown): string | null {
  if (rawUrl === undefined || rawUrl === null) {
    return null;
  }
  if (typeof rawUrl !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Icon URL must be a string or null.',
    );
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  if (
    /\s/.test(trimmed) ||
    CONTROL_CHAR_REGEX.test(trimmed) ||
    trimmed.length > MAX_URL_LEN
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Icon URL contains invalid characters or exceeds maximum length.',
    );
  }

  if (SAFE_RELATIVE_ICON_PATH_REGEX.test(trimmed)) {
    return trimmed;
  }

  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Icon URL must be a valid https:// image link.',
    );
  }

  if (!/^https:\/\//i.test(trimmed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Icon URL must start with https://',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Enter a valid https:// icon URL.',
    );
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Enter a valid https:// icon URL without embedded credentials.',
    );
  }

  const lowerPath = parsed.pathname.toLowerCase();
  if (
    lowerPath.endsWith('.svg') ||
    trimmed.toLowerCase().includes('image/svg')
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'SVG icons are not allowed. Use PNG, JPG, or WebP.',
    );
  }

  return trimmed;
}

function validatePartnerNameValue(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Partner name is required.');
  }
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_NAME_LEN ||
    CONTROL_CHAR_REGEX.test(trimmed)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Partner name must be between 1 and ${MAX_NAME_LEN} valid characters.`,
    );
  }
  return trimmed;
}

function validatePlatformValue(raw: unknown): PartnerPlatform {
  if (
    typeof raw !== 'string' ||
    !ALLOWED_PLATFORMS.has(raw as PartnerPlatform)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Platform must be facebook, instagram, or telegram.',
    );
  }
  return raw as PartnerPlatform;
}

function validateOptionalShortText(
  raw: unknown,
  fieldLabel: string,
  maxLen: number,
): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldLabel} must be a string or null.`,
    );
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > maxLen || CONTROL_CHAR_REGEX.test(trimmed)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldLabel} must be ${maxLen} characters or less without control characters.`,
    );
  }
  return trimmed;
}

export function validateOfficialPartnerQuery(
  rawQuery: Record<string, unknown>,
  defaultIncludeHidden = false,
): ValidatedPartnerQuery {
  for (const key of Object.keys(rawQuery)) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Unsupported query parameter: "${key}".`,
      );
    }
  }

  let includeHidden = defaultIncludeHidden;
  let hasExplicitScopeOrHidden = false;

  if (rawQuery.includeHidden !== undefined) {
    if (rawQuery.includeHidden === '1' || rawQuery.includeHidden === 'true') {
      includeHidden = true;
      hasExplicitScopeOrHidden = true;
    } else if (
      rawQuery.includeHidden === '0' ||
      rawQuery.includeHidden === 'false'
    ) {
      includeHidden = false;
    } else {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'includeHidden must be "1", "true", "0", or "false".',
      );
    }
  }

  if (rawQuery.scope !== undefined) {
    if (rawQuery.scope === 'admin') {
      includeHidden = true;
      hasExplicitScopeOrHidden = true;
    } else if (rawQuery.scope === 'public') {
      includeHidden = defaultIncludeHidden;
    } else {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'scope must be "admin" or "public".',
      );
    }
  }

  let platform: PartnerPlatform | undefined;
  if (rawQuery.platform !== undefined && rawQuery.platform !== '') {
    platform = validatePlatformValue(rawQuery.platform);
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

  let limit = 200;
  if (rawQuery.limit !== undefined) {
    const parsed = Number(rawQuery.limit);
    if (
      typeof rawQuery.limit !== 'string' ||
      !/^\d+$/.test(rawQuery.limit.trim()) ||
      !Number.isInteger(parsed) ||
      parsed < 1 ||
      parsed > 200
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'limit must be an integer between 1 and 200.',
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

  let sortBy: OfficialPartnerSortField = 'manual';
  if (rawQuery.sortBy !== undefined) {
    if (
      typeof rawQuery.sortBy !== 'string' ||
      !ALLOWED_SORT_FIELDS.has(rawQuery.sortBy as OfficialPartnerSortField)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'sortBy must be one of manual, name, platform, or updatedAt.',
      );
    }
    sortBy = rawQuery.sortBy as OfficialPartnerSortField;
  }

  let sortOrder: OfficialPartnerSortOrder = 'asc';
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
    includeHidden,
    hasExplicitScopeOrHidden,
    platform,
    search,
    sortBy,
    sortOrder,
    limit,
    offset,
  };
}

export function validateCreatePartnerBody(
  raw: unknown,
): CreateOfficialPartnerInput {
  const body = assertObjectRecord(raw);
  assertBodyKeysAllowed(body, ALLOWED_PARTNER_BODY_KEYS, 'official partner');

  const name = validatePartnerNameValue(body.name);
  const platform = validatePlatformValue(body.platform);
  const pageUrl = validatePartnerSocialUrl(
    body.pageUrl ?? body.page_url,
    platform,
    { required: true, fieldLabel: 'Page URL' },
  )!;
  const messageLink = validatePartnerSocialUrl(
    body.messageLink ?? body.message_link ?? null,
    platform,
    { required: false, fieldLabel: 'Message link' },
  );
  const iconUrl = validatePartnerIconUrlValue(
    body.iconUrl ?? body.icon_url ?? null,
  );
  const gameId = validateOptionalShortText(
    body.gameId ?? body.game_id ?? null,
    'Game ID',
    MAX_GAME_ID_LEN,
  );
  const note = validateOptionalShortText(
    body.note ?? null,
    'Short note',
    MAX_NOTE_LEN,
  );

  const hasIsVisible = 'isVisible' in body || 'is_visible' in body;
  let isVisible = true;
  if (hasIsVisible) {
    const rawVisible = 'isVisible' in body ? body.isVisible : body.is_visible;
    if (typeof rawVisible !== 'boolean') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'isVisible must be a boolean.',
      );
    }
    isVisible = rawVisible;
  }

  return {
    name,
    iconUrl,
    platform,
    pageUrl,
    messageLink,
    gameId,
    note,
    isVisible,
  };
}

export function validatePatchPartnerBody(raw: unknown): ValidatedPartnerPatch {
  const body = assertObjectRecord(raw);
  assertBodyKeysAllowed(body, ALLOWED_PARTNER_BODY_KEYS, 'official partner');

  const patch: ValidatedPartnerPatch = {};
  let hasField = false;

  if ('name' in body) {
    patch.name = validatePartnerNameValue(body.name);
    hasField = true;
  }

  if ('platform' in body) {
    patch.platform = validatePlatformValue(body.platform);
    hasField = true;
  }

  if ('iconUrl' in body || 'icon_url' in body) {
    const rawIcon = 'iconUrl' in body ? body.iconUrl : body.icon_url;
    patch.iconUrl = validatePartnerIconUrlValue(rawIcon);
    hasField = true;
  }

  if ('pageUrl' in body || 'page_url' in body) {
    const rawPageUrl = 'pageUrl' in body ? body.pageUrl : body.page_url;
    if (typeof rawPageUrl !== 'string' || !rawPageUrl.trim()) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Page URL is required.',
      );
    }
    patch.pageUrl = rawPageUrl.trim();
    hasField = true;
  }

  if ('messageLink' in body || 'message_link' in body) {
    const rawMsg =
      'messageLink' in body ? body.messageLink : body.message_link;
    if (rawMsg !== null && rawMsg !== undefined && typeof rawMsg !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Message link must be a string or null.',
      );
    }
    patch.messageLink =
      typeof rawMsg === 'string' && rawMsg.trim() ? rawMsg.trim() : null;
    hasField = true;
  }

  if ('gameId' in body || 'game_id' in body) {
    const rawGameId = 'gameId' in body ? body.gameId : body.game_id;
    patch.gameId = validateOptionalShortText(
      rawGameId,
      'Game ID',
      MAX_GAME_ID_LEN,
    );
    hasField = true;
  }

  if ('note' in body) {
    patch.note = validateOptionalShortText(
      body.note,
      'Short note',
      MAX_NOTE_LEN,
    );
    hasField = true;
  }

  if ('isVisible' in body || 'is_visible' in body) {
    const rawVisible = 'isVisible' in body ? body.isVisible : body.is_visible;
    if (typeof rawVisible !== 'boolean') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'isVisible must be a boolean.',
      );
    }
    patch.isVisible = rawVisible;
    hasField = true;
  }

  if (!hasField) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'At least one editable official partner field is required.',
    );
  }

  return patch;
}

export function validateReorderBody(raw: unknown): ValidatedReorderBody {
  const body = assertObjectRecord(raw);
  assertBodyKeysAllowed(body, ALLOWED_REORDER_BODY_KEYS, 'reorder');

  if (!Array.isArray(body.orderedIds)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'orderedIds must be a non-empty array of partner IDs.',
    );
  }

  const orderedIds: string[] = [];
  for (const item of body.orderedIds) {
    if (typeof item !== 'string') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'All partner IDs must be valid UUIDs.',
      );
    }
    const trimmed = item.trim().toLowerCase();
    if (!UUID_REGEX.test(trimmed)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'All partner IDs must be valid UUIDs.',
      );
    }
    orderedIds.push(trimmed);
  }

  if (orderedIds.length === 0 || orderedIds.length > MAX_REORDER_IDS) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'orderedIds must be a non-empty array of partner IDs.',
    );
  }

  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'orderedIds cannot contain duplicates.',
    );
  }

  return { orderedIds };
}

function hasValidImageMagicBytes(
  buffer: Buffer,
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
): boolean {
  if (buffer.length < 12) {
    return false;
  }
  if (mimeType === 'image/png') {
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
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

function looksLikeSvgPayload(buffer: Buffer): boolean {
  const head = buffer
    .subarray(0, 256)
    .toString('utf8')
    .trimStart()
    .toLowerCase();
  return (
    head.startsWith('<svg') ||
    (head.startsWith('<?xml') && head.includes('<svg'))
  );
}

export function validateIconUploadBody(raw: unknown): ValidatedIconUploadBody {
  const body = assertObjectRecord(raw);
  assertBodyKeysAllowed(body, ALLOWED_ICON_UPLOAD_BODY_KEYS, 'icon upload');

  const rawMime =
    typeof body.contentType === 'string'
      ? body.contentType.trim().toLowerCase()
      : '';
  const rawName =
    typeof body.fileName === 'string'
      ? body.fileName.trim().toLowerCase()
      : '';
  const rawBase64 =
    typeof body.fileBase64 === 'string' ? body.fileBase64.trim() : '';

  if (!rawBase64) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Icon image data is required.');
  }

  if (rawMime === 'image/svg+xml' || rawName.endsWith('.svg')) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'SVG icons are not allowed. Use PNG, JPG, or WebP.',
    );
  }

  if (
    !ALLOWED_ICON_MIME_TYPES.has(
      rawMime as 'image/png' | 'image/jpeg' | 'image/webp',
    )
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Only PNG, JPG, and WebP icons are allowed.',
    );
  }

  const contentType = rawMime as 'image/png' | 'image/jpeg' | 'image/webp';
  const cleanBase64 = rawBase64.includes(',')
    ? (rawBase64.split(',')[1] ?? '')
    : rawBase64;
  if (!cleanBase64 || !/^[A-Za-z0-9+/=\s]+$/.test(cleanBase64)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Icon image data must be valid base64.',
    );
  }

  const buffer = Buffer.from(cleanBase64, 'base64');
  if (buffer.length === 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Uploaded icon file is empty.',
    );
  }

  if (buffer.length > MAX_ICON_BYTES) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Icon exceeds the 512 KB maximum size limit.',
    );
  }

  if (
    looksLikeSvgPayload(buffer) ||
    !hasValidImageMagicBytes(buffer, contentType)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'File contents do not match a valid PNG, JPG, or WebP image.',
    );
  }

  const extension: 'png' | 'jpg' | 'webp' =
    contentType === 'image/png'
      ? 'png'
      : contentType === 'image/webp'
        ? 'webp'
        : 'jpg';

  const safePrefix =
    rawName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 24) || 'partner_icon';

  return {
    contentType,
    buffer,
    extension,
    safePrefix,
  };
}

function mapPartnerDomainError(err: unknown): never {
  if (err instanceof OfficialPartnerNotFoundError) {
    throw new HttpError(404, 'PARTNER_NOT_FOUND', err.message);
  }
  if (err instanceof OfficialPartnerValidationError) {
    throw new HttpError(400, 'VALIDATION_ERROR', err.message);
  }
  throw err;
}

function toPartnerDto(partner: OfficialPartnerRecord) {
  return {
    id: partner.id,
    name: partner.name,
    iconUrl: partner.iconUrl,
    platform: partner.platform,
    pageUrl: partner.pageUrl,
    messageLink: partner.messageLink,
    gameId: partner.gameId,
    note: partner.note,
    isVisible: partner.isVisible,
    sortOrder: partner.sortOrder,
    updatedBy: partner.updatedBy,
    updatedAt: partner.updatedAt,
  };
}

export function createOfficialPartnerRouter({
  officialPartnerRepo,
  requireAuth,
}: OfficialPartnerRouterDeps): Router {
  const router = Router();
  const requireAdmin = requireRole('admin');

  // Serve self-hosted partner icons (public brand assets matching legacy bucket policy)
  router.get(
    '/official-partners/icons/:iconId',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const iconId = validateIconIdParam(req.params.iconId);
        const icon = await officialPartnerRepo.findIconById(iconId);
        if (!icon) {
          throw new HttpError(404, 'ICON_NOT_FOUND', 'Partner icon not found.');
        }

        res.setHeader('Content-Type', icon.contentType);
        res.setHeader('Content-Length', String(icon.imageData.length));
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        res.status(200).send(icon.imageData);
      } catch (err) {
        next(err);
      }
    },
  );

  // Authenticated player/staff list (visible only unless admin requests hidden)
  router.get(
    '/official-partners',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const query = validateOfficialPartnerQuery(
          req.query as Record<string, unknown>,
          false,
        );

        if (
          (query.includeHidden || query.hasExplicitScopeOrHidden) &&
          actor.role !== 'admin'
        ) {
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Access Denied: Only Administrators can view hidden partners.',
          );
        }

        const result = await officialPartnerRepo.listPartners({
          includeHidden: query.includeHidden,
          platform: query.platform,
          search: query.search,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
          limit: query.limit,
          offset: query.offset,
        });

        res.status(200).json({
          success: true,
          partners: result.items.map(toPartnerDto),
          total: result.total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + result.items.length < result.total,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Admin full list (includes hidden by default)
  router.get(
    '/admin/official-partners',
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const query = validateOfficialPartnerQuery(
          req.query as Record<string, unknown>,
          true,
        );

        const result = await officialPartnerRepo.listPartners({
          includeHidden: query.includeHidden,
          platform: query.platform,
          search: query.search,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
          limit: query.limit,
          offset: query.offset,
        });

        res.status(200).json({
          success: true,
          partners: result.items.map(toPartnerDto),
          total: result.total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + result.items.length < result.total,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Admin reorder (static route registered before :id routes)
  router.post(
    '/admin/official-partners/reorder',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateReorderBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const { orderedIds } = req.body as ValidatedReorderBody;

        const partners = await officialPartnerRepo.reorderPartners(orderedIds, {
          appUserId: actor.appUserId,
          displayName: actor.displayName,
          role: actor.role,
        });

        res.status(200).json({
          success: true,
          partners: partners.map(toPartnerDto),
        });
      } catch (err) {
        try {
          mapPartnerDomainError(err);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );

  // Admin icon upload (static route registered before :id routes)
  router.post(
    '/admin/official-partners/icon',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateIconUploadBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const { contentType, buffer, extension, safePrefix } =
          req.body as ValidatedIconUploadBody;

        const iconId = `${safePrefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${extension}`;
        await officialPartnerRepo.saveIcon({
          id: iconId,
          contentType,
          imageData: buffer,
          sizeBytes: buffer.length,
          actorId: actor.appUserId,
        });

        res.status(200).json({
          success: true,
          url: `/api/official-partners/icons/${iconId}`,
          path: iconId,
          size: buffer.length,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Admin create partner
  router.post(
    '/admin/official-partners',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateCreatePartnerBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const payload = req.body as CreateOfficialPartnerInput;

        const created = await officialPartnerRepo.createPartner(payload, {
          appUserId: actor.appUserId,
          displayName: actor.displayName,
          role: actor.role,
        });

        res.status(201).json({
          success: true,
          partner: toPartnerDto(created),
        });
      } catch (err) {
        try {
          mapPartnerDomainError(err);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );

  // Admin partial update partner
  router.patch(
    '/admin/official-partners/:id',
    requireAuth,
    requireAdmin,
    validateRequestBody(validatePatchPartnerBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const partnerId = validatePartnerUuidParam(req.params.id);
        const patch = req.body as ValidatedPartnerPatch;

        const updated = await officialPartnerRepo.updatePartnerWithResolver(
          partnerId,
          (existing) => {
            const nextPlatform = patch.platform ?? existing.platform;
            const nextPageUrl = validatePartnerSocialUrl(
              patch.pageUrl !== undefined ? patch.pageUrl : existing.pageUrl,
              nextPlatform,
              { required: true, fieldLabel: 'Page URL' },
            )!;
            const nextMessageLink = validatePartnerSocialUrl(
              patch.messageLink !== undefined
                ? patch.messageLink
                : existing.messageLink,
              nextPlatform,
              { required: false, fieldLabel: 'Message link' },
            );
            return {
              name: patch.name ?? existing.name,
              iconUrl:
                patch.iconUrl !== undefined ? patch.iconUrl : existing.iconUrl,
              platform: nextPlatform,
              pageUrl: nextPageUrl,
              messageLink: nextMessageLink,
              gameId:
                patch.gameId !== undefined ? patch.gameId : existing.gameId,
              note: patch.note !== undefined ? patch.note : existing.note,
              isVisible:
                patch.isVisible !== undefined
                  ? patch.isVisible
                  : existing.isVisible,
            };
          },
          {
            appUserId: actor.appUserId,
            displayName: actor.displayName,
            role: actor.role,
          },
        );

        res.status(200).json({
          success: true,
          partner: toPartnerDto(updated),
        });
      } catch (err) {
        try {
          mapPartnerDomainError(err);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );

  // Admin full update partner
  router.put(
    '/admin/official-partners/:id',
    requireAuth,
    requireAdmin,
    validateRequestBody(validateCreatePartnerBody),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const partnerId = validatePartnerUuidParam(req.params.id);
        const payload = req.body as CreateOfficialPartnerInput;

        const updated = await officialPartnerRepo.updatePartnerWithResolver(
          partnerId,
          () => payload,
          {
            appUserId: actor.appUserId,
            displayName: actor.displayName,
            role: actor.role,
          },
        );

        res.status(200).json({
          success: true,
          partner: toPartnerDto(updated),
        });
      } catch (err) {
        try {
          mapPartnerDomainError(err);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );

  // Admin delete partner
  router.delete(
    '/admin/official-partners/:id',
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const actor = req.authContext!.user;
        const partnerId = validatePartnerUuidParam(req.params.id);

        const deleted = await officialPartnerRepo.deletePartner(partnerId, {
          appUserId: actor.appUserId,
          displayName: actor.displayName,
          role: actor.role,
        });

        res.status(200).json({
          success: true,
          id: deleted.id,
        });
      } catch (err) {
        try {
          mapPartnerDomainError(err);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );

  return router;
}
