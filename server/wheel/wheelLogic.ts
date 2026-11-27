export interface WheelSegment {
  id: string;
  label: string;
  rewardAmount: number;
  probabilityWeight: number;
  color: string;
  enabled: boolean;
}

export interface WheelSimulatedWinDisplay {
  enabled: boolean;
  amount: number;
  label: string;
}

export interface WheelOfLuckConfig {
  enabled: boolean;
  title: string;
  subtitle: string;
  segments: WheelSegment[];
  simulatedWinDisplay: WheelSimulatedWinDisplay;
}

export interface WheelSpinRecord {
  id: string;
  customerId: string;
  segmentId: string;
  segmentLabel: string;
  rewardAmount: number;
  simulatedWinAmount: number;
  probabilityWeight: number;
  status: string;
  txId?: string;
  createdAt: string;
}

export interface WheelEligibilityState {
  enabled: boolean;
  eligible: boolean;
  reason?: string;
  serverNow: string;
  lastSpinAt: string | null;
  nextEligibleAt: string | null;
  remainingMs: number;
}

export interface WheelStatusResponse {
  config: WheelOfLuckConfig;
  eligibility: WheelEligibilityState;
  freePlayBalance: number;
  availableBalance: number;
  referralBonusBalance: number;
  recentSpins: WheelSpinRecord[];
  latestSpin: WheelSpinRecord | null;
}

export interface ServerWheelSpinResponse {
  success: true;
  idempotentReplay: boolean;
  spin: WheelSpinRecord;
  selectedSegment: WheelSegment;
  segmentIndex: number;
  rewardAmount: number;
  actualRewardAmount: number;
  simulatedWinAmount: number;
  simulatedWinDisplay: WheelSimulatedWinDisplay;
  freePlayBalance: number;
  availableBalance: number;
  referralBonusBalance: number;
  eligibility: WheelEligibilityState;
  txId: string | null;
}

export const ROLLING_SPIN_COOLDOWN_HOURS = 24;
export const ROLLING_SPIN_COOLDOWN_MS = ROLLING_SPIN_COOLDOWN_HOURS * 60 * 60 * 1000;

export const WHEEL_COLOR_PALETTE = [
  '#1E293B',
  '#4F46E5',
  '#059669',
  '#D97706',
  '#0284C7',
  '#7C3AED',
  '#B45309',
  '#0F766E',
];

export const DEFAULT_WHEEL_SEGMENTS: WheelSegment[] = [
  {
    id: 'seg_try_again',
    label: 'Try Again',
    rewardAmount: 0,
    probabilityWeight: 25,
    color: '#1E293B',
    enabled: true,
  },
  {
    id: 'seg_fp_2',
    label: '$2 Free Play',
    rewardAmount: 2,
    probabilityWeight: 25,
    color: '#4F46E5',
    enabled: true,
  },
  {
    id: 'seg_fp_5',
    label: '$5 Free Play',
    rewardAmount: 5,
    probabilityWeight: 20,
    color: '#059669',
    enabled: true,
  },
  {
    id: 'seg_fp_10',
    label: '$10 Free Play',
    rewardAmount: 10,
    probabilityWeight: 14,
    color: '#D97706',
    enabled: true,
  },
  {
    id: 'seg_fp_15',
    label: '$15 Free Play',
    rewardAmount: 15,
    probabilityWeight: 8,
    color: '#0284C7',
    enabled: true,
  },
  {
    id: 'seg_fp_20',
    label: '$20 Free Play',
    rewardAmount: 20,
    probabilityWeight: 5,
    color: '#7C3AED',
    enabled: true,
  },
  {
    id: 'seg_fp_25',
    label: '$25 Free Play',
    rewardAmount: 25,
    probabilityWeight: 2,
    color: '#0F766E',
    enabled: true,
  },
  {
    id: 'seg_fp_50',
    label: '$50 Grand Play',
    rewardAmount: 50,
    probabilityWeight: 1,
    color: '#B45309',
    enabled: true,
  },
];

export const DEFAULT_WHEEL_OF_LUCK_CONFIG: WheelOfLuckConfig = {
  enabled: true,
  title: 'Daily Wheel of Luck',
  subtitle: 'Try your luck for instant Freeplay',
  segments: DEFAULT_WHEEL_SEGMENTS.map((s) => ({ ...s })),
  simulatedWinDisplay: {
    enabled: true,
    amount: 250,
    label: 'Featured Showcase Prize (Simulated Demo)',
  },
};

function roundCurrency(val: unknown, fallback = 0): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Number(Math.min(100000, n).toFixed(2));
}

function roundWeight(val: unknown, fallback = 0): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Number(Math.min(100000, n).toFixed(4));
}

