'use client';

import { useCallback, useEffect, useState } from 'react';

type ToastTone = 'success' | 'error' | 'info';

type ToastState = {
  id: number;
  message: string;
  tone: ToastTone;
} | null;

/**
 * Lightweight Operations toast — no external deps.
 * Mount once near the rejection UI and call `showToast` after actions.
 */
export function useOperationsActionToast() {
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const toastNode = toast ? (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[120] w-[min(92vw,28rem)] -translate-x-1/2"
    >
      <div
        className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur-md ${
          toast.tone === 'success'
            ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-50'
            : toast.tone === 'error'
              ? 'border-rose-400/40 bg-rose-500/15 text-rose-50'
              : 'border-white/15 bg-[#1A1F27]/95 text-white'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <p>{toast.message}</p>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 text-xs text-white/70 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { showToast, toastNode };
}
