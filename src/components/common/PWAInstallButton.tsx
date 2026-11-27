import React, { useState } from 'react';
import { Bell, Check, ChevronRight, Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { webPushClient } from '../../services/webPushClient';
import { UserProfile } from '../../types';

interface PWAInstallButtonProps {
  currentUser?: UserProfile | null;
  className?: string;
  variant?: 'navbar' | 'banner' | 'compact' | 'drawer';
  showPushButton?: boolean;
  onBeforeOpenModal?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  currentUser,
  className = '',
  variant = 'navbar',
  showPushButton = true,
  onBeforeOpenModal,
}) => {
  const {
    isInstalled,
    hasNativePrompt,
    isPrompting,
    env,
    triggerNativeInstall,
    openInstallModal,
  } = usePWAInstall();

  const [pushStatus, setPushStatus] = useState<NotificationPermission>(() =>
    webPushClient.getPermission()
  );
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  const handleInstallClick = async () => {
    if (hasNativePrompt) {
      const outcome = await triggerNativeInstall();
      if (outcome !== 'accepted') {
        onBeforeOpenModal?.();
        openInstallModal(env.recommendedTab);
      }
      return;
    }

    onBeforeOpenModal?.();
    openInstallModal(env.recommendedTab);
  };

  const handleEnablePush = async () => {
    if (!currentUser) return;
    if (env.platform === 'ios' && !isInstalled) {
      onBeforeOpenModal?.();
      openInstallModal('ios');
      return;
    }

    setIsSubscribingPush(true);
    const res = await webPushClient.subscribeToPushNotifications(currentUser);
    setIsSubscribingPush(false);
    setPushStatus(webPushClient.getPermission());
    if (res.success) {
      setPushSuccess(true);
      setTimeout(() => setPushSuccess(false), 3000);
    }
  };

  const canInstall = !isInstalled;
  const canShowPush = showPushButton && !!currentUser && pushStatus !== 'granted';

  if (!canInstall && !canShowPush) {
    return null;
  }

  if (variant === 'drawer') {
    if (!canInstall) return null;
    const isIOS = env.platform === 'ios';

    return (
      <button
        type="button"
        onClick={handleInstallClick}
        disabled={isPrompting}
        data-testid="drawer-install-app"
        className={`w-full min-h-[44px] flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/12 hover:bg-amber-500/20 border border-amber-500/35 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-60 ${className}`}
      >
        <span className="flex items-center gap-3 min-w-0">
          {isIOS ? (
            <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <Download className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span className="min-w-0">
            <span className="block text-sm font-bold text-white truncate">
              {hasNativePrompt ? 'Install App (1-Tap)' : 'Install App'}
            </span>
            <span className="block text-[11px] text-amber-200/85 truncate">
              {isIOS ? 'iPhone Home Screen guide' : 'Android & Desktop quick launch'}
            </span>
          </span>
        </span>
        <ChevronRight className="w-4 h-4 text-amber-300 shrink-0" />
      </button>
    );
  }

  const isCompact = variant === 'compact';

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {canInstall && (
        <button
          type="button"
          onClick={handleInstallClick}
          disabled={isPrompting}
          data-testid="pwa-install-button"
          className={`flex items-center justify-center gap-1.5 font-semibold rounded-xl border transition-colors active:scale-95 whitespace-nowrap shrink-0 disabled:opacity-60 ${
            isCompact
              ? 'px-3 py-1.5 min-h-[36px] text-xs bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-500/35'
              : 'px-2.5 sm:px-3 min-h-[44px] sm:min-h-[36px] text-xs bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-500/35'
          }`}
          title="Install Swift Sweeps app on Android, iPhone, or Desktop"
          aria-label="Install Swift Sweeps app"
        >
          {env.platform === 'ios' ? (
            <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <Download className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
          <span className="sm:hidden">{hasNativePrompt ? 'Get App' : 'Install'}</span>
          <span className="hidden sm:inline">
            {isPrompting ? 'Installing...' : 'Install App'}
          </span>
        </button>
      )}

      {canShowPush && (
        <button
          type="button"
          onClick={handleEnablePush}
          disabled={isSubscribingPush}
          className="flex items-center gap-1.5 px-2.5 py-2 min-h-[36px] text-xs font-semibold rounded-lg bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-200 border border-indigo-700/50 transition-colors active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
          title="Enable Background Notifications to receive alerts when the browser is closed"
          aria-label="Enable Background Alerts"
        >
          {pushSuccess ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-emerald-300">Alerts On</span>
            </>
          ) : (
            <>
              <Bell className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
              <span>{isSubscribingPush ? 'Enabling...' : 'Background Alerts'}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};
