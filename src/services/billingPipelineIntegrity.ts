/**
 * Billing pipeline integrity — read-only detection + explicit admin repair (never silent scripts).
 */
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, customers, electricityInvoices } from '@/src/db/schema';
import {
  normalizePipelineTestEmail,
  PIPELINE_TEST_RESIDENT_EMAIL,
} from '@/src/lib/billing/pipelineTestResident';
import type { AdminSession } from '@/src/lib/auth/session';
import { revalidateAdminSurfaces } from '@/src/lib/admin/revalidateSurfaces';

export type PipelineTestIntegrityIssue = {
  invoiceId: string;
  invoiceNumber: string;
  residentEmail: string;
  residentName: string;
  amountPaise: number;
};

export async function listPipelineTestIntegrityIssues(): Promise<PipelineTestIntegrityIssue[]> {
  const rows = await db
    .select({
      invoiceId: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      email: customers.email,
      residentName: customers.fullName,
      amountPaise: electricityInvoices.amountPaise,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(
      and(
        eq(electricityInvoices.isPipelineTest, true),
        ne(electricityInvoices.status, 'cancelled'),
        sql`lower(trim(${customers.email})) <> ${normalizePipelineTestEmail(PIPELINE_TEST_RESIDENT_EMAIL)}`,
      ),
    );

  return rows.map((r) => ({
    invoiceId: r.invoiceId,
    invoiceNumber: r.invoiceNumber,
    residentEmail: r.email ?? '',
    residentName: r.residentName,
    amountPaise: r.amountPaise,
  }));
}

export async function listStrayZeroProductionInvoices(): Promise<
  Array<{ invoiceNumber: string; email: string; amountPaise: number }>
> {
  const rows = await db
    .select({
      invoiceNumber: electricityInvoices.invoiceNumber,
      email: customers.email,
      amountPaise: electricityInvoices.amountPaise,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(
      and(
        eq(electricityInvoices.amountPaise, 0),
        eq(electricityInvoices.isPipelineTest, false),
        ne(electricityInvoices.status, 'cancelled'),
      ),
    );
  return rows.map((r) => ({
    invoiceNumber: r.invoiceNumber,
    email: r.email ?? '',
    amountPaise: r.amountPaise,
  }));
}

/** Admin-confirmed repair — cancels misassigned pipeline test invoices with full audit trail. */
export async function repairPipelineTestMisassignments(
  session: AdminSession,
): Promise<
  | { ok: true; cancelledCount: number; cancelledInvoiceNumbers: string[] }
  | { ok: false; error: string }
> {
  if (session.role !== 'super_admin' && session.role !== 'pg_manager') {
    return { ok: false, error: 'Only super admin or PG manager can repair pipeline test invoices.' };
  }

  const misassigned = await listPipelineTestIntegrityIssues();
  if (misassigned.length === 0) {
    return { ok: true, cancelledCount: 0, cancelledInvoiceNumbers: [] };
  }

  const ids = misassigned.map((r) => r.invoiceId);
  await db
    .update(electricityInvoices)
    .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
    .where(inArray(electricityInvoices.id, ids));

  const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
  await syncManyToUnified(ids, 'electricity').catch(() => undefined);

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: session.adminId,
    entity: 'billing_pipeline_integrity',
    entityId: misassigned[0]?.invoiceId ?? session.adminId,
    action: 'repair_pipeline_test_misassignments',
    diff: {
      cancelledCount: misassigned.length,
      cancelledInvoiceNumbers: misassigned.map((r) => r.invoiceNumber),
      reason: 'Misassigned pipeline test invoice — admin repair from Billing Centre',
    },
  });

  revalidateAdminSurfaces();
  return {
    ok: true,
    cancelledCount: misassigned.length,
    cancelledInvoiceNumbers: misassigned.map((r) => r.invoiceNumber),
  };
}
