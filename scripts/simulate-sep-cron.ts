#!/usr/bin/env npx tsx
import { sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('simulate-sep-cron.ts');
import { closeDb, db } from '../src/db/client';
import { evaluateAnniversaryRentGenerationEligibility } from '../src/services/rentInvoices';

async function main() {
  const rows = await db.execute<{ id: string; booking_code: string; name: string }>(sql`
    SELECT b.id::text, b.booking_code, c.full_name as name
    FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    JOIN resident_billing_profiles rbp ON rbp.booking_id = b.id
    JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary' AND br.status = 'active'
    WHERE b.status = 'confirmed' AND b.is_test = false
      AND CURRENT_DATE <@ br.stay_range
      AND rbp.billing_cycle_policy = 'calendar_month_1st'
    ORDER BY c.full_name
  `);
  for (const r of rows) {
    const elig = await evaluateAnniversaryRentGenerationEligibility({
      bookingId: r.id,
      billingMonth: '2026-09-01',
      asOf: '2026-09-01',
      forceAll: false,
    });
    console.log(
      JSON.stringify({
        code: r.booking_code,
        name: r.name,
        eligible: elig.eligible,
        skip: elig.skipCode,
        rent: elig.rentPaise,
      }),
    );
  }
}

main().then(() => closeDb());
