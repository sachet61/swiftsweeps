import type { GameAccount, GameAccountStatus } from '../types';

const VALID_STATUSES = new Set<GameAccountStatus>([
  'active',
  'pending_assignment',
  'pending_reset',
  'suspended',
]);

function normalizeStatus(raw: unknown): GameAccountStatus {
  if (typeof raw === 'string' && VALID_STATUSES.has(raw as GameAccountStatus)) {
    return raw as GameAccountStatus;
  }
  return 'active';
}

function toFixedMoney(value: unknown): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Number(num.toFixed(2));
}

export function mapServerGameAccountRow(
  raw: any,
  existingAccounts: GameAccount[] = [],
): GameAccount {
  const id = String(raw?.id ?? '');
  const existing = existingAccounts.find((a) => a.id === id);

  const gameCatalogId = String(
    raw?.gameCatalogId ?? raw?.game_id ?? existing?.gameCatalogId ?? '',
  );
  const customerId = String(
    raw?.customerId ?? raw?.customer_id ?? existing?.customerId ?? '',
  );
  const gameName = String(
    raw?.gameName ?? raw?.game_title ?? existing?.gameName ?? 'Game',
  );
  const platformName = String(
    raw?.platformName ??
      raw?.platform_name ??
      existing?.platformName ??
      'Sweepstakes',
  );
  const username = String(
    raw?.username ?? existing?.username ?? 'Pending Assignment',
  );
  const password =
    raw?.password !== undefined
      ? String(raw.password ?? '')
      : existing?.password;

  const rawRequestType = raw?.requestType ?? raw?.request_type;
  const requestType =
    rawRequestType === 'new_id_request' ||
    rawRequestType === 'password_reset_request'
      ? rawRequestType
      : undefined;

  const rawNotes = raw?.notes ?? raw?.pin;
  const notes =
    typeof rawNotes === 'string' && rawNotes.length > 0 ? rawNotes : undefined;

  const createdAt = String(
    raw?.createdAt ?? raw?.created_at ?? existing?.createdAt ?? new Date().toISOString(),
  );
  const updatedAt = String(
    raw?.updatedAt ?? raw?.updated_at ?? createdAt,
  );

  return {
    id,
    gameCatalogId,
    customerId,
    gameName,
    platformName,
    username,
    password,
    gameUrl: String(raw?.gameUrl ?? raw?.game_url ?? existing?.gameUrl ?? ''),
    status: normalizeStatus(raw?.status ?? existing?.status),
    balance: toFixedMoney(raw?.balance ?? existing?.balance),
    freePlayBalance: toFixedMoney(
      raw?.freePlayBalance ??
        raw?.free_play_balance ??
        existing?.freePlayBalance,
    ),
    requestType,
    notes,
    assignedByAgentId:
      raw?.assignedByAgentId ??
      raw?.assigned_by_agent_id ??
      existing?.assignedByAgentId,
    assignedByAgentName:
      raw?.assignedByAgentName ??
      raw?.assigned_by_agent_name ??
      existing?.assignedByAgentName,
    createdAt,
    updatedAt,
  };
}

/**
 * Enforces strictly 1 GameAccount per (customerId, game) invariant on cached lists.
 */
