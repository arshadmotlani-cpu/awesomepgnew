/**
 * Server loader for BillingCoverageModel — single SSOT for move-out money surfaces.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  bookings,
  rentInvoices,
  residentBillingProfiles,
} from '@/src/db/schema';
import { noticeDeductionAppliesToBooking } from '@/src/lib/checkout/noticeDeductionPolicy';
import {
  buildBillingCoverageModel,
  rawPeriodFromInvoiceDueDate,
  type BillingCoverageModel,
  type BillingCoveragePeriod,
} from '@/src/lib/billing/billingCoverageModel';
import { formatDate } from '@/src/lib/dates';
import {
  anniversaryBillingPeriod,
  billingDayFromMoveIn,
  dueDateForBillingDay,
  firstOfMonth,
} from '@/src/services/billing';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { isSettlementRentInvoice } from '@/src/lib/billing/settlementRentInvoiceFilter';

export type { BillingCoverageModel, BillingCoveragePeriod };

export type LoadBillingCoverageModelArgs = {
  bookingId: string;
  vacatingDate?: string | null;
  noticeGivenDate?: string | null;
  monthlyRentPaise?: number;
  treatAsApprovedForTail?: boolean;
  stayType?: string | null;
  durationMode?: string | null;
  asOfDate?: string | null;
};

export async function loadBillingCoverageRawPeriods(bookingId: string): Promise<{
  moveInDate: string | null;
  billingDay: number;
  rawPaidPeriods: BillingCoveragePeriod[];
}> {
  const [profile] = await db
    .select({ billingDay: residentBillingProfiles.billingDay })
    .from(residentBillingProfiles)
    .where(eq(residentBillingProfiles.bookingId, bookingId))
    .limit(1);

  const [stayRow] = await db
    .select({
      lower: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
    })
    .from(bedReservations)
    .where(
      and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')),
    )
    .orderBy(sql`${bedReservations.createdAt} desc`)
    .limit(1);

  const moveInDate = stayRow?.lower ?? null;
  const billingDay =
    profile?.billingDay ?? (moveInDate ? billingDayFromMoveIn(moveInDate) : 5);

  const invoiceRows = await db
    .select({
      id: rentInvoices.id,
      dueDate: rentInvoices.dueDate,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      status: rentInvoices.status,
      billingMonth: rentInvoices.billingMonth,
      invoiceNumber: rentInvoices.invoiceNumber,
      notes: rentInvoices.notes,
      paymentProofUrl: rentInvoices.paymentProofUrl,
      isAdhoc: rentInvoices.isAdhoc,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, bookingId));

  const rawPaidPeriods: BillingCoveragePeriod[] = [];
  const coveredBillingMonths = new Set<string>();

  for (const inv of invoiceRows) {
    if (!isSettlementRentInvoice(inv)) continue;
    if (inv.paidPrincipalPaise <= 0 && inv.status !== 'paid') continue;
    coveredBillingMonths.add(firstOfMonth(String(inv.billingMonth)));
    rawPaidPeriods.push({
      ...rawPeriodFromInvoiceDueDate(String(inv.dueDate), billingDay, inv.id),
      paidPrincipalPaise: Math.max(0, inv.paidPrincipalPaise),
    });
  }

  const money = await getBookingMoneyBalances(bookingId);
  const settlementRentReceivedPaise = money?.rent.receivedPaise ?? 0;

  if (
    moveInDate &&
    settlementRentReceivedPaise > 0 &&
    !coveredBillingMonths.has(firstOfMonth(moveInDate))
  ) {
    const firstDue = formatDate(dueDateForBillingDay(firstOfMonth(moveInDate), billingDay));
    const checkoutPeriod = anniversaryBillingPeriod(firstDue, billingDay);
    rawPaidPeriods.push({
      periodStart: checkoutPeriod.periodStart,
      periodEnd: checkoutPeriod.periodEnd,
      source: 'booking_checkout',
      sourceId: bookingId,
      paidPrincipalPaise: Math.max(0, settlementRentReceivedPaise),
    });
  }

  return { moveInDate, billingDay, rawPaidPeriods };
}

export async function loadBillingCoverageModel(
  args: LoadBillingCoverageModelArgs,
): Promise<BillingCoverageModel | null> {
  const { moveInDate, billingDay, rawPaidPeriods } = await loadBillingCoverageRawPeriods(
    args.bookingId,
  );
  if (!moveInDate) return null;

  const noticeApplies = noticeDeductionAppliesToBooking({
    stayType: args.stayType,
    durationMode: args.durationMode,
  });

  const money = await getBookingMoneyBalances(args.bookingId);

  return buildBillingCoverageModel({
    bookingId: args.bookingId,
    moveInDate,
    billingDay,
    rawPaidPeriods,
    vacatingDate: args.vacatingDate,
    asOfDate: args.asOfDate,
    noticeGivenDate: args.noticeGivenDate,
    monthlyRentPaise: args.monthlyRentPaise,
    rentReceivedPaise: money?.rent.receivedPaise,
    treatAsApprovedForTail: args.treatAsApprovedForTail,
    noticeApplies,
  });
}

/** @deprecated Use loadBillingCoverageModel — kept for gradual migration. */
export async function loadPaidInvoiceCoveragePeriods(bookingId: string): Promise<{
  periods: BillingCoveragePeriod[];
  billingDay: number;
  moveInDate: string | null;
}> {
  const { moveInDate, billingDay, rawPaidPeriods } =
    await loadBillingCoverageRawPeriods(bookingId);
  if (!moveInDate) {
    return { periods: [], billingDay, moveInDate: null };
  }
  const model = buildBillingCoverageModel({
    bookingId,
    moveInDate,
    billingDay,
    rawPaidPeriods,
  });
  return {
    periods: model.paidInvoiceCoverage,
    billingDay: model.billingDay,
    moveInDate: model.moveInDate,
  };
}
