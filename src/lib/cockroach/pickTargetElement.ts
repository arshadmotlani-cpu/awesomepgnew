import { focusStepsForPath } from './guideFocusSteps';

const MEANINGFUL_SELECTORS = [
  '[data-roachie-focus]',
  'main form[method="GET"]',
  'main .sticky button',
  'main aside',
  'main section',
] as const;

const IGNORE_SELECTOR =
  '[data-cockroach-ignore], .roachie-widget, .roachie-tour-widget, .roachie-tour-scrim, .roachie-reminder, .roachie-recall, .roachie-peek, .roachie-spotlight-ring, nav, header, footer, [aria-label="Support on WhatsApp"]';

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

function collect(selector: string): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const targets: HTMLElement[] = [];

  for (const node of document.querySelectorAll(selector)) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest(IGNORE_SELECTOR)) continue;
    if (seen.has(node)) continue;
    if (!isVisible(node)) continue;
    seen.add(node);
    targets.push(node);
  }

  return targets;
}

function collectFocusMarkers(includeOffScreen = false): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const targets: HTMLElement[] = [];

  for (const node of document.querySelectorAll('[data-roachie-focus]')) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest(IGNORE_SELECTOR)) continue;
    if (seen.has(node)) continue;
    if (!includeOffScreen && !isVisible(node)) continue;
    seen.add(node);
    targets.push(node);
  }

  return targets;
}

/** Collect meaningful UI targets — prefers explicit focus markers. */
export function pickVisibleTargets(): HTMLElement[] {
  const marked = collectFocusMarkers(false);
  if (marked.length > 0) return marked;

  const targets: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  for (const selector of MEANINGFUL_SELECTORS) {
    if (selector === '[data-roachie-focus]') continue;
    for (const el of collect(selector)) {
      if (seen.has(el)) continue;
      seen.add(el);
      targets.push(el);
    }
  }

  return targets;
}

/** Ordered focus markers for a route — includes off-screen elements so Next always advances. */
export function pickOrderedFocusTargets(pathname: string): HTMLElement[] {
  const steps = focusStepsForPath(pathname);
  const all = collectFocusMarkers(true);
  if (all.length === 0) return pickVisibleTargets();

  if (steps.length === 0) return all;

  const ordered: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  for (const step of steps) {
    for (const el of all) {
      if (el.getAttribute('data-roachie-focus') !== step) continue;
      if (seen.has(el)) continue;
      seen.add(el);
      ordered.push(el);
    }
  }

  for (const el of all) {
    if (seen.has(el)) continue;
    seen.add(el);
    ordered.push(el);
  }

  return ordered;
}
