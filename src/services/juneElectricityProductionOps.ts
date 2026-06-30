/**
 * Production June 2026 electricity ops — generation + automatic certification.
 */
import { runPendingMigrations } from '@/src/db/runPendingMigrations';
import { getDatabaseConnectionInfo, hasDatabaseUrl } from '@/src/lib/db/env';
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

export async function runJuneElectricityProductionOps(input: {
  adminEmail: string;
  adminId: string;
  pgQuery?: string;
  onLog: ProductionOpsLogFn;
}): Promise<void> {
  const { onLog, adminEmail, adminId, pgQuery = 'shanti' } = input;

  if (!hasDatabaseUrl()) {
    throw new Error('DATABASE_URL is not configured on this runtime.');
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
  if (!adminEmail.trim()) {
    throw new Error('Admin email required — link your Super Admin email to a resident profile for pipeline test + certification.');
  }

  const testResult = await createPipelineTestElectricityInvoice({
    adminEmail,
    billingMonth: BILLING_MONTH,
  });
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
      adminEmail,
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
}
