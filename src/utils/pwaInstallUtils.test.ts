import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTALL_BANNER_SNOOZE_MS,
  detectInstallEnvironment,
  getInstallPlatformLabel,
  shouldShowInstallBanner,
} from './pwaInstallUtils';

test('detectInstallEnvironment identifies iPhone Safari non-standalone correctly', () => {
  const env = detectInstallEnvironment({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    displayModeStandalone: false,
    navigatorStandalone: false,
    hasNativePrompt: false,
  });

  assert.equal(env.platform, 'ios');
  assert.equal(env.browser, 'safari');
  assert.equal(env.recommendedTab, 'ios');
  assert.equal(env.isStandalone, false);
  assert.equal(env.needsOpenInSafari, false);
  assert.equal(env.canTriggerNativePrompt, false);
});

test('detectInstallEnvironment flags iPhone Instagram/Facebook in-app browser to open in Safari', () => {
  const env = detectInstallEnvironment({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21C62 Instagram 315.0.0.0',
  });

  assert.equal(env.platform, 'ios');
  assert.equal(env.browser, 'inapp');
  assert.equal(env.isInAppBrowser, true);
  assert.equal(env.needsOpenInSafari, true);
  assert.equal(getInstallPlatformLabel(env.platform, env.browser), 'iPhone In-App Browser');
});

test('detectInstallEnvironment handles iPadOS desktop-class Safari UA via maxTouchPoints', () => {
  const env = detectInstallEnvironment({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    maxTouchPoints: 5,
  });

  assert.equal(env.platform, 'ios');
  assert.equal(env.browser, 'safari');
  assert.equal(env.recommendedTab, 'ios');
});

test('detectInstallEnvironment identifies Android Chrome with native prompt ready', () => {
  const env = detectInstallEnvironment({
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.80 Mobile Safari/537.36',
    hasNativePrompt: true,
  });

  assert.equal(env.platform, 'android');
  assert.equal(env.browser, 'chrome');
  assert.equal(env.recommendedTab, 'android');
  assert.equal(env.canTriggerNativePrompt, true);
  assert.equal(env.isStandalone, false);
});

test('detectInstallEnvironment recognizes Android Samsung Internet & WebView', () => {
  const samsung = detectInstallEnvironment({
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  });
  assert.equal(samsung.platform, 'android');
  assert.equal(samsung.browser, 'samsung');
  assert.equal(getInstallPlatformLabel(samsung.platform, samsung.browser), 'Samsung Internet');

  const webview = detectInstallEnvironment({
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36',
  });
  assert.equal(webview.platform, 'android');
  assert.equal(webview.browser, 'inapp');
  assert.equal(webview.isInAppBrowser, true);
});

test('standalone mode disables native prompt and hides install banner', () => {
  const env = detectInstallEnvironment({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    navigatorStandalone: true,
    hasNativePrompt: true,
  });

  assert.equal(env.isStandalone, true);
  assert.equal(env.canTriggerNativePrompt, false);
  assert.equal(
    shouldShowInstallBanner({
      isStandalone: true,
      dismissedAtMs: null,
      nowMs: 1_000_000,
    }),
    false
  );
});

test('shouldShowInstallBanner respects 7-day snooze window', () => {
  const now = 1_700_000_000_000;
  assert.equal(
    shouldShowInstallBanner({ isStandalone: false, dismissedAtMs: null, nowMs: now }),
    true
  );
  assert.equal(
    shouldShowInstallBanner({
      isStandalone: false,
      dismissedAtMs: now - (INSTALL_BANNER_SNOOZE_MS - 1000),
      nowMs: now,
    }),
    false
  );
  assert.equal(
    shouldShowInstallBanner({
      isStandalone: false,
      dismissedAtMs: now - INSTALL_BANNER_SNOOZE_MS,
      nowMs: now,
    }),
    true
  );
});
