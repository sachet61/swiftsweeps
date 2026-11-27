import React from 'react';
import { WheelSpinResponse } from '../../types';
import {
  CheckCircle2,
  Gamepad2,
  Gift,
  PartyPopper,
  X,
} from 'lucide-react';

interface WheelSpinResultModalProps {
  isOpen: boolean;
  spinResult: WheelSpinResponse | null;
  onDone: () => void;
  onLoadFreePlay?: () => void;
}

export const WheelSpinResultModal: React.FC<WheelSpinResultModalProps> = ({
  isOpen,
  spinResult,
  onDone,
  onLoadFreePlay,
}) => {
  if (!isOpen || !spinResult) return null;

  const actualReward = Number(spinResult.actualRewardAmount ?? spinResult.spin?.rewardAmount ?? 0);
  const isWin = actualReward > 0;
  const freePlayBalance = Number(spinResult.freePlayBalance ?? 0);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wheel-spin-result-modal-title"
      data-testid="wheel-spin-result-modal"
    >
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onDone}
      />

      <div className="relative z-10 w-full max-w-md max-h-[90dvh] overflow-y-auto overflow-x-hidden rounded-2xl border border-amber-500/45 bg-[#0E1726] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4 border-b border-slate-800 bg-[#0A0F1D]">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                isWin
                  ? 'bg-amber-500/15 border-amber-500/45 text-amber-400'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300'
              }`}
            >
              {isWin ? <PartyPopper className="w-5 h-5" /> : <Gift className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3
                id="wheel-spin-result-modal-title"
                className="text-base sm:text-lg font-extrabold text-white leading-snug"
              >
                {isWin ? 'Free-Play Won!' : 'Daily Spin Complete'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onDone}
            aria-label="Close spin result modal"
            className="w-10 h-10 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 flex items-center justify-center shrink-0 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Won Amount Body */}
        <div className="p-4 sm:p-5 space-y-4">
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isWin
                ? 'bg-[#0A0F1D] border-emerald-500/40'
                : 'bg-[#0A0F1D] border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2 pb-1">
              <span className="text-xs font-medium text-slate-400">Won Amount</span>
              <span className="text-2xl font-extrabold font-mono text-amber-300 tabular-nums">
                ${actualReward.toFixed(2)}
              </span>
            </div>

            <div className="flex items-start gap-2 pt-1 text-xs text-emerald-300 leading-snug">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                {isWin
                  ? `Successfully credited $${actualReward.toFixed(2)} to your Free-Play Balance.`
                  : `No Free-Play credits were added; your Free-Play Balance is $${freePlayBalance.toFixed(2)}.`}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={onDone}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-sm transition-all shadow-lg shadow-amber-500/20"
            >
              Done
            </button>
            {freePlayBalance > 0 && onLoadFreePlay && (
              <button
                type="button"
                onClick={onLoadFreePlay}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Gamepad2 className="w-4 h-4" />
                <span>Load Free-Play (${freePlayBalance.toFixed(2)})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
