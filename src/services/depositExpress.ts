/**
 * Deposit Express — security deposit collection workspace (isolated from rent/electricity).
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  customers,
  financialInvoices,
  floors,
  payments,
  pgs,
  rooms,
} from '@/src/db/schema';
import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import { createInvoiceShareToken } from '@/src/lib/billing/invoiceShareToken';
import { nextFinancialInvoiceNumber } from '@/src/lib/billing/invoiceNumbering.server';
import { formatDate } from '@/src/lib/dates';
import {
  depositRemainingDuePaise,
  depositWalletBalancePaise,
} from '@/src/lib/deposits/depositCollectibility';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { syncDepositCollectionFromLedger } from '@/src/services/depositCollection';
import { getDepositSummaryForBooking, recordDepositCollected } from '@/src/services/deposits';
import {
  listRefundConsoleBookingsForCustomer,
  searchRefundConsoleBookings,
  type RefundConsoleBookingRow,
} from '@/src/services/refundConsole';

export type DepositExpressContext = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  requiredDepositPaise: number;
  alreadyPaidPaise: number;
  remainingDuePaise: number;
  walletBalancePaise: number;
};

export type DepositExpressPaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'other';

export type ExecuteDepositExpressInput = {
  bookingId: string;
  requiredDepositPaise: number;
  paidAmountPaise: number;
  paymentMethod: DepositExpressPaymentMethod;
  reference?: string | null;
  notes?: string | null;
  adminId: string;
};

export type ExecuteDepositExpressResult =
  | {
      ok: true;
      message: string;
      invoiceId?: string;
      invoiceNumber?: string;
      paymentId?: string;
      remainingDuePaise: number;
    }
  | { ok: false; error: string };

function expressProvider(
  method: DepositExpressPaymentMethod,
): 'cash' | 'upi_manual' | 'bank_transfer' | 'mock' {
  if (method === 'cash') return 'cash';
  if (method === 'bank_transfer') return 'bank_transfer';
  return 'upi_manual';
}

async function loadBookingRow(bookingId: string) {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      depositPaise: bookings.depositPaise,
      pgId: floors.pgId,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row ?? null;
}

export async function loadDepositExpressContext(
  bookingId: string,
): Promise<DepositExpressContext | null> {
  const row = await loadBookingRow(bookingId);
  if (!row?.pgId) return null;

  const summary = await getDepositSummaryForBooking(bookingId);
  const walletBalancePaise = depositWalletBalancePaise(summary?.collectedPaise ?? 0);
  const requiredDepositPaise = guardDepositPaise(row.depositPaise, 'depositExpress.required');
  const remainingDuePaise = depositRemainingDuePaise(requiredDepositPaise, walletBalancePaise);

  return {
    bookingId: row.bookingId,
    bookingCode: row.bookingCode,
    customerId: row.customerId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    pgId: row.pgId,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    requiredDepositPaise,
    alreadyPaidPaise: walletBalancePaise,
    remainingDuePaise,
    walletBalancePaise,
  };
}

export async function searchDepositExpressResidents(query: string) {
  return searchRefundConsoleBookings(query);
}

export async function listDepositExpressBookingsForCustomer(
  customerId: string,
): Promise<RefundConsoleBookingRow[]> {
  return listRefundConsoleBookingsForCustomer(customerId);
}

async function findOpenDepositDueInvoice(bookingId: string) {
  const [row] = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      amountPaise: financialInvoices.amountPaise,
      status: financialInvoices.status,
    })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.bookingId, bookingId),
        eq(financialInvoices.invoiceType, 'deposit'),
        inArray(financialInvoices.status, ['sent', 'overdue', 'draft', 'partial']),
      ),
    )
    .orderBy(desc(financialInvoices.createdAt))
    .limit(1);
  return row ?? null;
}

async function upsertDepositDueInvoice(input: {
  bookingId: string;
  customerId: string;
  pgId: string;
  roomNumber: string;
  amountPaise: number;
  notes?: string | null;
  status: 'sent' | 'paid';
  paidAt?: Date;
}): Promise<{ invoiceId: string; invoiceNumber: string } | null> {
  if (input.amountPaise <= 0) return null;

  const existing = await findOpenDepositDueInvoice(input.bookingId);
  const label = 'Security deposit due';
  const breakdown: InvoiceBreakdown = {
    depositPaise: input.amountPaise,
    depositOutstandingPaise: input.amountPaise,
    lines: [{ kind: 'deposit', label, amountPaise: input.amountPaise }],
    paidPaise: input.status === 'paid' ? input.amountPaise : 0,
  };

  if (existing && input.status === 'sent') {
    await db
      .update(financialInvoices)
      .set({
        amountPaise: input.amountPaise,
        breakdown,
        status: 'sent',
        dueDate: formatDate(new Date()),
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(financialInvoices.id, existing.id));
    return { invoiceId: existing.id, invoiceNumber: existing.invoiceNumber };
  }

  const invoiceNumber = await nextFinancialInvoiceNumber({ pgId: input.pgId });
  const paidAt = input.paidAt ?? new Date();
  const [row] = await db
    .insert(financialInvoices)
    .values({
      invoiceNumber,
      invoiceType: 'deposit',
      customerId: input.customerId,
      bookingId: input.bookingId,
      pgId: input.pgId,
      roomNumber: input.roomNumber,
      amountPaise: input.amountPaise,
      breakdown,
      status: input.status,
      dueDate: formatDate(new Date()),
      sentAt: paidAt,
      paidAt: input.status === 'paid' ? paidAt : null,
      notes: input.notes ?? 'Deposit Express',
      shareToken: createInvoiceShareToken(),
    })
    .returning({ id: financialInvoices.id, invoiceNumber: financialInvoices.invoiceNumber });

  return { invoiceId: row.id, invoiceNumber: row.invoiceNumber };
}

/** Record deposit collection — never touches rent or electricity SSOT tables. */
export async function executeDepositExpress(
  input: ExecuteDepositExpressInput,
): Promise<ExecuteDepositExpressResult> {
  const requiredDepositPaise = guardDepositPaise(
    input.requiredDepositPaise,
    'depositExpress.input.required',
  );
  const paidAmountPaise = guardDepositPaise(input.paidAmountPaise, 'depositExpress.input.paid');

  if (requiredDepositPaise <= 0) {
    return { ok: false, error: 'Required deposit must be greater than zero.' };
  }
  if (paidAmountPaise < 0) {
    return { ok: false, error: 'Paid amount cannot be negative.' };
  }

  const row = await loadBookingRow(input.bookingId);
  if (!row?.pgId) return { ok: false, error: 'Booking not found.' };

  const summaryBefore = await getDepositSummaryForBooking(input.bookingId);
  const walletBefore = depositWalletBalancePaise(summaryBefore?.collectedPaise ?? 0);
  const maxCollectNow = depositRemainingDuePaise(requiredDepositPaise, walletBefore);

  if (paidAmountPaise > maxCollectNow) {
    return {
      ok: false,
      error: `Paid amount exceeds remaining deposit due (₹${(maxCollectNow / 100).toFixed(2)}).`,
    };
  }

  if (requiredDepositPaise !== row.depositPaise) {
    await db
      .update(bookings)
      .set({ depositPaise: requiredDepositPaise, updatedAt: new Date() })
      .where(eq(bookings.id, input.bookingId));
  }

  let paymentId: string | undefined;
  if (paidAmountPaise > 0) {
    const provider = expressProvider(input.paymentMethod);
    const providerPaymentId = `deposit-express-${input.bookingId}-${Date.now()}`;
    const reasonParts = [
      'Deposit Express',
      input.reference?.trim() ? `Ref: ${input.reference.trim()}` : null,
      input.notes?.trim() ?? null,
    ].filter(Boolean);

    const [payment] = await db
      .insert(payments)
      .values({
        bookingId: input.bookingId,
        purpose: 'deposit',
        provider,
        providerPaymentId,
        amountPaise: paidAmountPaise,
        status: 'succeeded',
        rawPayload: {
          source: 'deposit_express',
          method: input.paymentMethod,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
        },
        paidAt: new Date(),
      })
      .returning({ id: payments.id });

    paymentId = payment.id;

    await recordDepositCollected({
      bookingId: input.bookingId,
      customerId: row.customerId,
      amountPaise: paidAmountPaise,
      reason: reasonParts.join(' · '),
      relatedPaymentId: payment.id,
      createdByAdminId: input.adminId,
    });
  }

  await syncDepositCollectionFromLedger(input.bookingId);

  const summaryAfter = await getDepositSummaryForBooking(input.bookingId);
  const walletAfter = depositWalletBalancePaise(summaryAfter?.collectedPaise ?? 0);
  const remainingDuePaise = depositRemainingDuePaise(requiredDepositPaise, walletAfter);

  let invoiceId: string | undefined;
  let invoiceNumber: string | undefined;

  if (remainingDuePaise > 0) {
    const inv = await upsertDepositDueInvoice({
      bookingId: input.bookingId,
      customerId: row.customerId,
      pgId: row.pgId,
      roomNumber: row.roomNumber,
      amountPaise: remainingDuePaise,
      notes: input.notes,
      status: 'sent',
    });
    if (inv) {
      invoiceId = inv.invoiceId;
      invoiceNumber = inv.invoiceNumber;
    }
  } else if (paidAmountPaise > 0) {
    const inv = await upsertDepositDueInvoice({
      bookingId: input.bookingId,
      customerId: row.customerId,
      pgId: row.pgId,
      roomNumber: row.roomNumber,
      amountPaise: paidAmountPaise,
      notes: input.notes,
      status: 'paid',
      paidAt: new Date(),
    });
    if (inv) {
      invoiceId = inv.invoiceId;
      invoiceNumber = inv.invoiceNumber;
    }
  } else {
    const open = await findOpenDepositDueInvoice(input.bookingId);
    if (open) {
      await db
        .update(financialInvoices)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(financialInvoices.id, open.id));
    }
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'deposit_express_recorded',
    diff: {
      requiredDepositPaise,
      paidAmountPaise,
      remainingDuePaise,
      paymentMethod: input.paymentMethod,
      reference: input.reference ?? null,
      invoiceNumber: invoiceNumber ?? null,
    },
  });

  const message =
    remainingDuePaise > 0
      ? invoiceNumber
        ? `Recorded ₹${(paidAmountPaise / 100).toFixed(2)} deposit. Deposit due invoice ${invoiceNumber} for ₹${(remainingDuePaise / 100).toFixed(2)}.`
        : `Recorded ₹${(paidAmountPaise / 100).toFixed(2)} deposit. ₹${(remainingDuePaise / 100).toFixed(2)} still due.`
      : paidAmountPaise > 0
        ? `Deposit fully collected — ₹${(paidAmountPaise / 100).toFixed(2)} recorded to wallet.`
        : `Deposit due invoice created for ₹${(requiredDepositPaise / 100).toFixed(2)}.`;

  return {
    ok: true,
    message,
    invoiceId,
    invoiceNumber,
    paymentId,
    remainingDuePaise,
  };
}

