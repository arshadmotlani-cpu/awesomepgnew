const MEANINGFUL_SELECTORS = [
  '[data-roachie-focus]',
  'main a[href^="/pgs/"]',
  'main form[method="GET"]',
  'main ul.grid a',
  'main .sticky button',
  'main aside',
  'main section',
] as const;

const IGNORE_SELECTOR =
  '[data-cockroach-ignore], .roachie-widget, .roachie-recall, nav, header, footer, [aria-label="Support on WhatsApp"]';

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;

  const style = window.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
    return false;
  }

  const viewportBottom = window.innerHeight + window.scrollY;
  const viewportTop = window.scrollY;
  const elTop = rect.top + window.scrollY;
  const elBottom = rect.bottom + window.scrollY;

  return elBottom > viewportTop && elTop < viewportBottom;
}

/** Collect meaningful UI targets — skips nav, search, and generic chrome. */
export function pickVisibleTargets(): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const targets: HTMLElement[] = [];

  for (const selector of MEANINGFUL_SELECTORS) {
    for (const node of document.querySelectorAll(selector)) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.closest(IGNORE_SELECTOR)) continue;
      if (seen.has(node)) continue;
      if (!isVisible(node)) continue;
      seen.add(node);
      targets.push(node);
    }
  }

  return targets;
}
