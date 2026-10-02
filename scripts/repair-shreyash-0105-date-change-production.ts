/* eslint-disable no-console */
/**
 * Repair APG-2026-0105 move-out date change via approveVacatingDateChangeRequest SSOT.
 *
 *   npx tsx scripts/repair-shreyash-0105-date-change-production.ts --dry-run
 *   npx tsx scripts/repair-shreyash-0105-date-change-production.ts --apply
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('repair-shreyash-0105-date-change-production.ts');

const BOOKING_CODE = 'APG-2026-0105';
const DATE_CHANGE_REQUEST_ID = 'e253f864-e375-4fda-af3a-ed68f3037d44';

async function snapshot(label: string) {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  console.log(`\n=== ${label} ===`);
  const rows = await db.execute(sql`
    SELECT vr.status AS vacating_status, vr.vacating_date::text, vr.deduction_paise,
           vr.notice_chargeable_days, br.stay_range::text,
           ri.invoice_number, ri.billing_month::text, ri.status AS inv_status
    FROM bookings b
    JOIN vacating_requests vr ON vr.booking_id = b.id
    LEFT JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary' AND br.status = 'active'
    LEFT JOIN rent_invoices ri ON ri.booking_id = b.id AND ri.billing_month = '2026-10-01' AND ri.is_adhoc = false
    WHERE b.booking_code = ${BOOKING_CODE}
    ORDER BY vr.updated_at DESC LIMIT 1
  `);
  console.log(rows[0]);
  const dcr = await db.execute(sql`
    SELECT status, requested_vacating_date::text FROM vacating_date_change_requests
    WHERE id = ${DATE_CHANGE_REQUEST_ID}::uuid
  `);
  console.log('date_change', dcr[0]);
}

async function main() {
  const apply = process.argv.includes('--apply');
  await snapshot('BEFORE');

  if (!apply) {
    console.log('\nDry run — re-run with --apply to execute approveVacatingDateChangeRequest');
    const { closeDb } = await import('../src/db/client');
    await closeDb();
    return;
  }

  const { approveVacatingDateChangeRequest } = await import('../src/services/vacatingDateChange');
  const result = await approveVacatingDateChangeRequest({
    requestId: DATE_CHANGE_REQUEST_ID,
    resolvedByAdminId: null,
    adminNotes: 'Production repair — approve 30 Sep checkout after withdraw orphan',
  });
  console.log('\napprove result:', result);

  await snapshot('AFTER');
  const { closeDb } = await import('../src/db/client');
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  const { closeDb } = await import('../src/db/client');
  await closeDb().catch(() => undefined);
  process.exit(1);
});
