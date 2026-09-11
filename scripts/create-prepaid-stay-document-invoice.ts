/* eslint-disable no-console */
/**
 * Idempotent document-only prepaid stay invoice — profile/history only, zero revenue impact.
 *
 * Usage:
 *   npx tsx scripts/create-prepaid-stay-document-invoice.ts \
 *     --booking-code APG-2026-0106 \
 *     --stay-start 2026-09-07 \
 *     --stay-end 2026-09-11 \
 *     --duration-days 5 \
 *     --amount-paise 1000000 \
 *     --phone 9975108819 \
 *     --name-includes Mukundar \
 *     --inclusions "AC Room,Breakfast,Dinner,Laundry" \
 *     --payment-status "Paid Online · Prepaid"
 *
 *   Add --execute to write.
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  loadProductionAuditEnv();
  requireDatabaseUrl('create-prepaid-stay-document-invoice.ts');

  const bookingCode = arg('booking-code');
  const stayStart = arg('stay-start');
  const stayEnd = arg('stay-end');
  const durationDays = Number(arg('duration-days'));
  const totalPaise = Number(arg('amount-paise'));
  const phoneDigits = arg('phone');
  const nameIncludes = arg('name-includes');
  const inclusionsRaw = arg('inclusions');
  const paymentStatus = arg('payment-status') ?? 'Paid Online · Prepaid';
  const execute = process.argv.includes('--execute');

  if (
    !bookingCode ||
    !stayStart ||
    !stayEnd ||
    !Number.isFinite(durationDays) ||
    durationDays <= 0 ||
    !Number.isFinite(totalPaise) ||
    totalPaise <= 0
  ) {
    console.error(
      'Required: --booking-code --stay-start --stay-end --duration-days --amount-paise [--phone] [--name-includes] [--inclusions] [--payment-status] [--execute]',
    );
    process.exit(1);
  }

  const packageInclusions = inclusionsRaw
    ? inclusionsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  const { closeDb } = await import('../src/db/client');
  const { createCompanyReimbursementInvoice, displayRatePerDayPaise } = await import(
    '../src/services/companyReimbursementInvoice'
  );

  const ratePerDayPaise = displayRatePerDayPaise(totalPaise, durationDays);

  console.log(
    JSON.stringify(
      {
        mode: execute ? 'execute' : 'dry-run',
        bookingCode,
        stayStart,
        stayEnd,
        durationDays,
        totalPaise,
        totalInr: totalPaise / 100,
        ratePerDayPaise,
        ratePerDayInr: ratePerDayPaise / 100,
        packageInclusions,
        paymentStatus,
        accountingImpact: 'none (isDocumentOnly, revenueImpact=false)',
      },
      null,
      2,
    ),
  );

  if (!execute) {
    console.log('\nDry run — pass --execute to create document-only invoice.');
    await closeDb();
    return;
  }

  const result = await createCompanyReimbursementInvoice({
    bookingCode,
    stayStart,
    stayEnd,
    durationDays,
    totalPaise,
    expectedPhoneDigits: phoneDigits,
    expectedNameIncludes: nameIncludes,
    packageInclusions,
    paymentStatusLabel: paymentStatus,
  });

  if (!result.ok) {
    console.error('Failed:', result.error);
    await closeDb();
    process.exit(1);
  }

  console.log('\nCreated / idempotent match:');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nResident: Profile → Payments → Invoices`);
  console.log(`Admin PDF: /api/invoices/${result.invoiceId}/pdf`);

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
