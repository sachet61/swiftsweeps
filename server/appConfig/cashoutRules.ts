export type CashoutRuleKind = 'deposit_range' | 'minimum_qualifying';

export interface CashoutRuleOption {
  amountLabel: string;
  unitLabel: string;
}

export interface CashoutRuleCategory {
  id: string;
  category: string;
  kind: CashoutRuleKind;
  conditionLabel: string;
  minimumLabel: string;
  maximumLabel: string;
  redemptionOptions?: CashoutRuleOption[];
  notes?: string;
}

export interface CashoutRulesConfig {
  enabled: boolean;
  title: string;
  subtitle: string;
  voidExcessWarning: string;
  updatedAt?: string;
  categories: CashoutRuleCategory[];
}

export const DEFAULT_CASHOUT_RULES_CONFIG: CashoutRulesConfig = {
  enabled: true,
  title: 'Cashout & Redemption Limits',
  subtitle:
    'Cashout eligibility, minimum thresholds, and maximum redemption caps by deposit tier and promotional credit type.',
  voidExcessWarning:
    'Any amount exceeding the applicable maximum cashout will be voided.',
  categories: [
    {
      id: 'tier_10_or_more',
      category: '$10 or more',
      kind: 'deposit_range',
      conditionLabel: 'Deposit range',
      minimumLabel: '5× (load + bonus)',
      maximumLabel: '15× (load + bonus)',
      notes: 'Applies to qualifying cash deposits of $10 or above.',
    },
    {
      id: 'tier_5_to_9',
      category: '$5–$9',
      kind: 'deposit_range',
      conditionLabel: 'Deposit range',
      minimumLabel: '$30',
      maximumLabel: '$60',
      notes: 'Applies to deposits between $5 and $9.',
    },
    {
      id: 'tier_below_5',
      category: 'Below $5',
      kind: 'deposit_range',
      conditionLabel: 'Deposit range',
      minimumLabel: '$30',
      maximumLabel: '$30',
      notes: 'Fixed $30 cashout floor and ceiling for deposits under $5.',
    },
    {
      id: 'tier_freeplay',
      category: 'Freeplay',
      kind: 'minimum_qualifying',
      conditionLabel: 'Minimum qualifying amount',
      minimumLabel: '$20',
      maximumLabel: '$15 game credits OR $10 cash',
      redemptionOptions: [
        { amountLabel: '$15', unitLabel: 'game credits' },
        { amountLabel: '$10', unitLabel: 'cash' },
      ],
      notes: 'Choose either $15 game credits OR $10 cash upon qualifying.',
    },
    {
      id: 'tier_referral_bonus',
      category: 'Referral bonus',
      kind: 'minimum_qualifying',
      conditionLabel: 'Minimum qualifying amount',
      minimumLabel: '$40',
      maximumLabel: '$30 game points OR $20 cash',
      redemptionOptions: [
        { amountLabel: '$30', unitLabel: 'game points' },
        { amountLabel: '$20', unitLabel: 'cash' },
      ],
      notes: 'Choose either $30 game points OR $20 cash upon qualifying.',
    },
  ],
};

function cloneCategory(cat: CashoutRuleCategory): CashoutRuleCategory {
  return {
    id: cat.id,
    category: cat.category,
    kind: cat.kind,
    conditionLabel: cat.conditionLabel,
    minimumLabel: cat.minimumLabel,
    maximumLabel: cat.maximumLabel,
    ...(cat.redemptionOptions && cat.redemptionOptions.length > 0
      ? {
          redemptionOptions: cat.redemptionOptions.map((opt) => ({
            amountLabel: opt.amountLabel,
            unitLabel: opt.unitLabel,
          })),
        }
      : {}),
    ...(cat.notes ? { notes: cat.notes } : {}),
  };
}

export function cloneDefaultCashoutRulesConfig(): CashoutRulesConfig {
  return {
    ...DEFAULT_CASHOUT_RULES_CONFIG,
    categories: DEFAULT_CASHOUT_RULES_CONFIG.categories.map(cloneCategory),
  };
}

function sanitizePlainText(raw: unknown, fallback: string, maxLen = 240): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

