import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  BellRing,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { getInstallPlatformLabel } from '../../utils/pwaInstallUtils';

export type PWAInstallTab = 'android' | 'ios';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlatform?: PWAInstallTab | null;
}

const IOS_STEPS = [
  {
    id: 1,
    shortLabel: 'Tap Share',
    title: 'Tap the Share button in Safari',
    description:
      'Look at the bottom toolbar in Safari (or top-right on iPad) and tap the square icon with an upward arrow.',
  },
  {
    id: 2,
    shortLabel: 'Add to Home',
    title: 'Scroll & select "Add to Home Screen"',
    description:
      'Swipe up on the iOS Share sheet, then tap "Add to Home Screen" next to the plus-square icon.',
  },
  {
    id: 3,
    shortLabel: 'Tap Add',
    title: 'Tap "Add" and launch full-screen',
    description:
      'Tap Add in the top-right corner, then open Swift Sweeps from your Home Screen for full-screen play and instant payout alerts.',
  },
] as const;

const ANDROID_STEPS = [
  {
    id: 1,
    shortLabel: 'Open Menu',
    title: 'Tap the browser menu icon (⋮)',
    description:
      'Look at the top-right corner of Chrome or Samsung Internet and tap the three-dot menu icon.',
  },
  {
    id: 2,
    shortLabel: 'Install App',
    title: 'Select "Install app" or "Add to Home screen"',
    description:
      'In the menu list, tap Install app (or Add to Home screen on Samsung Internet / other browsers).',
  },
  {
    id: 3,
    shortLabel: 'Confirm',
    title: 'Tap "Install" to pin Swift Sweeps',
    description:
      'Confirm the prompt to add the Swift Sweeps icon to your Home Screen and App Drawer for 1-tap access.',
  },
] as const;

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  initialPlatform = null,
}) => {
  const {
    isInstalled,
    hasNativePrompt,
    isPrompting,
    justInstalled,
    env,
    triggerNativeInstall,
  } = usePWAInstall();

  const [activeTab, setActiveTab] = useState<PWAInstallTab>(
    initialPlatform ?? env.recommendedTab
  );
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [nativeOutcome, setNativeOutcome] = useState<'idle' | 'accepted' | 'dismissed' | 'unavailable'>('idle');

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialPlatform ?? env.recommendedTab);
    setStepIndex(0);
    setNativeOutcome('idle');
    setCopiedLink(false);
  }, [isOpen, initialPlatform, env.recommendedTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const platformLabel = getInstallPlatformLabel(env.platform, env.browser);
  const steps = activeTab === 'ios' ? IOS_STEPS : ANDROID_STEPS;
  const activeStep = steps[Math.min(stepIndex, steps.length - 1)];

  const handleTabChange = (tab: PWAInstallTab) => {
    setActiveTab(tab);
    setStepIndex(0);
  };

  const handleNativeInstall = async () => {
    const outcome = await triggerNativeInstall();
    setNativeOutcome(outcome);
  };

  const handleCopyLink = async () => {
    const url = typeof window !== 'undefined' ? window.location.origin : '';
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 3000);
    } catch {
      // Clipboard blocked in sandboxed environments
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center safe-modal-overlay bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
      data-testid="pwa-install-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-modal-title"
        data-testid="pwa-install-modal"
        className="w-full max-w-md bg-[#0E1628] border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl shadow-black/90 text-slate-100 flex flex-col gap-4 safe-modal-panel overflow-y-auto overscroll-contain"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/apple-touch-icon-v2.png"
              alt="Swift Sweeps"
              className="w-11 h-11 rounded-2xl border border-amber-500/40 shadow-lg shadow-amber-500/15 shrink-0 object-cover"
            />
            <div className="min-w-0">
              <h3
                id="pwa-install-modal-title"
                className="text-base font-extrabold text-white tracking-tight truncate"
              >
                Install Swift Sweeps
              </h3>
              <p className="text-xs text-slate-400 truncate">
                Detected: <span className="text-amber-300 font-medium">{platformLabel}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close install guide"
            data-testid="pwa-install-modal-close"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800/70 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Installed Confirmation */}
        {(isInstalled || justInstalled || nativeOutcome === 'accepted') && (
          <div
            data-testid="pwa-installed-confirmation"
            className="rounded-2xl bg-emerald-950/50 border border-emerald-500/40 p-4 flex items-start gap-3 text-xs text-emerald-100"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white text-sm">Swift Sweeps App Ready</div>
              <p className="text-emerald-200/90 mt-0.5 leading-relaxed">
                Look for the Swift Sweeps icon on your Home Screen or App Drawer to launch full-screen anytime.
              </p>
            </div>
          </div>
        )}

        {/* Interactive Platform Switcher */}
        <div
          role="tablist"
          aria-label="Choose device type"
          className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#080E1B] border border-slate-800"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'android'}
            data-testid="pwa-tab-android"
            onClick={() => handleTabChange('android')}
            className={`min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'android'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Android</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ios'}
            data-testid="pwa-tab-ios"
            onClick={() => handleTabChange('ios')}
            className={`min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'ios'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>iPhone &amp; iPad</span>
          </button>
        </div>

        {/* ANDROID FLOW */}
        {activeTab === 'android' && (
          <div className="space-y-3.5" data-testid="pwa-panel-android">
            {/* 1-Tap Native Chrome Install Card */}
            {hasNativePrompt && !isInstalled && (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/35 p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <div className="font-bold text-white text-sm">Instant 1-Tap Install Available</div>
                    <p className="text-slate-300 mt-0.5 leading-relaxed">
                      Install Swift Sweeps directly to your Home Screen in one tap with zero Play Store wait.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleNativeInstall}
                  disabled={isPrompting}
                  data-testid="pwa-native-install-btn"
                  className="w-full min-h-[48px] px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:brightness-110 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all active:scale-[0.99] disabled:opacity-60"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>{isPrompting ? 'Opening Browser Prompt...' : 'Install Swift Sweeps Now'}</span>
                </button>

                {nativeOutcome === 'dismissed' && (
                  <p className="text-[11px] text-amber-200/90 text-center">
                    Browser prompt was dismissed — tap above to retry or follow the quick 3-step menu below.
                  </p>
                )}
              </div>
            )}

            {/* In-App Browser Helper for Android */}
            {env.isInAppBrowser && env.platform === 'android' && (
              <div className="rounded-2xl bg-indigo-950/40 border border-indigo-500/35 p-3.5 space-y-2.5">
                <div className="flex items-start gap-2.5 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-slate-200 leading-relaxed">
                    In-app browsers (Facebook, Instagram, TikTok) hide the install button. Open this link in <strong className="text-white">Chrome</strong> to install in 1 tap.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  data-testid="pwa-copy-link-btn"
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-white flex items-center justify-center gap-2 transition-colors"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300">Link Copied! Paste in Chrome</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-amber-400" />
                      <span>Copy App Link for Chrome</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Interactive Step Selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200">
                  {hasNativePrompt ? 'Or install via browser menu:' : 'Interactive 3-Step Guide:'}
                </span>
                <span className="text-slate-400 font-mono">
                  Step {stepIndex + 1} of {steps.length}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {ANDROID_STEPS.map((step, idx) => (
                  <button
                    key={step.id}
                    type="button"
                    aria-pressed={stepIndex === idx}
                    data-testid={`android-step-${step.id}`}
                    onClick={() => setStepIndex(idx)}
                    className={`min-h-[44px] px-2 py-1.5 rounded-xl border text-left transition-colors duration-75 flex flex-col justify-center ${
                      stepIndex === idx
                        ? 'bg-amber-500/15 border-amber-400/70 text-white'
                        : 'bg-[#080E1B] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-[10px] font-mono text-amber-400 font-bold">
                      Step {step.id}
                    </span>
                    <span className="text-[11px] font-semibold truncate">{step.shortLabel}</span>
                  </button>
                ))}
              </div>

              {/* Interactive Visual Phone Mockup (Android) */}
              <div className="rounded-2xl bg-[#080E1B] border border-slate-800 p-4 space-y-3">
                <div className="rounded-xl bg-[#0F182C] border border-slate-700/80 p-3">
                  {stepIndex === 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 bg-slate-950/90 border border-slate-800 rounded-lg px-3 py-2">
                        <span className="text-[11px] font-mono text-slate-400 truncate">
                          swiftsweeps.app
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-bold text-amber-300">Tap here</span>
                          <span className="w-8 h-8 rounded-lg bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-300 shadow-md shadow-amber-500/20">
                            <MoreVertical className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {stepIndex === 1 && (
                    <div className="space-y-1.5 max-w-[230px] ml-auto bg-slate-900 border border-slate-700 rounded-xl p-2 shadow-xl">
                      <div className="px-2.5 py-1.5 rounded-lg text-[11px] text-slate-500">
                        New tab
                      </div>
                      <div className="px-2.5 py-2 rounded-lg bg-amber-500/20 border border-amber-400/80 text-white text-xs font-bold flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <Download className="w-3.5 h-3.5 text-amber-400" />
                          <span>Install app</span>
                        </span>
                        <span className="text-[10px] text-amber-300 font-mono">Tap</span>
                      </div>
                      <div className="px-2.5 py-1.5 rounded-lg text-[11px] text-slate-500">
                        Desktop site
                      </div>
                    </div>
                  )}

                  {stepIndex === 2 && (
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2.5">
                      <div className="flex items-center gap-2.5">
                        <img
                          src="/apple-touch-icon-v2.png"
                          alt=""
                          className="w-9 h-9 rounded-xl border border-amber-500/40 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white">Install Swift Sweeps?</div>
                          <div className="text-[11px] text-slate-400">Adds shortcut to Home Screen</div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <span className="px-3 py-1.5 rounded-lg text-[11px] text-slate-400">
                          Cancel
                        </span>
                        <span className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-extrabold text-[11px] shadow-md shadow-amber-500/25">
                          Install
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-sm font-bold text-white">{activeStep.title}</div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {activeStep.description}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* IPHONE & IPAD FLOW */}
        {activeTab === 'ios' && (
          <div className="space-y-3.5" data-testid="pwa-panel-ios">
            {/* In-app / Non-Safari helper */}
            {(env.needsOpenInSafari || (env.platform === 'ios' && env.browser !== 'safari')) && (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/35 p-3.5 space-y-2.5">
                <div className="flex items-start gap-2.5 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-amber-100 leading-relaxed">
                    {env.needsOpenInSafari ? (
                      <>
                        You are viewing inside an in-app browser. Copy this link and open it in <strong className="text-white">Safari</strong> to add Swift Sweeps to your Home Screen.
                      </>
                    ) : (
                      <>
                        For the smoothest Home Screen install and background push alerts on iPhone, open in <strong className="text-white">Safari</strong> (or tap the Share icon in the top-right bar).
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  data-testid="pwa-copy-link-btn"
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-xs font-bold text-white flex items-center justify-center gap-2 transition-colors"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300">Link Copied! Open Safari &amp; Paste</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-amber-400" />
                      <span>Copy Link for Safari</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Interactive Step Selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200">Interactive Safari Walkthrough:</span>
                <span className="text-slate-400 font-mono">
                  Step {stepIndex + 1} of {steps.length}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {IOS_STEPS.map((step, idx) => (
                  <button
                    key={step.id}
                    type="button"
                    aria-pressed={stepIndex === idx}
                    data-testid={`ios-step-${step.id}`}
                    onClick={() => setStepIndex(idx)}
                    className={`min-h-[44px] px-2 py-1.5 rounded-xl border text-left transition-colors duration-75 flex flex-col justify-center ${
                      stepIndex === idx
                        ? 'bg-amber-500/15 border-amber-400/70 text-white'
                        : 'bg-[#080E1B] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-[10px] font-mono text-amber-400 font-bold">
                      Step {step.id}
                    </span>
                    <span className="text-[11px] font-semibold truncate">{step.shortLabel}</span>
                  </button>
                ))}
              </div>

              {/* Interactive Visual Safari Mockup (iOS) */}
              <div className="rounded-2xl bg-[#080E1B] border border-slate-800 p-4 space-y-3">
                <div className="rounded-xl bg-[#0F182C] border border-slate-700/80 p-3">
                  {stepIndex === 0 && (
                    <div className="space-y-2.5">
                      <div className="text-[11px] text-center text-slate-400 font-medium">
                        Safari Bottom Toolbar
                      </div>
                      <div className="flex items-center justify-around bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-500">
                        <span className="text-xs">&lt;</span>
                        <span className="text-xs">&gt;</span>
                        <div className="flex flex-col items-center">
                          <span className="w-9 h-9 rounded-xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-300 shadow-md shadow-amber-500/20">
                            <Share className="w-4 h-4" />
                          </span>
                          <span className="text-[10px] font-bold text-amber-300 mt-1">Share</span>
                        </div>
                        <span className="text-xs">Bookmark</span>
                        <span className="text-xs">Tabs</span>
                      </div>
                    </div>
                  )}

                  {stepIndex === 1 && (
                    <div className="space-y-1.5 bg-slate-900 border border-slate-700 rounded-xl p-2.5">
                      <div className="px-2.5 py-1.5 rounded-lg text-[11px] text-slate-500 flex items-center justify-between">
                        <span>Copy</span>
                        <Copy className="w-3.5 h-3.5" />
                      </div>
                      <div className="px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-400/80 text-white text-xs font-bold flex items-center justify-between gap-2">
                        <span>Add to Home Screen</span>
                        <PlusSquare className="w-4 h-4 text-amber-300 shrink-0" />
                      </div>
                      <div className="px-2.5 py-1.5 rounded-lg text-[11px] text-slate-500 flex items-center justify-between">
                        <span>Add Bookmark</span>
                      </div>
                    </div>
                  )}

                  {stepIndex === 2 && (
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-xs">
                        <span className="text-slate-400">Cancel</span>
                        <span className="font-bold text-white">Add to Home Screen</span>
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-extrabold text-[11px]">
                          Add
                        </span>
                      </div>
                      <div className="flex items-center gap-3 pt-0.5">
                        <img
                          src="/apple-touch-icon-v2.png"
                          alt=""
                          className="w-10 h-10 rounded-xl border border-amber-500/40 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white">Swift Sweeps</div>
                          <div className="text-[11px] text-emerald-300 flex items-center gap-1 mt-0.5">
                            <BellRing className="w-3 h-3" />
                            <span>Unlocks full-screen &amp; iPhone alerts</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-sm font-bold text-white">{activeStep.title}</div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {activeStep.description}
                  </p>
                </div>
              </div>

              {!env.needsOpenInSafari && !(env.platform === 'ios' && env.browser !== 'safari') && (
                <button
                  type="button"
                  onClick={handleCopyLink}
                  data-testid="pwa-copy-link-btn"
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-colors"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300">Link Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-amber-400" />
                      <span>Copy App Link to Open in Safari</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step Navigation & Done Footer */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
            disabled={stepIndex === 0}
            className="min-h-[44px] px-3 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-40 flex items-center gap-1 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          {stepIndex < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
              data-testid="pwa-next-step-btn"
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-500/35 text-xs font-bold text-amber-300 flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Next Step</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              data-testid="pwa-done-btn"
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:brightness-110 text-slate-950 font-extrabold text-xs flex items-center justify-center transition-all shadow-lg shadow-amber-500/20"
            >
              Got It, Ready to Install
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export const PWAInstallModalHost: React.FC = () => {
  const { modalOpen, modalInitialPlatform, closeInstallModal } = usePWAInstall();
  return (
    <PWAInstallModal
      isOpen={modalOpen}
      onClose={closeInstallModal}
      initialPlatform={modalInitialPlatform}
    />
  );
};
