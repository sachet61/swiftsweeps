import {
  INSTALL_BANNER_DISMISS_STORAGE_KEY,
  InstallEnvironment,
  detectInstallEnvironment,
  shouldShowInstallBanner,
} from '../utils/pwaInstallUtils';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PWAInstallSnapshot {
  isInstalled: boolean;
  hasNativePrompt: boolean;
  isPrompting: boolean;
  justInstalled: boolean;
  bannerVisible: boolean;
  modalOpen: boolean;
  modalInitialPlatform: 'ios' | 'android' | null;
  env: InstallEnvironment;
}

type Listener = () => void;

class PWAInstallService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private isInstalled = false;
  private isPrompting = false;
  private justInstalled = false;
  private modalOpen = false;
  private modalInitialPlatform: 'ios' | 'android' | null = null;
  private dismissedAtMs: number | null = null;
  private initialized = false;
  private listeners = new Set<Listener>();
  private snapshotCache: PWAInstallSnapshot | null = null;

  constructor() {
    this.init();
  }

  public init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    this.isInstalled = this.readStandaloneState();
    this.dismissedAtMs = this.readDismissedAt();

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.isInstalled = this.readStandaloneState();
      this.invalidateAndNotify();
    };

    const handleAppInstalled = () => {
      this.deferredPrompt = null;
      this.isInstalled = true;
      this.isPrompting = false;
      this.justInstalled = true;
      this.invalidateAndNotify();
    };

    const displayModeQuery = window.matchMedia?.('(display-mode: standalone)');
    const handleDisplayModeChange = () => {
      this.isInstalled = this.readStandaloneState();
      this.invalidateAndNotify();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    displayModeQuery?.addEventListener?.('change', handleDisplayModeChange);
  }

  private readStandaloneState(): boolean {
    if (typeof window === 'undefined') return false;
    const mediaMatch = Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches);
    const navStandalone = Boolean((window.navigator as unknown as { standalone?: boolean }).standalone === true);
    return mediaMatch || navStandalone;
  }

  private readDismissedAt(): number | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(INSTALL_BANNER_DISMISS_STORAGE_KEY);
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private invalidateAndNotify(): void {
    this.snapshotCache = null;
    this.listeners.forEach((listener) => listener());
  }

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): PWAInstallSnapshot => {
    if (this.snapshotCache) return this.snapshotCache;

    const ua = typeof window !== 'undefined' ? window.navigator.userAgent : '';
    const maxTouchPoints = typeof window !== 'undefined' ? window.navigator.maxTouchPoints : 0;
    const mediaMatch =
      typeof window !== 'undefined' ? Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches) : false;
    const navStandalone =
      typeof window !== 'undefined'
        ? Boolean((window.navigator as unknown as { standalone?: boolean }).standalone === true)
        : false;

    const env = detectInstallEnvironment({
      userAgent: ua,
      maxTouchPoints,
      displayModeStandalone: mediaMatch || this.isInstalled,
      navigatorStandalone: navStandalone,
      hasNativePrompt: Boolean(this.deferredPrompt),
    });

    const bannerVisible = shouldShowInstallBanner({
      isStandalone: env.isStandalone,
      dismissedAtMs: this.dismissedAtMs,
      nowMs: Date.now(),
    });

    this.snapshotCache = {
      isInstalled: env.isStandalone,
      hasNativePrompt: Boolean(this.deferredPrompt),
      isPrompting: this.isPrompting,
      justInstalled: this.justInstalled,
      bannerVisible,
      modalOpen: this.modalOpen,
      modalInitialPlatform: this.modalInitialPlatform,
      env,
    };
    return this.snapshotCache;
  };

  public openModal(platform?: 'ios' | 'android'): void {
    this.modalOpen = true;
    this.modalInitialPlatform = platform ?? null;
    this.invalidateAndNotify();
  }

  public closeModal(): void {
    if (!this.modalOpen) return;
    this.modalOpen = false;
    this.modalInitialPlatform = null;
    this.invalidateAndNotify();
  }

  public async triggerNativeInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!this.deferredPrompt) {
      return 'unavailable';
    }

    this.isPrompting = true;
    this.invalidateAndNotify();

    try {
      await this.deferredPrompt.prompt();
      const choice = await this.deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        this.deferredPrompt = null;
        this.isInstalled = true;
        this.justInstalled = true;
        this.isPrompting = false;
        this.invalidateAndNotify();
        return 'accepted';
      }
      this.isPrompting = false;
      this.invalidateAndNotify();
      return 'dismissed';
    } catch {
      this.isPrompting = false;
      this.invalidateAndNotify();
      return 'unavailable';
    }
  }

  public dismissBanner(): void {
    const now = Date.now();
    this.dismissedAtMs = now;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(INSTALL_BANNER_DISMISS_STORAGE_KEY, String(now));
      } catch {
        // Ignore storage quota errors
      }
    }
    this.invalidateAndNotify();
  }
}

export const pwaInstallService = new PWAInstallService();
