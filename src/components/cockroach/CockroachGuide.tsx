'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  describeElement,
  getPageContext,
} from '@/src/lib/cockroach/pageContextBuilder';
import { guideExplanation } from '@/src/lib/cockroach/guideTips';
import { pickVisibleTargets } from '@/src/lib/cockroach/pickTargetElement';

const GUIDE_INTERVAL_MS = 8000;
const HIGHLIGHT_CLASS = 'cockroach-ai-highlight';

type Props = {
  enabled?: boolean;
};

export function CockroachGuide({ enabled = true }: Props) {
  const [message, setMessage] = useState('Hi! I’m Roachie. I’ll show you around.');
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const targetIndexRef = useRef(0);
  const highlightedRef = useRef<HTMLElement | null>(null);
  const pausedRef = useRef(paused);
  const minimizedRef = useRef(minimized);

  pausedRef.current = paused;
  minimizedRef.current = minimized;

  const clearHighlight = useCallback(() => {
    highlightedRef.current?.classList.remove(HIGHLIGHT_CLASS);
    highlightedRef.current = null;
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (muted || typeof window === 'undefined' || !window.speechSynthesis) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
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
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [clearHighlight],
  );

  const showNextTip = useCallback(() => {
    if (pausedRef.current || minimizedRef.current) return;

    const targets = pickVisibleTargets();
    if (targets.length === 0) {
      setMessage('I’m looking around… try scrolling a little.');
      return;
    }

    const index = targetIndexRef.current % targets.length;
    targetIndexRef.current += 1;
    const target = targets[index]!;

    const pageContext = getPageContext();
    const elementContext = describeElement(target);
    const text = guideExplanation({
      pageContext,
      elementContext,
      index: targetIndexRef.current,
    });

    setMessage(text);
    highlight(target);
    speak(text);
  }, [highlight, speak]);

  useEffect(() => {
    if (!enabled) return;

    showNextTip();
    const interval = window.setInterval(showNextTip, GUIDE_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      clearHighlight();
      window.speechSynthesis?.cancel();
    };
  }, [clearHighlight, enabled, showNextTip]);

  useEffect(() => {
    if (paused || minimized) {
      clearHighlight();
      window.speechSynthesis?.cancel();
    }
  }, [clearHighlight, minimized, paused]);

  if (!enabled) return null;

  return (
    <div className="cockroach-ai" data-cockroach-ignore>
      <div className="cockroach-ai__header">
        <span className="cockroach-ai__mascot" aria-hidden>
          🪳
        </span>
        <div>
          <p className="cockroach-ai__title">Roachie · site guide</p>
          <p className="cockroach-ai__status">
            {paused ? 'Paused' : 'Showing tips'}
          </p>
        </div>
        <button
          type="button"
          className="cockroach-ai__icon-btn"
          onClick={() => setMinimized((v) => !v)}
          aria-label={minimized ? 'Expand guide' : 'Minimize guide'}
        >
          {minimized ? '▲' : '▼'}
        </button>
      </div>

      {!minimized ? (
        <>
          <p className="cockroach-ai__message">{message}</p>

          <div className="cockroach-ai__actions">
            <button type="button" className="cockroach-ai__btn" onClick={showNextTip}>
              Next tip
            </button>
            <button
              type="button"
              className="cockroach-ai__btn cockroach-ai__btn--ghost"
              onClick={() => setPaused((v) => !v)}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              className="cockroach-ai__btn cockroach-ai__btn--ghost"
              onClick={() => setMuted((v) => !v)}
              aria-pressed={muted}
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
