/**
 * Pure bed availability window math — safe for client components.
 * Mirrors the helpers in availability.ts without DB imports.
 */
import { formatDateDdMmYyyy } from './format';
import { parseDate, formatDate, type DateLike } from './dates';
import {
  isStayRangeAvailable,
  maxCheckoutBeforeOverlap,
} from './bedStayOverlap';

export type FreeWindow = { startDate: string; endDate: string; nights: number };

export function maxCheckoutForCheckIn(
  checkIn: DateLike,
  freeWindows: FreeWindow[],
): string | null {
  const ci = parseDate(checkIn);
  for (const w of freeWindows) {
    const ws = parseDate(w.startDate);
    const we = parseDate(w.endDate);
    if (ci.getTime() >= ws.getTime() && ci.getTime() < we.getTime()) {
      return w.endDate;
    }
  }
  return null;
}

export type StayWindowValidation =
  | { ok: true; maxCheckout: string }
  | { ok: false; maxCheckout: string | null; reason: 'no_window' | 'exceeds_cap' };

export function validateStayWithinFreeWindows(
  checkIn: DateLike,
  checkOut: DateLike,
  freeWindows: FreeWindow[],
): StayWindowValidation {
  const maxCheckout = maxCheckoutForCheckIn(checkIn, freeWindows);
  if (!maxCheckout) {
    return { ok: false, maxCheckout: null, reason: 'no_window' };
  }
  const co = parseDate(checkOut);
  const cap = parseDate(maxCheckout);
  const ci = parseDate(checkIn);
  if (co.getTime() <= ci.getTime() || co.getTime() > cap.getTime()) {
    return { ok: false, maxCheckout, reason: 'exceeds_cap' };
  }
  return { ok: true, maxCheckout };
}

/** Blocking validation: selected [checkIn, checkOut) must not overlap any reservation. */
export function validateStayAgainstReservations(
  checkIn: DateLike,
  checkOut: DateLike,
  reservations: Array<{ startDate: string; endDate: string }>,
  horizonEnd: DateLike,
): StayWindowValidation {
  const ci = formatDate(parseDate(checkIn));
  const co = formatDate(parseDate(checkOut));
  if (co <= ci) {
    return { ok: false, maxCheckout: null, reason: 'no_window' };
  }

  if (!isStayRangeAvailable(ci, co, reservations)) {
    return { ok: false, maxCheckout: null, reason: 'no_window' };
  }

  const cap = maxCheckoutBeforeOverlap(ci, reservations, horizonEnd);
  if (!cap || co > cap) {
    return { ok: false, maxCheckout: cap, reason: 'exceeds_cap' };
  }

  return { ok: true, maxCheckout: cap };
}

export function checkoutCapMessage(maxCheckout: string): string {
  return (
    `This bed is only available until ${formatDateDdMmYyyy(maxCheckout)} because ` +
    'another guest has already reserved this bed after that date.'
  );
}

export function extensionCapMessage(maxUntil: string): string {
  return (
    `Your stay can only be extended until ${formatDateDdMmYyyy(maxUntil)} because ` +
    'another guest has already reserved this bed after that date.'
  );
}

/** Intersect free windows across multiple beds (for multi-bed booking). */
export function intersectFreeWindows(all: FreeWindow[][]): FreeWindow[] {
  if (all.length === 0) return [];
  let windows = all[0]!;
  for (let i = 1; i < all.length; i += 1) {
    const other = all[i]!;
    const merged: FreeWindow[] = [];
    for (const a of windows) {
      for (const b of other) {
        const startMs = Math.max(
          parseDate(a.startDate).getTime(),
          parseDate(b.startDate).getTime(),
        );
        const endMs = Math.min(parseDate(a.endDate).getTime(), parseDate(b.endDate).getTime());
        if (startMs < endMs) {
          merged.push({
            startDate: formatDateFromMs(startMs),
            endDate: formatDateFromMs(endMs),
            nights: Math.round((endMs - startMs) / 86_400_000),
          });
        }
      }
    }
    windows = merged;
  }
  return windows;
}

function formatDateFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
