export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
}

export const ZERO_SAFE_AREA_INSETS: SafeAreaInsets = {
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
};

export const IPHONE_11_PWA_INSETS: SafeAreaInsets = {
  top: 48,
  bottom: 34,
  left: 0,
  right: 0,
};

export const DYNAMIC_ISLAND_PWA_INSETS: SafeAreaInsets = {
  top: 59,
  bottom: 34,
  left: 0,
  right: 0,
};

export interface SafeModalBounds {
  paddingTop: number;
  paddingBottom: number;
  maxPanelHeight: number;
}

/**
 * Mirrors `.safe-modal-overlay` and `.safe-modal-panel` CSS rules in `src/index.css`:
 * - `padding-top: max(minPaddingPx, insetTop)`
 * - `padding-bottom: max(minPaddingPx, insetBottom)`
 * - `max-height: min(90dvh, calc(100dvh - paddingTop - paddingBottom - 8px))`
 */
export function computeSafeModalBounds(
  viewportHeight: number,
  insets: SafeAreaInsets,
  minPaddingPx = 12
): SafeModalBounds {
  const safeHeight = Math.max(0, viewportHeight);
  const paddingTop = Math.max(minPaddingPx, insets.top);
  const paddingBottom = Math.max(minPaddingPx, insets.bottom);
  const availableHeight = Math.max(0, safeHeight - paddingTop - paddingBottom - 8);
  const maxPanelHeight = Math.min(safeHeight * 0.9, availableHeight);

  return {
    paddingTop,
    paddingBottom,
    maxPanelHeight,
  };
}

/**
 * Mirrors `.safe-sheet-panel` in `src/index.css` for bottom sheets.
 */
export function computeSafeSheetMaxHeight(
  viewportHeight: number,
  insets: SafeAreaInsets,
  minPaddingPx = 12
): number {
  const safeHeight = Math.max(0, viewportHeight);
  const topAllowance = Math.max(minPaddingPx, insets.top);
  return Math.max(0, safeHeight - topAllowance - 8);
}

/**
 * Mirrors `.safe-toast-top` (`calc(insetTop + 4.5rem)`) for floating notification banners.
 */
export function computeSafeToastTopOffset(
  insets: SafeAreaInsets,
  navbarBasePx = 72
): number {
  return Math.max(0, insets.top) + navbarBasePx;
}

export interface SafeAreaClearanceResult {
  clearsTop: boolean;
  clearsBottom: boolean;
  topOverlapPx: number;
  bottomOverlapPx: number;
}

export function checkElementClearsSafeArea(
  rectTop: number,
  rectBottom: number,
  viewportHeight: number,
  insets: SafeAreaInsets
): SafeAreaClearanceResult {
  const topOverlapPx = Math.max(0, insets.top - rectTop);
  const maxAllowedBottom = viewportHeight - insets.bottom;
  const bottomOverlapPx = Math.max(0, rectBottom - maxAllowedBottom);

  return {
    clearsTop: topOverlapPx === 0,
    clearsBottom: bottomOverlapPx === 0,
    topOverlapPx,
    bottomOverlapPx,
  };
}
