/* eslint-disable no-console */
/**
 * Diagnose payment-proof audit_log inserts without mutating invoices.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.vercel.pull npx tsx -r dotenv/config scripts/verify-payment-approval-audit.ts
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();
import { and, eq, isNotNull } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { auditLog, electricityInvoices, rentInvoices } from '../src/db/schema';
import { writeAuditLog, writeAuditLogNonBlocking } from '../src/lib/audit/writeAuditLog';

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}

async function probeRentAudit(invoiceId: string, diff: Record<string, unknown>) {
  const probeId = `rent-proof-probe-${Date.now()}`;
  const result = await writeAuditLog(db, {
    actorType: 'system',
    actorId: null,
    entity: 'rent_invoice',
    entityId: invoiceId,
    action: 'paid',
    diff: { ...diff, providerPaymentId: probeId },
  });
  if (!result.ok) {
    console.error('  ✗ rent audit probe failed:', result.error);
    return false;
  }
  await db.execute(
    `DELETE FROM audit_log WHERE diff->>'providerPaymentId' = '${probeId}'`,
  );
  ok('rent audit_log probe insert succeeded');
  return true;
}

async function probeElectricityAudit(invoiceId: string, diff: Record<string, unknown>) {
  const probeId = `elec-proof-probe-${Date.now()}`;
  const result = await writeAuditLog(db, {
    actorType: 'system',
    actorId: null,
    entity: 'electricity_invoice',
    entityId: invoiceId,
    action: 'paid',
    diff: { ...diff, providerPaymentId: probeId },
  });
  if (!result.ok) {
    console.error('  ✗ electricity audit probe failed:', result.error);
    return false;
  }
  await db.execute(
    `DELETE FROM audit_log WHERE diff->>'providerPaymentId' = '${probeId}'`,
  );
  ok('electricity audit_log probe insert succeeded');
  return true;
}

async function main() {
  console.log('Payment approval audit diagnostics (read-only on invoices)\n');

  const [rent] = await db
    .select({
      id: rentInvoices.id,
      rentPaise: rentInvoices.rentPaise,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      paidLateFeePaise: rentInvoices.paidLateFeePaise,
      lateFeeLockedPaise: rentInvoices.lateFeeLockedPaise,
    })
    .from(rentInvoices)
    .where(
      and(
        isNotNull(rentInvoices.paymentProofUrl),
        eq(rentInvoices.status, 'pending'),
      ),
    )
    .limit(1);

  if (rent) {
    console.log(`Rent proof pending: ${rent.id}`);
    await probeRentAudit(rent.id, {
      provider: 'upi_manual',
      amountPaise: rent.rentPaise - rent.paidPrincipalPaise,
      rentPaise: rent.rentPaise,
      paidPrincipalPaise: rent.rentPaise,
      paidLateFeePaise: rent.paidLateFeePaise,
      lateFeeLockedPaise: rent.lateFeeLockedPaise,
      outstandingPaise: 0,
    });
  } else {
    console.log('No pending rent proof invoices found.');
  }

  const [elec] = await db
    .select({
      id: electricityInvoices.id,
      amountPaise: electricityInvoices.amountPaise,
      paidPaise: electricityInvoices.paidPaise,
    })
    .from(electricityInvoices)
    .where(
      and(
        isNotNull(electricityInvoices.paymentProofUrl),
        eq(electricityInvoices.status, 'pending'),
      ),
    )
    .limit(1);

  if (elec) {
    console.log(`\nElectricity proof pending: ${elec.id}`);
    await probeElectricityAudit(elec.id, {
      provider: 'upi_manual',
      amountPaise: elec.amountPaise,
      paidPaise: elec.amountPaise,
      outstandingPaise: 0,
    });
  } else {
    console.log('\nNo pending electricity proof invoices found.');
  }

  const nonBlocking = await writeAuditLogNonBlocking(db, {
    actorType: 'system',
    actorId: null,
    entity: 'rent_invoice',
    entityId: rent?.id ?? '00000000-0000-4000-8000-000000000001',
    action: 'partial_payment',
    diff: { provider: 'upi_manual', providerPaymentId: 'non-blocking-probe', amountPaise: 1 },
  });
  ok(`writeAuditLogNonBlocking returns structured result (ok=${nonBlocking.ok})`);

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
