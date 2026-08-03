/**
 * metrics/v1 — business metrics dashboard read APIs.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { businessMetricsIndex } from '@/src/db/schema/businessMetricsIndex';
import { loadBusinessMetrics } from '@/src/roomOs/metrics/loadBusinessMetrics';
import type {
  BookingMetricsRollup,
  BusinessMetricsSnapshot,
  MaterializationStatus,
  PropertyMetricsRollup,
  ResidentMetricsRollup,
  RoomMetricsRollup,
} from '@/src/roomOs/types';
import { firstOfMonth } from '@/src/services/billing';

export type MetricsApiBaseInput = {
  pgId: string;
  billingMonth: string;
  asOf?: string;
};

export async function loadPropertyRollup(input: MetricsApiBaseInput) {
  const result = await loadBusinessMetrics(input);
  return {
    apiVersion: 'metrics/v1' as const,
    status: result.status,
    property: result.snapshot?.property ?? null,
    financial: result.snapshot?.financial ?? null,
  };
}

export async function loadRoomRollup(
  input: MetricsApiBaseInput & { roomId?: string },
): Promise<{
  apiVersion: 'metrics/v1';
  status: MaterializationStatus;
  rooms: RoomMetricsRollup[];
}> {
  const result = await loadBusinessMetrics(input);
  if (!result.snapshot) {
    return { apiVersion: 'metrics/v1', status: 'not_materialized', rooms: [] };
  }
  const rooms = input.roomId
    ? result.snapshot.rooms.filter((r) => r.roomId === input.roomId)
    : result.snapshot.rooms;
  return { apiVersion: 'metrics/v1', status: result.status, rooms };
}

export async function loadBookingRollup(
  input: MetricsApiBaseInput & { bookingId?: string },
): Promise<{
  apiVersion: 'metrics/v1';
  status: MaterializationStatus;
  bookings: BookingMetricsRollup[];
}> {
  const result = await loadBusinessMetrics(input);
  if (!result.snapshot) {
    return { apiVersion: 'metrics/v1', status: 'not_materialized', bookings: [] };
  }
  const bookings = input.bookingId
    ? result.snapshot.bookings.filter((b) => b.bookingId === input.bookingId)
    : result.snapshot.bookings;
  return { apiVersion: 'metrics/v1', status: result.status, bookings };
}

export async function loadResidentRollup(
  input: MetricsApiBaseInput & { customerId?: string; bookingId?: string },
): Promise<{
  apiVersion: 'metrics/v1';
  status: MaterializationStatus;
  residents: ResidentMetricsRollup[];
}> {
  const result = await loadBusinessMetrics(input);
  if (!result.snapshot) {
    return { apiVersion: 'metrics/v1', status: 'not_materialized', residents: [] };
  }
  let residents = result.snapshot.residents;
  if (input.bookingId) {
    residents = residents.filter((r) => r.bookingId === input.bookingId);
  }
  if (input.customerId) {
    residents = residents.filter((r) => r.customerId === input.customerId);
  }
  return { apiVersion: 'metrics/v1', status: result.status, residents };
}

export type PortfolioRollupRow = {
  pgId: string;
  billingMonth: string;
  property: PropertyMetricsRollup;
  financial: BusinessMetricsSnapshot['financial'];
  contentHash: string;
};

export async function loadPortfolioRollup(input: {
  pgIds: string[];
  billingMonth: string;
}): Promise<{ apiVersion: 'metrics/v1'; rows: PortfolioRollupRow[] }> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const rows: PortfolioRollupRow[] = [];

  for (const pgId of input.pgIds) {
    const [row] = await db
      .select({ snapshot: businessMetricsIndex.snapshot })
      .from(businessMetricsIndex)
      .where(
        and(eq(businessMetricsIndex.pgId, pgId), eq(businessMetricsIndex.billingMonth, billingMonth)),
      )
      .limit(1);

    const snapshot = row?.snapshot ?? (await loadBusinessMetrics({ pgId, billingMonth })).snapshot;
    if (!snapshot) continue;

    rows.push({
      pgId,
      billingMonth,
      property: snapshot.property,
      financial: snapshot.financial,
      contentHash: snapshot.contentHash,
    });
  }

  return { apiVersion: 'metrics/v1', rows };
}
