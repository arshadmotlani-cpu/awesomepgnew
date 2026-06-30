/**
 * ₹0 pipeline-test electricity invoice — full UI/sync path, zero room/revenue impact.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  adminUsers,
  bedReservations,
  beds,
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  floors,
  rooms,
} from '@/src/db/schema';
import { getElectricityInvoiceSchemaCaps } from '@/src/lib/db/electricityInvoiceSchemaCaps';
import type { NewElectricityInvoice } from '@/src/db/schema/electricityInvoices';
import { electricityDueDate, firstOfMonth } from '@/src/services/billing';
import { formatDate } from '@/src/lib/dates';
import { nextElectricityInvoiceNumber } from '@/src/services/electricityBilling';
import {
  isPipelineTestResidentEmail,
  normalizePipelineTestEmail,
  PIPELINE_TEST_RESIDENT_EMAIL,
} from '@/src/lib/billing/pipelineTestResident';

const PIPELINE_TEST_NOTE =
  'PIPELINE_TEST — excluded from room reconciliation, revenue, and settlements';

async function resolveAdminCustomerContext(adminEmail: string) {
  const normalized = normalizePipelineTestEmail(adminEmail);

  if (!isPipelineTestResidentEmail(normalized)) {
    return {
      ok: false as const,
      error: `Pipeline test invoice can only be created for ${PIPELINE_TEST_RESIDENT_EMAIL}.`,
    };
  }

  const [admin] = await db
    .select({ id: adminUsers.id, email: adminUsers.email, fullName: adminUsers.fullName })
    .from(adminUsers)
    .where(eq(adminUsers.email, normalized))
    .limit(1);

  const [customer] = await db
    .select({
      id: customers.id,
      fullName: customers.fullName,
      email: customers.email,
    })
    .from(customers)
    .where(sql`lower(trim(${customers.email})) = ${normalized}`)
    .limit(1);

  if (!customer) {
    return {
      ok: false as const,
      error: `No resident account with email ${PIPELINE_TEST_RESIDENT_EMAIL}. Create or link this account before running the pipeline test.`,
    };
  }

  const [bookingRow] = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      bedId: beds.id,
      roomId: beds.roomId,
      pgId: floors.pgId,
    })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(bookings.customerId, customer.id),
        eq(bookings.status, 'confirmed'),
        eq(bedReservations.kind, 'primary'),
        eq(bedReservations.status, 'active'),
      ),
    )
    .orderBy(desc(bookings.createdAt))
    .limit(1);

  if (!bookingRow?.pgId) {
    return {
      ok: false as const,
      error: `Customer ${customer.fullName} has no active confirmed booking — assign a bed first.`,
    };
  }

  return {
    ok: true as const,
    admin,
    customer,
    booking: bookingRow,
  };
}


export async function createPipelineTestElectricityInvoice(input: {
  adminEmail?: string;
  billingMonth?: string;
}): Promise<
  | {
      ok: true;
      invoiceId: string;
      invoiceNumber: string;
      billId: string;
      financialInvoiceId: string | null;
      reused: boolean;
    }
  | { ok: false; error: string }
> {
  const billingMonth = firstOfMonth(input.billingMonth ?? '2026-06-01');
  const ctx = await resolveAdminCustomerContext(
    input.adminEmail ?? PIPELINE_TEST_RESIDENT_EMAIL,
  );
  if (!ctx.ok) return ctx;

  const { customer, booking, admin } = ctx;

  const [existing] = await db
    .select({
      id: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      electricityBillId: electricityInvoices.electricityBillId,
    })
    .from(electricityInvoices)
    .where(
      and(
        eq(electricityInvoices.customerId, customer.id),
        eq(electricityInvoices.billingMonth, billingMonth),
        eq(electricityInvoices.isPipelineTest, true),
        eq(electricityInvoices.status, 'pending'),
      ),
    )
    .limit(1);

  if (existing) {
    const { syncElectricityInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
    const financialInvoiceId = await syncElectricityInvoiceToUnified(existing.id);
    return {
      ok: true,
      invoiceId: existing.id,
      invoiceNumber: existing.invoiceNumber,
      billId: existing.electricityBillId,
      financialInvoiceId,
      reused: true,
    };
  }

  const dueDateIso = formatDate(electricityDueDate(new Date()));
  const invoiceSchemaCaps = await getElectricityInvoiceSchemaCaps();

  const result = await db.transaction(async (tx) => {
    const [bill] = await tx
      .insert(electricityBills)
      .values({
        pgId: booking.pgId!,
        roomId: booking.roomId,
        billingMonth,
        previousReadingUnits: '0',
        currentReadingUnits: '0',
        unitsConsumed: '0',
        ratePerUnitPaise: 0,
        totalPaise: 0,
        monthlyOccupantCount: 0,
        perResidentPaise: 0,
        roundingRemainderPaise: 0,
        prepaidCreditAppliedPaise: 0,
        checkoutCreditAppliedPaise: 0,
        createdByAdminId: admin?.id ?? null,
        notes: PIPELINE_TEST_NOTE,
        isPipelineTest: true,
      })
      .returning({ id: electricityBills.id });

    let invoiceNumber = '';
    let invoiceId = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      invoiceNumber = await nextElectricityInvoiceNumber(billingMonth, attempt + 99);
      try {
        const invoiceValues = {
          invoiceNumber,
          electricityBillId: bill.id,
          bookingId: booking.bookingId,
          customerId: customer.id,
          bedId: booking.bedId,
          billingMonth,
          dueDate: dueDateIso,
          amountPaise: 0,
          paidPaise: 0,
          unitsShare: '0',
          activeDays: 0,
          status: 'pending' as const,
          isPipelineTest: true,
          ...(invoiceSchemaCaps.roomId ? { roomId: booking.roomId } : {}),
        };
        const [inv] = await tx
          .insert(electricityInvoices)
          .values(invoiceValues as NewElectricityInvoice)
          .returning({ id: electricityInvoices.id });
        invoiceId = inv.id;
        break;
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === '23505') continue;
        throw err;
      }
    }

    if (!invoiceId) throw new Error('Could not allocate pipeline test invoice number.');

    return { billId: bill.id, invoiceId, invoiceNumber };
  });

  const { syncElectricityInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
  const financialInvoiceId = await syncElectricityInvoiceToUnified(result.invoiceId);

  return {
    ok: true,
    invoiceId: result.invoiceId,
    invoiceNumber: result.invoiceNumber,
    billId: result.billId,
    financialInvoiceId,
    reused: false,
  };
}
