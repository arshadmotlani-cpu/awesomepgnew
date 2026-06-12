'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { COCKROACH_AI_NAME, COCKROACH_TAGLINE } from '@/src/lib/cockroach/branding';
import { MASCOT_IMAGES } from '@/src/lib/cockroach/mascotAssets';

export const ROACHIE_BRIEFING_EVENT = 'roachie:briefing';

export type RoachieBriefingDetail = {
  message: string;
  /** Auto-open the panel once per session key (defaults to pathname). */
  sessionKey?: string;
  autoOpen?: boolean;
};

function sessionStorageKey(key: string): string {
  return `roachie-briefing-dismissed:${key}`;
}

export function isBriefingDismissed(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      sessionStorage.getItem(sessionStorageKey(key)) === '1' ||
      sessionStorage.getItem(`roachie-briefing-seen:${key}`) === '1'
    );
  } catch {
    return false;
  }
}

function markBriefingDismissed(key: string): void {
  try {
    sessionStorage.setItem(sessionStorageKey(key), '1');
    sessionStorage.removeItem(`roachie-briefing-seen:${key}`);
  } catch {
    /* sessionStorage blocked — in-memory ref still applies */
  }
}

export function dispatchRoachieBriefing(detail: RoachieBriefingDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ROACHIE_BRIEFING_EVENT, { detail }));
}

/** Mount on booking / resident pages to push a one-shot briefing to RoachieRecall. */
export function RoachieBriefingTrigger({
  message,
  sessionKey,
  autoOpen = true,
}: RoachieBriefingDetail) {
  const dispatchSigRef = useRef<string | null>(null);

  useEffect(() => {
    const key = sessionKey ?? '(default)';
    const sig = `${key}::${autoOpen === false ? '0' : '1'}`;
    if (dispatchSigRef.current === sig) return;
    dispatchSigRef.current = sig;

    const dismissed = sessionKey ? isBriefingDismissed(sessionKey) : false;
    dispatchRoachieBriefing({
      message,
      sessionKey,
      autoOpen: dismissed ? false : autoOpen,
    });
  }, [message, sessionKey, autoOpen]);

  return null;
}

export function RoachieRecall() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  /** In-memory guard — close must stick even if briefing events keep firing. */
  const dismissedRef = useRef(false);

  const dismissPanel = useCallback(() => {
    dismissedRef.current = true;
    setOpen(false);
    const key = activeKeyRef.current;
    if (key) markBriefingDismissed(key);
  }, []);

  const showBriefing = useCallback((detail: RoachieBriefingDetail) => {
    const key = detail.sessionKey ?? window.location.pathname;
    activeKeyRef.current = key;
    setMessage(detail.message);

    if (dismissedRef.current || isBriefingDismissed(key)) {
      return;
    }

    if (detail.autoOpen !== false) {
      setOpen(true);
      markBriefingDismissed(key);
    }
  }, []);

  useEffect(() => {
    function onBriefing(event: Event) {
      const detail = (event as CustomEvent<RoachieBriefingDetail>).detail;
      if (!detail?.message) return;
      showBriefing(detail);
    }

    window.addEventListener(ROACHIE_BRIEFING_EVENT, onBriefing);
    return () => window.removeEventListener(ROACHIE_BRIEFING_EVENT, onBriefing);
  }, [showBriefing]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissPanel();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, dismissPanel]);

  if (!message) return null;

  return (
    <>
      <button
        type="button"
        className="roachie-recall roachie-recall__fab"
        data-cockroach-ignore
        aria-label={`Open ${COCKROACH_AI_NAME} stay guide`}
        aria-expanded={open}
        onClick={() => {
          setOpen((wasOpen) => {
            const next = !wasOpen;
            if (next) dismissedRef.current = false;
            return next;
          });
        }}
      >
        <Image
          src={MASCOT_IMAGES.welcome}
          alt=""
          width={72}
          height={72}
          quality={95}
          className="roachie-recall__mascot"
          draggable={false}
        />
      </button>

      {open ? (
        <div
          className="roachie-recall-panel"
          data-cockroach-ignore
          role="dialog"
          aria-modal="true"
          aria-label={`${COCKROACH_AI_NAME} stay guide`}
        >
          <div className="roachie-recall-panel__header">
            <Image
              src={MASCOT_IMAGES.welcome}
              alt=""
              width={48}
              height={48}
              quality={95}
              className="roachie-recall-panel__mascot"
              draggable={false}
            />
            <p className="roachie-recall-panel__title">
              {COCKROACH_AI_NAME} · {COCKROACH_TAGLINE}
            </p>
            <button
              type="button"
              className="roachie-recall-panel__close"
              aria-label="Close guide"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dismissPanel();
              }}
            >
              ×
            </button>
          </div>
          <pre className="roachie-recall-panel__body">{message}</pre>
          <button
            type="button"
            className="roachie-recall-panel__dismiss"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              dismissPanel();
            }}
          >
            Got it
          </button>
        </div>
      ) : null}
    </>
  );
}
