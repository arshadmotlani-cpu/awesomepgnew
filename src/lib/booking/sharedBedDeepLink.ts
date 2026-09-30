/**
 * Safe handling for ?bed= deep links on the public room page.
 * No browser APIs — safe for server and client modules.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseSharedBedQueryParam(
  raw: string | string[] | null | undefined,
): string | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const trimmed = typeof item === 'string' ? item.trim() : '';
      if (trimmed.length > 0) return trimmed;
    }
    return null;
  }
  return null;
}

export function isSharedBedUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Escape a value for use inside a CSS attribute selector (data-bed-id="…"). */
export function escapeCssAttributeSelectorValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
