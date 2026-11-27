export type InstallPlatform = 'ios' | 'android' | 'desktop';

export type InstallBrowser =
  | 'safari'
  | 'chrome'
  | 'edge'
  | 'samsung'
  | 'firefox'
  | 'inapp'
  | 'other';

export interface InstallEnvironment {
  isStandalone: boolean;
  platform: InstallPlatform;
  browser: InstallBrowser;
  recommendedTab: 'ios' | 'android';
  canTriggerNativePrompt: boolean;
  isInAppBrowser: boolean;
  needsOpenInSafari: boolean;
}

export const INSTALL_BANNER_DISMISS_STORAGE_KEY = 'swiftsweeps_pwa_install_banner_dismissed_at';
export const INSTALL_BANNER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Classifies platform, browser, standalone state, and recommended interactive guide tab.
 */
export function detectInstallEnvironment(params: {
  userAgent: string;
  maxTouchPoints?: number;
  displayModeStandalone?: boolean;
  navigatorStandalone?: boolean;
  hasNativePrompt?: boolean;
}): InstallEnvironment {
  const ua = (params.userAgent || '').toLowerCase();
  const isStandalone = Boolean(params.displayModeStandalone || params.navigatorStandalone);

  const isIPadOSDesktopUA =
    /macintosh/.test(ua) && typeof params.maxTouchPoints === 'number' && params.maxTouchPoints > 1;
  const isIOS = (/iphone|ipad|ipod/.test(ua) || isIPadOSDesktopUA) && !/windows phone/.test(ua);
  const isAndroid = /android/.test(ua);

  const platform: InstallPlatform = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';

  let browser: InstallBrowser = 'other';
  const isInAppWebView =
    /\b(fban|fbav|instagram|line|tiktok|bytedance|micromessenger|snapchat|twitter|gsa|wv)\b/.test(
      ua
    ) ||
    (isAndroid && /; wv\)/.test(ua));

  if (isInAppWebView) {
    browser = 'inapp';
  } else if (/samsungbrowser/.test(ua)) {
    browser = 'samsung';
  } else if (/edg|edga|edgios/.test(ua)) {
    browser = 'edge';
  } else if (/fxios|firefox/.test(ua)) {
    browser = 'firefox';
  } else if (/crios|chrome|chromium/.test(ua)) {
    browser = 'chrome';
  } else if (/safari/.test(ua)) {
    browser = 'safari';
  }

  const recommendedTab: 'ios' | 'android' = platform === 'ios' ? 'ios' : 'android';
  const canTriggerNativePrompt = Boolean(params.hasNativePrompt && !isStandalone);
  const isInAppBrowser = browser === 'inapp';
  const needsOpenInSafari = platform === 'ios' && (browser === 'inapp' || browser === 'firefox');

  return {
    isStandalone,
    platform,
    browser,
    recommendedTab,
    canTriggerNativePrompt,
    isInAppBrowser,
    needsOpenInSafari,
  };
}

export function shouldShowInstallBanner(params: {
  isStandalone: boolean;
  dismissedAtMs: number | null;
  nowMs: number;
  snoozeMs?: number;
}): boolean {
  if (params.isStandalone) return false;
  if (params.dismissedAtMs === null || !Number.isFinite(params.dismissedAtMs)) {
    return true;
  }
  const snoozeWindow = params.snoozeMs ?? INSTALL_BANNER_SNOOZE_MS;
  return params.nowMs - params.dismissedAtMs >= snoozeWindow;
}

export function getInstallPlatformLabel(platform: InstallPlatform, browser: InstallBrowser): string {
  if (platform === 'ios') {
    if (browser === 'inapp') return 'iPhone In-App Browser';
    if (browser === 'firefox') return 'iPhone Firefox';
    if (browser === 'chrome') return 'iPhone Chrome';
    if (browser === 'edge') return 'iPhone Edge';
    return 'iPhone / iPad Safari';
  }
  if (platform === 'android') {
    if (browser === 'inapp') return 'Android In-App Browser';
    if (browser === 'samsung') return 'Samsung Internet';
    if (browser === 'firefox') return 'Android Firefox';
    return 'Android Chrome';
  }
  if (browser === 'edge') return 'Desktop Edge';
  if (browser === 'chrome') return 'Desktop Chrome';
  return 'Web Browser';
}
