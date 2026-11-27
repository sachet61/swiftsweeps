import { useCallback, useSyncExternalStore } from 'react';
import { pwaInstallService, type PWAInstallSnapshot } from '../services/pwaInstallService';

export function usePWAInstall() {
  const snapshot: PWAInstallSnapshot = useSyncExternalStore(
    pwaInstallService.subscribe,
    pwaInstallService.getSnapshot,
    pwaInstallService.getSnapshot
  );

  const triggerNativeInstall = useCallback(async () => {
    return pwaInstallService.triggerNativeInstall();
  }, []);

  const dismissBanner = useCallback(() => {
    pwaInstallService.dismissBanner();
  }, []);

  const openInstallModal = useCallback((platform?: 'ios' | 'android') => {
    pwaInstallService.openModal(platform);
  }, []);

  const closeInstallModal = useCallback(() => {
    pwaInstallService.closeModal();
  }, []);

  return {
    ...snapshot,
    triggerNativeInstall,
    dismissBanner,
    openInstallModal,
    closeInstallModal,
  };
}
