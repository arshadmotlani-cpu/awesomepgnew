/**
 * Audit and repair electricity invoice ownership — invoice resident must match bed occupant for billing month.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  beds,
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { revalidateAdminSurfaces } from '@/src/lib/admin/revalidateSurfaces';
import { resolveBedOccupantForBillingMonth } from '@/src/lib/billing/electricityOccupantEligibility';
import {
  isPipelineTestResidentEmail,
  normalizePipelineTestEmail,
  PIPELINE_TEST_RESIDENT_EMAIL,
} from '@/src/lib/billing/pipelineTestResident';
import { firstOfMonth } from '@/src/services/billing';

export type ElectricityOwnershipAuditRow = {
  invoiceId: string;
  invoiceNumber: string;
  bedId: string;
  residentName: string;
  residentEmail: string | null;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  billingMonth: string;
  amountPaise: number;
  paidPaise: number;
  status: string;
  isPipelineTest: boolean;
  flags: string[];
  expectedResidentName: string | null;
  expectedBookingCode: string | null;
};

export type ElectricityOwnershipAuditReport = {
  billingMonth: string;
  auditedAt: string;
  totalInvoices: number;
  flaggedCount: number;
  rows: ElectricityOwnershipAuditRow[];
  room203: ElectricityOwnershipAuditRow[];
};

export type ElectricityOwnershipRepairResult = {
  cancelled: string[];
  reassigned: Array<{ invoiceNumber: string; from: string; to: string }>;
  skippedPaid: string[];
  errors: string[];
};

export async function auditElectricityInvoiceOwnership(
  billingMonthInput: string,
  opts?: { roomNumber?: string; pgNamePattern?: string },
): Promise<ElectricityOwnershipAuditReport> {
  const billingMonth = firstOfMonth(billingMonthInput);
  const rows = await db
    .select({
      invoiceId: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      customerId: electricityInvoices.customerId,
      residentName: customers.fullName,
      residentEmail: customers.email,
      customerIsTest: customers.isTest,
      bookingIsTest: bookings.isTest,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      bedId: electricityInvoices.bedId,
      billingMonth: electricityInvoices.billingMonth,
      amountPaise: electricityInvoices.amountPaise,
      paidPaise: electricityInvoices.paidPaise,
      status: electricityInvoices.status,
      isPipelineTest: electricityInvoices.isPipelineTest,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .innerJoin(beds, eq(beds.id, electricityInvoices.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(electricityInvoices.billingMonth, billingMonth),
        sql`${electricityInvoices.status} <> 'cancelled'`,
        opts?.roomNumber ? eq(rooms.roomNumber, opts.roomNumber) : undefined,
        opts?.pgNamePattern
          ? sql`${pgs.name} ILIKE ${'%' + opts.pgNamePattern + '%'}`
          : undefined,
      ),
    )
    .orderBy(pgs.name, rooms.roomNumber, beds.bedCode);

  const audited: ElectricityOwnershipAuditRow[] = [];

  for (const row of rows) {
    const expected = await resolveBedOccupantForBillingMonth(row.bedId, billingMonth, {
      includeFixedStay: true,
    });

    const flags: string[] = [];
    if (row.isPipelineTest) flags.push('pipeline_test');
    if (row.customerIsTest || row.bookingIsTest) flags.push('test_account');
    if (isPipelineTestResidentEmail(row.residentEmail)) flags.push('pipeline_test_resident');

    if (!expected) {
      if (!row.isPipelineTest && row.amountPaise > 0) {
        flags.push('resident_not_assigned_to_bed');
      }
    } else if (expected.customerId !== row.customerId) {
      flags.push('resident_not_assigned_to_bed');
      flags.push('room_assignment_mismatch');
    }

    const billRoomMatchesBed = true; // joined via invoice bed → room
    if (!billRoomMatchesBed) flags.push('room_mismatch');

    audited.push({
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      bedId: row.bedId,
      residentName: row.residentName,
      residentEmail: row.residentEmail,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
      billingMonth: row.billingMonth,
      amountPaise: row.amountPaise,
      paidPaise: row.paidPaise,
      status: row.status,
      isPipelineTest: row.isPipelineTest ?? false,
      flags,
      expectedResidentName: expected?.customerName ?? null,
      expectedBookingCode: expected?.bookingCode ?? null,
    });
  }

  const flagged = audited.filter((r) => r.flags.length > 0);
  const room203 = audited.filter((r) => r.roomNumber === '203');

  return {
    billingMonth,
    auditedAt: new Date().toISOString(),
    totalInvoices: audited.length,
    flaggedCount: flagged.length,
    rows: audited,
    room203,
  };
}

export async function repairMisassignedElectricityInvoices(
  session: AdminSession,
  billingMonthInput: string,
  opts?: { dryRun?: boolean; roomNumber?: string },
): Promise<ElectricityOwnershipRepairResult> {
  const report = await auditElectricityInvoiceOwnership(billingMonthInput, {
    roomNumber: opts?.roomNumber,
  });

  const result: ElectricityOwnershipRepairResult = {
    cancelled: [],
    reassigned: [],
    skippedPaid: [],
    errors: [],
  };

  const pipelineCancelled = await repairPipelineTestResidentProductionInvoices(
    session,
    billingMonthInput,
  );
  result.cancelled.push(...pipelineCancelled.cancelled);

  const toRepair = report.rows.filter(
    (r) =>
      !r.isPipelineTest &&
      (r.flags.includes('resident_not_assigned_to_bed') ||
        r.flags.includes('room_assignment_mismatch')),
  );

  for (const row of toRepair) {
    if (row.paidPaise > 0) {
      result.skippedPaid.push(row.invoiceNumber);
      continue;
    }

    const expected = await resolveBedOccupantForBillingMonth(row.bedId, report.billingMonth, {
      includeFixedStay: true,
    });

    if (!expected) {
      if (!opts?.dryRun) {
        await db
          .update(electricityInvoices)
          .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
          .where(eq(electricityInvoices.id, row.invoiceId));
        const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
        await syncManyToUnified([row.invoiceId], 'electricity').catch(() => undefined);
      }
      result.cancelled.push(row.invoiceNumber);
      continue;
    }

    if (expected.customerName === row.residentName) continue;

    if (!opts?.dryRun) {
      try {
        await db
          .update(electricityInvoices)
          .set({
            customerId: expected.customerId,
            bookingId: expected.bookingId,
            bedId: expected.bedId,
            updatedAt: new Date(),
          })
          .where(eq(electricityInvoices.id, row.invoiceId));
        const { syncElectricityInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
        await syncElectricityInvoiceToUnified(row.invoiceId).catch(() => undefined);
        result.reassigned.push({
          invoiceNumber: row.invoiceNumber,
          from: row.residentName,
          to: expected.customerName,
        });
      } catch (err) {
        result.errors.push(
          `${row.invoiceNumber}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      result.reassigned.push({
        invoiceNumber: row.invoiceNumber,
        from: row.residentName,
        to: expected.customerName,
      });
    }
  }

  if (!opts?.dryRun && (result.cancelled.length > 0 || result.reassigned.length > 0)) {
    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: session.adminId,
      entity: 'electricity_invoice_ownership',
      entityId: report.billingMonth,
      action: 'repair_misassigned_invoices',
      diff: {
        billingMonth: report.billingMonth,
        cancelled: result.cancelled,
        reassigned: result.reassigned,
        skippedPaid: result.skippedPaid,
      },
    });

    const { syncActionItems } = await import('@/src/services/actionItems');
    await syncActionItems(session).catch(() => undefined);
    revalidateAdminSurfaces();
  }

  return result;
}

/** Cancel production invoices wrongly assigned to the pipeline-test resident. */
export async function repairPipelineTestResidentProductionInvoices(
  session: AdminSession,
  billingMonthInput?: string,
): Promise<{ cancelled: string[] }> {
  const billingMonth = billingMonthInput ? firstOfMonth(billingMonthInput) : undefined;
  const rows = await db
    .select({
      invoiceId: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      paidPaise: electricityInvoices.paidPaise,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(
      and(
        eq(electricityInvoices.isPipelineTest, false),
        sql`${electricityInvoices.status} <> 'cancelled'`,
        sql`lower(trim(${customers.email})) = ${normalizePipelineTestEmail(PIPELINE_TEST_RESIDENT_EMAIL)}`,
        billingMonth ? eq(electricityInvoices.billingMonth, billingMonth) : undefined,
      ),
    );

  const cancelled: string[] = [];
  const ids: string[] = [];
  for (const row of rows) {
    if (row.paidPaise > 0) continue;
    ids.push(row.invoiceId);
    cancelled.push(row.invoiceNumber);
  }

  if (ids.length > 0) {
    await db
      .update(electricityInvoices)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(inArray(electricityInvoices.id, ids));
    const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
    await syncManyToUnified(ids, 'electricity').catch(() => undefined);
    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: session.adminId,
      entity: 'electricity_invoice_ownership',
      entityId: billingMonth ?? 'all',
      action: 'cancel_pipeline_test_resident_production_invoices',
      diff: { cancelled },
    });
    const { syncActionItems } = await import('@/src/services/actionItems');
    await syncActionItems(session).catch(() => undefined);
    revalidateAdminSurfaces();
  }

  return { cancelled };
}
