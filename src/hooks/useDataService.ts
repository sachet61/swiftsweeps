import { useState, useEffect, useCallback } from 'react';
import { dataService } from '../services/dataService';
import { selfHostedAuthService } from '../services/selfHostedAuthService';
import type { AuthStatus } from '../services/authStateUtils';
import { UserProfile, UserWallet, AppConfig } from '../types';

export function useDataService() {
  const [tick, setTick] = useState(0);
  const [authSnapshot, setAuthSnapshot] = useState(() =>
    selfHostedAuthService.getSnapshot()
  );
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() =>
    dataService.getCurrentUser()
  );
  const [wallet, setWallet] = useState<UserWallet | null>(
    currentUser ? dataService.getWallet(currentUser.id) : null
  );
  const [config, setConfig] = useState<AppConfig>(dataService.getAppConfig());
  const [hydrationState, setHydrationState] = useState(() =>
    dataService.getHydrationState()
  );

  const refresh = useCallback(() => {
    setTick((prev) => prev + 1);
  }, []);

  const retryAuthSession = useCallback(() => {
    return selfHostedAuthService.bootstrapSession({ force: true });
  }, []);

  useEffect(() => {
    let active = true;

    const syncFromAuthSnapshot = (snap: ReturnType<typeof selfHostedAuthService.getSnapshot>) => {
      if (!active) return;
      setAuthSnapshot(snap);

      if (snap.status === 'authenticated' && snap.user) {
        const synced = dataService.syncAuthenticatedUser(snap.user, { hydrate: true });
        setCurrentUser(synced);
        setWallet(synced ? dataService.getWallet(synced.id) : null);
      } else {
        dataService.syncAuthenticatedUser(null);
        setCurrentUser(null);
        setWallet(null);
      }
      setHydrationState(dataService.getHydrationState());
    };

    const unsubscribe = selfHostedAuthService.subscribe(syncFromAuthSnapshot);

    // Bootstrap authoritative server session once on mount (deduplicated across StrictMode remounts).
    void selfHostedAuthService.bootstrapSession().then((snap) => {
      syncFromAuthSnapshot(snap);
    });

    const handleUpdate = (e: Event) => {
      // Do not trigger full app re-renders for background ticker updates
      const detailKey = (e as CustomEvent)?.detail?.key;
      if (detailKey === 'cashout_feed_updated') return;

      const u = dataService.getCurrentUser();
      setCurrentUser(u);
      setWallet(u ? dataService.getWallet(u.id) : null);
      setConfig(dataService.getAppConfig());
      setHydrationState(dataService.getHydrationState());
      setTick((prev) => prev + 1);
    };

    window.addEventListener('aetherpay_state_changed', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('aetherpay_state_changed', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Update whenever currentUser changes
  useEffect(() => {
    if (currentUser) {
      setWallet(dataService.getWallet(currentUser.id));
    } else {
      setWallet(null);
    }
  }, [currentUser?.id, tick]);

  const switchUser = (userId: string) => {
    dataService.setCurrentUserId(userId);
    const u = dataService.getCurrentUser();
    setCurrentUser(u);
    setWallet(u ? dataService.getWallet(u.id) : null);
    setHydrationState(dataService.getHydrationState());
  };

  const logout = useCallback(
    (reason: 'manual' | 'inactivity' | 'session_expired' = 'manual') => {
      dataService.logout(reason);
      setCurrentUser(null);
      setWallet(null);
      setHydrationState(dataService.getHydrationState());
    },
    []
  );

  const authStatus: AuthStatus = authSnapshot.status;

  return {
    currentUser,
    authStatus,
    authError: authSnapshot.errorMessage,
    authExpiredReason: authSnapshot.expiredReason,
    retryAuthSession,
    wallet,
    config,
    hydrationState,
    switchUser,
    logout,
    refresh,
    tick,
  };
}
