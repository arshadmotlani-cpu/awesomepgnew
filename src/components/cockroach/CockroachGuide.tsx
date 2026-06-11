'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  describeElement,
  getPageContext,
} from '@/src/lib/cockroach/pageContextBuilder';
import {
  guideForTarget,
  ROACHIE_IDLE,
  ROACHIE_INTRO,
} from '@/src/lib/cockroach/guidePlaybook';
import { pickVisibleTargets } from '@/src/lib/cockroach/pickTargetElement';

const GUIDE_INTERVAL_MS = 12000;
const HIGHLIGHT_CLASS = 'roachie-target-highlight';
const MASCOT = '/roachie-premium.png';

type Props = {
  enabled?: boolean;
};

export function CockroachGuide({ enabled = true }: Props) {
  const [message, setMessage] = useState(ROACHIE_INTRO);
  const [paused, setPaused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [talking, setTalking] = useState(false);

  const scanRef = useRef(0);
  const highlightedRef = useRef<HTMLElement | null>(null);
  const pausedRef = useRef(paused);
  const dismissedRef = useRef(dismissed);

  pausedRef.current = paused;
  dismissedRef.current = dismissed;

  const clearHighlight = useCallback(() => {
    highlightedRef.current?.classList.remove(HIGHLIGHT_CLASS);
    highlightedRef.current = null;
  }, []);

  const highlight = useCallback(
    (el: HTMLElement) => {
      clearHighlight();
      el.classList.add(HIGHLIGHT_CLASS);
      highlightedRef.current = el;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    [clearHighlight],
  );

  const pulseTalk = useCallback(() => {
    setTalking(true);
    window.setTimeout(() => setTalking(false), 480);
  }, []);

  const showNextTip = useCallback(() => {
    if (pausedRef.current || dismissedRef.current) return;

    const targets = pickVisibleTargets();
    if (targets.length === 0) {
      setMessage(ROACHIE_IDLE);
      clearHighlight();
      pulseTalk();
      return;
    }

    const pageContext = getPageContext();
    let chosen: HTMLElement | null = null;
    let tip: string | null = null;

    for (let i = 0; i < targets.length; i += 1) {
      const idx = (scanRef.current + i) % targets.length;
      const candidate = targets[idx]!;
      const elementContext = describeElement(candidate);
      const nextTip = guideForTarget({
        element: candidate,
        pageContext,
        elementContext,
      });
      if (nextTip) {
        chosen = candidate;
        tip = nextTip;
        scanRef.current = idx + 1;
        break;
      }
    }

    if (!chosen || !tip) {
      setMessage(ROACHIE_IDLE);
      clearHighlight();
      pulseTalk();
      return;
    }

    setMessage(tip);
    highlight(chosen);
    pulseTalk();
  }, [clearHighlight, highlight, pulseTalk]);

  useEffect(() => {
    if (!enabled) return;

    const enterTimer = window.setTimeout(() => setVisible(true), 180);
    const startTimer = window.setTimeout(() => {
      if (!dismissedRef.current && !pausedRef.current) showNextTip();
    }, 1200);
    const interval = window.setInterval(showNextTip, GUIDE_INTERVAL_MS);

    return () => {
      window.clearTimeout(enterTimer);
      window.clearTimeout(startTimer);
      window.clearInterval(interval);
      clearHighlight();
    };
  }, [clearHighlight, enabled, showNextTip]);

  useEffect(() => {
    if (paused || dismissed) clearHighlight();
  }, [clearHighlight, dismissed, paused]);

  if (!enabled) return null;

  if (dismissed) {
    return (
      <button
        type="button"
        className="roachie-recall"
        data-cockroach-ignore
        onClick={() => {
          setDismissed(false);
          setVisible(true);
          setPaused(false);
          setMessage(ROACHIE_INTRO);
          showNextTip();
        }}
        aria-label="Open Roachie guide"
      >
        <Image
          src={MASCOT}
          alt=""
          width={64}
          height={35}
          quality={95}
          className="roachie-recall__img"
        />
      </button>
    );
  }

  return (
    <aside
      className={`roachie-widget ${visible ? 'roachie-widget--visible' : ''} ${talking ? 'roachie-widget--talking' : ''}`}
      data-cockroach-ignore
      aria-live="polite"
    >
      <div className="roachie-widget__mascot">
        <Image
          src={MASCOT}
          alt="Roachie — Awesome PG guide"
          width={140}
          height={76}
          quality={95}
          priority
          className="roachie-widget__mascot-img"
        />
      </div>

      <div className="roachie-widget__panel">
        <p className="roachie-widget__badge">Awesome PG · guide</p>
        {paused ? (
          <>
            <p className="roachie-widget__text">On break — tap when you want me back.</p>
            <button type="button" className="roachie-btn roachie-btn--primary" onClick={() => setPaused(false)}>
              Continue
            </button>
          </>
        ) : (
          <>
            <p className="roachie-widget__text">{message}</p>
            <div className="roachie-widget__actions">
              <button type="button" className="roachie-btn roachie-btn--primary" onClick={showNextTip}>
                Next
              </button>
              <button type="button" className="roachie-btn" onClick={() => setPaused(true)}>
                Pause
              </button>
              <button
                type="button"
                className="roachie-btn roachie-btn--icon"
                onClick={() => setDismissed(true)}
                aria-label="Close guide"
              >
                ×
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
