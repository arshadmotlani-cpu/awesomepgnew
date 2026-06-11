import type { ElementContext, PageContext } from './types';

const TEXT_PREVIEW_LIMIT = 2000;
const LIST_ITEM_LIMIT = 12;

/** Serialize page context for the GPT prompt (pure — testable). */
export function formatPageContextForPrompt(ctx: PageContext): string {
  return [
    `Path: ${ctx.pathname}`,
    `Title: ${ctx.title}`,
    `Headings: ${ctx.headings.join(' · ') || '(none)'}`,
    `Buttons: ${ctx.buttons.join(' · ') || '(none)'}`,
    `Links: ${ctx.links.join(' · ') || '(none)'}`,
    `Sections on page: ${ctx.sectionCount}`,
    `Page text preview:\n${ctx.textPreview}`,
  ].join('\n');
}

/** Serialize a DOM element for the GPT prompt (pure — testable). */
export function formatElementContextForPrompt(ctx: ElementContext): string {
  return [
    `Tag: ${ctx.tag}`,
    ctx.role ? `Role: ${ctx.role}` : null,
    ctx.inputType ? `Input type: ${ctx.inputType}` : null,
    ctx.ariaLabel ? `Aria label: ${ctx.ariaLabel}` : null,
    `Visible text: ${ctx.text || '(no label)'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function trimList(values: string[], limit = LIST_ITEM_LIMIT): string[] {
  return values
    .map((v) => v.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit);
}

/** Capture what the user can see on the current page. Browser only. */
export function getPageContext(): PageContext {
  const main = document.querySelector('main') ?? document.body;

  return {
    pathname: window.location.pathname,
    title: document.title,
    headings: trimList(
      [...main.querySelectorAll('h1, h2')].map((h) => h.textContent ?? ''),
    ),
    buttons: trimList(
      [...main.querySelectorAll('button')].map(
        (b) => b.textContent ?? b.getAttribute('aria-label') ?? '',
      ),
    ),
    links: trimList(
      [...main.querySelectorAll('a[href]')].map(
        (a) => a.textContent ?? a.getAttribute('aria-label') ?? '',
      ),
    ),
    sectionCount: main.querySelectorAll('section').length,
    textPreview: (main.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, TEXT_PREVIEW_LIMIT),
  };
}

export function describeElement(el: HTMLElement): ElementContext {
  const text = (el.innerText || el.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);

  return {
    tag: el.tagName.toLowerCase(),
    text: text || el.getAttribute('placeholder') || '',
    role: el.getAttribute('role'),
    inputType: el.getAttribute('type'),
    ariaLabel: el.getAttribute('aria-label'),
  };
}