/** Bookings where required deposit exceeds wallet balance — Deposit Due queue SSOT. */
export async function listDepositDueBookings(session?: {
  role: string;
  pgScope: string[];
}): Promise<
  Array<{
    bookingId: string;
    bookingCode: string;
    customerId: string;
    customerName: string;
    customerPhone: string | null;
    pgId: string;
    pgName: string;
    roomNumber: string;
    bedCode: string;
    requiredDepositPaise: number;
    alreadyPaidPaise: number;
    remainingDuePaise: number;
  }>
> {
  const { listOutstandingDepositsFromEngine } = await import('./residentFinancialEngine');
  const rows = await listOutstandingDepositsFromEngine(
    session as import('@/src/lib/auth/session').AdminSession | undefined,
  );

  return rows
    .filter((r) => r.depositDuePaise > 0)
    .map((r) => ({
      bookingId: r.bookingId,
      bookingCode: r.bookingCode,
      customerId: r.customerId,
      customerName: r.customerFullName,
      customerPhone: r.customerPhone,
      pgId: r.pgId,
      pgName: r.pgName,
      roomNumber: r.roomNumber,
      bedCode: r.bedCode,
      requiredDepositPaise: r.depositPaise,
      alreadyPaidPaise: r.collectedPaise,
      remainingDuePaise: r.depositDuePaise,
    }));
}
