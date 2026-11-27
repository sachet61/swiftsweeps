import React, { useEffect, useState } from 'react';
import { dataService } from '../../services/dataService';
import { AppConfig, OfficialPartner } from '../../types';
import { getMessageLink, sortOfficialPartners } from '../../utils/officialPartnersUtils';
import { PartnerIcon, PlatformGlyph, getPlatformDisplayName } from '../../components/common/PartnerVisuals';
import { SafeFormattedText } from '../../components/common/SafeFormattedText';
import { CashoutRulesShowcase } from '../../components/common/CashoutRulesShowcase';
import {
  FileText,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  HelpCircle,
  ChevronDown,
  MessageCircle,
  ArrowRight,
} from 'lucide-react';

interface CustomerRulesProps {
  onNavigateTab: (tab: string) => void;
}

export const CustomerRules: React.FC<CustomerRulesProps> = ({ onNavigateTab }) => {
  const [config, setConfig] = useState<AppConfig>(() => dataService.getAppConfig());
  const rules = config.platformRules;
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [visiblePartners, setVisiblePartners] = useState<OfficialPartner[]>(() =>
    sortOfficialPartners(dataService.getCachedOfficialPartners().filter((p) => p.isVisible))
  );

  useEffect(() => {
    let cancelled = false;
    void dataService.fetchAppConfigFromServer().then((res) => {
      if (!cancelled && res?.success && res.config) {
        setConfig(res.config);
      }
    });
    void dataService.fetchOfficialPartners().then((res) => {
      if (!cancelled && res.success) {
        setVisiblePartners(sortOfficialPartners(res.partners.filter((p) => p.isVisible)));
      }
    });
    const onStateChanged = () => {
      if (!cancelled) {
        setConfig(dataService.getAppConfig());
      }
    };
    window.addEventListener('aetherpay_state_changed', onStateChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('aetherpay_state_changed', onStateChanged);
    };
  }, []);

  const sections = [
    {
      title: 'Deposit Guidelines & Source Verification',
      icon: ShieldCheck,
      text: rules.depositTerms,
    },
    {
      title: 'Promotional Bonuses & Wagering Qualifications',
      icon: RefreshCw,
      text: rules.bonusWageringTerms,
    },
    {
      title: 'Cashout Policy & Settlement Reserve Stages',
      icon: FileText,
      text: rules.withdrawalPolicy,
    },
    {
      title: 'Refund Eligibility & Reversal Procedures',
      icon: HelpCircle,
      text: rules.refundPolicy,
    },
    {
      title: 'Cryptocurrency Confirmations & Network Caution',
      icon: AlertTriangle,
      text: rules.cryptoRiskWarning,
    },
  ];

  const cashoutPolicyHtml = config.policies?.cashoutPolicyHtml?.trim();

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-24 md:pb-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Platform Rules, Cashout &amp; Refund Policy</h1>
      </div>

      <CashoutRulesShowcase
        rules={config.cashoutRules}
        onContactSupport={() => onNavigateTab('chat')}
      />

      {cashoutPolicyHtml && (
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900 space-y-2.5">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Additional Cashout &amp; Payout Disclosures</span>
          </h2>
          <SafeFormattedText
            content={cashoutPolicyHtml}
            className="text-xs text-slate-300 leading-relaxed space-y-2 max-w-none"
          />
        </div>
      )}

      <div className="space-y-3" role="region" aria-label="Platform Rules and Policies">
        {sections.map((sec, idx) => {
          const Icon = sec.icon;
          const isOpen = openIndex === idx;
          const headerId = `rule-accordion-btn-${idx}`;
          const panelId = `rule-accordion-panel-${idx}`;
          return (
            <div
              key={idx}
              className="rounded-2xl border border-slate-800 bg-slate-900 shadow-md overflow-hidden transition-colors hover:border-slate-700"
            >
              <h2 className="m-0">
                <button
                  id={headerId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex((prev) => (prev === idx ? null : idx))}
                  className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left text-sm font-bold text-white hover:bg-slate-800/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="leading-snug">{sec.title}</span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-indigo-300' : ''
                    }`}
                  />
                </button>
              </h2>
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                hidden={!isOpen}
                className="px-5 pb-5 pt-1 border-t border-slate-800/70"
              >
                <SafeFormattedText
                  content={sec.text}
                  className="text-xs text-slate-300 leading-relaxed pl-6 space-y-2 max-w-none"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Official Partners Directory Link */}
      <div className="p-5 rounded-2xl border border-slate-800 bg-[#0E1726] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Official Partners</span>
            </h3>
            <p className="text-sm text-slate-300 mt-0.5">
              Message our official partners anytime via verified Facebook, Instagram, or Telegram channels.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('official_partners')}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Open Official Partners</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {visiblePartners.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
            {visiblePartners.slice(0, 3).map((partner) => (
              <a
                key={partner.id}
                href={getMessageLink(partner)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] p-3 rounded-xl bg-[#0A0F1D] border border-slate-800 hover:border-amber-500/40 flex items-center justify-between gap-2.5 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <PartnerIcon
                    name={partner.name}
                    iconUrl={partner.iconUrl}
                    platform={partner.platform}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{partner.name}</div>
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <PlatformGlyph platform={partner.platform} className="w-3 h-3 shrink-0" />
                      <span>{getPlatformDisplayName(partner.platform)}</span>
                    </div>
                  </div>
                </div>
                <span className="text-xs font-semibold text-amber-400 shrink-0">Message</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-white text-sm">Privacy Policy</h3>
          <p className="text-xs text-slate-400 mt-1">Review how SwiftSweeps collects, uses, and protects your account, wallet, and support data.</p>
        </div>
        <button
          type="button"
          onClick={() => onNavigateTab('privacy')}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs whitespace-nowrap transition-colors self-start sm:self-auto"
        >
          View Privacy Policy
        </button>
      </div>

      <div className="p-5 rounded-2xl bg-indigo-950/40 border border-indigo-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
        <div>
          <div className="font-semibold text-white">Have a specific dispute or inquiry?</div>
          <div className="text-slate-300 mt-0.5">
            Our 24/7 certified compliance and customer care desk can assist with any transaction dispute.
          </div>
        </div>

        <button
          onClick={() => onNavigateTab('chat')}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs whitespace-nowrap transition-colors"
        >
          Contact Customer Care Desk
        </button>
      </div>
    </div>
  );
};
