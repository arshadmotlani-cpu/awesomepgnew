/**
 * Production June 2026 electricity ops — generation + automatic certification.
 */
import { eq } from 'drizzle-orm';
import { runPendingMigrations } from '@/src/db/runPendingMigrations';
import { db } from '@/src/db/client';
import { adminUsers } from '@/src/db/schema';
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
import { PIPELINE_TEST_RESIDENT_EMAIL } from '@/src/lib/billing/pipelineTestResident';
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

async function createPipelineTestInvoiceSafe(
  onLog: ProductionOpsLogFn,
): Promise<{ invoiceId: string | null; adminEmail: string }> {
  onLog(`  Pipeline test resident: ${PIPELINE_TEST_RESIDENT_EMAIL}`);
  const testResult = await createPipelineTestElectricityInvoice({
    billingMonth: BILLING_MONTH,
  });
  if (!testResult.ok) {
    onLog(`  WARNING: Skipping pipeline test invoice — ${testResult.error}`);
    return { invoiceId: null, adminEmail: PIPELINE_TEST_RESIDENT_EMAIL };
  }
  onLog(
    `Pipeline test invoice ${testResult.reused ? 'reused' : 'created'}: ${testResult.invoiceId}`,
  );
  onLog(`  Invoice number: ${testResult.invoiceNumber}`);
  onLog(`  Amount: ${paiseToInr(0)} · status: pending`);
  return { invoiceId: testResult.invoiceId, adminEmail: PIPELINE_TEST_RESIDENT_EMAIL };
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
    await runJuneElectricityProductionCertification({
      adminEmail: PIPELINE_TEST_RESIDENT_EMAIL,
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
  const { invoiceId: pipelineTestInvoiceId, adminEmail: pipelineAdminEmail } =
    await createPipelineTestInvoiceSafe(onLog);

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
