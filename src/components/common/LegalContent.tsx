import React, { useEffect, useState } from 'react';
import { Shield, ArrowLeft, FileText } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { SafeFormattedText } from './SafeFormattedText';

interface LegalContentProps {
  onBack?: () => void;
}

export const LegalContent: React.FC<LegalContentProps> = ({ onBack }) => {
  const [customPrivacyHtml, setCustomPrivacyHtml] = useState<string>(() =>
    (dataService.getAppConfig().policies?.privacyPolicyHtml || '').trim()
  );

  useEffect(() => {
    let cancelled = false;
    void dataService.fetchAppConfigFromServer().then((res) => {
      if (!cancelled && res?.success && res.config) {
        setCustomPrivacyHtml((res.config.policies?.privacyPolicyHtml || '').trim());
      }
    });
    const onStateChanged = () => {
      if (!cancelled) {
        setCustomPrivacyHtml((dataService.getAppConfig().policies?.privacyPolicyHtml || '').trim());
      }
    };
    window.addEventListener('aetherpay_state_changed', onStateChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('aetherpay_state_changed', onStateChanged);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0F1D] text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                aria-label="Go Back"
                title="Go Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                SwiftSweeps Privacy Policy
              </h1>
              <p className="text-xs text-slate-400">
                How SwiftSweeps collects, uses, and protects your account, wallet, and support data
              </p>
            </div>
          </div>
        </div>

        {/* PRIVACY POLICY */}
        <div className="space-y-6 bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-3 text-amber-400">
            <Shield className="w-7 h-7 shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-white">Privacy Policy</h2>
              <p className="text-xs text-slate-400">Platform Data Handling &amp; Security Practices</p>
            </div>
          </div>

          <div className="space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
            <section className="space-y-2">
              <h3 className="font-bold text-white text-base">1. Overview</h3>
              <p>
                SwiftSweeps respects your privacy and handles personal data strictly to operate our gaming wallet, game account provisioning, promotional rewards, and 24/7 customer support services.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-bold text-white text-base">2. Information We Collect</h3>
              <p>Depending on the features you use, SwiftSweeps collects and stores:</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-300">
                <li><strong>Account &amp; Profile Data:</strong> Email address, display name or gamer tag, optional phone number, profile avatar image, and email verification status.</li>
                <li><strong>Wallet, Deposit &amp; Withdrawal Data:</strong> Wallet balances, transaction ledger entries, payment proof screenshots submitted for top-ups, and withdrawal payout method details.</li>
                <li><strong>Game Accounts &amp; Promotions:</strong> Linked game platform account requests/usernames, referral attribution codes and reward records, and Daily Wheel of Luck spin history.</li>
                <li><strong>Support &amp; Technical Data:</strong> Live support chat messages and uploaded attachments, optional Web Push notification subscriptions you enable, and IP or device metadata used for session protection and referral fraud prevention.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="font-bold text-white text-base">3. How We Use Your Information</h3>
              <ul className="list-disc pl-5 space-y-1 text-slate-300">
                <li>To register and authenticate your account using email/password credentials, email OTP verification, and password recovery codes.</li>
                <li>To provision game accounts, process deposits and withdrawals, credit referral and wheel rewards, and maintain accurate wallet balances.</li>
                <li>To deliver 24/7 live customer support and optional browser push alerts when enabled in your profile.</li>
                <li>To enforce platform security, prevent duplicate or self-referral abuse, and maintain server audit logs.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="font-bold text-white text-base">4. Security &amp; Data Sharing</h3>
              <p>
                Authentication sessions use secure server-issued HTTP-only cookies, and sensitive wallet, credential, and attachment records are restricted by server-side role-based access controls. We do not sell your personal information to third parties.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-bold text-white text-base">5. Support &amp; Privacy Inquiries</h3>
              <p>
                If you have questions about your account data or this privacy policy, reach our support team anytime through the 24/7 live support chat inside your SwiftSweeps portal.
              </p>
            </section>

            {customPrivacyHtml && (
              <section className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Additional Privacy Disclosures</span>
                </h3>
                <SafeFormattedText
                  content={customPrivacyHtml}
                  className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-2 max-w-none"
                />
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

