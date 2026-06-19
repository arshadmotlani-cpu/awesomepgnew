'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { useWorldScroll } from '@/src/components/world/WorldMotionProvider';
import { WORLD_DURATION, WORLD_EASE } from '@/src/components/world/worldMotion';

type Props = {
  id?: string;
  children: ReactNode;
  className?: string;
  checkpoint?: boolean;
};

export function WorldSection({ id, children, className = '', checkpoint = false }: Props) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-8%' });
  const reduced = useReducedMotion();
  const { scrollProgress, registerSection } = useWorldScroll();

  useEffect(() => {
    if (!id || !checkpoint || !ref.current) return;
    const el = ref.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      const elTop = rect.top + window.scrollY;
      const p = docH > 0 ? elTop / docH : 0;
      registerSection(id, p);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [id, checkpoint, registerSection, scrollProgress]);

  return (
    <motion.section
      ref={ref}
      id={id}
      data-world-checkpoint={checkpoint ? id : undefined}
      className={`world-section ${className}`}
      initial={reduced ? false : { opacity: 0, y: 40 }}
      animate={inView || reduced ? { opacity: 1, y: 0 } : undefined}
      transition={{
        duration: WORLD_DURATION.cinematic,
        ease: WORLD_EASE.cinematic,
      }}
    >
      {children}
    </motion.section>
  );
}
