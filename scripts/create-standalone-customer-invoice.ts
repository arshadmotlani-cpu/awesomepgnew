/* eslint-disable no-console */
/**
 * Standalone invoice for a non-resident customer (no booking).
 *
 * Usage:
 *   npx tsx scripts/create-standalone-customer-invoice.ts \
 *     --name "Sushant S Khatakalle" \
 *     --stay-start 2026-10-05 \
 *     --stay-end 2026-10-08 \
 *     --duration-days 4 \
 *     --amount-paise 420000 \
 *     --description "PG Accommodation — Daily Rent"
 *
 *   Add --execute to write. USE_PRODUCTION_DB=1 for production (see loadProductionAuditEnv).
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  loadProductionAuditEnv();
  requireDatabaseUrl('create-standalone-customer-invoice.ts');

  const name = arg('name');
  const phone = arg('phone');
  const email = arg('email');
  const stayStart = arg('stay-start');
  const stayEnd = arg('stay-end');
  const durationDays = Number(arg('duration-days'));
  const totalPaise = Number(arg('amount-paise'));
  const description = arg('description') ?? 'PG Accommodation — Daily Rent';
  const additionalPaise = Number(arg('additional-paise') ?? '0');
  const execute = process.argv.includes('--execute');

  if (
    !name ||
    !stayStart ||
    !stayEnd ||
    !Number.isFinite(durationDays) ||
    durationDays <= 0 ||
    !Number.isFinite(totalPaise) ||
    totalPaise <= 0
  ) {
    console.error(
      'Required: --name --stay-start --stay-end --duration-days --amount-paise [--phone] [--email] [--description] [--additional-paise] [--execute]',
    );
    process.exit(1);
  }

  const { closeDb } = await import('../src/db/client');
  const { createStandaloneCustomerInvoice, standaloneAccommodationLineLabel } = await import(
    '../src/services/standaloneCustomerInvoice'
  );
  const { displayRatePerDayPaise } = await import('../src/services/companyReimbursementInvoice');

  const accommodationPaise = totalPaise - (Number.isFinite(additionalPaise) ? additionalPaise : 0);
  const ratePerDayPaise = displayRatePerDayPaise(accommodationPaise, durationDays);
  const lineLabel = standaloneAccommodationLineLabel({
    description,
    durationDays,
    ratePerDayPaise,
  });

  console.log(
    JSON.stringify(
      {
        mode: execute ? 'execute' : 'dry-run',
        name,
        phone,
        email,
        stayStart,
        stayEnd,
        durationDays,
        totalPaise,
        totalInr: totalPaise / 100,
        ratePerDayPaise,
        ratePerDayInr: ratePerDayPaise / 100,
        lineLabel,
        paymentStatus: 'Unpaid',
      },
      null,
      2,
    ),
  );

  if (!execute) {
    console.log('\nDry run — pass --execute to create standalone invoice.');
    await closeDb();
    return;
  }

  const result = await createStandaloneCustomerInvoice({
    customer: { fullName: name, phone, email },
    stayStart,
    stayEnd,
    durationDays,
    totalPaise,
    description,
    additionalChargesPaise: Number.isFinite(additionalPaise) ? additionalPaise : 0,
  });

  if (!result.ok) {
    console.error('Failed:', result.error);
    await closeDb();
    process.exit(1);
  }

  const { CANONICAL_PRODUCTION_URL } = await import('@/src/lib/url');
  const { invoicePublicSharePath } = await import('@/src/lib/billing/invoiceShareToken');
  const productionShareUrl =
    process.env.USE_PRODUCTION_DB === '1'
      ? `${CANONICAL_PRODUCTION_URL}${invoicePublicSharePath(result.shareToken)}`
      : result.shareUrl;
  const productionPdfUrl =
    process.env.USE_PRODUCTION_DB === '1'
      ? `${CANONICAL_PRODUCTION_URL}${result.pdfPath}`
      : result.pdfPath;

  console.log('\nStandalone invoice (created or idempotent match):');
  console.log(
    JSON.stringify(
      {
        invoiceNumber: result.invoiceNumber,
        customerName: result.customerName,
        stayPeriod: result.stayPeriodLabel,
        totalInr: result.amountPaise / 100,
        paymentStatus: result.paymentStatus,
        shareUrl: productionShareUrl,
        pdfUrl: productionPdfUrl,
        invoiceId: result.invoiceId,
        created: result.created,
      },
      null,
      2,
    ),
  );

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
