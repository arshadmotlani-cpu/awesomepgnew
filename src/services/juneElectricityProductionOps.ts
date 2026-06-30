/**
 * Production June 2026 electricity ops — generation + automatic certification.
 */
import { eq, and, sql } from 'drizzle-orm';
import { runPendingMigrations } from '@/src/db/runPendingMigrations';
import { db } from '@/src/db/client';
import { adminUsers, customers, electricityBills, electricityInvoices, bookings } from '@/src/db/schema';
import { getDatabaseConnectionInfo, hasDatabaseUrl } from '@/src/lib/db/env';
import {
  getJuneElectricityOpsCompletion,
  markJuneElectricityOpsCompleted,
} from '@/src/lib/admin/juneElectricityOpsAudit';
import {
  countActiveElectricityInvoiceDuplicates,
  listElectricityInvoiceDuplicateGroups,
} from '@/src/services/electricityInvoiceDuplicates';
import { createPipelineTestElectricityInvoice } from '@/src/services/electricityPipelineTestInvoice';
import { runGenerateJune2026ElectricityBills } from '@/src/services/generateJune2026ElectricityBills';
import {
  JuneElectricityCertificationError,
  runJuneElectricityProductionCertification,
} from '@/src/services/juneElectricityProductionCertification';
import { getMonthlyRevenuePaise } from '@/src/services/dashboardMetrics';

const BILLING_MONTH = '2026-06-01';

export type ProductionOpsLogFn = (line: string) => void;

