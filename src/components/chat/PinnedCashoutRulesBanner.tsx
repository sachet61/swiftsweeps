import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Pin,
  PinOff,
  RefreshCw,
  Scale,
  X,
} from 'lucide-react';
import type { SupportConversation } from '../../types';
import type { CashoutRulesConfig } from '../../utils/cashoutRulesUtils';
import {
  computeCashoutRulesVersion,
  deriveConversationPinStatus,
  formatCashoutRulesMessage,
  normalizeCashoutRulesConfig,
} from '../../utils/cashoutRulesUtils';
import { CashoutRulesShowcase } from '../common/CashoutRulesShowcase';

interface PinnedCashoutRulesBannerProps {
  conversation: SupportConversation | null | undefined;
  cashoutRules?: CashoutRulesConfig | null;
  isStaff?: boolean;
  isPinning?: boolean;
  isUnpinning?: boolean;
  pinError?: string | null;
  onPinOrUpdate?: () => void;
  onUnpin?: () => void;
  onJumpToMessage?: (messageId: string) => void;
  onOpenFullRules?: () => void;
  className?: string;
}

export const PinnedCashoutRulesBanner: React.FC<PinnedCashoutRulesBannerProps> = ({
  conversation,
  cashoutRules,
  isStaff = false,
  isPinning = false,
  isUnpinning = false,
  pinError = null,
  onPinOrUpdate,
  onUnpin,
  onJumpToMessage,
  onOpenFullRules,
  className = '',
}) => {
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const normalizedRules = normalizeCashoutRulesConfig(cashoutRules);
  const currentRulesVersion = computeCashoutRulesVersion(normalizedRules);
  const pinStatus = deriveConversationPinStatus({
    pinnedMessageId: conversation?.pinnedMessageId,
    pinnedRulesVersion: conversation?.pinnedRulesVersion,
    currentRulesVersion,
  });

  if (pinStatus === 'not_pinned' && !pinError) {
    return null;
  }

  const handleCopy = async () => {
    try {
      const text =
        conversation?.pinnedMessageText?.trim() ||
        formatCashoutRulesMessage(normalizedRules);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <>
      <div
        data-testid="pinned-cashout-rules-bar"
        className={`w-full border-b border-[#1E2942] bg-[#0D162C] shrink-0 ${className}`}
      >
        <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 min-h-[40px] py-1.5 flex items-center justify-between gap-2 text-xs">
          {/* Left: Pin indicator + concise label */}
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 min-w-0 flex-1 text-left group focus:outline-none focus-visible:underline"
          >
            {pinError ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : (
              <Pin
                className={`w-3.5 h-3.5 shrink-0 ${
                  pinStatus === 'outdated' ? 'text-amber-400' : 'text-emerald-400'
                }`}
              />
            )}
            <span className="font-semibold text-slate-100 group-hover:text-white truncate">
              {pinError
                ? `Pin Failed: ${pinError}`
                : 'Pinned: Cashout & Redemption Limits'}
            </span>
            {!pinError && pinStatus === 'outdated' && (
              <span className="hidden sm:inline text-[11px] font-medium text-amber-300 shrink-0">
                · Update available
              </span>
            )}
          </button>

          {/* Right: Compact actions */}
          <div className="flex items-center gap-2 shrink-0">
            {pinError && isStaff && onPinOrUpdate && (
              <button
                type="button"
                disabled={isPinning}
                onClick={onPinOrUpdate}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isPinning ? 'animate-spin' : ''}`} />
                <span>Retry</span>
              </button>
            )}

            {!pinError && isStaff && pinStatus === 'outdated' && onPinOrUpdate && (
              <button
                type="button"
                disabled={isPinning}
                onClick={onPinOrUpdate}
                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isPinning ? 'animate-spin' : ''}`} />
                <span>{isPinning ? 'Updating...' : 'Update Pin'}</span>
              </button>
            )}

            {pinStatus !== 'not_pinned' && (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="px-2.5 py-1 rounded-lg bg-[#131F3D] hover:bg-[#1B2B52] border border-[#263864] text-indigo-200 text-[11px] font-semibold transition-colors cursor-pointer"
              >
                View
              </button>
            )}

            {isStaff && pinStatus !== 'not_pinned' && onUnpin && (
              <button
                type="button"
                disabled={isUnpinning}
                onClick={onUnpin}
                title="Unpin cashout rules from this conversation"
                aria-label="Unpin cashout rules"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-950/40 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <PinOff className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Full Pinned Rules Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center safe-modal-overlay bg-black/80 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pinned Cashout Rules"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl rounded-2xl bg-[#0B1222] border border-slate-800 p-4 sm:p-5 shadow-2xl space-y-4 safe-modal-panel overflow-y-auto overscroll-contain"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 min-w-0">
                <Pin className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">
                    Pinned Cashout Rules
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    {conversation?.pinnedByName
                      ? `Pinned by ${conversation.pinnedByName}`
                      : 'Pinned in conversation'}
                    {conversation?.pinnedAt
                      ? ` · ${new Date(conversation.pinnedAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                aria-label="Close pinned rules modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {pinStatus === 'outdated' && (
              <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-950/35 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Platform cashout rules were updated since this message was pinned.
                </span>
                {isStaff && onPinOrUpdate && (
                  <button
                    type="button"
                    disabled={isPinning}
                    onClick={() => {
                      setShowModal(false);
                      onPinOrUpdate();
                    }}
                    className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] cursor-pointer"
                  >
                    Re-Pin Updated Rules
                  </button>
                )}
              </div>
            )}

            <CashoutRulesShowcase rules={normalizedRules} compact copyable={false} />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Rules Text</span>
                    </>
                  )}
                </button>

                {conversation?.pinnedMessageId && onJumpToMessage && (
                  <button
                    type="button"
                    onClick={() => {
                      const msgId = conversation.pinnedMessageId!;
                      setShowModal(false);
                      onJumpToMessage(msgId);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-200 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Jump to Message
                  </button>
                )}

                {onOpenFullRules && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      onOpenFullRules();
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Scale className="w-3.5 h-3.5" />
                    <span>Rules Page</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isStaff && onUnpin && (
                  <button
                    type="button"
                    disabled={isUnpinning}
                    onClick={() => {
                      setShowModal(false);
                      onUnpin();
                    }}
                    className="px-3 py-2 rounded-xl bg-rose-950/70 hover:bg-rose-900/70 border border-rose-800/70 text-rose-200 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Unpin
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
