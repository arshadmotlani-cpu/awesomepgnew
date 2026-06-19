/** Motion tokens — pair with prefers-reduced-motion checks in components. */

export const duration = {
  instant: 0.1,
  quick: 0.2,
  standard: 0.3,
  reveal: 0.45,
  countUp: 0.75,
} as const;

export const easing = {
  linear: 'linear',
  out: [0, 0, 0.2, 1] as const,
  inOut: [0.4, 0, 0.2, 1] as const,
  reveal: [0.22, 1.15, 0.36, 1] as const,
};

export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: duration.reveal, ease: easing.reveal },
};

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: duration.standard, ease: easing.out },
};

export function reducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
