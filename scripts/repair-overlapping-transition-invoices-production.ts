#!/usr/bin/env npx tsx
/**
 * Cancel billing_cycle_transition invoices that overlap prepaid anniversary coverage.
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-overlapping-transition-invoices-production.ts
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-overlapping-transition-invoices-production.ts --execute
 */
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('repair-overlapping-transition-invoices-production.ts');

import { closeDb, db } from '../src/db/client';
import { adminUsers, bookings } from '../src/db/schema';
import {
  cancelOverlappingBillingTransitionInvoices,
  previewBillingCycleMigration,
} from '../src/services/billingCycleMigration';
import { parseBillingPeriodFromInvoiceNotes } from '../src/lib/billing/billingCoverageModel';
import { getBookingMoneyBalances } from '../src/services/bookingMoneyBalances';
import { paiseToInr } from '../src/lib/format';

const execute = process.argv.includes('--execute');

async function main() {
  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.role, 'super_admin'))
    .limit(1);
  if (!admin) throw new Error('No super_admin');

  const session = {
    adminId: admin.id,
    role: 'super_admin' as const,
    pgScope: null,
    email: admin.email,
  };

  const migrated = await db.execute<{
    booking_id: string;
    booking_code: string;
    name: string;
  }>(sql`
    SELECT b.id::text as booking_id, b.booking_code, c.full_name as name
    FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    JOIN resident_billing_profiles rbp ON rbp.booking_id = b.id
    JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary' AND br.status = 'active'
    WHERE b.status = 'confirmed' AND b.is_test = false AND c.is_test = false
      AND CURRENT_DATE <@ br.stay_range
      AND rbp.billing_cycle_policy = 'calendar_month_1st'
    ORDER BY c.full_name
  `);

  console.log(`Migrated residents to audit: ${migrated.length}`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}\n`);

  for (const row of migrated) {
    const preview = await previewBillingCycleMigration(row.booking_id);
    if ('ok' in preview && preview.ok === false) continue;

    const pending = await db.execute<{
      invoice_number: string;
      rent_paise: number;
      notes: string | null;
      status: string;
    }>(sql`
      SELECT invoice_number, rent_paise, notes, status
      FROM rent_invoices
      WHERE booking_id = ${row.booking_id}::uuid
        AND invoice_subtype = 'billing_cycle_transition'
        AND status IN ('pending', 'overdue')
    `);

    const money = await getBookingMoneyBalances(row.booking_id);
    console.log(`## ${row.name} (${row.booking_code})`);
    console.log(`  paid-through (migration): ${preview.paidThroughDate ?? '—'}`);
    console.log(`  rent outstanding: ${paiseToInr(money?.rent.outstandingPaise ?? 0)}`);
    for (const inv of pending) {
      const parsed = parseBillingPeriodFromInvoiceNotes(inv.notes);
      const overlap =
        parsed &&
        preview.paidThroughDate &&
        parsed.periodStart <= preview.paidThroughDate;
      console.log(
        `  - ${inv.invoice_number} ${parsed ? `${parsed.periodStart}→${parsed.periodEnd}` : '?'} ${paiseToInr(inv.rent_paise)} ${overlap ? 'OVERLAP→cancel' : 'keep'}`,
      );
    }

    if (execute) {
      const result = await cancelOverlappingBillingTransitionInvoices(
        session,
        row.booking_id,
        'Overlapping prepaid anniversary coverage — billing cycle migration correction',
      );
      console.log(
        `  cancelled: ${result.cancelledIds.length} kept: ${result.keptIds.length}`,
      );
    }
    console.log('');
  }
}

main()
  .then(() => closeDb())
  .catch((err) => {
    console.error(err);
    closeDb().finally(() => process.exit(1));
  });
