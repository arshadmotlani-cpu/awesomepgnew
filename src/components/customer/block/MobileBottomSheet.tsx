'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabelledBy?: string;
  /** Extra classes on the sheet panel (not the scrim). */
  panelClassName?: string;
};

/** Mobile-first bottom sheet — slides up from the bottom, keeps page context visible. */
export function MobileBottomSheet({
  open,
  onClose,
  children,
  ariaLabelledBy,
  panelClassName = '',
}: Props) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[99940] bg-black/45 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby={ariaLabelledBy}
            initial={reduceMotion ? false : { y: '100%' }}
            animate={{ y: 0 }}
            exit={reduceMotion ? undefined : { y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className={
              'fixed inset-x-0 bottom-0 z-[99950] flex max-h-[88vh] flex-col overflow-hidden rounded-t-[18px] border border-white/10 border-b-0 bg-[#161b22] shadow-[0_-12px_48px_rgba(0,0,0,0.4)] ' +
              panelClassName
            }
          >
            <div className="flex shrink-0 justify-center pt-2.5 pb-1" aria-hidden>
              <span className="h-1 w-10 rounded-full bg-white/25" />
            </div>
            {children}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
