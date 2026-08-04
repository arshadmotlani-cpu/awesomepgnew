import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('check-optverify');
import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';

async function main() {
  const rows = await db.execute(sql`
    SELECT id, status, payment_id IS NOT NULL AS has_payment, paid_principal_paise, left(notes, 80) AS notes
    FROM rent_invoices
    WHERE notes LIKE '%OPTVERIFY_%'
      AND created_at > now() - interval '6 hours'
    ORDER BY created_at
  `);
  console.log('invoices', JSON.stringify(rows, null, 2));

  const pays = await db.execute(sql`
    SELECT id, status, amount_paise, provider_payment_id, created_at::text
    FROM payments
    WHERE provider_payment_id LIKE 'rent-proof-%'
      AND created_at > now() - interval '6 hours'
    ORDER BY created_at DESC
    LIMIT 30
  `);
  console.log('payments', JSON.stringify(pays, null, 2));
}

main()
  .catch(console.error)
  .finally(() => closeDb());