export function normalizeWheelConfig(raw?: unknown): WheelOfLuckConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const rawSegments =
    Array.isArray(src.segments) && src.segments.length > 0
      ? src.segments.slice(0, 16)
      : DEFAULT_WHEEL_SEGMENTS;

  const seenIds = new Set<string>();
  const segments: WheelSegment[] = rawSegments.map((rawItem: unknown, idx: number) => {
    const item = (rawItem && typeof rawItem === 'object'
      ? rawItem
      : {}) as Record<string, unknown>;
    const baseId =
      typeof item.id === 'string' && item.id.trim()
        ? item.id
            .trim()
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .slice(0, 48)
        : `seg_${idx + 1}`;
    let id = baseId;
    let suffix = 2;
    while (seenIds.has(id)) {
      id = `${baseId}_${suffix++}`;
    }
    seenIds.add(id);

    const rewardAmount = roundCurrency(item.rewardAmount, 0);
    const defaultLabel = rewardAmount > 0 ? `$${rewardAmount} Free Play` : 'Try Again';
    const label =
      typeof item.label === 'string' && item.label.trim()
        ? item.label.trim().slice(0, 40)
        : defaultLabel;
    const color =
      typeof item.color === 'string' &&
      /^#[0-9a-fA-F]{3,8}$/.test(item.color.trim())
        ? item.color.trim()
        : WHEEL_COLOR_PALETTE[idx % WHEEL_COLOR_PALETTE.length]!;

    return {
      id,
      label,
      rewardAmount,
      probabilityWeight: roundWeight(item.probabilityWeight, 0),
      color,
      enabled: item.enabled !== false,
    };
  });

  const simRaw = (src.simulatedWinDisplay &&
  typeof src.simulatedWinDisplay === 'object'
    ? src.simulatedWinDisplay
    : {}) as Record<string, unknown>;

  const simulatedWinDisplay: WheelSimulatedWinDisplay = {
    enabled: simRaw.enabled !== false,
    amount: roundCurrency(
      simRaw.amount !== undefined
        ? simRaw.amount
        : DEFAULT_WHEEL_OF_LUCK_CONFIG.simulatedWinDisplay.amount,
      DEFAULT_WHEEL_OF_LUCK_CONFIG.simulatedWinDisplay.amount,
    ),
    label:
      typeof simRaw.label === 'string' && simRaw.label.trim()
        ? simRaw.label.trim().slice(0, 80)
        : DEFAULT_WHEEL_OF_LUCK_CONFIG.simulatedWinDisplay.label,
  };

  return {
    enabled: src.enabled !== false,
    title:
      typeof src.title === 'string' && src.title.trim()
        ? src.title.trim().slice(0, 60)
        : DEFAULT_WHEEL_OF_LUCK_CONFIG.title,
    subtitle:
      typeof src.subtitle === 'string' && src.subtitle.trim()
        ? src.subtitle.trim().slice(0, 140)
        : DEFAULT_WHEEL_OF_LUCK_CONFIG.subtitle,
    segments,
    simulatedWinDisplay,
  };
}

