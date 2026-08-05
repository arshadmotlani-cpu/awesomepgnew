/**
 * Detect duplicate payment-proof screenshot URLs among other pending
 * same-PG Operations reviews (rent / electricity / extension / deposit_link).
 */

import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  electricityBills,
  electricityInvoices,
  floors,
  paymentLinks,
  rentInvoices,
  rooms,
  stayExtensions,
} from '@/src/db/schema';

export type PendingProofEntityKind = 'rent' | 'electricity' | 'extension' | 'deposit_link';

/**
 * Returns true when another pending review in the same PG already uses this URL.
 * Excludes the current entity (kind + id).
 */
export async function hasDuplicatePendingPaymentProofUrl(input: {
  pgId: string;
  paymentProofUrl: string;
  exclude?: { kind: PendingProofEntityKind; id: string };
}): Promise<boolean> {
  const url = input.paymentProofUrl.trim();
  if (!url) return false;
  const exclude = input.exclude;

  const [rentDup] = await db
    .select({ id: rentInvoices.id })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.pgId, input.pgId),
        eq(rentInvoices.paymentProofUrl, url),
        sql`${rentInvoices.status} IN ('pending', 'overdue', 'payment_in_progress')`,
        exclude?.kind === 'rent' ? ne(rentInvoices.id, exclude.id) : undefined,
      ),
    )
    .limit(1);
  if (rentDup) return true;

  const [elecDup] = await db
    .select({ id: electricityInvoices.id })
    .from(electricityInvoices)
    .innerJoin(
      electricityBills,
      eq(electricityBills.id, electricityInvoices.electricityBillId),
    )
    .where(
      and(
        eq(electricityBills.pgId, input.pgId),
        eq(electricityInvoices.paymentProofUrl, url),
        eq(electricityInvoices.status, 'pending'),
        exclude?.kind === 'electricity'
          ? ne(electricityInvoices.id, exclude.id)
          : undefined,
      ),
    )
    .limit(1);
  if (elecDup) return true;

  const [extDup] = await db
    .select({ id: stayExtensions.id })
    .from(stayExtensions)
    .innerJoin(bookings, eq(bookings.id, stayExtensions.bookingId))
    .where(
      and(
        eq(stayExtensions.status, 'pending'),
        eq(stayExtensions.paymentProofUrl, url),
        exclude?.kind === 'extension' ? ne(stayExtensions.id, exclude.id) : undefined,
        sql`EXISTS (
          SELECT 1 FROM ${bedReservations} br
          JOIN ${beds} b ON b.id = br.bed_id
          JOIN ${rooms} r ON r.id = b.room_id
          JOIN ${floors} f ON f.id = r.floor_id
          WHERE br.booking_id = ${stayExtensions.bookingId}
            AND f.pg_id = ${input.pgId}
          LIMIT 1
        )`,
      ),
    )
    .limit(1);
  if (extDup) return true;

  const [depDup] = await db
    .select({ id: paymentLinks.id })
    .from(paymentLinks)
    .where(
      and(
        eq(paymentLinks.pgId, input.pgId),
        eq(paymentLinks.purpose, 'deposit'),
        eq(paymentLinks.status, 'active'),
        isNotNull(paymentLinks.bookingId),
        eq(paymentLinks.paymentProofUrl, url),
        exclude?.kind === 'deposit_link' ? ne(paymentLinks.id, exclude.id) : undefined,
      ),
    )
    .limit(1);
  if (depDup) return true;

  return false;
}
