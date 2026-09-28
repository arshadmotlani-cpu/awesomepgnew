/**
 * Viewport placement for a menu anchored to a trigger (right-aligned, flips above).
 * Used by portaled dropdowns so overflow/scroll containers cannot clip them.
 */

export type AnchoredMenuRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export function placeAnchoredMenu(input: {
  trigger: AnchoredMenuRect;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  pad?: number;
  gap?: number;
}): { top: number; left: number } {
  const pad = input.pad ?? 8;
  const gap = input.gap ?? 4;
  const { trigger, menuWidth, menuHeight, viewportWidth, viewportHeight } = input;

  let left = trigger.right - menuWidth;
  const maxLeft = Math.max(pad, viewportWidth - pad - menuWidth);
  if (left > maxLeft) left = maxLeft;
  if (left < pad) left = pad;

  const belowTop = trigger.bottom + gap;
  const aboveTop = trigger.top - gap - menuHeight;
  const spaceBelow = viewportHeight - pad - belowTop;
  const spaceAbove = trigger.top - gap - pad;
  const openAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;

  let top = openAbove ? aboveTop : belowTop;
  const maxTop = Math.max(pad, viewportHeight - pad - menuHeight);
  if (top > maxTop) top = maxTop;
  if (top < pad) top = pad;

  return { top, left };
}
