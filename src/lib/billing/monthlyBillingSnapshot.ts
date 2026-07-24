/**
 * Canonical monthly rent billing snapshot for a booking — one loader for admin/resident surfaces.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, bookings, rentInvoices } from '@/src/db/schema';
import { formatDate, todayString } from '@/src/lib/dates';
import { isMonthlyStayType, stayTypeFromPricingMode } from '@/src/lib/stayType';
import type { BillingCoverageModel } from '@/src/lib/billing/billingCoverageModel';
import {
  anniversaryBillingPeriod,
  billingDayFromMoveIn,
  buildRentBillingTimeline,
  dailyRateFromMonthly,
  formatAnniversaryBillingPeriodLabel,
} from '@/src/services/billing';
import { loadBillingCoverageModel } from '@/src/services/billingCoverage';
import {
  ensureBillingProfileForBooking,
  getResidentBillingFormDefaults,
} from '@/src/services/residentBillingProfiles';

export type MonthlyBillingSnapshot = {
  checkInDate: string;
  billingCycleLabel: string;
  billingDay: number;
  paidUntilDate: string | null;
  nextRentDueDate: string;
  dailyRentPaise: number;
  monthlyRentPaise: number;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingPeriodLabel: string;
};

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

export function billingCycleLabelFromDay(billingDay: number): string {
  const day = Math.min(Math.max(1, billingDay), 31);
  return `${day}${ordinalSuffix(day)} of each month`;
}

async function moveInDateForBooking(bookingId: string): Promise<string | null> {
  const [stay] = await db
    .select({
      moveIn: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
    })
    .from(bedReservations)
    .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.status, 'active')))
    .limit(1);
  return stay?.moveIn ?? null;
}

/** Load full monthly billing snapshot; returns null for non-monthly or missing profile. */
export async function loadMonthlyBillingSnapshotForBooking(args: {
  bookingId: string;
  customerId?: string;
  vacatingDate?: string | null;
  coverageModel?: BillingCoverageModel | null;
}): Promise<MonthlyBillingSnapshot | null> {
  const [booking] = await db
    .select({
      customerId: bookings.customerId,
      durationMode: bookings.durationMode,
      status: bookings.status,
    })
    .from(bookings)
    .where(eq(bookings.id, args.bookingId))
    .limit(1);

  if (!booking || booking.status !== 'confirmed') return null;
  if (!isMonthlyStayType(stayTypeFromPricingMode(booking.durationMode))) return null;

  const customerId = args.customerId ?? booking.customerId;
  const profile = await ensureBillingProfileForBooking(args.bookingId);
  if (!profile) return null;

  const moveIn = await moveInDateForBooking(args.bookingId);
  if (!moveIn) return null;

  const billingDay = profile.billingDay || billingDayFromMoveIn(moveIn);
  const defaults =
    customerId != null
      ? await getResidentBillingFormDefaults(customerId, args.bookingId)
      : null;

  const [latestInvoice] = await db
    .select({
      dueDate: rentInvoices.dueDate,
      billingMonth: rentInvoices.billingMonth,
      status: rentInvoices.status,
      createdAt: rentInvoices.createdAt,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, args.bookingId),
        eq(rentInvoices.isAdhoc, false),
        sql`${rentInvoices.status} != 'cancelled'`,
      ),
    )
    .orderBy(desc(rentInvoices.billingMonth), desc(rentInvoices.createdAt))
    .limit(1);

  const today = todayString();
  const openDue =
    latestInvoice &&
    !['paid', 'cancelled'].includes(latestInvoice.status) &&
    latestInvoice.dueDate >= today
      ? latestInvoice.dueDate
      : null;

  const timeline = buildRentBillingTimeline({
    moveInDate: moveIn,
    billingDay,
    monthlyRentPaise: profile.rentAmountPaise,
    openInvoiceDueDate: openDue,
    openInvoiceBillingMonth: latestInvoice?.billingMonth ?? null,
    lastInvoiceDate: latestInvoice ? formatDate(latestInvoice.createdAt) : null,
  });

  const nextRentDueDate = defaults?.nextRentDueDate ?? timeline.nextDueDate;
  const periodAnchor = openDue ?? nextRentDueDate;
  const period = anniversaryBillingPeriod(periodAnchor, billingDay);

  const coverageAsOf = args.vacatingDate ?? today;
  const coverage =
    args.coverageModel ??
    (await loadBillingCoverageModel({
      bookingId: args.bookingId,
      vacatingDate: coverageAsOf,
      asOfDate: coverageAsOf,
    }));
  const paidUntilDate = coverage?.paidUntilDate ?? null;
  const currentPeriod = coverage?.currentBillingPeriod;

  const monthlyRentPaise = defaults?.rentAmountPaise ?? profile.rentAmountPaise;

  return {
    checkInDate: timeline.checkInDate,
    billingCycleLabel: billingCycleLabelFromDay(billingDay),
    billingDay,
    paidUntilDate,
    nextRentDueDate,
    dailyRentPaise: dailyRateFromMonthly(monthlyRentPaise),
    monthlyRentPaise,
    billingPeriodStart: currentPeriod?.periodStart ?? period.periodStart,
    billingPeriodEnd: currentPeriod?.periodEnd ?? period.periodEnd,
    billingPeriodLabel:
      currentPeriod?.label ??
      formatAnniversaryBillingPeriodLabel(period.periodStart, period.periodEnd),
  };
}
