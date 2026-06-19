'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { duration } from '@/src/lib/design-system/motion';

type Props = {
  value: number;
  durationMs?: number;
  className?: string;
  formatter?: (n: number) => string;
};

export function CountUpNumber({
  value,
  durationMs = duration.countUp * 1000,
  className = '',
  formatter = (n) => String(Math.round(n)),
}: Props) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? value : 0);
  const started = useRef(false);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    if (started.current) return;
    started.current = true;
    const start = performance.now();
    const from = 0;
    const to = value;
    let frame: number;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduceMotion]);

  useEffect(() => {
    if (!reduceMotion && started.current) setDisplay(value);
  }, [value, reduceMotion]);

  return <span className={`tabular-nums ${className}`.trim()}>{formatter(display)}</span>;
}
