/**
 * Resident billing profile — reusable invoice template per booking.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  floors,
  residentBillingProfiles,
  rentInvoices,
  rooms,
  type ResidentBillingProfile,
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { billingDayFromMoveIn, dueDateForBillingDay, firstOfMonth } from '@/src/services/billing';
import { formatDate } from '@/src/lib/dates';
import { sql } from 'drizzle-orm';

function monthlyRentFromSnapshot(snapshot: PricingSnapshot | null): number {
  if (!snapshot || !Array.isArray(snapshot.perBed)) return 0;
  return snapshot.perBed.reduce((acc, bed) => acc + (bed.monthlyRatePaise ?? 0), 0);
}

export type ResidentBillingFormDefaults = {
  rentAmountPaise: number;
  billingMonth: string;
  dueDate: string;
  billingDay: number;
  defaultPaymentMethod: string;
  pendingRentInvoiceId: string | null;
  pendingInvoiceNumber: string | null;
  pendingInvoiceStatus: string | null;
};

async function billingDayForBooking(bookingId: string): Promise<number> {
  const [stay] = await db
    .select({
      moveIn: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
    })
    .from(bedReservations)
    .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.status, 'active')))
    .limit(1);
  return stay?.moveIn ? billingDayFromMoveIn(stay.moveIn) : 5;
}

/** Sync billing day from the resident's check-in date. */
export async function syncBillingDayFromCheckIn(bookingId: string): Promise<number> {
  const billingDay = await billingDayForBooking(bookingId);
  await db
    .update(residentBillingProfiles)
    .set({ billingDay, updatedAt: new Date() })
    .where(eq(residentBillingProfiles.bookingId, bookingId));
  return billingDay;
}

export async function getBillingProfileForBooking(
  bookingId: string,
): Promise<ResidentBillingProfile | null> {
  const [row] = await db
    .select()
    .from(residentBillingProfiles)
    .where(eq(residentBillingProfiles.bookingId, bookingId))
    .limit(1);
  return row ?? null;
}

/** Create or refresh billing profile from booking pricing snapshot. */
export async function ensureBillingProfileForBooking(
  bookingId: string,
): Promise<ResidentBillingProfile | null> {
  const [booking] = await db
    .select({
      customerId: bookings.customerId,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) return null;

  const rentAmountPaise = monthlyRentFromSnapshot(
    booking.pricingSnapshot as PricingSnapshot | null,
  );
  if (rentAmountPaise <= 0) return null;

  const [pgRow] = await db
    .select({ pgId: floors.pgId })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')))
    .limit(1);

  if (!pgRow) return null;

  const billingDay = await billingDayForBooking(bookingId);

  const existing = await getBillingProfileForBooking(bookingId);
  if (existing) {
    const [updated] = await db
      .update(residentBillingProfiles)
      .set({
        rentAmountPaise,
        billingDay,
        updatedAt: new Date(),
      })
      .where(eq(residentBillingProfiles.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await db
    .insert(residentBillingProfiles)
    .values({
      bookingId,
      customerId: booking.customerId,
      pgId: pgRow.pgId,
      rentAmountPaise,
      billingDay,
      defaultPaymentMethod: 'upi',
      autoGenerate: true,
    })
    .onConflictDoNothing({ target: residentBillingProfiles.bookingId })
    .returning();

  if (created) return created;
  return getBillingProfileForBooking(bookingId);
}

export async function getResidentBillingFormDefaults(
  customerId: string,
  bookingId: string,
): Promise<ResidentBillingFormDefaults | null> {
  const profile = await ensureBillingProfileForBooking(bookingId);
  if (!profile) return null;

  const billingMonth = firstOfMonth(new Date());
  const dueDate = formatDate(dueDateForBillingDay(billingMonth, profile.billingDay));

  const [pending] = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      status: rentInvoices.status,
      rentPaise: rentInvoices.rentPaise,
      dueDate: rentInvoices.dueDate,
      billingMonth: rentInvoices.billingMonth,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, bookingId),
        eq(rentInvoices.customerId, customerId),
        eq(rentInvoices.isAdhoc, false),
      ),
    )
    .orderBy(desc(rentInvoices.billingMonth))
    .limit(1);

  const activePending =
    pending && !['paid', 'cancelled'].includes(pending.status) ? pending : null;

  return {
    rentAmountPaise: activePending?.rentPaise ?? profile.rentAmountPaise,
    billingMonth: activePending?.billingMonth ?? billingMonth,
    dueDate: activePending?.dueDate ?? dueDate,
    billingDay: profile.billingDay,
    defaultPaymentMethod: profile.defaultPaymentMethod,
    pendingRentInvoiceId: activePending?.id ?? null,
    pendingInvoiceNumber: activePending?.invoiceNumber ?? null,
    pendingInvoiceStatus: activePending?.status ?? null,
  };
}
