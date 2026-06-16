/**
 * Pricing service.
 *
 * Quote prices for a bed (or a multi-bed booking) according to the four
 * duration modes defined in PROJECT_PLAN.md §2.5:
 *
 *   - daily       → nights * dailyRate
 *   - weekly      → ceil(nights / 7) * weeklyRate
 *   - monthly     → whole months * monthlyRate, remainder at daily rate (pro-rata)
 *   - open_ended  → first month upfront (1 * monthlyRate); subsequent months
 *                   are billed by a cron in Phase 5.
 *
 * The breakdown is intentionally shaped to drop directly into
 * `bookings.pricing_snapshot.perBed[]` (see src/db/schema/bookings.ts).
 *
 * The math is split into pure functions (`computePriceBreakdown`,
 * `monthsBetween`) and DB-fetching wrappers (`quoteBedPrice`,
 * `quoteBookingPrice`) so the math is testable without a database.
 */

import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { bedPrices } from '../db/schema';
import { addMonths, diffDays, formatDate, isBefore, parseDate, type DateLike } from '../lib/dates';
import { computeLowestFixedStayRent } from '../lib/pricing/fixedStayOptimizer';
import type { FixedStayPricingStrategy } from '../lib/pricing/types';

export type PricingMode = 'daily' | 'weekly' | 'monthly' | 'open_ended' | 'fixed_stay';

