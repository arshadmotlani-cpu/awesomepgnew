'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabelledBy?: string;
  panelClassName?: string;
};

const OVERLAY_Z = 99990;
const PANEL_Z = 99999;

/** Focus-trapped overlay sheet — portaled to body so it never renders off-screen. */
export function MobileBottomSheet({
  open,
  onClose,
  children,
  ariaLabelledBy,
  panelClassName = '',
}: Props) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(true);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(max-width: 639px)');
    const sync = () => setMobileSheet(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const focusTimer = window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      window.cancelAnimationFrame(focusTimer);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 bg-black/50"
            style={{ zIndex: OVERLAY_Z }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal
            aria-labelledby={ariaLabelledBy}
            tabIndex={-1}
            initial={
              reduceMotion
                ? false
                : mobileSheet
                  ? { y: '100%', opacity: 0.98 }
                  : { y: 20, opacity: 0 }
            }
            animate={{ y: 0, opacity: 1 }}
            exit={
              reduceMotion
                ? undefined
                : mobileSheet
                  ? { y: '100%', opacity: 0.98 }
                  : { y: 20, opacity: 0 }
            }
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className={
              'fixed inset-x-0 bottom-0 flex max-h-[min(88vh,100dvh)] flex-col overflow-hidden rounded-t-[18px] border border-white/10 border-b-0 bg-[#161b22] shadow-[0_-12px_48px_rgba(0,0,0,0.45)] outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(85vh,720px)] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[18px] sm:border-b ' +
              panelClassName
            }
            style={{ zIndex: PANEL_Z }}
          >
            <div className="flex shrink-0 justify-center pt-2.5 pb-1 sm:hidden" aria-hidden>
              <span className="h-1 w-10 rounded-full bg-white/25" />
            </div>
            {children}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
