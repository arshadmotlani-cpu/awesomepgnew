#!/usr/bin/env npx tsx
import { eq, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('check-migration-status.ts');
import { closeDb, db } from '../src/db/client';
import { bookings, rentInvoices, residentBillingProfiles } from '../src/db/schema';

async function main() {
  const codes = ['APG-2026-0090', 'APG-2026-0094'];
  for (const code of codes) {
    const rows = await db.execute<{
      booking_code: string;
      policy: string;
      billing_day: number;
      first_auto: string | null;
      migrated_at: string | null;
    }>(sql`
      SELECT b.booking_code, rbp.billing_cycle_policy as policy, rbp.billing_day,
             rbp.first_auto_billing_date::text as first_auto,
             rbp.billing_cycle_migrated_at::text as migrated_at
      FROM bookings b
      JOIN resident_billing_profiles rbp ON rbp.booking_id = b.id
      WHERE b.booking_code = ${code}
    `);
    console.log('PROFILE', JSON.stringify(rows[0]));

    const invs = await db.execute<{
      invoice_number: string;
      subtype: string;
      due_date: string | null;
      rent_paise: number;
      status: string;
      is_adhoc: boolean;
      notes: string | null;
    }>(sql`
      SELECT ri.invoice_number, ri.invoice_subtype as subtype, ri.due_date::text,
             ri.rent_paise, ri.status, ri.is_adhoc, ri.notes
      FROM rent_invoices ri
      JOIN bookings b ON b.id = ri.booking_id
      WHERE b.booking_code = ${code}
      ORDER BY ri.billing_month
    `);
    for (const i of invs) console.log('INV', code, JSON.stringify(i));
  }

  const counts = await db.execute<{ policy: string; cnt: number }>(sql`
    SELECT billing_cycle_policy as policy, count(*)::int as cnt
    FROM resident_billing_profiles rbp
    JOIN bookings b ON b.id = rbp.booking_id
    JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary' AND br.status = 'active'
    WHERE b.status = 'confirmed' AND b.is_test = false
      AND CURRENT_DATE <@ br.stay_range
    GROUP BY billing_cycle_policy
  `);
  console.log('POLICY_COUNTS', JSON.stringify(counts));
}

main().then(() => closeDb()).catch((e) => { console.error(e); closeDb().finally(() => process.exit(1)); });