function paiseToInr(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

async function auditDuplicates(onLog: ProductionOpsLogFn) {
  const count = await countActiveElectricityInvoiceDuplicates();
  onLog(`Duplicate invoice groups: ${count}`);
  if (count > 0) {
    const groups = await listElectricityInvoiceDuplicateGroups();
    for (const g of groups) {
      onLog(`  ${g.pgName} Room ${g.roomNumber} ${g.billingMonth} · ${g.customerName}`);
      for (const inv of g.invoices) {
        onLog(`    ${inv.invoiceNumber} ${inv.status} ${paiseToInr(inv.amountPaise)}`);
      }
    }
    throw new Error(`${count} duplicate invoice group(s) remain — fix before sign-off`);
  }
  onLog('Duplicate check: PASS');
}

async function findJuneBillableResidentEmail(): Promise<string | null> {
  const [billable] = await db
    .select({ email: customers.email })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .where(
      and(
        eq(electricityBills.billingMonth, BILLING_MONTH),
        eq(electricityInvoices.status, 'pending'),
        eq(bookings.status, 'confirmed'),
        sql`coalesce(${electricityInvoices.isPipelineTest}, false) = false`,
      ),
    )
    .limit(1);
  return billable?.email?.trim() || null;
}

async function resolvePipelineTestAdminEmail(onLog: ProductionOpsLogFn): Promise<string> {
  const developer = process.env.DEVELOPER_TEST_EMAIL?.trim();
  if (developer) {
    onLog(`  Trying pipeline test resident: ${developer}`);
    return developer;
  }
  const billable = await findJuneBillableResidentEmail();
  if (billable) {
    onLog(`  Pipeline test resident (June billable): ${billable}`);
    return billable;
  }
  throw new Error(
    'No June billable resident with confirmed booking found for pipeline test.',
  );
}

export async function runJuneElectricityProductionOps(input: {
  adminEmail?: string;
  adminId?: string;
  pgQuery?: string;
  onLog: ProductionOpsLogFn;
  /** When true, skip generation if audit log shows a prior successful run. */
  skipGenerationIfCompleted?: boolean;
}): Promise<void> {
  const { onLog, pgQuery = 'shanti', skipGenerationIfCompleted = true } = input;

  if (!hasDatabaseUrl()) {
    throw new Error('DATABASE_URL is not configured on this runtime.');
  }

  let adminEmail = input.adminEmail?.trim() ?? '';
  let adminId = input.adminId?.trim() ?? '';
  if (!adminEmail || !adminId) {
    const [admin] = await db
      .select({ id: adminUsers.id, email: adminUsers.email })
      .from(adminUsers)
      .where(eq(adminUsers.role, 'super_admin'))
      .limit(1);
    if (!admin) {
      throw new Error('No super_admin found — pass --admin-email or create an admin account.');
    }
    adminEmail = adminEmail || admin.email;
    adminId = adminId || admin.id;
  }

  const prior = await getJuneElectricityOpsCompletion();
  if (prior.completed && skipGenerationIfCompleted) {
    onLog('June 2026 electricity ops already completed');
    if (prior.completedAt) {
      onLog(`  Completed at: ${prior.completedAt.toISOString()}`);
    }
    onLog('\nRunning certification-only verification…');
    const revenueBefore = await getMonthlyRevenuePaise(BILLING_MONTH);
    const pipelineAdminEmail = await resolvePipelineTestAdminEmail(onLog);
    await runJuneElectricityProductionCertification({
      adminEmail: pipelineAdminEmail,
      adminId,
      pgQuery,
      revenueElectricityBeforePaise: revenueBefore.electricityPaise,
      pipelineTestInvoiceId: null,
      onLog,
    });
    onLog('\n✓ Certification-only verification passed.');
    return;
  }

  const info = getDatabaseConnectionInfo();
  onLog('Production electricity ops');
  onLog(`Database: ${info.host}/${info.database} (${info.environment})`);

  onLog('\n[1/6] Running migrations…');
  await runPendingMigrations(onLog);

  onLog('\n[2/6] Capturing revenue snapshot (before generation)…');
  const revenueBefore = await getMonthlyRevenuePaise(BILLING_MONTH);
  onLog(`Electricity collected revenue (MTD): ${paiseToInr(revenueBefore.electricityPaise)}`);

  onLog('\n[3/6] Generating June 2026 electricity bills (LIVE)…');
  await runGenerateJune2026ElectricityBills({ onLog, pgQuery, dryRun: false });

  onLog('\n[4/6] Duplicate invoice audit…');
  await auditDuplicates(onLog);

  onLog('\n[5/6] ₹0 pipeline test invoice…');
  let pipelineTestInvoiceId: string | null = null;
  let pipelineAdminEmail = await resolvePipelineTestAdminEmail(onLog);

  let testResult = await createPipelineTestElectricityInvoice({
    adminEmail: pipelineAdminEmail,
    billingMonth: BILLING_MONTH,
  });
  if (!testResult.ok && process.env.DEVELOPER_TEST_EMAIL?.trim() === pipelineAdminEmail) {
    const fallback = await findJuneBillableResidentEmail();
    if (fallback && fallback !== pipelineAdminEmail) {
      onLog(`  Retrying pipeline test with ${fallback}`);
      pipelineAdminEmail = fallback;
      testResult = await createPipelineTestElectricityInvoice({
        adminEmail: pipelineAdminEmail,
        billingMonth: BILLING_MONTH,
      });
    }
  }
  if (!testResult.ok) {
    throw new Error(`Pipeline test invoice failed: ${testResult.error}`);
  }
  pipelineTestInvoiceId = testResult.invoiceId;
  onLog(
    `Pipeline test invoice ${testResult.reused ? 'reused' : 'created'}: ${testResult.invoiceId}`,
  );
  onLog(`  Invoice number: ${testResult.invoiceNumber}`);
  onLog(`  Amount: ${paiseToInr(0)} · status: pending`);

  onLog('\n[6/6] Automatic certification (all verification steps)…');
  try {
    await runJuneElectricityProductionCertification({
      adminEmail: pipelineAdminEmail,
      adminId,
      pgQuery,
      revenueElectricityBeforePaise: revenueBefore.electricityPaise,
      pipelineTestInvoiceId,
      onLog,
    });
  } catch (err) {
    if (err instanceof JuneElectricityCertificationError) {
      throw new Error(`Certification failed — ${err.message}`);
    }
    throw err;
  }

  onLog('\n✓ Production electricity ops complete — all certification checks passed.');
  await markJuneElectricityOpsCompleted(adminId);
  onLog('Audit log: june_electricity_generation_completed');
}
