/**
 * APG OS mark geometry — Concept 02 · Sentinel Shield
 * viewBox 0 0 512 512 · symmetric heraldic shield + geometric “A”.
 */

export const APG_OS_VIEWBOX = 512;
export const APG_OS_SHIELD_STROKE = 20;

/** Sentinel shield — enterprise, not cartoon heraldry. */
export const APG_OS_SHIELD_PATH =
  'M256 48 L416 120 L416 280 Q416 368 256 464 Q96 368 96 280 L96 120 Z';

/** Symmetric “A” with even-odd counter. */
export const APG_OS_A_PATH =
  'M256 168 L320 360 H296 L256 272 L216 360 H192 Z M224 300 H288 L256 248 Z';

/** Wider crossbar for sub-24px renders. */
export const APG_OS_A_PATH_BOLD =
  'M256 176 L312 352 H292 L256 280 L220 352 H200 Z M222 296 H290 L256 256 Z';

/** @deprecated Hex concept — use shield paths. */
export const APG_OS_HEX_PATH = APG_OS_SHIELD_PATH;
export const APG_OS_HEX_STROKE = APG_OS_SHIELD_STROKE;

export function apgOsUseBoldLetter(sizePx: number): boolean {
  return sizePx > 0 && sizePx < 24;
}
