import React, { useState, useEffect, useRef } from 'react';
import { INACTIVITY_TIMEOUT_MS } from '../../services/authSessionService';
import { Clock, CheckCircle2 } from 'lucide-react';

interface SessionTimeoutWarningModalProps {
  onLogout: (reason: string) => void;
}

export const SessionTimeoutWarningModal: React.FC<SessionTimeoutWarningModalProps> = ({ onLogout }) => {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(120);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    // If indefinite session is active, no timer is needed
    if (INACTIVITY_TIMEOUT_MS > 24 * 60 * 60 * 1000) {
      return;
    }

    lastActivityRef.current = Date.now();

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      setShowWarning(false);
    };

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });

    const interval = setInterval(() => {
      const remainingMs = Math.max(0, INACTIVITY_TIMEOUT_MS - (Date.now() - lastActivityRef.current));
      if (remainingMs <= 0) {
        setShowWarning(false);
        onLogout('inactivity');
      } else if (remainingMs <= 120000) {
        setShowWarning(true);
        setSecondsRemaining(Math.ceil(remainingMs / 1000));
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, [onLogout]);

  if (!showWarning) return null;

  const handleStayActive = () => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center safe-modal-overlay">
      <div className="bg-slate-900 border border-amber-600/60 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 safe-modal-panel overflow-y-auto overscroll-contain animate-in fade-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto">
          <Clock className="w-6 h-6 animate-pulse" />
        </div>

        <div className="text-center space-y-1">
          <h3 className="text-base font-bold text-white">Inactivity Warning</h3>
          <p className="text-xs text-slate-300">
            For security, your session will automatically lock in:
          </p>
          <div className="text-2xl font-black font-mono text-amber-400 py-1">
            {Math.floor(secondsRemaining / 60)}:
            {(secondsRemaining % 60).toString().padStart(2, '0')}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleStayActive}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Stay Signed In</span>
          </button>
          <button
            type="button"
            onClick={() => onLogout('manual')}
            className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
};