export function validateWheelConfig(raw?: unknown): {
  valid: boolean;
  errors: string[];
  config: WheelOfLuckConfig;
} {
  const errors: string[] = [];
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  if (!Array.isArray(src.segments) || src.segments.length < 2) {
    errors.push('Wheel of Luck requires at least 2 segments.');
  } else if (src.segments.length > 16) {
    errors.push('Wheel of Luck supports at most 16 segments.');
  }

  if (Array.isArray(src.segments)) {
    src.segments.forEach((rawSeg: unknown, index: number) => {
      const seg = (rawSeg && typeof rawSeg === 'object'
        ? rawSeg
        : {}) as Record<string, unknown>;
      const label = typeof seg.label === 'string' ? seg.label.trim() : '';
      const reward = Number(seg.rewardAmount);
      const weight = Number(seg.probabilityWeight);
      if (!label) {
        errors.push(`Segment #${index + 1} must have a non-empty label.`);
      }
      if (!Number.isFinite(reward) || reward < 0 || reward > 10000) {
        errors.push(
          `Segment #${index + 1} reward amount must be between $0 and $10,000.`,
        );
      }
      if (!Number.isFinite(weight) || weight < 0 || weight > 100000) {
        errors.push(
          `Segment #${index + 1} probability weight must be 0 or greater.`,
        );
      }
    });
  }

  const simDisplay = (src.simulatedWinDisplay &&
  typeof src.simulatedWinDisplay === 'object'
    ? src.simulatedWinDisplay
    : {}) as Record<string, unknown>;
  const simAmt = Number(simDisplay.amount ?? 0);
  if (
    simDisplay.amount !== undefined &&
    (!Number.isFinite(simAmt) || simAmt < 0 || simAmt > 100000)
  ) {
    errors.push(
      'Simulated promotional win display amount must be between $0 and $100,000.',
    );
  }

  const normalized = normalizeWheelConfig(src);
  const activeWeightSum = normalized.segments
    .filter((s) => s.enabled && s.probabilityWeight > 0)
    .reduce((acc, s) => acc + s.probabilityWeight, 0);

  if (normalized.enabled && activeWeightSum <= 0) {
    errors.push(
      'At least one enabled segment must have a probability weight greater than 0 when the wheel is enabled.',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    config: normalized,
  };
}

export interface WeightedSpinSelection {
  segment: WheelSegment;
  segmentIndexInAll: number;
  normalizedProbabilityPct: number;
}

export function selectWeightedWheelSegment(
  segments: WheelSegment[],
  randomUnit: number,
): WeightedSpinSelection | null {
  const list = Array.isArray(segments) ? segments : [];
  const activeEntries = list
    .map((segment, index) => ({ segment, index }))
    .filter((entry) => entry.segment.enabled && entry.segment.probabilityWeight > 0);

  if (activeEntries.length === 0) return null;

  const totalWeight = activeEntries.reduce(
    (sum, entry) => sum + entry.segment.probabilityWeight,
    0,
  );
  if (totalWeight <= 0) return null;

  const clampedUnit = Number.isFinite(randomUnit)
    ? Math.min(0.999999999, Math.max(0, randomUnit))
    : 0;
  let threshold = clampedUnit * totalWeight;

  for (const entry of activeEntries) {
    threshold -= entry.segment.probabilityWeight;
    if (threshold < 0) {
      return {
        segment: entry.segment,
        segmentIndexInAll: entry.index,
        normalizedProbabilityPct: Number(
          ((entry.segment.probabilityWeight / totalWeight) * 100).toFixed(2),
        ),
      };
    }
  }

  const fallback = activeEntries[activeEntries.length - 1]!;
  return {
    segment: fallback.segment,
    segmentIndexInAll: fallback.index,
    normalizedProbabilityPct: Number(
      ((fallback.segment.probabilityWeight / totalWeight) * 100).toFixed(2),
    ),
  };
}

export function evaluateWheelEligibility(params: {
  config: WheelOfLuckConfig;
  lastSpinAt?: string | null;
  serverNowMs: number;
}): WheelEligibilityState {
  const serverNowIso = new Date(params.serverNowMs).toISOString();
  const lastSpinMs = params.lastSpinAt ? Date.parse(params.lastSpinAt) : NaN;
  const hasValidLastSpin = Number.isFinite(lastSpinMs) && lastSpinMs > 0;
  const nextEligibleMs = hasValidLastSpin
    ? lastSpinMs + ROLLING_SPIN_COOLDOWN_MS
    : null;
  const remainingMs =
    nextEligibleMs !== null ? Math.max(0, nextEligibleMs - params.serverNowMs) : 0;

  if (!params.config.enabled) {
    return {
      enabled: false,
      eligible: false,
      reason: 'Wheel of Luck is currently disabled by Admin.',
      serverNow: serverNowIso,
      lastSpinAt: hasValidLastSpin ? new Date(lastSpinMs).toISOString() : null,
      nextEligibleAt:
        nextEligibleMs !== null ? new Date(nextEligibleMs).toISOString() : null,
      remainingMs,
    };
  }

  const activeWeight = params.config.segments
    .filter((s) => s.enabled && s.probabilityWeight > 0)
    .reduce((sum, s) => sum + s.probabilityWeight, 0);

  if (activeWeight <= 0) {
    return {
      enabled: true,
      eligible: false,
      reason: 'No active reward segments are configured.',
      serverNow: serverNowIso,
      lastSpinAt: hasValidLastSpin ? new Date(lastSpinMs).toISOString() : null,
      nextEligibleAt:
        nextEligibleMs !== null ? new Date(nextEligibleMs).toISOString() : null,
      remainingMs,
    };
  }

  if (hasValidLastSpin && remainingMs > 0 && nextEligibleMs !== null) {
    return {
      enabled: true,
      eligible: false,
      reason:
        'Daily spin already claimed. Next spin unlocks after the 24-hour cooldown.',
      serverNow: serverNowIso,
      lastSpinAt: new Date(lastSpinMs).toISOString(),
      nextEligibleAt: new Date(nextEligibleMs).toISOString(),
      remainingMs,
    };
  }

  return {
    enabled: true,
    eligible: true,
    serverNow: serverNowIso,
    lastSpinAt: hasValidLastSpin ? new Date(lastSpinMs).toISOString() : null,
    nextEligibleAt: null,
    remainingMs: 0,
  };
}

export function computeGameCreditUnloadSplit(params: {
  totalGameBalance: number;
  trackedFreePlayBalance: number;
  requestedAmount: number;
}): {
  valid: boolean;
  error?: string;
  freePlayReturn: number;
  cashReturn: number;
  nextGameBalance: number;
  nextGameFreePlayBalance: number;
} {
  const totalBal = roundCurrency(params.totalGameBalance, 0);
  const trackedFreePlay = Math.min(
    totalBal,
    roundCurrency(params.trackedFreePlayBalance, 0),
  );
  const reqAmt = roundCurrency(params.requestedAmount, 0);

  if (reqAmt <= 0) {
    return {
      valid: false,
      error: 'Unload amount must be greater than zero.',
      freePlayReturn: 0,
      cashReturn: 0,
      nextGameBalance: totalBal,
      nextGameFreePlayBalance: trackedFreePlay,
    };
  }

  if (reqAmt > totalBal) {
    return {
      valid: false,
      error: `Insufficient game credits ($${totalBal.toFixed(2)} available to unload).`,
      freePlayReturn: 0,
      cashReturn: 0,
      nextGameBalance: totalBal,
      nextGameFreePlayBalance: trackedFreePlay,
    };
  }

  const freePlayReturn = Number(Math.min(reqAmt, trackedFreePlay).toFixed(2));
  const cashReturn = Number(Math.max(0, reqAmt - freePlayReturn).toFixed(2));
  const nextGameBalance = Number(Math.max(0, totalBal - reqAmt).toFixed(2));
  const nextGameFreePlayBalance = Number(
    Math.max(0, trackedFreePlay - freePlayReturn).toFixed(2),
  );

  return {
    valid: true,
    freePlayReturn,
    cashReturn,
    nextGameBalance,
    nextGameFreePlayBalance,
  };
}

export interface GameBonusLoadStaffMessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: 'customer';
  source: 'free_play' | 'referral_bonus';
  sourceLabel: 'Free-Play' | 'Referral Bonus';
  amount: number;
  gameTitle: string;
  gameUsername: string;
  txId: string;
  content: string;
  telegramText: string;
  pushTitle: string;
  pushBody: string;
  createdAt: string;
}

