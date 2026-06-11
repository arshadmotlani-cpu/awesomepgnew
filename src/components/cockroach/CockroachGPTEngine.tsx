'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  describeElement,
  getPageContext,
} from '@/src/lib/cockroach/pageContextBuilder';
import {
  inferUserStage,
  pickVisibleTargets,
} from '@/src/lib/cockroach/pickTargetElement';
import type { CockroachExplainResponse } from '@/src/lib/cockroach/types';

const GUIDE_INTERVAL_MS = 8000;
const HIGHLIGHT_CLASS = 'cockroach-ai-highlight';

type Props = {
  /** When false, the widget is not rendered at all. */
  enabled?: boolean;
};

export function CockroachGPTEngine({ enabled = true }: Props) {
  const [message, setMessage] = useState('Hi! I’m Roachie. I’ll show you around.');
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetIndexRef = useRef(0);
  const highlightedRef = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
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

  const explainNext = useCallback(async () => {
    if (pausedRef.current || minimizedRef.current) return;

    const targets = pickVisibleTargets();
    if (targets.length === 0) {
      setMessage('I’m looking around… try scrolling a little.');
      return;
    }

    const index = targetIndexRef.current % targets.length;
    targetIndexRef.current += 1;
    const target = targets[index]!;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/cockroach-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          pageContext: getPageContext(),
          elementContext: describeElement(target),
          userStage: inferUserStage(window.location.pathname),
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Guide unavailable');
      }

      const data = (await res.json()) as CockroachExplainResponse;
      setMessage(data.text);
      highlight(target);
      speak(data.text);
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Guide unavailable';
      setError(msg);
      setMessage('Roachie is resting right now. Try again in a bit.');
    } finally {
      setLoading(false);
    }
  }, [highlight, speak]);

  useEffect(() => {
    if (!enabled) return;

    void explainNext();
    const interval = window.setInterval(() => {
      void explainNext();
    }, GUIDE_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      abortRef.current?.abort();
      clearHighlight();
      window.speechSynthesis?.cancel();
    };
  }, [clearHighlight, enabled, explainNext]);

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
          <p className="cockroach-ai__title">Roachie · AI guide</p>
          <p className="cockroach-ai__status">
            {loading ? 'Thinking…' : paused ? 'Paused' : 'Live help'}
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
          {error ? <p className="cockroach-ai__error">{error}</p> : null}

          <div className="cockroach-ai__actions">
            <button
              type="button"
              className="cockroach-ai__btn"
              onClick={() => void explainNext()}
              disabled={loading}
            >
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
