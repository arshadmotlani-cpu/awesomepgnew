/**
 * Admin-safe display for approved transaction-ref conflicts (payment review).
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bookings,
  customers,
  electricityInvoices,
  paymentLinks,
  pgPaymentRecords,
  playstationMemberships,
  rentInvoices,
  stayExtensions,
} from '@/src/db/schema';
import type { PgApprovedTxnSourceKind } from '@/src/db/schema/pgApprovedTransactionRefs';
import type {
  DuplicateTransactionRefReviewContext,
  DuplicateTransactionRefReviewContextEnriched,
  DuplicateTransactionRefConflictAdminView,
} from '@/src/lib/payments/duplicateTransactionRefOverride';

function purposeLabelForSourceKind(kind: string): string {
  switch (kind) {
    case 'pg_payment_record':
      return 'Booking / QR payment';
    case 'rent_invoice':
      return 'Rent';
    case 'electricity_invoice':
      return 'Electricity';
    case 'stay_extension':
      return 'Stay extension';
    case 'payment_link':
      return 'Deposit / payment link';
    case 'playstation_membership':
      return 'PlayStation membership';
    default:
      return 'Payment';
  }
}

async function conflictViewForRegistryRow(row: {
  sourceKind: string;
  sourceId: string;
  approvedAt: string | null;
  approvedByAdminId: string | null;
}): Promise<DuplicateTransactionRefConflictAdminView> {
  const kind = row.sourceKind as PgApprovedTxnSourceKind;
  const base = {
    sourceKind: row.sourceKind,
    sourceId: row.sourceId,
    paymentId: row.sourceId,
    residentName: null as string | null,
    bookingCode: null as string | null,
    amountPaise: null as number | null,
    approvedAt: row.approvedAt,
    purposeLabel: purposeLabelForSourceKind(row.sourceKind),
  };

  if (kind === 'pg_payment_record') {
    const [r] = await db
      .select({
        customerId: pgPaymentRecords.customerId,
        bookingId: pgPaymentRecords.bookingId,
        amountPaise: pgPaymentRecords.amountPaise,
      })
      .from(pgPaymentRecords)
      .where(eq(pgPaymentRecords.id, row.sourceId))
      .limit(1);
    if (!r) return base;
    const [customer] = r.customerId
      ? await db
          .select({ name: customers.fullName })
          .from(customers)
          .where(eq(customers.id, r.customerId))
          .limit(1)
      : [];
    const [booking] = r.bookingId
      ? await db
          .select({ bookingCode: bookings.bookingCode })
          .from(bookings)
          .where(eq(bookings.id, r.bookingId))
          .limit(1)
      : [];
    return {
      ...base,
      residentName: customer?.name ?? null,
      bookingCode: booking?.bookingCode ?? null,
      amountPaise: r.amountPaise,
    };
  }

  if (kind === 'rent_invoice') {
    const [r] = await db
      .select({
        customerId: rentInvoices.customerId,
        bookingId: rentInvoices.bookingId,
        amountPaise: rentInvoices.proofSnapshotOutstandingPaise,
        rentPaise: rentInvoices.rentPaise,
      })
      .from(rentInvoices)
      .where(eq(rentInvoices.id, row.sourceId))
      .limit(1);
    if (!r) return base;
    const [customer] = r.customerId
      ? await db
          .select({ name: customers.fullName })
          .from(customers)
          .where(eq(customers.id, r.customerId))
          .limit(1)
      : [];
    const [booking] = r.bookingId
      ? await db
          .select({ bookingCode: bookings.bookingCode })
          .from(bookings)
          .where(eq(bookings.id, r.bookingId))
          .limit(1)
      : [];
    return {
      ...base,
      residentName: customer?.name ?? null,
      bookingCode: booking?.bookingCode ?? null,
      amountPaise: r.amountPaise ?? r.rentPaise,
    };
  }

  if (kind === 'electricity_invoice') {
    const [r] = await db
      .select({
        customerId: electricityInvoices.customerId,
        bookingId: electricityInvoices.bookingId,
        amountPaise: electricityInvoices.amountPaise,
      })
      .from(electricityInvoices)
      .where(eq(electricityInvoices.id, row.sourceId))
      .limit(1);
    if (!r) return base;
    const [customer] = r.customerId
      ? await db
          .select({ name: customers.fullName })
          .from(customers)
          .where(eq(customers.id, r.customerId))
          .limit(1)
      : [];
    const [booking] = r.bookingId
      ? await db
          .select({ bookingCode: bookings.bookingCode })
          .from(bookings)
          .where(eq(bookings.id, r.bookingId))
          .limit(1)
      : [];
    return {
      ...base,
      residentName: customer?.name ?? null,
      bookingCode: booking?.bookingCode ?? null,
      amountPaise: r.amountPaise,
    };
  }

  if (kind === 'stay_extension') {
    const [r] = await db
      .select({
        bookingId: stayExtensions.bookingId,
        amountPaise: stayExtensions.quotedTotalPaise,
        customerId: bookings.customerId,
        bookingCode: bookings.bookingCode,
      })
      .from(stayExtensions)
      .innerJoin(bookings, eq(bookings.id, stayExtensions.bookingId))
      .where(eq(stayExtensions.id, row.sourceId))
      .limit(1);
    if (!r) return base;
    const [customer] = r.customerId
      ? await db
          .select({ name: customers.fullName })
          .from(customers)
          .where(eq(customers.id, r.customerId))
          .limit(1)
      : [];
    return {
      ...base,
      residentName: customer?.name ?? null,
      bookingCode: r.bookingCode ?? null,
      amountPaise: r.amountPaise,
    };
  }

  if (kind === 'payment_link') {
    const [r] = await db
      .select({
        residentId: paymentLinks.residentId,
        bookingId: paymentLinks.bookingId,
        amountPaise: paymentLinks.amount,
        purpose: paymentLinks.purpose,
      })
      .from(paymentLinks)
      .where(eq(paymentLinks.id, row.sourceId))
      .limit(1);
    if (!r) return base;
    const [customer] = r.residentId
      ? await db
          .select({ name: customers.fullName })
          .from(customers)
          .where(eq(customers.id, r.residentId))
          .limit(1)
      : [];
    const [booking] = r.bookingId
      ? await db
          .select({ bookingCode: bookings.bookingCode })
          .from(bookings)
          .where(eq(bookings.id, r.bookingId))
          .limit(1)
      : [];
    return {
      ...base,
      purposeLabel: r.purpose ? `Payment link (${r.purpose})` : base.purposeLabel,
      residentName: customer?.name ?? null,
      bookingCode: booking?.bookingCode ?? null,
      amountPaise: r.amountPaise,
    };
  }

  if (kind === 'playstation_membership') {
    const [r] = await db
      .select({
        customerId: playstationMemberships.customerId,
        bookingId: playstationMemberships.bookingId,
        amountPaise: playstationMemberships.amountPaise,
      })
      .from(playstationMemberships)
      .where(eq(playstationMemberships.id, row.sourceId))
      .limit(1);
    if (!r) return base;
    const [customer] = r.customerId
      ? await db
          .select({ name: customers.fullName })
          .from(customers)
          .where(eq(customers.id, r.customerId))
          .limit(1)
      : [];
    const [booking] = r.bookingId
      ? await db
          .select({ bookingCode: bookings.bookingCode })
          .from(bookings)
          .where(eq(bookings.id, r.bookingId))
          .limit(1)
      : [];
    return {
      ...base,
      residentName: customer?.name ?? null,
      bookingCode: booking?.bookingCode ?? null,
      amountPaise: r.amountPaise,
    };
  }

  return base;
}

export async function enrichDuplicateTransactionRefReviewContext(
  ctx: DuplicateTransactionRefReviewContext,
): Promise<DuplicateTransactionRefReviewContextEnriched> {
  const conflicts = await Promise.all(
    ctx.approvedRegistryConflicts.map((row) => conflictViewForRegistryRow(row)),
  );
  return { ...ctx, conflicts };
}
