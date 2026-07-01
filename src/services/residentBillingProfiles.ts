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
import {
  billingDayFromMoveIn,
  computeNextRentDueDate,
  dueDateForBillingDay,
  firstAutoBillingDate,
  firstOfMonth,
} from '@/src/services/billing';
import { formatDate } from '@/src/lib/dates';
import { resolveMonthlyRentPaiseForBooking } from '@/src/lib/billing/rentPricingSsot';
import { sql } from 'drizzle-orm';

function monthlyRentFromSnapshot(snapshot: PricingSnapshot | null): number {
  if (!snapshot || !Array.isArray(snapshot.perBed)) return 0;
  return snapshot.perBed.reduce((acc, bed) => acc + (bed.monthlyRatePaise ?? 0), 0);
}

export type ResidentLastInvoiceSnapshot = {
  invoiceDate: string;
  statusLabel: 'Paid' | 'Pending' | 'Awaiting approval';
  amountPaise: number;
  invoiceNumber: string;
};

export type ResidentBillingFormDefaults = {
  rentAmountPaise: number;
  billingMonth: string;
  /** Earliest open rent bill due date, or next cycle due for new charges. */
  dueDate: string;
  /** Next future rent due date for profile display (never a past cycle). */
  nextRentDueDate: string;
  billingDay: number;
  defaultPaymentMethod: string;
  pendingRentInvoiceId: string | null;
  pendingInvoiceNumber: string | null;
  pendingInvoiceStatus: string | null;
  lastInvoice: ResidentLastInvoiceSnapshot | null;
};

function rentInvoiceStatusLabel(
  status: string,
  paymentProofUrl: string | null,
): ResidentLastInvoiceSnapshot['statusLabel'] {
  if (status === 'paid') return 'Paid';
  if (paymentProofUrl) return 'Awaiting approval';
  return 'Pending';
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

async function billingDayForBooking(bookingId: string): Promise<number> {
  const moveIn = await moveInDateForBooking(bookingId);
  return moveIn ? billingDayFromMoveIn(moveIn) : 5;
}

function billingCycleFields(moveIn: string, billingDay: number) {
  return {
    billingAnchorDate: moveIn,
    firstAutoBillingDate: firstAutoBillingDate(moveIn, billingDay),
  };
}

/** Sync billing day from the resident's check-in date. */
export async function syncBillingDayFromCheckIn(bookingId: string): Promise<number> {
  const moveIn = await moveInDateForBooking(bookingId);
  const billingDay = moveIn ? billingDayFromMoveIn(moveIn) : 5;
  const cycle = moveIn ? billingCycleFields(moveIn, billingDay) : {};
  await db
    .update(residentBillingProfiles)
    .set({ billingDay, ...cycle, updatedAt: new Date() })
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

/** Create or refresh billing profile — rent from bed_prices / room config, not stale snapshot. */
export async function ensureBillingProfileForBooking(
  bookingId: string,
): Promise<ResidentBillingProfile | null> {
  const [booking] = await db
    .select({
      customerId: bookings.customerId,
      durationMode: bookings.durationMode,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) return null;

  const billingMonth = firstOfMonth(new Date());
  const resolved = await resolveMonthlyRentPaiseForBooking(bookingId, billingMonth);
  const snapshotRent = monthlyRentFromSnapshot(
    booking.pricingSnapshot as PricingSnapshot | null,
  );
  const rentAmountPaise =
    resolved.source === 'bed_price' || resolved.source === 'private_room_config'
      ? resolved.rentPaise
      : resolved.rentPaise > 0
        ? resolved.rentPaise
        : snapshotRent;
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

  const moveIn = await moveInDateForBooking(bookingId);
  const billingDay = moveIn ? billingDayFromMoveIn(moveIn) : 5;
  const cycle = moveIn ? billingCycleFields(moveIn, billingDay) : {};
  const autoGenerate =
    booking.durationMode !== 'fixed_stay' &&
    booking.durationMode !== 'daily' &&
    booking.durationMode !== 'weekly' &&
    booking.durationMode !== 'reserve';

  const existing = await getBillingProfileForBooking(bookingId);
  if (existing) {
    const profileRent =
      resolved.source === 'bed_price' || resolved.source === 'private_room_config'
        ? resolved.rentPaise
        : existing.rentAmountPaise > 0
          ? existing.rentAmountPaise
          : rentAmountPaise;
    const [updated] = await db
      .update(residentBillingProfiles)
      .set({
        rentAmountPaise: profileRent,
        billingDay,
        autoGenerate,
        ...cycle,
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
      autoGenerate,
      ...cycle,
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
  const calendarDueDate = formatDate(dueDateForBillingDay(billingMonth, profile.billingDay));
  const moveIn = await moveInDateForBooking(bookingId);

  const [latest] = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      status: rentInvoices.status,
      rentPaise: rentInvoices.rentPaise,
      dueDate: rentInvoices.dueDate,
      billingMonth: rentInvoices.billingMonth,
      paymentProofUrl: rentInvoices.paymentProofUrl,
      createdAt: rentInvoices.createdAt,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, bookingId),
        eq(rentInvoices.customerId, customerId),
        eq(rentInvoices.isAdhoc, false),
        sql`${rentInvoices.status} != 'cancelled'`,
      ),
    )
    .orderBy(desc(rentInvoices.billingMonth), desc(rentInvoices.createdAt))
    .limit(1);

  const activePending =
    latest && !['paid', 'cancelled'].includes(latest.status) ? latest : null;

  const today = formatDate(new Date());
  const openDueForDisplay =
    activePending?.dueDate && activePending.dueDate >= today ? activePending.dueDate : null;
  const nextRentDueDate = moveIn
    ? computeNextRentDueDate({
        moveInDate: moveIn,
        billingDay: profile.billingDay,
        openInvoiceDueDate: openDueForDisplay,
      })
    : calendarDueDate >= today
      ? calendarDueDate
      : computeNextRentDueDate({
          moveInDate: billingMonth,
          billingDay: profile.billingDay,
        });

  const lastInvoice: ResidentLastInvoiceSnapshot | null = latest
    ? {
        invoiceDate: formatDate(latest.createdAt),
        statusLabel: rentInvoiceStatusLabel(latest.status, latest.paymentProofUrl),
        amountPaise: latest.rentPaise,
        invoiceNumber: latest.invoiceNumber,
      }
    : null;

  return {
    rentAmountPaise: activePending?.rentPaise ?? profile.rentAmountPaise,
    billingMonth: activePending?.billingMonth ?? billingMonth,
    dueDate: activePending?.dueDate ?? nextRentDueDate,
    nextRentDueDate,
    billingDay: profile.billingDay,
    defaultPaymentMethod: profile.defaultPaymentMethod,
    pendingRentInvoiceId: activePending?.id ?? null,
    pendingInvoiceNumber: activePending?.invoiceNumber ?? null,
    pendingInvoiceStatus: activePending?.status ?? null,
    lastInvoice,
  };
}
