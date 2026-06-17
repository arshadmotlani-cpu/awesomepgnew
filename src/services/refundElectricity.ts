/**
 * Electricity preview for deposit refund approval — uses existing invoices,
 * meter readings, or room-average estimate before wallet deduction.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  electricityBills,
  electricityInvoices,
  floors,
  meterLogs,
  pgs,
  rooms,
} from '@/src/db/schema';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import { formatDate } from '@/src/lib/dates';
import type { AdminSession } from '@/src/lib/auth/session';
import { assertAdminCanAccessPg } from '@/src/lib/auth/pgAccess';
import { firstOfMonth } from '@/src/services/billing';
import {
  createBillFromMeterLogs,
  createEstimatedMonthlyBill,
} from '@/src/services/meterElectricity';

export type RefundElectricityPreview =
  | {
      ok: true;
      billingMonth: string;
      units: number;
      ratePerUnitPaise: number;
      amountPaise: number;
      invoiceId: string;
      invoiceNumber: string;
      usedAverage: boolean;
      message: string;
    }
  | { ok: false; error: string };

async function bookingRoomContext(bookingId: string) {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      pgId: pgs.id,
      roomId: beds.roomId,
    })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(eq(bookings.id, bookingId), eq(bedReservations.kind, 'primary')),
    )
    .limit(1);
  return row ?? null;
}

async function pendingInvoiceForBooking(bookingId: string) {
  const [row] = await db
    .select({
      invoiceId: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      amountPaise: electricityInvoices.amountPaise,
      unitsShare: electricityInvoices.unitsShare,
      billingMonth: electricityInvoices.billingMonth,
      ratePerUnitPaise: electricityBills.ratePerUnitPaise,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .where(
      and(
        eq(electricityInvoices.bookingId, bookingId),
        eq(electricityInvoices.status, 'pending'),
      ),
    )
    .orderBy(desc(electricityInvoices.billingMonth))
    .limit(1);
  return row ?? null;
}

async function invoiceAfterBill(bookingId: string, billId: string) {
  const [row] = await db
    .select({
      invoiceId: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      amountPaise: electricityInvoices.amountPaise,
      unitsShare: electricityInvoices.unitsShare,
      billingMonth: electricityInvoices.billingMonth,
      ratePerUnitPaise: electricityBills.ratePerUnitPaise,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .where(
      and(
        eq(electricityInvoices.bookingId, bookingId),
        eq(electricityInvoices.electricityBillId, billId),
      ),
    )
    .limit(1);
  return row ?? null;
}

function toPreview(
  row: {
    invoiceId: string;
    invoiceNumber: string;
    amountPaise: number;
    unitsShare: string | null;
    billingMonth: string;
    ratePerUnitPaise: number;
  },
  usedAverage: boolean,
  message: string,
): Extract<RefundElectricityPreview, { ok: true }> {
  const units = row.unitsShare ? Number(row.unitsShare) : 0;
  return {
    ok: true,
    billingMonth: row.billingMonth,
    units,
    ratePerUnitPaise: row.ratePerUnitPaise,
    amountPaise: row.amountPaise,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
    usedAverage,
    message,
  };
}

export async function calculateRefundElectricityForBooking(
  session: AdminSession,
  input: { bookingId: string; useAverageFallback?: boolean },
): Promise<RefundElectricityPreview> {
  const ctx = await bookingRoomContext(input.bookingId);
  if (!ctx) {
    return { ok: false, error: 'Booking or room not found.' };
  }

  try {
    assertAdminCanAccessPg(session, ctx.pgId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }

  const existing = await pendingInvoiceForBooking(input.bookingId);
  if (existing) {
    return toPreview(
      existing,
      false,
      `Using pending invoice ${existing.invoiceNumber} for ${existing.billingMonth}.`,
    );
  }

  const billingMonth = firstOfMonth(formatDate(new Date()));
  const ratePerUnitPaise = DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE;

  if (input.useAverageFallback) {
    const bill = await createEstimatedMonthlyBill(session, {
      roomId: ctx.roomId,
      billingMonth,
      ratePerUnitPaise,
    });
    if (!bill.ok) {
      return { ok: false, error: bill.message };
    }
    const invoice = await invoiceAfterBill(input.bookingId, bill.billId);
    if (!invoice) {
      return { ok: false, error: 'Bill created but no invoice for this booking.' };
    }
    return toPreview(
      invoice,
      true,
      `Estimated from room average for ${billingMonth}. Invoice ${invoice.invoiceNumber} generated.`,
    );
  }

  const [latestLog] = await db
    .select()
    .from(meterLogs)
    .where(and(eq(meterLogs.roomId, ctx.roomId), eq(meterLogs.isEstimated, false)))
    .orderBy(desc(meterLogs.recordedAt))
    .limit(1);

  if (latestLog) {
    const bill = await createBillFromMeterLogs(session, {
      roomId: ctx.roomId,
      billingMonth,
      ratePerUnitPaise,
      endMeterLogId: latestLog.id,
    });
    if (bill.ok) {
      const invoice = await invoiceAfterBill(input.bookingId, bill.billId);
      if (invoice) {
        return toPreview(
          invoice,
          false,
          `Generated from meter reading for ${billingMonth}. Invoice ${invoice.invoiceNumber}.`,
        );
      }
    }
  }

  const [existingBill] = await db
    .select({ id: electricityBills.id })
    .from(electricityBills)
    .where(
      and(
        eq(electricityBills.roomId, ctx.roomId),
        eq(electricityBills.billingMonth, billingMonth),
      ),
    )
    .limit(1);

  if (existingBill) {
    const invoice = await invoiceAfterBill(input.bookingId, existingBill.id);
    if (invoice) {
      return toPreview(invoice, false, `Using invoice from existing room bill for ${billingMonth}.`);
    }
  }

  return {
    ok: false,
    error:
      'No meter reading or pending invoice found. Enable "Auto average per room" or enter electricity manually.',
  };
}
