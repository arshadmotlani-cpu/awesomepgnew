/* eslint-disable no-console */
/**
 * One-time: create company reimbursement invoice for Dhruv / APG-2026-0040.
 *
 * Usage:
 *   npx tsx scripts/create-dhruv-company-reimbursement-invoice.ts
 *   npx tsx scripts/create-dhruv-company-reimbursement-invoice.ts --execute
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.vercel.prod') });
config({ path: resolve(process.cwd(), '.env.production.local') });
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const execute = process.argv.includes('--execute');
  const { closeDb } = await import('../src/db/client');
  const {
    createCompanyReimbursementInvoice,
    displayRatePerDayPaise,
  } = await import('../src/services/companyReimbursementInvoice');

  const totalPaise = 1_200_000;
  const durationDays = 7;
  const ratePerDayPaise = displayRatePerDayPaise(totalPaise, durationDays);

  console.log('\n=== Company reimbursement invoice (Dhruv / APG-2026-0040) ===');
  console.log(`Mode: ${execute ? 'EXECUTE' : 'dry-run'}`);
  console.log(`Stay: 21 July 2026 – 27 July 2026 (${durationDays} days)`);
  console.log(`Total: Rs. ${(totalPaise / 100).toLocaleString('en-IN')}`);
  console.log(`Per day (display): Rs. ${(ratePerDayPaise / 100).toFixed(2)}`);

  if (!execute) {
    console.log('\nDry run only — pass --execute to create the invoice.');
    await closeDb();
    return;
  }

  const result = await createCompanyReimbursementInvoice({
    bookingCode: 'APG-2026-0040',
    stayStart: '2026-07-21',
    stayEnd: '2026-07-27',
    durationDays,
    totalPaise,
    expectedPhoneDigits: '7002350213',
    expectedNameIncludes: 'Dhruv',
    actorId: undefined,
  });

  if (!result.ok) {
    console.error('Failed:', result.error);
    await closeDb();
    process.exit(1);
  }

  console.log('\nCreated / found:');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nAdmin: /admin/invoices/${result.invoiceId}`);
  console.log(`PDF:   /api/invoices/${result.invoiceId}/pdf`);
  if (result.shareToken) {
    console.log(`Share: /i/${result.shareToken}`);
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  try {
    const { closeDb } = await import('../src/db/client');
    await closeDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
