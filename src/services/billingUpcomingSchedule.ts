/**
 * Upcoming rent schedule projection — powers Billing Command Centre dashboard.
 * Uses the same candidate discovery and eligibility pipeline as the daily rent job.
 */

import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { todayInBillingTimezone } from '@/src/lib/billing/billingTimezone';
import { billingCycleMonthForRunDate } from '@/src/lib/billing/billingCycleEngine';
import { listAnniversaryCandidates } from '@/src/services/billingScheduler';
import {
  evaluateAnniversaryRentGenerationEligibility,
  type RentGenerationEligibility,
} from '@/src/services/rentInvoices';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  rentInvoices,
  rooms,
} from '@/src/db/schema';

export type UpcomingRentResidentRow = {
  bookingId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  bookingStatus: string;
  billingDay: number;
  issueDate: string;
  billingMonth: string;
  dueDate: string;
  expectedRentPaise: number;
  status: 'scheduled';
  invoiceId: null;
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

/** Whether a candidate should appear in the upcoming preview (scheduled-only). */
export function shouldPreviewUpcomingRentGeneration(input: {
  hasExistingInvoice: boolean;
  eligibility: RentGenerationEligibility;
}): boolean {
  if (input.hasExistingInvoice) return false;
  return input.eligibility.eligible;
}

type DisplayProfile = {
  bookingId: string;
  customerName: string;
  customerPhone: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  bookingStatus: string;
};

async function loadDisplayProfilesByBooking(
  bookingIds: string[],
): Promise<Map<string, DisplayProfile>> {
  const map = new Map<string, DisplayProfile>();
  if (bookingIds.length === 0) return map;

  const rows = await db
    .select({
      bookingId: bookings.id,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      bookingStatus: bookings.status,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        inArray(bookings.id, bookingIds),
        eq(bedReservations.status, 'active'),
      ),
    );

  for (const row of rows) {
    if (map.has(row.bookingId)) continue;
    map.set(row.bookingId, row);
  }

  return map;
}

export async function loadUpcomingRentSchedule(opts?: {
  fromDate?: string;
  horizonDays?: number;
}): Promise<UpcomingRentSchedule> {
  const fromDate = opts?.fromDate ?? todayInBillingTimezone();
  const horizonDays = opts?.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const dates = upcomingScheduleDates(fromDate, horizonDays);
  const throughDate = dates[dates.length - 1]!;

  const dayMap = new Map<string, UpcomingRentResidentRow[]>();
  for (const d of dates) dayMap.set(d, []);

  type RawCandidate = {
    bookingId: string;
    customerId: string;
    pgId: string;
    billingDay: number;
    issueDate: string;
    billingMonth: string;
  };

  const rawCandidates: RawCandidate[] = [];

  for (const issueDate of dates) {
    const candidates = await listAnniversaryCandidates(issueDate);
    const billingMonth = billingCycleMonthForRunDate(issueDate);

    for (const candidate of candidates) {
      rawCandidates.push({
        bookingId: candidate.bookingId,
        customerId: candidate.customerId,
        pgId: candidate.pgId,
        billingDay: candidate.billingDay,
        issueDate,
        billingMonth,
      });
    }
  }

  if (rawCandidates.length === 0) {
    return {
      fromDate,
      throughDate,
      days: [],
      totalScheduledResidents: 0,
      totalExpectedPaise: 0,
    };
  }

  const bookingIds = [...new Set(rawCandidates.map((c) => c.bookingId))];
  const billingMonths = [...new Set(rawCandidates.map((c) => c.billingMonth))];

  const existingInvoices = await db
    .select({
      bookingId: rentInvoices.bookingId,
      billingMonth: rentInvoices.billingMonth,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.isAdhoc, false),
        inArray(rentInvoices.bookingId, bookingIds),
        inArray(rentInvoices.billingMonth, billingMonths),
      ),
    );

  const issuedKey = new Set(
    existingInvoices.map((i) => `${i.bookingId}:${i.billingMonth}`),
  );

  type PendingRow = RawCandidate & {
    dueDate: string;
    expectedRentPaise: number;
  };

  const pendingRows: PendingRow[] = [];

  for (const candidate of rawCandidates) {
    const key = `${candidate.bookingId}:${candidate.billingMonth}`;
    const eligibility = await evaluateAnniversaryRentGenerationEligibility({
      bookingId: candidate.bookingId,
      billingMonth: candidate.billingMonth,
      asOf: candidate.issueDate,
      forceAll: true,
    });

    if (
      !shouldPreviewUpcomingRentGeneration({
        hasExistingInvoice: issuedKey.has(key),
        eligibility,
      })
    ) {
      continue;
    }

    if (!eligibility.eligible) continue;

    pendingRows.push({
      ...candidate,
      dueDate: eligibility.dueDate,
      expectedRentPaise: eligibility.rentPaise,
    });
  }

  const displayByBooking = await loadDisplayProfilesByBooking(bookingIds);

  for (const row of pendingRows) {
    const display = displayByBooking.get(row.bookingId);
    if (!display) continue;

    const upcomingRow: UpcomingRentResidentRow = {
      bookingId: row.bookingId,
      customerId: row.customerId,
      customerName: display.customerName,
      customerPhone: display.customerPhone,
      pgId: row.pgId,
      pgName: display.pgName,
      roomNumber: display.roomNumber,
      bedCode: display.bedCode,
      bookingStatus: display.bookingStatus,
      billingDay: row.billingDay,
      issueDate: row.issueDate,
      billingMonth: row.billingMonth,
      dueDate: row.dueDate,
      expectedRentPaise: row.expectedRentPaise,
      status: 'scheduled',
      invoiceId: null,
    };
    dayMap.get(row.issueDate)!.push(upcomingRow);
  }

  const days: UpcomingRentDaySummary[] = dates.map((issueDate) => {
    const residents = dayMap.get(issueDate) ?? [];
    residents.sort((a, b) => a.customerName.localeCompare(b.customerName));
    return {
      issueDate,
      residentCount: residents.length,
      totalExpectedPaise: residents.reduce((s, r) => s + r.expectedRentPaise, 0),
      scheduledCount: residents.length,
      alreadyIssuedCount: 0,
      residents,
    };
  });

  const allScheduled = days.flatMap((d) => d.residents);

  return {
    fromDate,
    throughDate,
    days: days.filter((d) => d.residentCount > 0),
    totalScheduledResidents: allScheduled.length,
    totalExpectedPaise: allScheduled.reduce((s, r) => s + r.expectedRentPaise, 0),
  };
}