export function normalizeCashoutRulesConfig(raw: unknown): CashoutRulesConfig {
  const defaults = cloneDefaultCashoutRulesConfig();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults;
  }
  const obj = raw as Record<string, unknown>;
  const rawCats = Array.isArray(obj.categories) ? obj.categories : [];

  const categories: CashoutRuleCategory[] = [];
  if (rawCats.length > 0) {
    rawCats.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      const r = entry as Record<string, unknown>;
      const fallback = defaults.categories[index] ?? defaults.categories[0]!;
      const kind: CashoutRuleKind =
        r.kind === 'minimum_qualifying' || r.kind === 'deposit_range'
          ? r.kind
          : fallback.kind;
      const rawOpts = Array.isArray(r.redemptionOptions)
        ? r.redemptionOptions
            .filter(
              (o): o is Record<string, unknown> =>
                Boolean(o) && typeof o === 'object' && !Array.isArray(o),
            )
            .map((o) => ({
              amountLabel: sanitizePlainText(o.amountLabel, '', 40),
              unitLabel: sanitizePlainText(o.unitLabel, '', 60),
            }))
            .filter((o) => o.amountLabel && o.unitLabel)
        : fallback.redemptionOptions;

      const maximumFromOpts =
        rawOpts && rawOpts.length >= 2
          ? rawOpts.map((o) => `${o.amountLabel} ${o.unitLabel}`).join(' OR ')
          : undefined;

      categories.push({
        id: sanitizePlainText(r.id, `tier_${index + 1}`, 60),
        category: sanitizePlainText(r.category, fallback.category, 80),
        kind,
        conditionLabel: sanitizePlainText(
          r.conditionLabel,
          kind === 'minimum_qualifying'
            ? 'Minimum qualifying amount'
            : 'Deposit range',
          80,
        ),
        minimumLabel: sanitizePlainText(r.minimumLabel, fallback.minimumLabel, 80),
        maximumLabel: sanitizePlainText(
          r.maximumLabel,
          maximumFromOpts ?? fallback.maximumLabel,
          120,
        ),
        ...(rawOpts && rawOpts.length > 0 ? { redemptionOptions: rawOpts } : {}),
        ...(typeof r.notes === 'string' && r.notes.trim()
          ? { notes: sanitizePlainText(r.notes, '', 240) }
          : fallback.notes
            ? { notes: fallback.notes }
            : {}),
      });
    });
  }

  return {
    enabled: obj.enabled !== false,
    title: sanitizePlainText(obj.title, defaults.title, 120),
    subtitle: sanitizePlainText(obj.subtitle, defaults.subtitle, 320),
    voidExcessWarning: sanitizePlainText(
      obj.voidExcessWarning,
      defaults.voidExcessWarning,
      280,
    ),
    ...(typeof obj.updatedAt === 'string' && obj.updatedAt.trim()
      ? { updatedAt: obj.updatedAt.trim() }
      : {}),
    categories: categories.length > 0 ? categories : defaults.categories,
  };
}

function fnv1aDualHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

/**
 * Deterministic rules fingerprint ignoring volatile updatedAt timestamps so
 * pinned status detects genuine rule/warning edits reliably across server & UI.
 */
export function computeCashoutRulesVersion(raw: unknown): string {
  const norm = normalizeCashoutRulesConfig(raw);
  const canonical = {
    enabled: norm.enabled,
    title: norm.title,
    subtitle: norm.subtitle,
    voidExcessWarning: norm.voidExcessWarning,
    categories: norm.categories.map((cat) => ({
      id: cat.id,
      category: cat.category,
      kind: cat.kind,
      conditionLabel: cat.conditionLabel,
      minimumLabel: cat.minimumLabel,
      maximumLabel: cat.maximumLabel,
      redemptionOptions: (cat.redemptionOptions ?? []).map((opt) => ({
        amountLabel: opt.amountLabel,
        unitLabel: opt.unitLabel,
      })),
      notes: cat.notes ?? '',
    })),
  };
  return `crv_${fnv1aDualHex(JSON.stringify(canonical))}`;
}

export function formatCashoutRulesMessage(raw: unknown): string {
  const config = normalizeCashoutRulesConfig(raw);
  const depositTiers = config.categories.filter((c) => c.kind === 'deposit_range');
  const qualifyingTiers = config.categories.filter(
    (c) => c.kind === 'minimum_qualifying',
  );

  const lines: string[] = [
    `${config.title.toUpperCase()}`,
    '',
  ];

  if (depositTiers.length > 0) {
    lines.push('Deposit Range Rules:');
    for (const tier of depositTiers) {
      lines.push(
        `• ${tier.category} (${tier.conditionLabel}): Min ${tier.minimumLabel} | Max ${tier.maximumLabel}`,
      );
    }
    lines.push('');
  }

  if (qualifyingTiers.length > 0) {
    lines.push('Freeplay & Referral Bonus Rules:');
    for (const tier of qualifyingTiers) {
      lines.push(
        `• ${tier.category} (${tier.conditionLabel}): Min ${tier.minimumLabel} | Max / Redemption: ${tier.maximumLabel}`,
      );
    }
    lines.push('');
  }

  lines.push(`Important Notice: ${config.voidExcessWarning}`);
  return lines.join('\n').trim();
}
