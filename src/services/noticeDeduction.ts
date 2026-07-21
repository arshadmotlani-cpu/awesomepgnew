/**
 * Notice deduction — loads paid rent coverage and computes booking-scoped breakdown.
 */

import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  bookings,
  rentInvoices,
  residentBillingProfiles,
} from '@/src/db/schema';
import { noticeDeductionAppliesToBooking } from '@/src/lib/checkout/noticeDeductionPolicy';
import {
  computeNoticeDeductionBreakdown,
  type NoticeDeductionBreakdown,
  type PaidRentCoveragePeriod,
} from '@/src/lib/vacating/noticeDeductionEngine';
import {
  anniversaryBillingPeriod,
  billingDayFromMoveIn,
  dueDateForBillingDay,
  firstOfMonth,
} from '@/src/services/billing';
import { formatDate } from '@/src/lib/dates';

export type { NoticeDeductionBreakdown, PaidRentCoveragePeriod };

export async function loadPaidRentCoveragePeriods(bookingId: string): Promise<{
  periods: PaidRentCoveragePeriod[];
  billingDay: number;
  moveInDate: string | null;
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
    })
    .from(rentInvoices)
    .where(
      and(eq(rentInvoices.bookingId, bookingId), ne(rentInvoices.status, 'cancelled')),
    );

  const periods: PaidRentCoveragePeriod[] = [];
  const coveredBillingMonths = new Set<string>();

  for (const inv of invoiceRows) {
    if (inv.paidPrincipalPaise <= 0 && inv.status !== 'paid') continue;
    const billingPeriod = anniversaryBillingPeriod(String(inv.dueDate), billingDay);
    coveredBillingMonths.add(firstOfMonth(inv.billingMonth));
    periods.push({
      periodStart: billingPeriod.periodStart,
      periodEnd: billingPeriod.periodEnd,
      source: 'rent_invoice',
      sourceId: inv.id,
    });
  }

  const [bookingRow] = await db
    .select({
      rentReceivedPaise: bookings.rentReceivedPaise,
      stayType: bookings.stayType,
      durationMode: bookings.durationMode,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (
    moveInDate &&
    (bookingRow?.rentReceivedPaise ?? 0) > 0 &&
    !coveredBillingMonths.has(firstOfMonth(moveInDate))
  ) {
    const firstDue = formatDate(dueDateForBillingDay(firstOfMonth(moveInDate), billingDay));
    const checkoutPeriod = anniversaryBillingPeriod(firstDue, billingDay);
    periods.push({
      periodStart: checkoutPeriod.periodStart,
      periodEnd: checkoutPeriod.periodEnd,
      source: 'booking_checkout',
      sourceId: bookingId,
    });
  }

  return { periods, billingDay, moveInDate };
}

export async function computeNoticeDeductionForBooking(input: {
  bookingId: string;
  noticeGivenDate: string;
  vacatingDate: string;
  monthlyRentPaise: number;
  stayType?: string | null;
  durationMode?: string | null;
}): Promise<NoticeDeductionBreakdown> {
  const applies =
    input.stayType != null || input.durationMode != null
      ? noticeDeductionAppliesToBooking({
          stayType: input.stayType,
          durationMode: input.durationMode,
        })
      : true;

  if (!applies) {
    return computeNoticeDeductionBreakdown({
      monthlyRentPaise: 0,
      noticeGivenDate: input.noticeGivenDate,
      vacatingDate: input.vacatingDate,
      paidRentPeriods: [],
    });
  }

  let stayType = input.stayType;
  let durationMode = input.durationMode;
  if (stayType == null && durationMode == null) {
    const [booking] = await db
      .select({ stayType: bookings.stayType, durationMode: bookings.durationMode })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId))
      .limit(1);
    stayType = booking?.stayType;
    durationMode = booking?.durationMode;
    if (
      !noticeDeductionAppliesToBooking({
        stayType,
        durationMode,
      })
    ) {
      return computeNoticeDeductionBreakdown({
        monthlyRentPaise: 0,
        noticeGivenDate: input.noticeGivenDate,
        vacatingDate: input.vacatingDate,
        paidRentPeriods: [],
      });
    }
  }

  const { periods } = await loadPaidRentCoveragePeriods(input.bookingId);
  return computeNoticeDeductionBreakdown({
    monthlyRentPaise: input.monthlyRentPaise,
    noticeGivenDate: input.noticeGivenDate,
    vacatingDate: input.vacatingDate,
    paidRentPeriods: periods,
  });
}
