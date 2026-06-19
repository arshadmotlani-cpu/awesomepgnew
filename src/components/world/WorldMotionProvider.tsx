'use client';

import { useReducedMotion } from 'framer-motion';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type WorldScrollState = {
  scrollY: number;
  scrollProgress: number;
  reducedMotion: boolean;
  registerSection: (id: string, progress: number) => void;
  activeSection: string | null;
};

const WorldCtx = createContext<WorldScrollState>({
  scrollY: 0,
  scrollProgress: 0,
  reducedMotion: false,
  registerSection: () => {},
  activeSection: null,
});

export function WorldMotionProvider({ children }: { children: ReactNode }) {
  const prefersReduced = useReducedMotion();
  const reducedMotion = prefersReduced ?? false;
  const [scrollY, setScrollY] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [sections, setSections] = useState<Record<string, number>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const max = Math.max(
          document.documentElement.scrollHeight - window.innerHeight,
          1,
        );
        setScrollY(y);
        setScrollProgress(Math.min(1, Math.max(0, y / max)));
      });
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const registerSection = useCallback((id: string, progress: number) => {
    setSections((prev) => ({ ...prev, [id]: progress }));
  }, []);

  const activeSection = useMemo(() => {
    if (Object.keys(sections).length === 0) return null;
    let best: string | null = null;
    let bestDist = Infinity;
    for (const [id, p] of Object.entries(sections)) {
      const dist = Math.abs(p - scrollProgress);
      if (dist < bestDist) {
        bestDist = dist;
        best = id;
      }
    }
    return best;
  }, [sections, scrollProgress]);

  const value = useMemo(
    () => ({
      scrollY: reducedMotion ? 0 : scrollY,
      scrollProgress: reducedMotion ? 0 : scrollProgress,
      reducedMotion,
      registerSection,
      activeSection,
    }),
    [scrollY, scrollProgress, reducedMotion, registerSection, activeSection],
  );

  return <WorldCtx.Provider value={value}>{children}</WorldCtx.Provider>;
}

export function useWorldScroll() {
  return useContext(WorldCtx);
}
