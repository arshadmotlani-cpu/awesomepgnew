/**
 * Upcoming rent schedule projection — powers Billing Command Centre dashboard.
 * Groups anniversary issuances for the next N days (default 14).
 */

import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { todayInBillingTimezone } from '@/src/lib/billing/billingTimezone';
import {
  billingCycleDueDate,
  billingCycleMonthForRunDate,
  firstAutoBillingDate,
  shouldGenerateBillOnDate,
} from '@/src/lib/billing/billingCycleEngine';
import { fullMonthlyRentPaise } from '@/src/services/billing';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  pgs,
  rentInvoices,
  residentBillingProfiles,
} from '@/src/db/schema';
import {
  isActiveResidentFilter,
  isProductionBookingFilter,
  isProductionCustomerFilter,
} from '@/src/lib/billing/productionDataFilter';

export type UpcomingRentResidentRow = {
  bookingId: string;
  customerId: string;
  customerName: string;
  pgId: string;
  pgName: string;
  billingDay: number;
  issueDate: string;
  billingMonth: string;
  dueDate: string;
  expectedRentPaise: number;
  status: 'scheduled' | 'already_issued';
  invoiceId: string | null;
};

export type UpcomingRentDaySummary = {
  issueDate: string;
  residentCount: number;
  totalExpectedPaise: number;
  scheduledCount: number;
  alreadyIssuedCount: number;
  residents: UpcomingRentResidentRow[];
};

export type UpcomingRentSchedule = {
  fromDate: string;
  throughDate: string;
  days: UpcomingRentDaySummary[];
  totalScheduledResidents: number;
  totalExpectedPaise: number;
};

const DEFAULT_HORIZON_DAYS = 14;

/** Pure: list calendar dates from `start` inclusive for `count` days. */
export function upcomingScheduleDates(
  start: string,
  count = DEFAULT_HORIZON_DAYS,
): string[] {
  const dates: string[] = [];
  let cursor = parseDate(start);
  for (let i = 0; i < count; i += 1) {
    dates.push(formatDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export async function loadUpcomingRentSchedule(opts?: {
  fromDate?: string;
  horizonDays?: number;
}): Promise<UpcomingRentSchedule> {
  const fromDate = opts?.fromDate ?? todayInBillingTimezone();
  const horizonDays = opts?.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const dates = upcomingScheduleDates(fromDate, horizonDays);
  const throughDate = dates[dates.length - 1]!;

  const profiles = await db
    .select({
      bookingId: residentBillingProfiles.bookingId,
      customerId: residentBillingProfiles.customerId,
      customerName: customers.fullName,
      pgId: residentBillingProfiles.pgId,
      pgName: pgs.name,
      billingDay: residentBillingProfiles.billingDay,
      rentAmountPaise: residentBillingProfiles.rentAmountPaise,
      billingAnchorDate: residentBillingProfiles.billingAnchorDate,
      firstAutoBillingDate: residentBillingProfiles.firstAutoBillingDate,
      autoGenerate: residentBillingProfiles.autoGenerate,
    })
    .from(residentBillingProfiles)
    .innerJoin(bookings, eq(bookings.id, residentBillingProfiles.bookingId))
    .innerJoin(customers, eq(customers.id, residentBillingProfiles.customerId))
    .innerJoin(pgs, eq(pgs.id, residentBillingProfiles.pgId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(residentBillingProfiles.autoGenerate, true),
        eq(bookings.status, 'confirmed'),
        isProductionBookingFilter(),
        isProductionCustomerFilter(),
        isActiveResidentFilter(),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        eq(bedReservations.status, 'active'),
        sql`${beds.status} != 'maintenance'`,
        sql`${throughDate}::date <@ ${bedReservations.stayRange}`,
      ),
    );

  const byBooking = new Map<string, (typeof profiles)[number]>();
  for (const row of profiles) {
    if (!byBooking.has(row.bookingId)) byBooking.set(row.bookingId, row);
  }

  const dayMap = new Map<string, UpcomingRentResidentRow[]>();
  for (const d of dates) dayMap.set(d, []);

  const billingMonths = new Set<string>();
  const candidateRows: Array<{
    profile: (typeof profiles)[number];
    issueDate: string;
    billingMonth: string;
    dueDate: string;
  }> = [];

  for (const profile of byBooking.values()) {
    const anchor = profile.billingAnchorDate ?? profile.firstAutoBillingDate;
    if (!anchor) continue;
    const firstAuto =
      profile.firstAutoBillingDate ?? firstAutoBillingDate(anchor, profile.billingDay);

    for (const issueDate of dates) {
      if (
        !shouldGenerateBillOnDate({
          runDate: issueDate,
          billingDay: profile.billingDay,
          firstAutoBillingDate: firstAuto,
        })
      ) {
        continue;
      }
      const billingMonth = billingCycleMonthForRunDate(issueDate);
      const dueDate = billingCycleDueDate(billingMonth, profile.billingDay);
      billingMonths.add(billingMonth);
      candidateRows.push({ profile, issueDate, billingMonth, dueDate });
    }
  }

  const existingInvoices =
    candidateRows.length > 0
      ? await db
          .select({
            bookingId: rentInvoices.bookingId,
            billingMonth: rentInvoices.billingMonth,
            id: rentInvoices.id,
          })
          .from(rentInvoices)
          .where(
            and(
              eq(rentInvoices.isAdhoc, false),
              inArray(
                rentInvoices.bookingId,
                [...new Set(candidateRows.map((c) => c.profile.bookingId))],
              ),
              inArray(rentInvoices.billingMonth, [...billingMonths]),
            ),
          )
      : [];

  const issuedKey = new Set(
    existingInvoices.map((i) => `${i.bookingId}:${i.billingMonth}`),
  );
  const invoiceIdByKey = new Map(
    existingInvoices.map((i) => [`${i.bookingId}:${i.billingMonth}`, i.id]),
  );

  for (const { profile, issueDate, billingMonth, dueDate } of candidateRows) {
    const key = `${profile.bookingId}:${billingMonth}`;
    const alreadyIssued = issuedKey.has(key);
    const row: UpcomingRentResidentRow = {
      bookingId: profile.bookingId,
      customerId: profile.customerId,
      customerName: profile.customerName,
      pgId: profile.pgId,
      pgName: profile.pgName,
      billingDay: profile.billingDay,
      issueDate,
      billingMonth,
      dueDate,
      expectedRentPaise: fullMonthlyRentPaise(profile.rentAmountPaise),
      status: alreadyIssued ? 'already_issued' : 'scheduled',
      invoiceId: invoiceIdByKey.get(key) ?? null,
    };
    dayMap.get(issueDate)!.push(row);
  }

  const days: UpcomingRentDaySummary[] = dates.map((issueDate) => {
    const residents = dayMap.get(issueDate) ?? [];
    residents.sort((a, b) => a.customerName.localeCompare(b.customerName));
    const scheduled = residents.filter((r) => r.status === 'scheduled');
    return {
      issueDate,
      residentCount: residents.length,
      totalExpectedPaise: residents.reduce((s, r) => s + r.expectedRentPaise, 0),
      scheduledCount: scheduled.length,
      alreadyIssuedCount: residents.length - scheduled.length,
      residents,
    };
  });

  const allScheduled = days.flatMap((d) => d.residents.filter((r) => r.status === 'scheduled'));

  return {
    fromDate,
    throughDate,
    days: days.filter((d) => d.residentCount > 0),
    totalScheduledResidents: allScheduled.length,
    totalExpectedPaise: allScheduled.reduce((s, r) => s + r.expectedRentPaise, 0),
  };
}
