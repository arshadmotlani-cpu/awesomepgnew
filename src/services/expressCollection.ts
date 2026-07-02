/**
 * Express Collection — record money already collected (historical / offline)
 * without creating payment links or outstanding debt.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  financialInvoices,
  floors,
  payments,
  pgs,
  rentInvoices,
  rooms,
} from '@/src/db/schema';
import type { NewElectricityInvoice } from '@/src/db/schema/electricityInvoices';
import {
  EXPRESS_COLLECTION_NOTE_PREFIX,
  expressCollectionProvider,
  type ExpressCollectionChargeType,
  type ExpressCollectionPaymentMethod,
} from '@/src/lib/billing/expressCollectionConstants';
import { getElectricityInvoiceSchemaCaps } from '@/src/lib/db/electricityInvoiceSchemaCaps';
import { fetchElectricityInvoiceByBookingAndMonth } from '@/src/lib/db/electricityInvoiceSelect';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import { createInvoiceShareToken } from '@/src/lib/billing/invoiceShareToken';
import { nextFinancialInvoiceNumber } from '@/src/lib/billing/invoiceNumbering.server';
import { formatDate, parseDate } from '@/src/lib/dates';
import { dueDateForMonth, firstOfMonth } from '@/src/services/billing';
import { syncDepositCollectionFromLedger } from '@/src/services/depositCollection';
import { recordDepositCollected } from '@/src/services/deposits';
import { recordElectricityPaymentSuccess } from '@/src/services/electricityBilling';
import { recordRentPaymentSuccess, ensureMonthlyRentInvoice } from '@/src/services/rentInvoices';

export type RecordExpressCollectionInput = {
  customerId: string;
  bookingId?: string | null;
  chargeType: ExpressCollectionChargeType;
  amountPaise: number;
  billingMonth?: string | null;
  paymentDate: string;
  paymentMethod: ExpressCollectionPaymentMethod;
  referenceNumber?: string | null;
  notes?: string | null;
  customTitle?: string | null;
  createAsPaid: boolean;
  actorId: string;
};

export type RecordExpressCollectionResult =
  | {
      ok: true;
      chargeType: ExpressCollectionChargeType;
      amountPaise: number;
      paymentId?: string;
      invoiceId?: string;
      invoiceNumber?: string;
      rentInvoiceId?: string;
      message: string;
    }
  | { ok: false; error: string };

type ResidentCtx = {
  customerId: string;
  customerName: string;
  bookingId: string;
  bedId: string;
  pgId: string;
  pgName: string;
  roomId: string;
  roomNumber: string;
};

function pgErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const c = (cause as { code?: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return null;
}

function monthLabel(billingMonth: string): string {
  const d = parseDate(billingMonth);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function nextRentInvoiceNumber(billingMonth: string, attempt = 0): Promise<string> {
  const label = monthLabel(billingMonth);
  const prefix = `RNT-${label}-`;
  const [row] = await db.execute<{ c: number }>(sql`
    SELECT count(*)::int AS c FROM rent_invoices
    WHERE invoice_number LIKE ${prefix + '%'}
  `);
  const seq = Number((Array.from(row ? [row] : [])[0] as { c: number } | undefined)?.c ?? 0) + 1 + attempt;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function nextElectricityInvoiceNumber(billingMonth: string, attempt = 0): Promise<string> {
  const label = monthLabel(billingMonth);
  const prefix = `ELC-${label}-`;
  const [row] = await db.execute<{ c: number }>(sql`
    SELECT count(*)::int AS c FROM electricity_invoices
    WHERE billing_month = ${firstOfMonth(billingMonth)}
  `);
  const seq = Number((Array.from(row ? [row] : [])[0] as { c: number } | undefined)?.c ?? 0) + 1 + attempt;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function loadResidentCtx(
  customerId: string,
  bookingId?: string | null,
): Promise<ResidentCtx | null> {
  const bookingFilter = bookingId
    ? eq(bookings.id, bookingId)
    : eq(bookings.customerId, customerId);

  const [row] = await db
    .select({
      customerId: customers.id,
      customerName: customers.fullName,
      bookingId: bookings.id,
      bedId: beds.id,
      pgId: pgs.id,
      pgName: pgs.name,
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(and(bookingFilter, eq(bedReservations.kind, 'primary')))
    .limit(1);

  return row ?? null;
}

function buildProviderPaymentId(input: RecordExpressCollectionInput, ctx: ResidentCtx): string {
  if (input.referenceNumber?.trim()) {
    return `express-historical:${input.referenceNumber.trim()}`;
  }
  const month = input.billingMonth ? firstOfMonth(input.billingMonth) : 'na';
  return `express-historical:${ctx.bookingId}:${input.chargeType}:${month}:${input.amountPaise}:${input.paymentDate}`;
}

function buildRawPayload(input: RecordExpressCollectionInput) {
  return {
    expressCollection: true,
    historical: true,
    chargeType: input.chargeType,
    paymentMethod: input.paymentMethod,
    paymentDate: input.paymentDate,
    referenceNumber: input.referenceNumber ?? null,
    notes: input.notes ?? null,
  };
}

async function writeExpressCollectionAudit(
  input: RecordExpressCollectionInput,
  ctx: ResidentCtx,
  extra: Record<string, unknown>,
) {
  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.actorId,
    entity: 'resident',
    entityId: ctx.customerId,
    action: 'historical_payment_recorded',
    diff: {
      residentId: ctx.customerId,
      bookingId: ctx.bookingId,
      amountPaise: input.amountPaise,
      chargeType: input.chargeType,
      paymentDate: input.paymentDate,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber ?? null,
      billingMonth: input.billingMonth ?? null,
      notes: input.notes ?? null,
      timestamp: new Date().toISOString(),
      ...extra,
    },
  });
}

async function recordExpressRent(
  input: RecordExpressCollectionInput,
  ctx: ResidentCtx,
  paidAt: Date,
): Promise<RecordExpressCollectionResult> {
  if (!input.billingMonth) {
    return { ok: false, error: 'Billing month is required for rent.' };
  }

  const billingMonth = firstOfMonth(input.billingMonth);
  const note = [EXPRESS_COLLECTION_NOTE_PREFIX, input.notes].filter(Boolean).join(' · ');
  const provider = expressCollectionProvider(input.paymentMethod);
  const providerPaymentId = buildProviderPaymentId(input, ctx);
  const rawPayload = buildRawPayload(input);

  const ensured = await ensureMonthlyRentInvoice({
    bookingId: ctx.bookingId,
    billingMonth,
    amountPaise: input.amountPaise,
    expressWalkInRetry: true,
  });
  if (!ensured.ok) {
    return { ok: false, error: ensured.error };
  }

  if (ensured.status === 'paid') {
    return {
      ok: true,
      chargeType: 'rent',
      amountPaise: input.amountPaise,
      rentInvoiceId: ensured.invoiceId,
      invoiceNumber: ensured.invoiceNumber,
      message: 'Rent for this month is already recorded as paid.',
    };
  }

  if (ensured.status === 'payment_in_progress') {
    return {
      ok: false,
      error: 'Rent payment is in progress for this month — finish or cancel payment first.',
    };
  }

  const invoiceId = ensured.invoiceId;
  const invoiceNumber = ensured.invoiceNumber;

  if (note) {
    await db
      .update(rentInvoices)
      .set({ notes: note, updatedAt: new Date() })
      .where(eq(rentInvoices.id, invoiceId));
  }

  const payResult = await recordRentPaymentSuccess({
    provider: 'mock',
    offlineProvider: provider,
    providerPaymentId,
    amountPaise: input.amountPaise,
    invoiceId,
    rawPayload,
    paidAt,
    historical: true,
  });

  if (!payResult.ok) {
    return { ok: false, error: payResult.reason };
  }

  await writeExpressCollectionAudit(input, ctx, {
    rentInvoiceId: invoiceId,
    invoiceNumber,
    paymentId: payResult.paymentId,
  });

  return {
    ok: true,
    chargeType: 'rent',
    amountPaise: input.amountPaise,
    paymentId: payResult.paymentId,
    rentInvoiceId: invoiceId,
    invoiceNumber,
    message: `Recorded historical rent payment — ${invoiceNumber}.`,
  };
}

async function recordExpressDeposit(
  input: RecordExpressCollectionInput,
  ctx: ResidentCtx,
  paidAt: Date,
): Promise<RecordExpressCollectionResult> {
  const provider = expressCollectionProvider(input.paymentMethod);
  const providerPaymentId = buildProviderPaymentId(input, ctx);
  const rawPayload = buildRawPayload(input);
  const reason = [EXPRESS_COLLECTION_NOTE_PREFIX, input.notes].filter(Boolean).join(' · ');

  const [existingPayment] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.provider, provider), eq(payments.providerPaymentId, providerPaymentId)))
    .limit(1);

  if (existingPayment) {
    return {
      ok: true,
      chargeType: 'deposit',
      amountPaise: input.amountPaise,
      paymentId: existingPayment.id,
      message: 'This historical deposit payment was already recorded.',
    };
  }

  const [payment] = await db
    .insert(payments)
    .values({
      bookingId: ctx.bookingId,
      purpose: 'deposit',
      provider,
      providerPaymentId,
      amountPaise: input.amountPaise,
      status: 'succeeded',
      rawPayload,
      paidAt,
    })
    .returning({ id: payments.id });

  await recordDepositCollected({
    bookingId: ctx.bookingId,
    customerId: ctx.customerId,
    amountPaise: input.amountPaise,
    reason,
    relatedPaymentId: payment.id,
    createdByAdminId: input.actorId,
  });
  await syncDepositCollectionFromLedger(ctx.bookingId);

  await writeExpressCollectionAudit(input, ctx, { paymentId: payment.id });

  return {
    ok: true,
    chargeType: 'deposit',
    amountPaise: input.amountPaise,
    paymentId: payment.id,
    message: 'Recorded historical deposit collection.',
  };
}

async function recordExpressElectricity(
  input: RecordExpressCollectionInput,
  ctx: ResidentCtx,
  paidAt: Date,
): Promise<RecordExpressCollectionResult> {
  if (!input.billingMonth) {
    return { ok: false, error: 'Billing month is required for electricity.' };
  }

  const billingMonth = firstOfMonth(input.billingMonth);
  const provider = expressCollectionProvider(input.paymentMethod);
  const providerPaymentId = buildProviderPaymentId(input, ctx);
  const rawPayload = buildRawPayload(input);
  const dueDate = formatDate(dueDateForMonth(billingMonth));
  const note = [EXPRESS_COLLECTION_NOTE_PREFIX, input.notes].filter(Boolean).join(' · ');

  const existing = await fetchElectricityInvoiceByBookingAndMonth(ctx.bookingId, billingMonth);

  let invoiceId: string;
  let invoiceNumber: string;

  if (existing) {
    if (existing.status === 'paid') {
      if (existing.amountPaise === input.amountPaise) {
        return {
          ok: true,
          chargeType: 'electricity',
          amountPaise: input.amountPaise,
          invoiceId: existing.id,
          invoiceNumber: existing.invoiceNumber,
          message: 'Electricity for this month is already recorded as paid.',
        };
      }
      return {
        ok: false,
        error: `Electricity invoice ${existing.invoiceNumber} is already paid with a different amount.`,
      };
    }
    if (existing.amountPaise !== input.amountPaise) {
      await db
        .update(electricityInvoices)
        .set({ amountPaise: input.amountPaise, updatedAt: new Date() })
        .where(eq(electricityInvoices.id, existing.id));
    }
    invoiceId = existing.id;
    invoiceNumber = existing.invoiceNumber;
  } else {
    const invoiceSchemaCaps = await getElectricityInvoiceSchemaCaps();
    const result = await db.transaction(async (tx) => {
      const [bill] = await tx
        .insert(electricityBills)
        .values({
          pgId: ctx.pgId,
          roomId: ctx.roomId,
          billingMonth,
          previousReadingUnits: '0',
          currentReadingUnits: '1',
          unitsConsumed: '1',
          ratePerUnitPaise: input.amountPaise,
          totalPaise: input.amountPaise,
          monthlyOccupantCount: 1,
          perResidentPaise: input.amountPaise,
          roundingRemainderPaise: 0,
          createdByAdminId: input.actorId,
          isEstimated: true,
          notes: note,
        })
        .onConflictDoNothing({ target: [electricityBills.roomId, electricityBills.billingMonth] })
        .returning({ id: electricityBills.id });

      let billId = bill?.id;
      if (!billId) {
        const [existingBill] = await tx
          .select({ id: electricityBills.id })
          .from(electricityBills)
          .where(
            and(
              eq(electricityBills.roomId, ctx.roomId),
              eq(electricityBills.billingMonth, billingMonth),
            ),
          )
          .limit(1);
        billId = existingBill?.id;
      }
      if (!billId) throw new Error('Could not create electricity bill.');

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const invNum = await nextElectricityInvoiceNumber(billingMonth, attempt);
        try {
          const [inv] = await tx
            .insert(electricityInvoices)
            .values({
              invoiceNumber: invNum,
              electricityBillId: billId,
              ...(invoiceSchemaCaps.roomId ? { roomId: ctx.roomId } : {}),
              bookingId: ctx.bookingId,
              customerId: ctx.customerId,
              bedId: ctx.bedId,
              billingMonth,
              dueDate,
              amountPaise: input.amountPaise,
              unitsShare: '1',
              activeDays: 1,
              status: 'pending',
            } as NewElectricityInvoice)
            .returning({
              id: electricityInvoices.id,
              invoiceNumber: electricityInvoices.invoiceNumber,
            });
          return inv;
        } catch (err) {
          if (pgErrorCode(err) === '23505') continue;
          throw err;
        }
      }
      throw new Error('Could not create electricity invoice.');
    });

    invoiceId = result.id;
    invoiceNumber = result.invoiceNumber;
    const { syncElectricityInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
    await syncElectricityInvoiceToUnified(invoiceId);
  }

  const payResult = await recordElectricityPaymentSuccess({
    provider: 'mock',
    offlineProvider: provider,
    amountPaise: input.amountPaise,
    invoiceId,
    providerPaymentId,
    rawPayload,
    paidAt,
    historical: true,
  });

  if (!payResult.ok) {
    return { ok: false, error: payResult.reason };
  }

  await writeExpressCollectionAudit(input, ctx, {
    electricityInvoiceId: invoiceId,
    invoiceNumber,
    paymentId: payResult.paymentId,
  });

  return {
    ok: true,
    chargeType: 'electricity',
    amountPaise: input.amountPaise,
    paymentId: payResult.paymentId,
    invoiceId,
    invoiceNumber,
    message: `Recorded historical electricity payment — ${invoiceNumber}.`,
  };
}

async function recordExpressFinancialCharge(
  input: RecordExpressCollectionInput,
  ctx: ResidentCtx,
  paidAt: Date,
  invoiceType: 'custom' | 'ps4',
): Promise<RecordExpressCollectionResult> {
  const title =
    input.customTitle?.trim() ||
    (invoiceType === 'ps4' ? 'PS4 membership' : 'Custom charge');
  const provider = expressCollectionProvider(input.paymentMethod);
  const providerPaymentId = buildProviderPaymentId(input, ctx);
  const rawPayload = buildRawPayload(input);
  const note = [EXPRESS_COLLECTION_NOTE_PREFIX, input.notes].filter(Boolean).join(' · ');
  const billingMonth = input.billingMonth ? firstOfMonth(input.billingMonth) : null;

  const invoiceNumber = await nextFinancialInvoiceNumber({ pgId: ctx.pgId });
  const breakdown = {
    otherPaise: invoiceType === 'custom' ? input.amountPaise : 0,
    ps4Paise: invoiceType === 'ps4' ? input.amountPaise : 0,
    lines: [
      {
        kind: invoiceType === 'ps4' ? 'ps4' : 'custom',
        label: title,
        amountPaise: input.amountPaise,
        sourceTable: 'financial_invoices' as const,
      },
    ],
  };

  const [row] = await db
    .insert(financialInvoices)
    .values({
      invoiceNumber,
      invoiceType,
      customerId: ctx.customerId,
      bookingId: ctx.bookingId,
      pgId: ctx.pgId,
      bedId: ctx.bedId,
      roomNumber: ctx.roomNumber,
      amountPaise: input.amountPaise,
      breakdown,
      status: 'sent',
      dueDate: input.paymentDate,
      billingMonth,
      sentAt: paidAt,
      notes: note,
      shareToken: createInvoiceShareToken(),
    })
    .returning({ id: financialInvoices.id });

  await db
    .update(financialInvoices)
    .set({
      status: 'paid',
      paidAt,
      breakdown: { ...breakdown, paidPaise: input.amountPaise },
      updatedAt: new Date(),
    })
    .where(eq(financialInvoices.id, row.id));

  await db
    .insert(payments)
    .values({
      bookingId: ctx.bookingId,
      purpose: 'adjustment',
      provider,
      providerPaymentId,
      amountPaise: input.amountPaise,
      status: 'succeeded',
      rawPayload,
      paidAt,
    })
    .onConflictDoNothing();

  await writeExpressCollectionAudit(input, ctx, {
    financialInvoiceId: row.id,
    invoiceNumber,
    invoiceType,
  });

  return {
    ok: true,
    chargeType: invoiceType === 'ps4' ? 'ps4' : 'custom',
    amountPaise: input.amountPaise,
    invoiceId: row.id,
    invoiceNumber,
    message: `Recorded historical ${invoiceType === 'ps4' ? 'PS4' : 'custom'} payment — ${invoiceNumber}.`,
  };
}

/** Record a payment that was already collected outside the platform. */
export async function recordExpressCollection(
  input: RecordExpressCollectionInput,
): Promise<RecordExpressCollectionResult> {
  if (input.amountPaise <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }
  if (!input.createAsPaid) {
    return {
      ok: false,
      error: 'Express Collection only records payments that were already collected.',
    };
  }
  if (!input.paymentDate) {
    return { ok: false, error: 'Payment date is required.' };
  }

  const ctx = await loadResidentCtx(input.customerId, input.bookingId);
  if (!ctx) {
    return { ok: false, error: 'Resident not found or has no active booking.' };
  }

  const paidAt = parseDate(input.paymentDate);
  paidAt.setUTCHours(12, 0, 0, 0);

  let result: RecordExpressCollectionResult;

  switch (input.chargeType) {
    case 'rent':
      result = await recordExpressRent(input, ctx, paidAt);
      break;
    case 'deposit':
      result = await recordExpressDeposit(input, ctx, paidAt);
      break;
    case 'electricity':
      result = await recordExpressElectricity(input, ctx, paidAt);
      break;
    case 'ps4':
      result = await recordExpressFinancialCharge(input, ctx, paidAt, 'ps4');
      break;
    case 'custom':
      result = await recordExpressFinancialCharge(input, ctx, paidAt, 'custom');
      break;
    default:
      return { ok: false, error: 'Unknown charge type.' };
  }

  if (result.ok) {
    revalidateFinancialViews();
  }

  return result;
}