export function deduplicateGameAccountsList(
  accounts: GameAccount[],
): GameAccount[] {
  if (!Array.isArray(accounts)) return [];

  const customerMap = new Map<string, GameAccount[]>();
  for (const acc of accounts) {
    if (!acc || !acc.customerId) continue;
    const list = customerMap.get(acc.customerId) || [];
    list.push(acc);
    customerMap.set(acc.customerId, list);
  }

  const cleanedAccounts: GameAccount[] = [];

  for (const userAccList of customerMap.values()) {
    const gameBuckets: GameAccount[] = [];

    for (const candidate of userAccList) {
      const candCatalog = candidate.gameCatalogId?.trim().toLowerCase() || '';
      const candTitle = candidate.gameName?.trim().toLowerCase() || '';

      const existingIdx = gameBuckets.findIndex((b) => {
        const bCatalog = b.gameCatalogId?.trim().toLowerCase() || '';
        const bTitle = b.gameName?.trim().toLowerCase() || '';
        if (candCatalog && bCatalog && candCatalog === bCatalog) return true;
        if (candTitle && bTitle && candTitle === bTitle) return true;
        return false;
      });

      if (existingIdx === -1) {
        gameBuckets.push({ ...candidate });
      } else {
        const existing = gameBuckets[existingIdx]!;
        const candIsActive =
          candidate.status === 'active' &&
          Boolean(candidate.username) &&
          candidate.username !== 'Pending Assignment';
        const existIsActive =
          existing.status === 'active' &&
          Boolean(existing.username) &&
          existing.username !== 'Pending Assignment';

        const primary = candIsActive && !existIsActive ? candidate : existing;
        const secondary = primary === candidate ? existing : candidate;

        const mergedBalance = Number(
          ((existing.balance || 0) + (candidate.balance || 0)).toFixed(2),
        );
        const mergedFreePlay = Number(
          (
            (existing.freePlayBalance || 0) +
            (candidate.freePlayBalance || 0)
          ).toFixed(2),
        );
        const bestUsername =
          primary.username && primary.username !== 'Pending Assignment'
            ? primary.username
            : secondary.username && secondary.username !== 'Pending Assignment'
              ? secondary.username
              : primary.username;

        const bestPassword = primary.password || secondary.password || '';
        const bestStatus: GameAccountStatus =
          primary.status === 'active' || secondary.status === 'active'
            ? 'active'
            : primary.status;

        gameBuckets[existingIdx] = {
          ...primary,
          id: existing.id,
          balance: mergedBalance,
          freePlayBalance: mergedFreePlay,
          username: bestUsername,
          password: bestPassword,
          status: bestStatus,
          gameCatalogId: primary.gameCatalogId || secondary.gameCatalogId,
          gameName: primary.gameName || secondary.gameName,
          platformName: primary.platformName || secondary.platformName,
          gameUrl: primary.gameUrl || secondary.gameUrl,
          notes: primary.notes || secondary.notes,
          updatedAt: primary.updatedAt || secondary.updatedAt || existing.updatedAt,
        };
      }
    }

    cleanedAccounts.push(...gameBuckets);
  }

  return cleanedAccounts;
}

export function mergeGameAccounts(
  existing: GameAccount[],
  incomingRows: any[],
  replaceAll = false,
  removeIds: string[] = [],
): GameAccount[] {
  const removeSet = new Set(removeIds);
  const base = replaceAll
    ? []
    : (existing || []).filter((a) => !removeSet.has(a.id));

  const map = new Map<string, GameAccount>();
  for (const item of base) {
    if (item && item.id) {
      map.set(item.id, item);
    }
  }

  for (const row of incomingRows || []) {
    if (!row || !row.id) continue;
    if (row.deleted_at || removeSet.has(String(row.id))) {
      map.delete(String(row.id));
      continue;
    }
    const mapped = mapServerGameAccountRow(row, existing);
    map.set(mapped.id, mapped);
  }

  return deduplicateGameAccountsList(Array.from(map.values()));
}

export function parseGameAccountApiError(
  status: number,
  rawBody: string,
  fallback: string,
): string {
  const trimmed = (rawBody || '').trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as {
        message?: unknown;
        error?: unknown;
      };
      if (typeof parsed.message === 'string' && parsed.message.trim()) {
        return parsed.message.trim();
      }
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        return parsed.error.trim();
      }
    } catch {
      if (!trimmed.startsWith('<') && trimmed.length < 300) {
        return trimmed;
      }
    }
  }

  if (status === 401) {
    return 'Your session has expired. Please sign in again.';
  }
  if (status === 403) {
    return 'You do not have permission to perform this game account action.';
  }
  if (status === 404) {
    return 'Game account or catalog entry not found.';
  }
  if (status === 409) {
    return 'A conflicting game ID request already exists.';
  }
  return fallback;
}

export function buildGameAccountsQueryUrl(options?: {
  customerId?: string;
  customerIds?: string[];
  status?: string;
  gameCatalogId?: string;
  q?: string;
  sortBy?: string;
  sortOrder?: string;
  limit?: number;
  offset?: number;
}): string {
  const params = new URLSearchParams();
  if (options?.customerId?.trim()) {
    params.set('customerId', options.customerId.trim());
  }
  if (options?.customerIds && options.customerIds.length > 0) {
    const cleanIds = options.customerIds.map((id) => id.trim()).filter(Boolean);
    if (cleanIds.length > 0) {
      params.set('customerIds', cleanIds.join(','));
    }
  }
  if (options?.status?.trim()) {
    params.set('status', options.status.trim());
  }
  if (options?.gameCatalogId?.trim()) {
    params.set('gameCatalogId', options.gameCatalogId.trim());
  }
  if (options?.q?.trim()) {
    params.set('q', options.q.trim());
  }
  if (options?.sortBy?.trim()) {
    params.set('sortBy', options.sortBy.trim());
  }
  if (options?.sortOrder?.trim()) {
    params.set('sortOrder', options.sortOrder.trim());
  }
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  if (options?.offset !== undefined) {
    params.set('offset', String(options.offset));
  }
  const qs = params.toString();
  return qs ? `/api/game-accounts?${qs}` : '/api/game-accounts';
}
