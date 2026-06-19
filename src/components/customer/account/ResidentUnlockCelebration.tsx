'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const STORAGE_KEY = 'apg-resident-unlock-seen';

type Props = {
  customerId: string;
  residentName: string;
};

export function ResidentUnlockCelebration({ customerId, residentName }: Props) {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const key = `${STORAGE_KEY}:${customerId}`;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(key)) return;
    setVisible(true);
    window.localStorage.setItem(key, '1');
    const t = window.setTimeout(() => setVisible(false), reduceMotion ? 2000 : 4500);
    return () => window.clearTimeout(t);
  }, [customerId, reduceMotion]);

  const dismiss = useCallback(() => setVisible(false), []);

  if (!visible) return null;

  return (
    <motion.div
      role="dialog"
      aria-labelledby="unlock-title"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={dismiss}
    >
      <motion.div
        className="apg-elev-floating max-w-md rounded-2xl border border-apg-orange/40 bg-apg-deep-grey p-8 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-4xl" aria-hidden>
          🎉
        </p>
        <h2 id="unlock-title" className="mt-4 text-2xl font-semibold text-white">
          Welcome home, {residentName.split(' ')[0]}!
        </h2>
        <p className="mt-2 text-sm text-apg-silver">
          Resident Hub is unlocked — rent, wallet, requests, and your room are ready.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="apg-glow-btn mt-6 min-h-[44px] rounded-xl bg-apg-orange px-8 py-2.5 text-sm font-semibold text-white"
        >
          Enter Resident Hub
        </button>
      </motion.div>
    </motion.div>
  );
}
