'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
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
  return `roachie-briefing-seen:${key}`;
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
  useEffect(() => {
    dispatchRoachieBriefing({ message, sessionKey, autoOpen });
  }, [message, sessionKey, autoOpen]);

  return null;
}

export function RoachieRecall() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const showBriefing = useCallback((detail: RoachieBriefingDetail) => {
    setMessage(detail.message);
    const key = detail.sessionKey ?? window.location.pathname;
    const seen = sessionStorage.getItem(sessionStorageKey(key));
    if (detail.autoOpen !== false && !seen) {
      setOpen(true);
      sessionStorage.setItem(sessionStorageKey(key), '1');
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

  if (!message) return null;

  return (
    <>
      <button
        type="button"
        className="roachie-recall roachie-recall__fab"
        data-cockroach-ignore
        aria-label={`Open ${COCKROACH_AI_NAME} stay guide`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Image
          src={MASCOT_IMAGES.welcome}
          alt=""
          width={72}
          height={72}
          quality={95}
          className="roachie-recall__mascot"
        />
      </button>

      {open ? (
        <div className="roachie-recall-panel" data-cockroach-ignore role="dialog" aria-label={`${COCKROACH_AI_NAME} stay guide`}>
          <div className="roachie-recall-panel__header">
            <Image
              src={MASCOT_IMAGES.welcome}
              alt=""
              width={48}
              height={48}
              quality={95}
              className="roachie-recall-panel__mascot"
            />
            <p className="roachie-recall-panel__title">{COCKROACH_AI_NAME} · {COCKROACH_TAGLINE}</p>
            <button
              type="button"
              className="roachie-recall-panel__close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <pre className="roachie-recall-panel__body">{message}</pre>
          <button
            type="button"
            className="roachie-recall-panel__dismiss"
            onClick={() => setOpen(false)}
          >
            Got it
          </button>
        </div>
      ) : null}
    </>
  );
}
