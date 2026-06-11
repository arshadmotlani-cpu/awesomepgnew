import type { ElementContext, PageContext } from './types';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/lib/dateDefaults';

const FOCUS_TIPS: Record<string, string> = {
  'stay-dates': `Planning to stay long-term? Pick Living here — you only set a move-in date. Leave anytime with ${VACATING_NOTICE_MIN_DAYS} days notice from your resident dashboard.`,
  'pg-card': 'Open a PG only after you check gender policy and live bed count — we book exact beds, not just rooms.',
  'room-pick': 'Tap a room when the free-bed count looks right. Inside, you choose the exact bed — not just a room number.',
  'bed-pick': 'Green beds are yours to claim for your dates. You can grab more than one if you’re booking for friends.',
  'confirm-booking': 'Your deposit is refundable. Living-here stays bill monthly after move-in — no fixed checkout date needed upfront.',
  vacating: `When you plan to move out, submit vacating here at least ${VACATING_NOTICE_MIN_DAYS} days before your last day to protect your deposit refund.`,
  'ps4-service':
    'PS4 gaming maintenance is a separate add-on from rent — weekly ₹350, bi-weekly ₹550, or monthly ₹750. Subscribe here, pay via UPI, and lounge access activates automatically.',
  'pay-rent': 'Pay rent from here before the 5th to avoid late fees. Electricity is billed separately when your PG uses meter split.',
};

const BORING_LABEL =
  /^(browse|bookings|profile|sign out|log in|login|search|next|pause|continue|update dates|discover)$/i;

function textOf(el: HTMLElement, ctx: ElementContext): string {
  return (ctx.text || el.getAttribute('aria-label') || '').trim();
}

function isBoringElement(el: HTMLElement, ctx: ElementContext): boolean {
  if (el.closest('nav, header, footer')) return true;
  if (el.matches('input[type="search"], input[type="search"] *')) return true;
  const text = textOf(el, ctx);
  if (!text || text.length < 2) return true;
  if (BORING_LABEL.test(text)) return true;
  if (text.length < 4 && !el.dataset.roachieFocus) return true;
  return false;
}

function tipForPgCard(ctx: ElementContext): string {
  const t = ctx.text.toLowerCase();
  if (t.includes('fully occupied') || t.includes('no beds')) {
    return 'This PG is full right now — try another property or different move-in dates.';
  }
  if (t.includes('female') || t.includes('women')) {
    return 'Women-only PG — double-check the gender badge matches who you’re booking for.';
  }
  return FOCUS_TIPS['pg-card']!;
}

function tipForPathAndElement(
  pathname: string,
  el: HTMLElement,
  ctx: ElementContext,
  page: PageContext,
): string | null {
  const focus = el.closest('[data-roachie-focus]')?.getAttribute('data-roachie-focus')
    ?? el.dataset.roachieFocus;
  if (focus && FOCUS_TIPS[focus]) {
    if (focus === 'pg-card') return tipForPgCard(ctx);
    return FOCUS_TIPS[focus]!;
  }

  if (pathname === '/pgs' || pathname.startsWith('/pgs?')) {
    if (el.closest('a[href^="/pgs/"]')) return tipForPgCard(ctx);
    return null;
  }

  if (/^\/pgs\/[^/]+$/.test(pathname)) {
    if (el.textContent?.includes('Living here')) {
      return FOCUS_TIPS['stay-dates']!;
    }
    if (el.closest('a[href*="/rooms/"]')) {
      return FOCUS_TIPS['room-pick']!;
    }
    if (ctx.text.toLowerCase().includes('amenities')) {
      return 'Amenities here are what you actually get — daily cleaning, free laundry, WiFi, chill rooms, and more. Compare before you pick a room.';
    }
    if (ctx.text.toLowerCase().includes('fully occupied')) {
      return 'Every bed is taken for these dates. Shift your move-in date or check another Awesome PG nearby.';
    }
    return null;
  }

  if (/^\/pgs\/[^/]+\/rooms\//.test(pathname)) {
    if (el.closest('button') && ctx.text.toLowerCase().includes('continue')) {
      return 'Lock in your beds here — next step is profile + payment. Holds expire if you wait too long.';
    }
    return FOCUS_TIPS['bed-pick']!;
  }

  if (pathname.startsWith('/booking/new')) {
    return FOCUS_TIPS['confirm-booking']!;
  }

  if (pathname.startsWith('/account/resident')) {
    if (ctx.text.toLowerCase().includes('vacat')) return FOCUS_TIPS.vacating!;
    if (ctx.text.toLowerCase().includes('ps4') || ctx.text.toLowerCase().includes('gaming')) {
      return FOCUS_TIPS['ps4-service']!;
    }
    if (ctx.text.toLowerCase().includes('rent') || ctx.text.toLowerCase().includes('pay')) {
      return FOCUS_TIPS['pay-rent']!;
    }
    if (ctx.text.toLowerCase().includes('electric')) {
      return 'Electricity shares are split among active residents on that meter — pay before the due date to skip penalties.';
    }
    return 'Your resident hub — rent, deposit balance, and move-out requests all live here once you’re checked in.';
  }

  if (pathname.startsWith('/booking/') && !pathname.includes('/new')) {
    return 'Track payment and check-in here. Complete KYC before move-in day so check-in stays smooth.';
  }

  if (page.headings.some((h) => /home base/i.test(h))) {
    return null;
  }

  return null;
}

function focusKeyFor(el: HTMLElement): string | null {
  return (
    el.closest('[data-roachie-focus]')?.getAttribute('data-roachie-focus')
    ?? el.dataset.roachieFocus
    ?? null
  );
}

export function guideForTarget(args: {
  element: HTMLElement;
  pageContext: PageContext;
  elementContext: ElementContext;
}): string | null {
  const focus = focusKeyFor(args.element);
  if (focus && FOCUS_TIPS[focus]) {
    if (focus === 'pg-card') return tipForPgCard(args.elementContext);
    return FOCUS_TIPS[focus]!;
  }

  if (isBoringElement(args.element, args.elementContext)) return null;
  return tipForPathAndElement(
    args.pageContext.pathname,
    args.element,
    args.elementContext,
    args.pageContext,
  );
}

import { COCKROACH_AI_NAME } from '@/src/lib/cockroach/branding';

export const ROACHIE_INTRO =
  `Nice pick — ${COCKROACH_AI_NAME} will walk you through dates, rooms, and beds. Watch for the yellow highlight.`;

export const ROACHIE_IDLE =
  `Tap Next when you want another pointer from ${COCKROACH_AI_NAME} on this page.`;
