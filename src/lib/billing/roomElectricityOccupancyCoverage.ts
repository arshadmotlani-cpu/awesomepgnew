/**
 * Pure room-level electricity occupancy coverage.
 *
 * Bed IDs are retained for audit only. Electricity identity is room + resident,
 * so adjacent/overlapping bed allocations in the same room collapse into one
 * continuous coverage period.
 */
import { addDays, diffDays, formatDate, parseDate, tryParseDateBound } from '@/src/lib/dates';
import { monthBounds } from '@/src/services/billing';

export type RoomElectricityReservationSegment = {
  roomId: string;
  bookingId: string;
  customerId: string;
  customerName?: string;
  bedId: string;
  startDate: string;
  endDateExclusive: string | null;
};

export type RoomElectricityCoverageInterval = {
  startDate: string;
  endDateExclusive: string;
};

export type RoomElectricityResidentCoverage = {
  roomId: string;
  customerId: string;
  customerName?: string;
  bookingIds: string[];
  invoiceBookingId: string;
  bedIds: string[];
  intervals: RoomElectricityCoverageInterval[];
  occupiedDates: string[];
  activeDays: number;
  stayStart: string;
  stayEnd: string;
};

type MutableCoverage = {
  roomId: string;
  customerId: string;
  customerName?: string;
  bookingIds: Set<string>;
  bedIds: Set<string>;
  latestBooking: { bookingId: string; startDate: string };
  ranges: Array<{ start: Date; end: Date }>;
};

export function billingMonthCalendarDays(billingMonth: string): string[] {
  const { start, end } = monthBounds(billingMonth);
  const days: string[] = [];
  for (let cursor = start; cursor < end; cursor = addDays(cursor, 1)) {
    days.push(formatDate(cursor));
  }
  return days;
}

export function mergeRoomElectricityCoverage(input: {
  roomId: string;
  billingMonth: string;
  segments: RoomElectricityReservationSegment[];
}): RoomElectricityResidentCoverage[] {
  const { start: monthStart, end: monthEnd } = monthBounds(input.billingMonth);
  const byResident = new Map<string, MutableCoverage>();

  for (const segment of input.segments) {
    if (segment.roomId !== input.roomId) continue;
    // Historical stay bounds must never crash billing — skip malformed segments.
    const startIso = tryParseDateBound(segment.startDate);
    if (!startIso) continue;
    const endIso = tryParseDateBound(segment.endDateExclusive);
    const rawStart = parseDate(startIso);
    const rawEnd = endIso ? parseDate(endIso) : monthEnd;
    const start = rawStart > monthStart ? rawStart : monthStart;
    const end = rawEnd < monthEnd ? rawEnd : monthEnd;
    if (end <= start) continue;

    const key = `${segment.roomId}:${segment.customerId}`;
    const current = byResident.get(key);
    if (current) {
      current.bookingIds.add(segment.bookingId);
      current.bedIds.add(segment.bedId);
      current.ranges.push({ start, end });
      if (startIso >= current.latestBooking.startDate) {
        current.latestBooking = {
          bookingId: segment.bookingId,
          startDate: startIso,
        };
      }
      current.customerName ??= segment.customerName;
    } else {
      byResident.set(key, {
        roomId: segment.roomId,
        customerId: segment.customerId,
        customerName: segment.customerName,
        bookingIds: new Set([segment.bookingId]),
        bedIds: new Set([segment.bedId]),
        latestBooking: { bookingId: segment.bookingId, startDate: startIso },
        ranges: [{ start, end }],
      });
    }
  }

  return [...byResident.values()]
    .map((resident): RoomElectricityResidentCoverage => {
      const sorted = [...resident.ranges].sort(
        (left, right) => left.start.getTime() - right.start.getTime(),
      );
      const merged: Array<{ start: Date; end: Date }> = [];
      for (const range of sorted) {
        const previous = merged.at(-1);
        if (previous && range.start <= previous.end) {
          if (range.end > previous.end) previous.end = range.end;
        } else {
          merged.push({ ...range });
        }
      }

      const occupiedDates: string[] = [];
      for (const range of merged) {
        for (let cursor = range.start; cursor < range.end; cursor = addDays(cursor, 1)) {
          occupiedDates.push(formatDate(cursor));
        }
      }
      const intervals = merged.map((range) => ({
        startDate: formatDate(range.start),
        endDateExclusive: formatDate(range.end),
      }));
      const first = merged[0];
      const last = merged.at(-1)!;

      return {
        roomId: resident.roomId,
        customerId: resident.customerId,
        customerName: resident.customerName,
        bookingIds: [...resident.bookingIds],
        invoiceBookingId: resident.latestBooking.bookingId,
        bedIds: [...resident.bedIds],
        intervals,
        occupiedDates,
        activeDays: occupiedDates.length,
        stayStart: formatDate(first.start),
        stayEnd: formatDate(addDays(last.end, -1)),
      };
    })
    .filter((coverage) => coverage.activeDays > 0)
    .sort((left, right) => {
      const byStart = left.stayStart.localeCompare(right.stayStart);
      return byStart !== 0 ? byStart : left.customerId.localeCompare(right.customerId);
    });
}

export function totalRoomResidentDays(
  coverage: RoomElectricityResidentCoverage[],
): number {
  return coverage.reduce((sum, resident) => sum + resident.activeDays, 0);
}

export function roomCoverageHasGap(input: {
  coverage: RoomElectricityResidentCoverage;
  expectedStart: string;
  expectedEndExclusive: string;
}): boolean {
  return (
    input.coverage.stayStart !== input.expectedStart ||
    input.coverage.activeDays !==
      diffDays(parseDate(input.expectedStart), parseDate(input.expectedEndExclusive))
  );
}
