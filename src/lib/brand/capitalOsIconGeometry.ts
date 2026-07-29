/**
 * Capital OS — ledger / growth mark — viewBox 0 0 512 512
 */

export const CAPITAL_OS_VIEWBOX = 512;

/** Rounded square frame */
export const CAPITAL_OS_FRAME = 'M96 96 H416 V416 H96 Z';

/** Three ascending bars + baseline */
export const CAPITAL_OS_BARS = [
  { x: 140, y: 320, w: 56, h: 80 },
  { x: 228, y: 260, w: 56, h: 140 },
  { x: 316, y: 200, w: 56, h: 200 },
] as const;

export const CAPITAL_OS_BASELINE = { x1: 120, y1: 400, x2: 392, y2: 400 };
