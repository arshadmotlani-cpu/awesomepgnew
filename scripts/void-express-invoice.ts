/* eslint-disable no-console */
/**
 * Void an express walk-in invoice and remove resident traces.
 *
 * Usage:
 *   npx tsx scripts/void-express-invoice.ts RNT-2026-06-0019 --execute
 *   npx tsx scripts/void-express-invoice.ts --phone=9049163636 --execute
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.vercel.prod') });
config({ path: resolve(process.cwd(), '.env.production.local') });
config({ path: resolve(process.cwd(), '.env') });

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const execute = process.argv.includes('--execute');
  const invoiceNumber = process.argv[2]?.startsWith('--') ? undefined : process.argv[2];
  const phone = arg('phone');

  const { closeDb, db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');

  let invoiceId: string | undefined;
  if (invoiceNumber) {
    const [row] = await db.execute<{ id: string }>(sql`
      SELECT id::text FROM financial_invoices WHERE invoice_number = ${invoiceNumber} LIMIT 1
    `);
    invoiceId = row?.id;
  } else if (phone) {
    const digits = phone.replace(/\D/g, '');
    const [row] = await db.execute<{ id: string }>(sql`
      SELECT fi.id::text
      FROM financial_invoices fi
      JOIN customers c ON c.id = fi.customer_id
      WHERE regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'}
        AND fi.status IN ('paid', 'sent', 'overdue', 'partial', 'refunded')
      ORDER BY fi.created_at DESC
      LIMIT 1
    `);
    invoiceId = row?.id;
  }

  if (!invoiceId) {
    console.error('Usage: npx tsx scripts/void-express-invoice.ts <invoiceNumber> [--execute]');
    process.exit(1);
  }

  console.log(`\n=== Void express invoice ${invoiceId} (${execute ? 'EXECUTE' : 'dry-run'}) ===\n`);

  const { getInvoiceVoidCapabilities } = await import('../src/services/invoiceVoid');
  const caps = await getInvoiceVoidCapabilities(invoiceId);
  console.log('Capabilities:', caps);

  if (!execute) {
    console.log('\nDry run only — pass --execute to void.');
    await closeDb();
    return;
  }

  const { voidInvoiceCompletely } = await import('../src/services/invoiceVoid');
  const result = await voidInvoiceCompletely(
    invoiceId,
    '[admin script] Void mistaken express walk-in sale',
    { type: 'admin', id: 'script' },
    { archiveCustomer: true },
  );
  console.log(JSON.stringify(result, null, 2));
  await closeDb();
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