export type RateSnapshot = {
  bedPriceId: string;
  dailyRatePaise: number;
  weeklyRatePaise: number;
  monthlyRatePaise: number;
  /** Legacy column — mirrors monthly deposit when set. */
  securityDepositPaise: number;
  dailySecurityDepositPaise: number;
  weeklySecurityDepositPaise: number;
  monthlySecurityDepositPaise: number;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export function securityDepositForMode(rate: RateSnapshot, durationMode: PricingMode): number {
  if (durationMode === 'open_ended' || durationMode === 'monthly') {
    return computeMonthlyDepositPaise(rate);
  }
  if (durationMode === 'daily') {
    return rate.dailySecurityDepositPaise > 0
      ? rate.dailySecurityDepositPaise
      : rate.securityDepositPaise;
  }
  if (durationMode === 'weekly') {
    return rate.weeklySecurityDepositPaise > 0
      ? rate.weeklySecurityDepositPaise
      : rate.securityDepositPaise;
  }
  return rate.monthlySecurityDepositPaise > 0
    ? rate.monthlySecurityDepositPaise
    : rate.securityDepositPaise;
}

/** Monthly / open-ended stays: deposit = 2 × monthly rent. */
export function computeMonthlyDepositPaise(rate: RateSnapshot): number {
  requirePositiveRate(rate.monthlyRatePaise, 'monthly');
  return rate.monthlyRatePaise * 2;
}

/** Fixed-date stays: deposit = 50% of booking subtotal (rent only, not deposit). */
export function computeFixedStayDepositPaise(subtotalPaise: number): number {
  if (subtotalPaise <= 0) return 0;
  return Math.ceil(subtotalPaise * 0.5);
}

export function computeRequiredDepositPaise(
  rate: RateSnapshot,
  durationMode: PricingMode,
  subtotalPaise: number,
): number {
  if (durationMode === 'open_ended' || durationMode === 'monthly') {
    return computeMonthlyDepositPaise(rate);
  }
  if (durationMode === 'fixed_stay') {
    return computeFixedStayDepositPaise(subtotalPaise);
  }
  return securityDepositForMode(rate, durationMode);
}

export type LineItem = {
  kind:
    | 'monthly_cycle'
    | 'weekly_cycle'
    | 'daily_nights'
    | 'pro_rata_days'
    | 'deposit';
  description: string;
  units: number;
  unitPricePaise: number;
  amountPaise: number;
};

// Re-export for client-safe imports
export type { PricingLineItem } from '@/src/lib/pricing/types';

export type PriceQuote = {
  bedId: string;
  durationMode: PricingMode;
  startDate: string;
  endDate: string | null;
  nights: number | null;
  /**
   * Primary billing unit count. Snapshot-friendly: daily→nights, weekly→weeks,
   * monthly→whole months, open_ended→1. Pro-rata days for monthly mode live
   * in `lineItems` and contribute to the subtotal but not to `units`.
   */
  units: number;
  rate: RateSnapshot;
  lineItems: LineItem[];
  subtotalPaise: number;
  depositPaise: number;
  totalPaise: number;
  computedAt: string;
  notes?: string;
  /** True when fixed_stay used a cheaper strategy than naive week+day split. */
  lowestPriceApplied?: boolean;
  /** Which rent strategy won for fixed_stay. */
  pricingStrategy?: FixedStayPricingStrategy;
};

export type ComputePriceInput = {
  bedId: string;
  rate: RateSnapshot;
  startDate: DateLike;
  endDate: DateLike | null;
  durationMode: PricingMode;
  includeDeposit?: boolean;
};

// ───────────────────────────────────────────────────────────────────────────
// Pure math
// ───────────────────────────────────────────────────────────────────────────

/**
 * Count whole calendar months fitting inside [start, end), plus the leftover
 * days. The cursor advances by 1 month at a time using {@link addMonths}
 * (which clamps to month-end). Example:
 *
 *   start = 2026-06-15, end = 2026-08-22
 *     → 2 whole months (06-15 → 07-15, 07-15 → 08-15), then 7 leftover days
 *
 *   start = 2026-01-31, end = 2026-03-31
 *     → 2 whole months (clamped: 01-31 → 02-28, 02-28 → 03-28), then 3 days
 *
 * Both inputs must already be UTC midnight Dates.
 */
export function monthsBetween(
  start: DateLike,
  end: DateLike,
): { months: number; remainingDays: number } {
  let cursor = parseDate(start);
  const stop = parseDate(end);
  if (!isBefore(cursor, stop)) return { months: 0, remainingDays: 0 };

  let months = 0;
  while (true) {
    const next = addMonths(cursor, 1);
    if (next.getTime() > stop.getTime()) break;
    months += 1;
    cursor = next;
  }
  const remainingDays = diffDays(cursor, stop);
  return { months, remainingDays };
}

/**
 * Pure quote calculation. Given an explicit rate snapshot, derive every
 * line item and the total. No DB access — easy to unit-test exhaustively.
 */
export function computePriceBreakdown(input: ComputePriceInput): PriceQuote {
  const { bedId, rate, durationMode, includeDeposit = true } = input;
  const startDate = parseDate(input.startDate);
  const endDate = input.endDate == null ? null : parseDate(input.endDate);

  // Mode-specific guard rails before doing math.
  if (durationMode !== 'open_ended' && endDate == null) {
    throw new Error(`endDate is required for durationMode "${durationMode}"`);
  }
  if (endDate != null && !isBefore(startDate, endDate)) {
    throw new Error(
      `endDate (${formatDate(endDate)}) must be strictly after startDate (${formatDate(startDate)})`,
    );
  }

  const lineItems: LineItem[] = [];
  let subtotalPaise = 0;
  let units = 0;
  let nights: number | null = null;
  let notes: string | undefined;
  let lowestPriceApplied: boolean | undefined;
  let pricingStrategy: FixedStayPricingStrategy | undefined;

  if (durationMode === 'daily') {
    nights = diffDays(startDate, endDate!);
    requirePositiveRate(rate.dailyRatePaise, 'daily');
    units = nights;
    const amount = nights * rate.dailyRatePaise;
    lineItems.push({
      kind: 'daily_nights',
      description: `${nights} night${nights === 1 ? '' : 's'} @ daily rate`,
      units: nights,
      unitPricePaise: rate.dailyRatePaise,
      amountPaise: amount,
    });
    subtotalPaise = amount;
  } else if (durationMode === 'fixed_stay') {
    nights = diffDays(startDate, endDate!);
    requirePositiveRate(rate.weeklyRatePaise, 'weekly');
    requirePositiveRate(rate.dailyRatePaise, 'daily');

    const optimized = computeLowestFixedStayRent({
      nights,
      dailyRatePaise: rate.dailyRatePaise,
      weeklyRatePaise: rate.weeklyRatePaise,
      monthlyRatePaise: rate.monthlyRatePaise,
    });

    lineItems.push(...optimized.lineItems);
    subtotalPaise = optimized.subtotalPaise;
    units = optimized.units;
    lowestPriceApplied = optimized.lowestPriceApplied;
    pricingStrategy = optimized.strategy;

    notes = optimized.lowestPriceApplied
      ? `Fixed stay: ${nights} night${nights === 1 ? '' : 's'} — lowest available price automatically applied (${optimized.strategy}).`
      : `Fixed stay: ${nights} night${nights === 1 ? '' : 's'} (${optimized.strategy}).`;
  } else if (durationMode === 'weekly') {
    nights = diffDays(startDate, endDate!);
    requirePositiveRate(rate.weeklyRatePaise, 'weekly');
    const weeks = Math.ceil(nights / 7);
    units = weeks;
    const amount = weeks * rate.weeklyRatePaise;
    lineItems.push({
      kind: 'weekly_cycle',
      description: `${weeks} week${weeks === 1 ? '' : 's'} billed (${nights} night${
        nights === 1 ? '' : 's'
      } stayed)`,
      units: weeks,
      unitPricePaise: rate.weeklyRatePaise,
      amountPaise: amount,
    });
    subtotalPaise = amount;
  } else if (durationMode === 'monthly') {
    nights = diffDays(startDate, endDate!);
    requirePositiveRate(rate.monthlyRatePaise, 'monthly');
    const { months, remainingDays } = monthsBetween(startDate, endDate!);
    units = months;

    if (months > 0) {
      const monthlyAmount = months * rate.monthlyRatePaise;
      lineItems.push({
        kind: 'monthly_cycle',
        description: `${months} month${months === 1 ? '' : 's'} @ monthly rate`,
        units: months,
        unitPricePaise: rate.monthlyRatePaise,
        amountPaise: monthlyAmount,
      });
      subtotalPaise += monthlyAmount;
    }

    if (remainingDays > 0) {
      // Pro-rata: use the explicit daily rate if set, else derive from the
      // monthly rate (ceil so the operator is never under-paid for a partial
      // month). This matches the plan's "pro-rata daily for partial month".
      const proRataUnitPaise =
        rate.dailyRatePaise > 0
          ? rate.dailyRatePaise
          : Math.ceil(rate.monthlyRatePaise / 30);
      const proRataAmount = remainingDays * proRataUnitPaise;
      lineItems.push({
        kind: 'pro_rata_days',
        description: `${remainingDays} pro-rata day${
          remainingDays === 1 ? '' : 's'
        } @ ${rate.dailyRatePaise > 0 ? 'daily rate' : 'monthly/30'}`,
        units: remainingDays,
        unitPricePaise: proRataUnitPaise,
        amountPaise: proRataAmount,
      });
      subtotalPaise += proRataAmount;
    }
  } else {
    // open_ended
    requirePositiveRate(rate.monthlyRatePaise, 'monthly');
    units = 1;
    const amount = rate.monthlyRatePaise;
    lineItems.push({
      kind: 'monthly_cycle',
      description: '1 month upfront (open-ended stay)',
      units: 1,
      unitPricePaise: rate.monthlyRatePaise,
      amountPaise: amount,
    });
    subtotalPaise = amount;
    notes = 'Open-ended stay: first month billed now, subsequent months billed monthly.';
  }

  const depositPaise = includeDeposit
    ? computeRequiredDepositPaise(rate, durationMode, subtotalPaise)
    : 0;
  if (depositPaise > 0) {
    const depositLabel =
      durationMode === 'open_ended' || durationMode === 'monthly'
        ? 'Refundable security deposit (2 months rent)'
        : durationMode === 'fixed_stay'
          ? 'Refundable security deposit (50% of booking)'
          : 'Refundable security deposit';
    lineItems.push({
      kind: 'deposit',
      description: depositLabel,
      units: 1,
      unitPricePaise: depositPaise,
      amountPaise: depositPaise,
    });
  }

  return {
    bedId,
    durationMode,
    startDate: formatDate(startDate),
    endDate: endDate ? formatDate(endDate) : null,
    nights,
    units,
    rate,
    lineItems,
    subtotalPaise,
    depositPaise,
    totalPaise: subtotalPaise + depositPaise,
    computedAt: new Date().toISOString(),
    notes,
    lowestPriceApplied,
    pricingStrategy,
  };
}

function requirePositiveRate(rate: number, modeLabel: string): void {
  if (!(rate > 0)) {
    throw new Error(
      `No positive ${modeLabel} rate configured for this bed. ` +
        `Set a rate in bed_prices before quoting.`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// DB-backed orchestration
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resolve the active `bed_prices` row whose effective window contains
 * `onDate`. If no row covers the date, returns the most recent row that
 * started on or before `onDate` (open-ended) — matching the convention in
 * PROJECT_PLAN.md §2.5.
 */
export async function loadBedPrice(
  bedId: string,
  onDate: DateLike,
): Promise<RateSnapshot | null> {
  const targetIso = formatDate(parseDate(onDate));
  const [row] = await db
    .select({
      id: bedPrices.id,
      bedId: bedPrices.bedId,
      dailyRatePaise: bedPrices.dailyRatePaise,
      weeklyRatePaise: bedPrices.weeklyRatePaise,
      monthlyRatePaise: bedPrices.monthlyRatePaise,
      securityDepositPaise: bedPrices.securityDepositPaise,
      dailySecurityDepositPaise: bedPrices.dailySecurityDepositPaise,
      weeklySecurityDepositPaise: bedPrices.weeklySecurityDepositPaise,
      monthlySecurityDepositPaise: bedPrices.monthlySecurityDepositPaise,
      effectiveFrom: bedPrices.effectiveFrom,
      effectiveTo: bedPrices.effectiveTo,
    })
    .from(bedPrices)
    .where(
      and(
        eq(bedPrices.bedId, bedId),
        sql`${bedPrices.effectiveFrom} <= ${targetIso}::date`,
        or(
          isNull(bedPrices.effectiveTo),
          sql`${bedPrices.effectiveTo} > ${targetIso}::date`,
        ),
      ),
    )
    .orderBy(desc(bedPrices.effectiveFrom))
    .limit(1);

  if (!row) return null;
  return {
    bedPriceId: row.id,
    dailyRatePaise: row.dailyRatePaise,
    weeklyRatePaise: row.weeklyRatePaise,
    monthlyRatePaise: row.monthlyRatePaise,
    securityDepositPaise: row.securityDepositPaise,
    dailySecurityDepositPaise: row.dailySecurityDepositPaise,
    weeklySecurityDepositPaise: row.weeklySecurityDepositPaise,
    monthlySecurityDepositPaise: row.monthlySecurityDepositPaise,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  };
}

/** Latest configured price row for a bed (ignores move-in date). Admin fallback. */
export async function loadLatestBedPrice(bedId: string): Promise<RateSnapshot | null> {
  const [row] = await db
    .select({
      id: bedPrices.id,
      bedId: bedPrices.bedId,
      dailyRatePaise: bedPrices.dailyRatePaise,
      weeklyRatePaise: bedPrices.weeklyRatePaise,
      monthlyRatePaise: bedPrices.monthlyRatePaise,
      securityDepositPaise: bedPrices.securityDepositPaise,
      dailySecurityDepositPaise: bedPrices.dailySecurityDepositPaise,
      weeklySecurityDepositPaise: bedPrices.weeklySecurityDepositPaise,
      monthlySecurityDepositPaise: bedPrices.monthlySecurityDepositPaise,
      effectiveFrom: bedPrices.effectiveFrom,
      effectiveTo: bedPrices.effectiveTo,
    })
    .from(bedPrices)
    .where(eq(bedPrices.bedId, bedId))
    .orderBy(desc(bedPrices.effectiveFrom))
    .limit(1);

  if (!row) return null;
  return {
    bedPriceId: row.id,
    dailyRatePaise: row.dailyRatePaise,
    weeklyRatePaise: row.weeklyRatePaise,
    monthlyRatePaise: row.monthlyRatePaise,
    securityDepositPaise: row.securityDepositPaise,
    dailySecurityDepositPaise: row.dailySecurityDepositPaise,
    weeklySecurityDepositPaise: row.weeklySecurityDepositPaise,
    monthlySecurityDepositPaise: row.monthlySecurityDepositPaise,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  };
}

function syntheticAdminRate(args: {
  bedId: string;
  startDate: string;
  monthlyRatePaise: number;
  depositPaise: number;
}): RateSnapshot {
  return {
    bedPriceId: `admin-${args.bedId}`,
    dailyRatePaise: Math.max(0, Math.floor(args.monthlyRatePaise / 30)),
    weeklyRatePaise: 0,
    monthlyRatePaise: args.monthlyRatePaise,
    securityDepositPaise: args.depositPaise,
    dailySecurityDepositPaise: 0,
    weeklySecurityDepositPaise: 0,
    monthlySecurityDepositPaise: args.depositPaise,
    effectiveFrom: args.startDate,
    effectiveTo: null,
  };
}

export type QuoteAdminTenantInput = QuoteBookingInput & {
  customMonthlyRatePaise?: number;
  customDepositPaise?: number;
};

/**
 * Admin tenant assignment quote. Supports grandfathered rent/deposit without
 * requiring a bed_prices row on the exact move-in date.
 */
export async function quoteAdminTenantAssignment(
  input: QuoteAdminTenantInput,
): Promise<BookingQuote> {
  if (input.bedIds.length === 0) {
    throw new Error('quoteAdminTenantAssignment requires at least one bedId');
  }

  const startIso = formatDate(parseDate(input.startDate));
  const perBed: PriceQuote[] = [];

  for (const bedId of input.bedIds) {
    let rate =
      (await loadBedPrice(bedId, input.startDate)) ?? (await loadLatestBedPrice(bedId));

    if (!rate) {
      const monthly = input.customMonthlyRatePaise ?? 0;
      if (monthly <= 0) {
        throw new Error(
          `No rent price for this bed on ${startIso}. Enter monthly rent (₹) below, or save room rent under PG → Rooms.`,
        );
      }
      rate = syntheticAdminRate({
        bedId,
        startDate: startIso,
        monthlyRatePaise: monthly,
        depositPaise: input.customDepositPaise ?? 0,
      });
    }

    const quote = computePriceBreakdown({
      bedId,
      rate,
      startDate: input.startDate,
      endDate: input.endDate,
      durationMode: input.durationMode,
      includeDeposit: input.includeDeposit ?? true,
    });

    if (input.customMonthlyRatePaise != null && input.customMonthlyRatePaise > 0) {
      quote.rate.monthlyRatePaise = input.customMonthlyRatePaise;
      quote.subtotalPaise = input.customMonthlyRatePaise * Math.max(1, quote.units);
    }

    if (input.customDepositPaise != null) {
      quote.depositPaise = input.customDepositPaise;
      quote.rate.securityDepositPaise = input.customDepositPaise;
      quote.rate.monthlySecurityDepositPaise = input.customDepositPaise;
    }

    quote.totalPaise = quote.subtotalPaise + quote.depositPaise;
    perBed.push(quote);
  }

  const subtotalPaise = perBed.reduce((a, q) => a + q.subtotalPaise, 0);
  const depositPaise = perBed.reduce((a, q) => a + q.depositPaise, 0);
  return {
    startDate: perBed[0]!.startDate,
    endDate: perBed[0]!.endDate,
    durationMode: input.durationMode,
    perBed,
    subtotalPaise,
    depositPaise,
    totalPaise: subtotalPaise + depositPaise,
    computedAt: new Date().toISOString(),
  };
}

export type QuoteBedInput = {
  bedId: string;
  startDate: DateLike;
  endDate: DateLike | null;
  durationMode: PricingMode;
  includeDeposit?: boolean;
};

/**
 * Single-bed quote: looks up the active price row and runs
 * {@link computePriceBreakdown}.
 */
export async function quoteBedPrice(input: QuoteBedInput): Promise<PriceQuote> {
  const rate = await loadBedPrice(input.bedId, input.startDate);
  if (!rate) {
    throw new Error(
      `No rent price for this bed on ${formatDate(parseDate(input.startDate))}. ` +
        `Set move-in to today or later, or open PG → Rooms, click Save room rent, and try again.`,
    );
  }
  return computePriceBreakdown({
    bedId: input.bedId,
    rate,
    startDate: input.startDate,
    endDate: input.endDate,
    durationMode: input.durationMode,
    includeDeposit: input.includeDeposit,
  });
}

export type BookingQuote = {
  startDate: string;
  endDate: string | null;
  durationMode: PricingMode;
  perBed: PriceQuote[];
  subtotalPaise: number;
  depositPaise: number;
  totalPaise: number;
  computedAt: string;
};

export type QuoteBookingInput = {
  bedIds: string[];
  startDate: DateLike;
  endDate: DateLike | null;
  durationMode: PricingMode;
  includeDeposit?: boolean;
};

/**
 * Multi-bed quote: every bed is priced independently against its own
 * `bed_prices` row, then aggregated. The returned shape mirrors the
 * `PricingSnapshot` type expected by `bookings.pricing_snapshot`, so it can
 * be persisted as-is when Phase 3 wires up the booking service.
 */
export async function quoteBookingPrice(input: QuoteBookingInput): Promise<BookingQuote> {
  if (input.bedIds.length === 0) {
    throw new Error('quoteBookingPrice requires at least one bedId');
  }
  const perBed = await Promise.all(
    input.bedIds.map((bedId) =>
      quoteBedPrice({
        bedId,
        startDate: input.startDate,
        endDate: input.endDate,
        durationMode: input.durationMode,
        includeDeposit: input.includeDeposit,
      }),
    ),
  );
  const subtotalPaise = perBed.reduce((a, q) => a + q.subtotalPaise, 0);
  const depositPaise = perBed.reduce((a, q) => a + q.depositPaise, 0);
  return {
    startDate: perBed[0].startDate,
    endDate: perBed[0].endDate,
    durationMode: input.durationMode,
    perBed,
    subtotalPaise,
    depositPaise,
    totalPaise: subtotalPaise + depositPaise,
    computedAt: new Date().toISOString(),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 5 — extension quotes
// ───────────────────────────────────────────────────────────────────────────

export type ExtensionQuote = BookingQuote & {
  /** Original booking's previous expected_checkout_date (inclusive start of the extension). */
  fromDate: string;
};

export type QuoteExtensionInput = {
  bedIds: string[];
  /** Inclusive start = original booking's previous expected_checkout_date. */
  fromDate: DateLike;
  /** Exclusive end = new expected_checkout_date. */
  untilDate: DateLike;
  durationMode: 'daily' | 'weekly' | 'monthly';
};

/**
 * Quote the cost of extending an existing confirmed booking by
 * `[fromDate, untilDate)` across the same set of beds.
 *
 * Differences from {@link quoteBookingPrice}:
 *
 *   - Deposit is always 0 — the original booking already collected it.
 *   - `open_ended` is not a valid extension mode (open-ended bookings
 *     don't have a finite checkout to extend FROM; renewal is monthly
 *     invoicing, out of Phase 5 scope).
 *
 * The price snapshot returned here is what gets frozen into the
 * `stay_extensions.quoted_total_paise` field and replayed on payment
 * success — so a `bed_prices` change between quote and capture cannot
 * change the customer's bill. (See PROJECT_PLAN.md §8.6.)
 */
export async function quoteExtension(input: QuoteExtensionInput): Promise<ExtensionQuote> {
  if (input.bedIds.length === 0) {
    throw new Error('quoteExtension requires at least one bedId');
  }
  const from = parseDate(input.fromDate);
  const until = parseDate(input.untilDate);
  if (!isBefore(from, until)) {
    throw new Error(
      `extension untilDate (${formatDate(until)}) must be strictly after fromDate (${formatDate(from)})`,
    );
  }
  const quote = await quoteBookingPrice({
    bedIds: input.bedIds,
    startDate: from,
    endDate: until,
    durationMode: input.durationMode,
    includeDeposit: false,
  });
  return { ...quote, fromDate: formatDate(from) };
}

// re-export so downstream code (and tests) can compose queries if needed.
export const _internal = { asc };
