/**
 * When the App Router soft-navigation stalls (stale chunks, RSC errors), same-origin
 * link clicks can appear dead. These helpers schedule a hard navigation fallback.
 */

export const CLIENT_NAV_FALLBACK_MS = 2_000;

export function isPrimaryUnmodifiedClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented
  );
}

export function resolveSameOriginNavHref(
  anchor: HTMLAnchorElement,
  origin: string,
): string | null {
  const raw = anchor.getAttribute('href');
  if (!raw || raw.startsWith('#')) return null;
  if (anchor.target === '_blank' || anchor.hasAttribute('download')) return null;

  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }

  if (url.origin !== origin) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function currentDocumentHref(pathname: string, search: string, hash: string): string {
  return `${pathname}${search}${hash}`;
}

export function shouldScheduleClientNavFallback(input: {
  event: MouseEvent;
  anchor: HTMLAnchorElement;
  origin: string;
  currentHref: string;
}): string | null {
  if (!isPrimaryUnmodifiedClick(input.event)) return null;
  const dest = resolveSameOriginNavHref(input.anchor, input.origin);
  if (!dest || dest === input.currentHref) return null;
  return dest;
}
