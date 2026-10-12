/* eslint-disable no-console */
/**
 * Read-only: recent fyh_checkout_operations (production diagnostics).
 * HAIR_DATABASE_URL must point at the target DB (use production integration URL).
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { sql } from 'drizzle-orm';
import { createHairClient } from '@/src/hair/db/client';
import { getHairDatabaseHost } from '@/src/hair/lib/db/env';

async function main() {
  console.log(`Hair DB host: ${getHairDatabaseHost() ?? 'unknown'}`);
  const { db, close } = createHairClient({ max: 1 });
  const rows = await db.execute<{
    attempt_key: string;
    status: string;
    invoice_id: string | null;
    error_message: string | null;
    created_at: string;
    invoice_number: string | null;
    grand_total_paise: string | null;
    inv_status: string | null;
    customer_code: string | null;
  }>(sql`
    SELECT o.attempt_key, o.status, o.invoice_id::text, o.error_message, o.created_at::text,
           i.invoice_number, i.grand_total_paise::text, i.status AS inv_status,
           c.customer_code
    FROM fyh_checkout_operations o
    LEFT JOIN fyh_invoices i ON i.id = o.invoice_id
    LEFT JOIN fyh_customers c ON c.id = i.customer_id
    WHERE o.created_at >= now() - interval '7 days'
    ORDER BY o.created_at DESC
    LIMIT 40
  `);
  console.log(JSON.stringify({ count: rows.length, rows }, null, 2));
  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
