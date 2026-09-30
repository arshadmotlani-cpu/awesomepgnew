export type SharePopoverRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type ClampSharePopoverInput = {
  triggerRect: SharePopoverRect;
  panelWidth: number;
  panelHeight: number;
  padding?: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
};

/**
 * Place a share popover below the trigger, aligned to the trigger's right edge.
 * Flips above when there is not enough space below; clamps within the viewport.
 */
export function clampSharePopoverPosition(input: ClampSharePopoverInput): { top: number; left: number } {
  const padding = input.padding ?? 12;
  const gap = input.gap ?? 8;
  const { triggerRect, panelWidth, panelHeight, viewportWidth, viewportHeight } = input;

  let top = triggerRect.bottom + gap;
  if (top + panelHeight > viewportHeight - padding) {
    top = triggerRect.top - panelHeight - gap;
  }
  top = Math.max(padding, Math.min(top, viewportHeight - panelHeight - padding));

  let left = triggerRect.right - panelWidth;
  left = Math.max(padding, Math.min(left, viewportWidth - panelWidth - padding));

  return { top, left };
}