export function buildGameBonusLoadStaffMessage(params: {
  direction: string;
  source: string;
  amount: number;
  customerId: string;
  customerName?: string | null;
  gameTitle?: string | null;
  gameUsername?: string | null;
  txId: string;
  createdAt?: string;
}): GameBonusLoadStaffMessagePayload | null {
  const dir = String(params.direction || '').trim().toLowerCase();
  const src = String(params.source || '').trim().toLowerCase();
  if (dir !== 'load') return null;
  if (src !== 'free_play' && src !== 'referral_bonus') return null;

  const amount = roundCurrency(params.amount, 0);
  const customerId = String(params.customerId || '').trim();
  const txId = String(params.txId || '').trim();
  if (amount <= 0 || !customerId || !txId) return null;

  const source: 'free_play' | 'referral_bonus' = src;
  const sourceLabel: 'Free-Play' | 'Referral Bonus' =
    source === 'referral_bonus' ? 'Referral Bonus' : 'Free-Play';
  const senderName = String(params.customerName || '').trim() || 'Player';
  const gameTitle = String(params.gameTitle || '').trim() || 'Selected Game';
  const gameUsername = String(params.gameUsername || '').trim() || senderName;
  const formattedAmount = amount.toFixed(2);
  const createdAt = String(params.createdAt || new Date().toISOString());

  const content = [
    `🎮 ${sourceLabel} Load — Manual Confirmation Needed`,
    `• Player: ${senderName}`,
    `• Game Selected: ${gameTitle} (Gaming ID: ${gameUsername})`,
    `• Amount Loaded: $${formattedAmount} (${sourceLabel})`,
    `• Transfer Ref: ${txId}`,
    '',
    `⏳ Please manually confirm & load $${formattedAmount} ${sourceLabel} onto ${gameTitle} (${gameUsername}).`,
  ].join('\n');

  const telegramText = [
    `🎮 ${sourceLabel} Game Load Confirmation Needed`,
    `Player: ${senderName}`,
    `Game: ${gameTitle} (${gameUsername})`,
    `Amount: $${formattedAmount} (${sourceLabel})`,
    `Ref: ${txId}`,
  ].join('\n');

  return {
    id: `msg_gload_${txId}`,
    conversationId: `conv_${customerId}`,
    senderId: customerId,
    senderName,
    senderRole: 'customer',
    source,
    sourceLabel,
    amount,
    gameTitle,
    gameUsername,
    txId,
    content,
    telegramText,
    pushTitle: `🎮 ${sourceLabel} Load Confirmation Needed`,
    pushBody: `${senderName} loaded $${formattedAmount} (${sourceLabel}) to ${gameTitle} (${gameUsername})`,
    createdAt,
  };
}
