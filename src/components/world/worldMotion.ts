/** Cinematic motion tokens — presentation layer only. */
export const WORLD_EASE = {
  cinematic: [0.22, 1, 0.36, 1] as const,
  reveal: [0.22, 1.15, 0.36, 1] as const,
  snap: [0.4, 0, 0.2, 1] as const,
  float: [0.45, 0, 0.55, 1] as const,
};

export const WORLD_DURATION = {
  instant: 0.1,
  quick: 0.2,
  standard: 0.35,
  reveal: 0.55,
  cinematic: 0.85,
} as const;

/** Depth layers: 0 = far background, 1 = floating mid, 2 = focus foreground */
export type WorldDepth = 0 | 1 | 2;

export const DEPTH_PARALLAX_FACTOR: Record<WorldDepth, number> = {
  0: 0.04,
  1: 0.12,
  2: 0.22,
};

export const DEPTH_Z_INDEX: Record<WorldDepth, number> = {
  0: 0,
  1: 10,
  2: 20,
};
