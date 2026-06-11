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
const SPOTLIGHT_PAD = 10;

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type Props = {
  enabled?: boolean;
};

function measureSpotlight(el: HTMLElement | null): SpotlightRect | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return null;
  return {
    top: rect.top - SPOTLIGHT_PAD,
    left: rect.left - SPOTLIGHT_PAD,
    width: rect.width + SPOTLIGHT_PAD * 2,
    height: rect.height + SPOTLIGHT_PAD * 2,
  };
}

export function CockroachGuide({ enabled = true }: Props) {
  const [message, setMessage] = useState('Hey! I’m Roachie. Stick with me — I’ll walk you through this page.');
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [entered, setEntered] = useState(false);
  const [talking, setTalking] = useState(false);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);

  const targetIndexRef = useRef(0);
  const highlightedRef = useRef<HTMLElement | null>(null);
  const pausedRef = useRef(paused);
  const dismissedRef = useRef(dismissed);

  pausedRef.current = paused;
  dismissedRef.current = dismissed;

  const clearHighlight = useCallback(() => {
    highlightedRef.current?.classList.remove(HIGHLIGHT_CLASS);
    highlightedRef.current = null;
    setSpotlight(null);
  }, []);

  const syncSpotlight = useCallback(() => {
    setSpotlight(measureSpotlight(highlightedRef.current));
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (muted || typeof window === 'undefined' || !window.speechSynthesis) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.92;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    },
    [muted],
  );

  const highlight = useCallback(
    (el: HTMLElement) => {
      clearHighlight();
      el.classList.add(HIGHLIGHT_CLASS);
      highlightedRef.current = el;
      setSpotlight(measureSpotlight(el));
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(syncSpotlight, 400);
    },
    [clearHighlight, syncSpotlight],
  );

  const pulseTalk = useCallback(() => {
    setTalking(true);
    window.setTimeout(() => setTalking(false), 700);
  }, []);

  const showNextTip = useCallback(() => {
    if (pausedRef.current || dismissedRef.current) return;

    const targets = pickVisibleTargets();
    if (targets.length === 0) {
      setMessage('Scroll a little — I’m trying to find something to show you.');
      pulseTalk();
      return;
    }

    const index = targetIndexRef.current % targets.length;
    targetIndexRef.current += 1;
    const target = targets[index]!;

    const text = guideExplanation({
      pageContext: getPageContext(),
      elementContext: describeElement(target),
      index: targetIndexRef.current,
    });

    setMessage(text);
    highlight(target);
    pulseTalk();
    speak(text);
  }, [highlight, pulseTalk, speak]);

  useEffect(() => {
    if (!enabled) return;
    const enterTimer = window.setTimeout(() => setEntered(true), 350);
    const startTimer = window.setTimeout(() => {
      if (!dismissedRef.current && !pausedRef.current) showNextTip();
    }, 900);

    const interval = window.setInterval(showNextTip, GUIDE_INTERVAL_MS);

    return () => {
      window.clearTimeout(enterTimer);
      window.clearTimeout(startTimer);
      window.clearInterval(interval);
      clearHighlight();
      window.speechSynthesis?.cancel();
    };
  }, [clearHighlight, enabled, showNextTip]);

  useEffect(() => {
    if (paused || dismissed) {
      clearHighlight();
      window.speechSynthesis?.cancel();
    }
  }, [clearHighlight, dismissed, paused]);

  useEffect(() => {
    if (!spotlight || paused || dismissed) return;

    const onMove = () => syncSpotlight();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [dismissed, paused, spotlight, syncSpotlight]);

  if (!enabled) return null;

  const showStage = entered && !dismissed;

  return (
    <div className="roachie-guide" data-cockroach-ignore aria-live="polite">
      {showStage && !paused ? (
        <>
          {spotlight ? (
            <div
              className="roachie-spotlight"
              style={{
                top: spotlight.top,
                left: spotlight.left,
                width: spotlight.width,
                height: spotlight.height,
              }}
            >
              <span className="roachie-spotlight__ring" aria-hidden />
            </div>
          ) : (
            <div className="roachie-backdrop" aria-hidden />
          )}
        </>
      ) : null}

      {showStage && !paused ? (
        <div className={`roachie-stage ${talking ? 'roachie-stage--talking' : ''}`}>
          <div className="roachie-speech">
            <p className="roachie-speech__label">Roachie says</p>
            <p className="roachie-speech__text">{message}</p>
            <div className="roachie-speech__actions">
              <button type="button" className="roachie-btn roachie-btn--primary" onClick={showNextTip}>
                Next
              </button>
              <button
                type="button"
                className="roachie-btn"
                onClick={() => setPaused((v) => !v)}
              >
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                className="roachie-btn"
                onClick={() => setMuted((v) => !v)}
                aria-pressed={!muted}
              >
                {muted ? 'Voice off' : 'Voice on'}
              </button>
              <button
                type="button"
                className="roachie-btn roachie-btn--ghost"
                onClick={() => setDismissed(true)}
              >
                Bye Roachie
              </button>
            </div>
          </div>

          <div className={`roachie-character ${talking ? 'roachie-character--talking' : ''}`}>
            <div className="roachie-character__badge">
              <Image
                src="/roachie-mascot.png"
                alt="Roachie the guide"
                width={220}
                height={127}
                priority
                className="roachie-character__img"
              />
            </div>
          </div>
        </div>
      ) : null}

      {dismissed ? (
        <button
          type="button"
          className="roachie-recall"
          onClick={() => {
            setDismissed(false);
            setEntered(true);
            showNextTip();
          }}
          aria-label="Bring Roachie back"
        >
          <Image src="/roachie-mascot.png" alt="" width={56} height={32} className="roachie-recall__img" />
        </button>
      ) : null}

      {showStage && paused ? (
        <div className="roachie-paused-banner">
          <p>Roachie is waiting.</p>
          <button type="button" className="roachie-btn roachie-btn--primary" onClick={() => setPaused(false)}>
            Continue tour
          </button>
        </div>
      ) : null}
    </div>
  );
}
