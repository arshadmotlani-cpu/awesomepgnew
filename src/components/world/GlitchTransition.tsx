'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

const GLITCH_MS = 400;
const SWAP_MS = 150;

type Props = {
  /** Increment to trigger a new glitch cut. */
  trigger: number;
  onSwap: () => void;
  onComplete?: () => void;
  children: React.ReactNode;
  className?: string;
};

/** ~400ms digital glitch — content swaps at ~150ms under the noise. */
export function GlitchTransition({
  trigger,
  onSwap,
  onComplete,
  children,
  className = '',
}: Props) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(false);
  const lastTrigger = useRef(trigger);
  const swapDone = useRef(false);
  const onSwapRef = useRef(onSwap);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onSwapRef.current = onSwap;
    onCompleteRef.current = onComplete;
  }, [onSwap, onComplete]);

  useEffect(() => {
    if (trigger === lastTrigger.current) return;
    lastTrigger.current = trigger;
    swapDone.current = false;

    if (reduced) {
      onSwapRef.current();
      onCompleteRef.current?.();
      return;
    }

    setActive(true);
    const swapTimer = window.setTimeout(() => {
      if (!swapDone.current) {
        swapDone.current = true;
        onSwapRef.current();
      }
    }, SWAP_MS);

    const endTimer = window.setTimeout(() => {
      setActive(false);
      onCompleteRef.current?.();
    }, GLITCH_MS);

    return () => {
      window.clearTimeout(swapTimer);
      window.clearTimeout(endTimer);
    };
  }, [trigger, reduced]);

  return (
    <div className={`room-glitch-root relative ${className}`}>
      {children}
      {active && !reduced ? (
        <div className="room-glitch-overlay pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
          <div className="room-glitch-noise absolute inset-0" />
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="room-glitch-band absolute left-0 w-full"
              style={{
                top: `${(i / 6) * 100}%`,
                height: `${100 / 6}%`,
                animationDelay: `${i * 18}ms`,
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
