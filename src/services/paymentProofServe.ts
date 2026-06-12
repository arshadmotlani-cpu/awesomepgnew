import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  electricityBills,
  electricityInvoices,
  floors,
  pgPaymentRecords,
  playstationMemberships,
  rentInvoices,
  rooms,
  stayExtensions,
} from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';

export type PaymentProofKind = 'playstation' | 'rent' | 'electricity' | 'extension' | 'qr';

async function pgIdForBooking(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ pgId: floors.pgId })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(bedReservations.bookingId, bookingId))
    .limit(1);
  return row?.pgId ?? null;
}

export async function resolveAdminPaymentProofUrl(
  session: AdminSession,
  kind: PaymentProofKind,
  id: string,
): Promise<string | null> {
  switch (kind) {
    case 'playstation': {
      const [row] = await db
        .select({
          pgId: playstationMemberships.pgId,
          url: playstationMemberships.paymentProofUrl,
        })
        .from(playstationMemberships)
        .where(eq(playstationMemberships.id, id))
        .limit(1);
      if (!row?.url) return null;
      if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId)) {
        return null;
      }
      return row.url;
    }
    case 'rent': {
      const [row] = await db
        .select({ pgId: rentInvoices.pgId, url: rentInvoices.paymentProofUrl })
        .from(rentInvoices)
        .where(eq(rentInvoices.id, id))
        .limit(1);
      if (!row?.url) return null;
      if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId)) {
        return null;
      }
      return row.url;
    }
    case 'electricity': {
      const [row] = await db
        .select({
          pgId: electricityBills.pgId,
          url: electricityInvoices.paymentProofUrl,
        })
        .from(electricityInvoices)
        .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
        .where(eq(electricityInvoices.id, id))
        .limit(1);
      if (!row?.url) return null;
      if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId)) {
        return null;
      }
      return row.url;
    }
    case 'extension': {
      const [row] = await db
        .select({
          url: stayExtensions.paymentProofUrl,
          bookingId: stayExtensions.bookingId,
        })
        .from(stayExtensions)
        .where(eq(stayExtensions.id, id))
        .limit(1);
      if (!row?.url) return null;
      const pgId = await pgIdForBooking(row.bookingId);
      if (!pgId || !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId)) {
        return null;
      }
      return row.url;
    }
    case 'qr': {
      const [row] = await db
        .select({
          pgId: pgPaymentRecords.pgId,
          url: pgPaymentRecords.paymentScreenshotUrl,
        })
        .from(pgPaymentRecords)
        .where(eq(pgPaymentRecords.id, id))
        .limit(1);
      if (!row?.url) return null;
      if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId)) {
        return null;
      }
      return row.url;
    }
    default:
      return null;
  }
}

export async function resolveCustomerPlaystationProofUrl(
  customerId: string,
  membershipId: string,
): Promise<string | null> {
  const [row] = await db
    .select({
      customerId: playstationMemberships.customerId,
      url: playstationMemberships.paymentProofUrl,
    })
    .from(playstationMemberships)
    .where(eq(playstationMemberships.id, membershipId))
    .limit(1);
  if (!row?.url || row.customerId !== customerId) return null;
  return row.url;
}

export async function resolveCustomerBookingProofUrl(
  customerId: string,
  recordId: string,
): Promise<string | null> {
  const [row] = await db
    .select({
      customerId: pgPaymentRecords.customerId,
      url: pgPaymentRecords.paymentScreenshotUrl,
    })
    .from(pgPaymentRecords)
    .where(eq(pgPaymentRecords.id, recordId))
    .limit(1);
  if (!row?.url || row.customerId !== customerId) return null;
  return row.url;
}
