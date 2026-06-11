'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  describeElement,
  getPageContext,
} from '@/src/lib/cockroach/pageContextBuilder';
import { guideExplanation } from '@/src/lib/cockroach/guideTips';
import { pickVisibleTargets } from '@/src/lib/cockroach/pickTargetElement';

const GUIDE_INTERVAL_MS = 9000;
const HIGHLIGHT_CLASS = 'roachie-target-highlight';

type Props = {
  enabled?: boolean;
};

export function CockroachGuide({ enabled = true }: Props) {
  const [message, setMessage] = useState('Hey — I’m Roachie. I’ll point things out as you browse.');
  const [paused, setPaused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [talking, setTalking] = useState(false);

  const targetIndexRef = useRef(0);
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
    window.setTimeout(() => setTalking(false), 500);
  }, []);

  const showNextTip = useCallback(() => {
    if (pausedRef.current || dismissedRef.current) return;

    const targets = pickVisibleTargets();
    if (targets.length === 0) {
      setMessage('Scroll a bit — I’m looking for something to show you.');
      pulseTalk();
      return;
    }

    const index = targetIndexRef.current % targets.length;
    targetIndexRef.current += 1;
    const target = targets[index]!;

    setMessage(
      guideExplanation({
        pageContext: getPageContext(),
        elementContext: describeElement(target),
        index: targetIndexRef.current,
      }),
    );
    highlight(target);
    pulseTalk();
  }, [highlight, pulseTalk]);

  useEffect(() => {
    if (!enabled) return;

    const enterTimer = window.setTimeout(() => setVisible(true), 200);
    const startTimer = window.setTimeout(() => {
      if (!dismissedRef.current && !pausedRef.current) showNextTip();
    }, 700);
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
          showNextTip();
        }}
        aria-label="Open Roachie guide"
      >
        <Image src="/roachie-mascot.png" alt="" width={52} height={30} className="roachie-recall__img" />
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
          src="/roachie-mascot.png"
          alt="Roachie"
          width={92}
          height={53}
          priority
          className="roachie-widget__mascot-img"
        />
      </div>

      {paused ? (
        <div className="roachie-widget__panel">
          <p className="roachie-widget__text">Paused.</p>
          <button type="button" className="roachie-btn roachie-btn--primary" onClick={() => setPaused(false)}>
            Continue
          </button>
        </div>
      ) : (
        <div className="roachie-widget__panel">
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
        </div>
      )}
    </aside>
  );
}
