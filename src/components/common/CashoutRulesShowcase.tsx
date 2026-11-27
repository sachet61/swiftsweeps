import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Layers,
  MessageCircle,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import type { CashoutRulesConfig } from '../../utils/cashoutRulesUtils';
import {
  formatCashoutRulesMessage,
  normalizeCashoutRulesConfig,
} from '../../utils/cashoutRulesUtils';

interface CashoutRulesShowcaseProps {
  rules?: CashoutRulesConfig | null;
  compact?: boolean;
  copyable?: boolean;
  onContactSupport?: () => void;
  className?: string;
}

export const CashoutRulesShowcase: React.FC<CashoutRulesShowcaseProps> = ({
  rules,
  compact = false,
  copyable = true,
  onContactSupport,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const normalized = normalizeCashoutRulesConfig(rules);

  const depositTiers = normalized.categories.filter((c) => c.kind === 'deposit_range');
  const qualifyingTiers = normalized.categories.filter(
    (c) => c.kind === 'minimum_qualifying',
  );

  const handleCopyRules = async () => {
    try {
      await navigator.clipboard.writeText(formatCashoutRulesMessage(normalized));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures in restricted environments
    }
  };

  if (!normalized.enabled) {
    return null;
  }

  return (
    <section
      aria-label={normalized.title}
      data-testid="cashout-rules-showcase"
      className={`rounded-2xl border border-slate-800 bg-[#0B1222] ${
        compact ? 'p-4 space-y-4' : 'p-5 sm:p-6 space-y-5'
      } shadow-lg ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-800/90">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold uppercase tracking-wider">
            <Scale className="w-4 h-4 shrink-0" />
            <span>Official Cashout Schedule</span>
          </div>
          <h2
            className={`${
              compact ? 'text-base' : 'text-lg sm:text-xl'
            } font-bold text-white tracking-tight`}
          >
            {normalized.title}
          </h2>
          {normalized.subtitle && (
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
              {normalized.subtitle}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {copyable && (
            <button
              type="button"
              onClick={() => void handleCopyRules()}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy Rules</span>
                </>
              )}
            </button>
          )}

          {onContactSupport && (
            <button
              type="button"
              onClick={onContactSupport}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Ask Support</span>
            </button>
          )}
        </div>
      </div>

      {/* Deposit Range Tiers */}
      {depositTiers.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Cash Deposit Tiers</span>
            </span>
            <span className="text-[11px] text-slate-400">
              Minimum &amp; maximum cashout by deposit size
            </span>
          </div>

          <div
            className={`grid gap-3 ${
              compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 md:grid-cols-3'
            }`}
          >
            {depositTiers.map((tier) => (
              <div
                key={tier.id}
                className="rounded-xl border border-slate-800 bg-[#080E1D] p-3.5 flex flex-col justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <div className="text-[11px] font-medium text-slate-400">
                    {tier.conditionLabel}
                  </div>
                  <div className="text-base font-bold text-white font-mono tabular-nums">
                    {tier.category}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-slate-800/90">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
                      Minimum
                    </div>
                    <div className="text-sm font-bold text-slate-100 font-mono tabular-nums mt-0.5 leading-snug">
                      {tier.minimumLabel}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
                      Maximum
                    </div>
                    <div className="text-sm font-bold text-emerald-300 font-mono tabular-nums mt-0.5 leading-snug">
                      {tier.maximumLabel}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Promotional & Bonus Qualifying Limits */}
      {qualifyingTiers.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Freeplay &amp; Referral Bonus Limits</span>
            </span>
            <span className="text-[11px] text-slate-400">
              Minimum qualifying balance &amp; redemption cap
            </span>
          </div>

          <div
            className={`grid gap-3 ${
              compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
            }`}
          >
            {qualifyingTiers.map((tier) => {
              const hasSplitOptions =
                Array.isArray(tier.redemptionOptions) &&
                tier.redemptionOptions.length >= 2;
              return (
                <div
                  key={tier.id}
                  className="rounded-xl border border-slate-800 bg-[#080E1D] p-4 space-y-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-slate-400">
                        {tier.conditionLabel}
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-white">
                        {tier.category}
                      </h3>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">
                        Minimum
                      </div>
                      <div className="text-base font-bold text-amber-300 font-mono tabular-nums">
                        {tier.minimumLabel}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-800/90 space-y-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
                      Maximum / Redemption Option
                    </div>

                    {hasSplitOptions ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {tier.redemptionOptions!.map((opt, idx) => (
                          <React.Fragment key={`${tier.id}_opt_${idx}`}>
                            {idx > 0 && (
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
                                OR
                              </span>
                            )}
                            <div className="flex-1 min-w-[110px] rounded-lg border border-slate-800 bg-[#0D162B] px-3 py-2">
                              <span className="text-sm font-bold text-emerald-300 font-mono tabular-nums">
                                {opt.amountLabel}
                              </span>
                              <span className="text-xs text-slate-300 ml-1.5">
                                {opt.unitLabel}
                              </span>
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm font-bold text-emerald-300 font-mono tabular-nums">
                        {tier.maximumLabel}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Excess Voiding Warning Callout */}
      <div
        role="note"
        className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 flex items-start gap-3 text-xs"
      >
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-bold text-amber-200">Excess Cashout Policy</div>
          <p className="text-amber-100/90 leading-relaxed">
            {normalized.voidExcessWarning}
          </p>
        </div>
      </div>
    </section>
  );
};
