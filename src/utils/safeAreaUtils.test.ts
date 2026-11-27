import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IPHONE_11_PWA_INSETS,
  DYNAMIC_ISLAND_PWA_INSETS,
  ZERO_SAFE_AREA_INSETS,
  computeSafeModalBounds,
  computeSafeSheetMaxHeight,
  computeSafeToastTopOffset,
  checkElementClearsSafeArea,
} from './safeAreaUtils';

test('iPhone 11 PWA safe-modal bounds clear notch (48px) and home indicator (34px)', () => {
  const viewportHeight = 896; // iPhone 11 logical height
  const bounds = computeSafeModalBounds(viewportHeight, IPHONE_11_PWA_INSETS, 12);

  assert.equal(bounds.paddingTop, 48);
  assert.equal(bounds.paddingBottom, 34);
  // 896 - 48 - 34 - 8 = 806; 90% of 896 = 806.4 -> clamped to 806
  assert.equal(bounds.maxPanelHeight, 806);

  const centeredTop = bounds.paddingTop + (viewportHeight - bounds.paddingTop - bounds.paddingBottom - bounds.maxPanelHeight) / 2;
  const centeredBottom = centeredTop + bounds.maxPanelHeight;
  const clearance = checkElementClearsSafeArea(centeredTop, centeredBottom, viewportHeight, IPHONE_11_PWA_INSETS);

  assert.equal(clearance.clearsTop, true);
  assert.equal(clearance.clearsBottom, true);
  assert.equal(clearance.topOverlapPx, 0);
  assert.equal(clearance.bottomOverlapPx, 0);
});

test('Dynamic Island PWA safe-modal bounds clear 59px top inset', () => {
  const viewportHeight = 852; // iPhone 15 Pro logical height
  const bounds = computeSafeModalBounds(viewportHeight, DYNAMIC_ISLAND_PWA_INSETS, 12);

  assert.equal(bounds.paddingTop, 59);
  assert.equal(bounds.paddingBottom, 34);
  // 852 - 59 - 34 - 8 = 751 (< 0.9 * 852 = 766.8)
  assert.equal(bounds.maxPanelHeight, 751);

  const clearance = checkElementClearsSafeArea(
    bounds.paddingTop,
    bounds.paddingTop + bounds.maxPanelHeight,
    viewportHeight,
    DYNAMIC_ISLAND_PWA_INSETS
  );
  assert.equal(clearance.clearsTop, true);
  assert.equal(clearance.clearsBottom, true);
});

test('Safari browser mode preserves standard 12px/16px modal padding and 90dvh height when insets are 0', () => {
  const viewportHeight = 896;
  const mobileBrowser = computeSafeModalBounds(viewportHeight, ZERO_SAFE_AREA_INSETS, 12);
  assert.equal(mobileBrowser.paddingTop, 12);
  assert.equal(mobileBrowser.paddingBottom, 12);
  assert.equal(mobileBrowser.maxPanelHeight, 896 * 0.9);

  const desktopBrowser = computeSafeModalBounds(900, ZERO_SAFE_AREA_INSETS, 16);
  assert.equal(desktopBrowser.paddingTop, 16);
  assert.equal(desktopBrowser.paddingBottom, 16);
  assert.equal(desktopBrowser.maxPanelHeight, 900 * 0.9);
});

test('bottom sheet max height and toast top offset clear iPhone 11 status bar', () => {
  const sheetMax = computeSafeSheetMaxHeight(896, IPHONE_11_PWA_INSETS, 12);
  assert.equal(sheetMax, 840);
  assert.equal(896 - sheetMax >= IPHONE_11_PWA_INSETS.top, true);

  const toastTop = computeSafeToastTopOffset(IPHONE_11_PWA_INSETS, 72);
  assert.equal(toastTop, 120);
  assert.equal(toastTop > IPHONE_11_PWA_INSETS.top, true);
});

test('checkElementClearsSafeArea detects notch overlap accurately', () => {
  const overlapped = checkElementClearsSafeArea(12, 860, 896, IPHONE_11_PWA_INSETS);
  assert.equal(overlapped.clearsTop, false);
  assert.equal(overlapped.topOverlapPx, 36);
  assert.equal(overlapped.clearsBottom, true);
});
