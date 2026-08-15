#!/usr/bin/env npx tsx
import { sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('list-migrated-residents.ts');
import { closeDb, db } from '../src/db/client';

async function main() {
  const rows = await db.execute<{
    booking_code: string;
    name: string;
    policy: string;
    billing_day: number;
    first_auto: string;
    migrated_at: string;
    transition_cnt: number;
  }>(sql`
    SELECT b.booking_code, c.full_name as name, rbp.billing_cycle_policy as policy,
           rbp.billing_day, rbp.first_auto_billing_date::text as first_auto,
           rbp.billing_cycle_migrated_at::text as migrated_at,
           (SELECT count(*)::int FROM rent_invoices ri
            WHERE ri.booking_id = b.id AND ri.invoice_subtype = 'billing_cycle_transition') as transition_cnt
    FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    JOIN resident_billing_profiles rbp ON rbp.booking_id = b.id
    JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary' AND br.status = 'active'
    WHERE b.status = 'confirmed' AND b.is_test = false AND c.is_test = false
      AND CURRENT_DATE <@ br.stay_range
      AND rbp.billing_cycle_policy = 'calendar_month_1st'
    ORDER BY c.full_name
  `);
  for (const r of rows) {
    console.log(JSON.stringify(r));
  }
}

main().then(() => closeDb());
