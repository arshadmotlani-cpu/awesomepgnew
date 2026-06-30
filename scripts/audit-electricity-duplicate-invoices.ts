/**
 * Audit duplicate electricity invoices: same room + billing month + resident.
 *
 * Usage: npx tsx scripts/audit-electricity-duplicate-invoices.ts
 */
import {
  countActiveElectricityInvoiceDuplicates,
  listElectricityInvoiceDuplicateGroups,
} from '../src/services/electricityInvoiceDuplicates';

async function main() {
  const groupCount = await countActiveElectricityInvoiceDuplicates();
  console.log(`\nDuplicate electricity invoice groups: ${groupCount}\n`);

  if (groupCount === 0) {
    console.log('No duplicates found.');
    return;
  }

  const groups = await listElectricityInvoiceDuplicateGroups();
  for (const group of groups) {
    console.log('—'.repeat(60));
    console.log(
      `${group.pgName} · Room ${group.roomNumber} · ${group.billingMonth} · ${group.customerName}`,
    );
    for (const inv of group.invoices) {
      console.log(
        `  ${inv.invoiceNumber} · ${inv.status} · ₹${(inv.amountPaise / 100).toFixed(2)} · ${inv.invoiceId}`,
      );
    }
  }
  console.log('\nRepair at /admin/electricity/duplicates\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
