#!/usr/bin/env npx tsx
/**
 * Audit June electricity invoice ownership and repair misassignments.
 *
 *   npx tsx scripts/audit-repair-electricity-ownership.ts --month=2026-06-01
 *   npx tsx scripts/audit-repair-electricity-ownership.ts --month=2026-06-01 --execute
 *   npx tsx scripts/audit-repair-electricity-ownership.ts --month=2026-06-01 --room=203
 */
import { loadScriptEnv } from '@/src/lib/scripts/loadScriptEnv';
import { paiseToInr } from '@/src/lib/format';

loadScriptEnv();

const SCRIPT_SESSION = {
  kind: 'admin' as const,
  sessionId: 'elec-ownership-audit',
  adminId: 'elec-ownership-audit',
  email: 'audit@system',
  fullName: 'Electricity Ownership Audit',
  role: 'super_admin' as const,
  pgScope: [] as string[],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function main() {
  const month =
    process.argv.find((a) => a.startsWith('--month='))?.split('=')[1] ?? '2026-06-01';
  const room = process.argv.find((a) => a.startsWith('--room='))?.split('=')[1];
  const execute = process.argv.includes('--execute');

  const {
    auditElectricityInvoiceOwnership,
    repairMisassignedElectricityInvoices,
  } = await import('@/src/services/electricityInvoiceOwnership');
  const { closeDb } = await import('@/src/db/client');

  console.log(`\n=== Electricity invoice ownership audit (${month}) ===\n`);

  const report = await auditElectricityInvoiceOwnership(month, {
    roomNumber: room,
    pgNamePattern: room ? undefined : undefined,
  });

  console.log(`Total invoices: ${report.totalInvoices}`);
  console.log(`Flagged: ${report.flaggedCount}\n`);

  console.log(
    '| Invoice | Resident | PG | Room | Bed | Month | Amount | Flags | Expected |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  const displayRows = room
    ? report.rows.filter((r) => r.roomNumber === room)
    : report.rows;

  for (const row of displayRows) {
    const flags = row.flags.length ? row.flags.join(', ') : '—';
    const expected = row.expectedResidentName ?? '—';
    console.log(
      `| ${row.invoiceNumber} | ${row.residentName} | ${row.pgName} | ${row.roomNumber} | ${row.bedCode} | ${row.billingMonth} | ${paiseToInr(row.amountPaise)} | ${flags} | ${expected} |`,
    );
  }

  if (report.room203.length > 0) {
    console.log('\n=== Room 203 ===\n');
    for (const row of report.room203) {
      console.log(
        `  ${row.invoiceNumber} · ${row.bedCode} · ${row.residentName} · ${paiseToInr(row.amountPaise)} · flags: ${row.flags.join(', ') || 'ok'} · expected: ${row.expectedResidentName ?? 'vacant'}`,
      );
    }
  }

  if (!execute) {
    console.log('\nDry run — pass --execute to repair misassigned invoices.\n');
    await closeDb();
    return;
  }

  console.log('\n=== Repair ===\n');
  const repair = await repairMisassignedElectricityInvoices(SCRIPT_SESSION, month, {
    dryRun: false,
    roomNumber: room,
  });

  console.log('Cancelled:', repair.cancelled.length ? repair.cancelled.join(', ') : 'none');
  console.log(
    'Reassigned:',
    repair.reassigned.length
      ? repair.reassigned.map((r) => `${r.invoiceNumber}: ${r.from} → ${r.to}`).join('; ')
      : 'none',
  );
  if (repair.skippedPaid.length) {
    console.log('Skipped (paid):', repair.skippedPaid.join(', '));
  }
  if (repair.errors.length) {
    console.log('Errors:', repair.errors.join('; '));
  }

  const after = await auditElectricityInvoiceOwnership(month, { roomNumber: room });
  console.log(`\nAfter repair — flagged: ${after.flaggedCount} / ${after.totalInvoices}`);

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  const { closeDb } = await import('@/src/db/client');
  await closeDb().catch(() => undefined);
  process.exit(1);
});
