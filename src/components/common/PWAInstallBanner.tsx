import React from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallBannerProps {
  className?: string;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({ className = '' }) => {
  const {
    isInstalled,
    bannerVisible,
    hasNativePrompt,
    isPrompting,
    env,
    triggerNativeInstall,
    openInstallModal,
    dismissBanner,
  } = usePWAInstall();

  if (isInstalled || !bannerVisible) {
    return null;
  }

  const handleInstallClick = async () => {
    if (hasNativePrompt) {
      const outcome = await triggerNativeInstall();
      if (outcome !== 'accepted') {
        openInstallModal(env.recommendedTab);
      }
      return;
    }
    openInstallModal(env.recommendedTab);
  };

  const isIOS = env.platform === 'ios';
  const primaryLabel = hasNativePrompt
    ? isPrompting
      ? 'Installing...'
      : 'Install App'
    : isIOS
    ? 'Add to iPhone'
    : 'Install App';

  return (
    <section
      data-testid="pwa-install-banner"
      aria-label="Install Swift Sweeps app"
      className={`rounded-2xl bg-gradient-to-r from-[#0E1726] via-[#131E33] to-[#0E1726] border border-amber-500/30 p-3.5 sm:p-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <img
          src="/apple-touch-icon-v2.png"
          alt="Swift Sweeps"
          className="w-11 h-11 rounded-xl border border-amber-500/35 shrink-0 object-cover"
        />
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white leading-snug">
            Get the Swift Sweeps App
          </h2>
          <p className="text-xs text-slate-300 leading-snug mt-0.5">
            {isIOS
              ? 'Add to your iPhone Home Screen for full-screen play and instant alerts.'
              : 'Launch faster in full-screen with 1-tap Android install and payout alerts.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 justify-end">
        <button
          type="button"
          onClick={handleInstallClick}
          disabled={isPrompting}
          data-testid="pwa-banner-install-btn"
          className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:brightness-110 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-[0.98] transition-all whitespace-nowrap disabled:opacity-60"
        >
          {isIOS ? (
            <Smartphone className="w-4 h-4 shrink-0" />
          ) : (
            <Download className="w-4 h-4 shrink-0" />
          )}
          <span>{primaryLabel}</span>
        </button>

        <button
          type="button"
          onClick={dismissBanner}
          aria-label="Dismiss install banner"
          title="Not now"
          data-testid="pwa-banner-dismiss-btn"
          className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
};
