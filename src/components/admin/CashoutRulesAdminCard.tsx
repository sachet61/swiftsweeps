import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, RotateCcw, Save, Scale } from 'lucide-react';
import type {
  CashoutRuleCategory,
  CashoutRulesConfig,
} from '../../utils/cashoutRulesUtils';
import {
  cloneDefaultCashoutRulesConfig,
  computeCashoutRulesVersion,
  normalizeCashoutRulesConfig,
} from '../../utils/cashoutRulesUtils';
import { CashoutRulesShowcase } from '../common/CashoutRulesShowcase';

interface CashoutRulesAdminCardProps {
  value?: CashoutRulesConfig | null;
  onChange: (next: CashoutRulesConfig) => void;
  onSave: () => Promise<void> | void;
  isSaving: boolean;
}

export const CashoutRulesAdminCard: React.FC<CashoutRulesAdminCardProps> = ({
  value,
  onChange,
  onSave,
  isSaving,
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const rules = normalizeCashoutRulesConfig(value);
  const versionTag = computeCashoutRulesVersion(rules);

  const updateCategory = (
    idx: number,
    updater: (cat: CashoutRuleCategory) => CashoutRuleCategory,
  ) => {
    const nextCategories = rules.categories.map((cat, i) =>
      i === idx ? updater(cat) : cat,
    );
    onChange({
      ...rules,
      categories: nextCategories,
    });
  };

  const handleResetDefaults = () => {
    onChange(cloneDefaultCashoutRulesConfig());
  };

  return (
    <div
      data-testid="admin-cashout-rules-card"
      className="p-6 rounded-2xl border border-slate-800 bg-slate-900 shadow-md space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Scale className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Cashout &amp; Redemption Rules</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Single source of truth rendered on Customer Rules, Top-Up, Cashout, and pinned chat cards.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono text-slate-400 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
            {versionTag}
          </span>
          <button
            type="button"
            onClick={() => setShowPreview((prev) => !prev)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showPreview ? 'Hide Preview' : 'Preview UI'}</span>
          </button>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* Global Title, Subtitle, Enabled, & Excess Warning */}
      <div className="space-y-3 text-xs">
        <label className="flex items-center gap-2.5 text-slate-200 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rules.enabled}
            onChange={(e) => onChange({ ...rules, enabled: e.target.checked })}
            className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-amber-500"
          />
          <span className="font-semibold">Display Structured Cashout Schedule to Customers</span>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-slate-400 text-[11px]">Schedule Heading</label>
            <input
              type="text"
              value={rules.title}
              onChange={(e) => onChange({ ...rules, title: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-slate-400 text-[11px]">Excess Balance Voiding Warning</label>
            <input
              type="text"
              value={rules.voidExcessWarning}
              onChange={(e) => onChange({ ...rules, voidExcessWarning: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-amber-200 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-slate-400 text-[11px]">Schedule Subtitle</label>
          <input
            type="text"
            value={rules.subtitle}
            onChange={(e) => onChange({ ...rules, subtitle: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Category Rows */}
      <div className="space-y-3">
        {rules.categories.map((cat, idx) => {
          const hasSplitOptions =
            Array.isArray(cat.redemptionOptions) && cat.redemptionOptions.length >= 2;
          return (
            <div
              key={cat.id}
              className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white">
                  Tier {idx + 1}: {cat.category}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {cat.kind === 'deposit_range' ? 'Deposit range' : 'Minimum qualifying'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Category</label>
                  <input
                    type="text"
                    value={cat.category}
                    onChange={(e) =>
                      updateCategory(idx, (prev) => ({ ...prev, category: e.target.value }))
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Condition</label>
                  <input
                    type="text"
                    value={cat.conditionLabel}
                    onChange={(e) =>
                      updateCategory(idx, (prev) => ({
                        ...prev,
                        conditionLabel: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Minimum</label>
                  <input
                    type="text"
                    value={cat.minimumLabel}
                    onChange={(e) =>
                      updateCategory(idx, (prev) => ({
                        ...prev,
                        minimumLabel: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Maximum / Redemption</label>
                  <input
                    type="text"
                    value={cat.maximumLabel}
                    onChange={(e) =>
                      updateCategory(idx, (prev) => ({
                        ...prev,
                        maximumLabel: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-emerald-300 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {hasSplitOptions && cat.redemptionOptions && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800/80">
                  {cat.redemptionOptions.map((opt, optIdx) => (
                    <div
                      key={`${cat.id}_opt_${optIdx}`}
                      className="grid grid-cols-2 gap-2"
                    >
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400">
                          Option {optIdx + 1} Amount
                        </label>
                        <input
                          type="text"
                          value={opt.amountLabel}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateCategory(idx, (prev) => {
                              const nextOpts = (prev.redemptionOptions ?? []).map((o, j) =>
                                j === optIdx ? { ...o, amountLabel: val } : o,
                              );
                              return {
                                ...prev,
                                redemptionOptions: nextOpts,
                                maximumLabel: nextOpts
                                  .map((o) => `${o.amountLabel} ${o.unitLabel}`.trim())
                                  .join(' OR '),
                              };
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-emerald-300 font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400">
                          Option {optIdx + 1} Type
                        </label>
                        <input
                          type="text"
                          value={opt.unitLabel}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateCategory(idx, (prev) => {
                              const nextOpts = (prev.redemptionOptions ?? []).map((o, j) =>
                                j === optIdx ? { ...o, unitLabel: val } : o,
                              );
                              return {
                                ...prev,
                                redemptionOptions: nextOpts,
                                maximumLabel: nextOpts
                                  .map((o) => `${o.amountLabel} ${o.unitLabel}`.trim())
                                  .join(' OR '),
                              };
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showPreview && (
        <div className="pt-2">
          <CashoutRulesShowcase rules={rules} compact copyable={false} />
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
        <p className="text-[11px] text-slate-400">
          Saving updated rules marks existing customer chat pins as Update Available until re-pinned.
        </p>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void onSave()}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-md shadow-amber-500/20 cursor-pointer"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{isSaving ? 'Saving Cashout Rules...' : 'Save Cashout Rules'}</span>
        </button>
      </div>
    </div>
  );
};
