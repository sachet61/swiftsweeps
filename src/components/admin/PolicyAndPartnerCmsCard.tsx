import React, { useState, useEffect, useRef } from 'react';
import { dataService } from '../../services/dataService';
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Save,
  Eye,
  Edit3,
  Loader2,
} from 'lucide-react';
import { htmlToPlainEditorText, plainEditorTextToHtml } from '../../utils/uiCopyUtils';
import { SafeFormattedText } from '../common/SafeFormattedText';

export const PolicyAndPartnerCmsCard: React.FC = () => {
  const initial = dataService.getCmsPolicies();
  const hasEditedRef = useRef(false);

  const [activeTab, setActiveTab] = useState<'cashout' | 'privacy' | 'terms'>('cashout');
  const [cashoutPolicyText, setCashoutPolicyText] = useState(() =>
    htmlToPlainEditorText(initial.cashoutPolicyHtml)
  );
  const [privacyPolicyText, setPrivacyPolicyText] = useState(() =>
    htmlToPlainEditorText(initial.privacyPolicyHtml)
  );
  const [termsPolicyText, setTermsPolicyText] = useState(() =>
    htmlToPlainEditorText(initial.termsPolicyHtml)
  );
  const [previewMode, setPreviewMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const onStateChanged = (e: Event) => {
      const key = (e as CustomEvent)?.detail?.key;
      if ((key === 'initial_compact_load' || key === 'aetherpay_config') && !hasEditedRef.current) {
        const hydrated = dataService.getCmsPolicies();
        setCashoutPolicyText(htmlToPlainEditorText(hydrated.cashoutPolicyHtml));
        setPrivacyPolicyText(htmlToPlainEditorText(hydrated.privacyPolicyHtml));
        setTermsPolicyText(htmlToPlainEditorText(hydrated.termsPolicyHtml));
      }
    };
    window.addEventListener('aetherpay_state_changed', onStateChanged);
    return () => window.removeEventListener('aetherpay_state_changed', onStateChanged);
  }, []);

  const handleSaveAll = async () => {
    setIsSaving(true);
    setFeedback(null);
    const res = await dataService.updateCmsPoliciesAsync({
      cashoutPolicyHtml: plainEditorTextToHtml(cashoutPolicyText),
      privacyPolicyHtml: plainEditorTextToHtml(privacyPolicyText),
      termsPolicyHtml: plainEditorTextToHtml(termsPolicyText),
    });
    setIsSaving(false);
    if (res.success) {
      hasEditedRef.current = false;
      setFeedback({ type: 'success', text: res.message });
      setTimeout(() => setFeedback(null), 4000);
    } else {
      setFeedback({ type: 'error', text: res.message || 'Failed to save policy settings.' });
    }
  };

  return (
    <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold shadow-inner">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Platform Policies CMS</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Customize Cashout Policy, Privacy Disclosures, and Terms of Service.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={isSaving}
          onClick={() => void handleSaveAll()}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 self-start sm:self-auto"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{isSaving ? 'Saving Policies...' : 'Save Policies CMS'}</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
              : 'bg-rose-950/80 border-rose-700 text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('cashout')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              activeTab === 'cashout' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Cashout Policy
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              activeTab === 'privacy' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              activeTab === 'terms' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Terms &amp; Rules
          </button>
        </div>

        <button
          type="button"
          onClick={() => setPreviewMode(!previewMode)}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-slate-950 border border-slate-800"
        >
          {previewMode ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span>{previewMode ? 'Edit Content' : 'Preview'}</span>
        </button>
      </div>

      {/* Cashout Policy Tab */}
      {activeTab === 'cashout' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Cashout &amp; Withdrawal Policy Content</span>
            <span className="text-[11px] text-slate-500">Supports **bold** and - bullet lists</span>
          </div>

          {previewMode ? (
            <SafeFormattedText
              content={plainEditorTextToHtml(cashoutPolicyText)}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 space-y-2 leading-relaxed min-h-[160px] max-w-none"
            />
          ) : (
            <textarea
              rows={8}
              value={cashoutPolicyText}
              onChange={(e) => {
                hasEditedRef.current = true;
                setCashoutPolicyText(e.target.value);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-amber-500"
              placeholder="Enter cashout policy details..."
            />
          )}
        </div>
      )}

      {/* Privacy Policy Tab */}
      {activeTab === 'privacy' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Privacy Policy &amp; Player Disclosures</span>
            <span className="text-[11px] text-slate-500">Supports **bold** and - bullet lists</span>
          </div>

          {previewMode ? (
            <SafeFormattedText
              content={plainEditorTextToHtml(privacyPolicyText)}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 space-y-2 leading-relaxed min-h-[160px] max-w-none"
            />
          ) : (
            <textarea
              rows={8}
              value={privacyPolicyText}
              onChange={(e) => {
                hasEditedRef.current = true;
                setPrivacyPolicyText(e.target.value);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-amber-500"
              placeholder="Enter privacy policy details..."
            />
          )}
        </div>
      )}

      {/* Terms & Rules Tab */}
      {activeTab === 'terms' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Terms of Service &amp; Fair Gaming Rules</span>
            <span className="text-[11px] text-slate-500">Supports **bold** and - bullet lists</span>
          </div>

          {previewMode ? (
            <SafeFormattedText
              content={plainEditorTextToHtml(termsPolicyText)}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 space-y-2 leading-relaxed min-h-[160px] max-w-none"
            />
          ) : (
            <textarea
              rows={8}
              value={termsPolicyText}
              onChange={(e) => {
                hasEditedRef.current = true;
                setTermsPolicyText(e.target.value);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-amber-500"
              placeholder="Enter terms and rules details..."
            />
          )}
        </div>
      )}
    </div>
  );
};
