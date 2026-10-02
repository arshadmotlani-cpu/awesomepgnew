/* eslint-disable no-console */
/** Read-only forensic for move-out date change — APG-2026-0105 */
import { sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('forensic-shreyash-0105-readonly.ts');

const BOOKING_CODE = 'APG-2026-0105';

async function main() {
  const { closeDb, db } = await import('../src/db/client');

  const [b] = await db.execute(sql`
    SELECT b.id, b.booking_code, b.status, b.expected_checkout_date::text,
           c.full_name, c.phone
    FROM bookings b JOIN customers c ON c.id = b.customer_id
    WHERE b.booking_code = ${BOOKING_CODE}
  `);
  console.log('BOOKING', b);

  const vr = await db.execute(sql`
    SELECT vr.id, vr.status, vr.notice_given_date::text, vr.vacating_date::text,
           vr.deduction_paise, vr.notice_chargeable_days, vr.notice_rent_covered_days,
           vr.monthly_rent_paise_snapshot, vr.created_at, vr.updated_at
    FROM vacating_requests vr
    JOIN bookings b ON b.id = vr.booking_id
    WHERE b.booking_code = ${BOOKING_CODE}
    ORDER BY vr.created_at DESC
  `);
  console.log('\nVACATING_REQUESTS', vr);

  const dcr = await db.execute(sql`
    SELECT vdcr.id, vdcr.status, vdcr.current_vacating_date::text, vdcr.requested_vacating_date::text,
           vdcr.refund_delta_paise, vdcr.created_at, vdcr.reviewed_at, vdcr.admin_notes
    FROM vacating_date_change_requests vdcr
    JOIN bookings b ON b.id = vdcr.booking_id
    WHERE b.booking_code = ${BOOKING_CODE}
    ORDER BY vdcr.created_at DESC
  `);
  console.log('\nDATE_CHANGE_REQUESTS', dcr);

  const br = await db.execute(sql`
    SELECT br.status, br.kind, br.stay_range::text,
           bd.bed_code, r.room_number, p.name AS pg_name
    FROM bed_reservations br
    JOIN beds bd ON bd.id = br.bed_id
    JOIN rooms r ON r.id = bd.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    JOIN bookings b ON b.id = br.booking_id
    WHERE b.booking_code = ${BOOKING_CODE}
    ORDER BY br.status, br.kind
  `);
  console.log('\nBED_RESERVATIONS', br);

  const ri = await db.execute(sql`
    SELECT ri.invoice_number, ri.billing_month::text, ri.status, ri.rent_paise,
           ri.paid_principal_paise, ri.notes, ri.created_at
    FROM rent_invoices ri
    JOIN bookings b ON b.id = ri.booking_id
    WHERE b.booking_code = ${BOOKING_CODE} AND ri.is_adhoc = false
    ORDER BY ri.billing_month DESC
  `);
  console.log('\nRENT_INVOICES', ri);

  const cs = await db.execute(sql`
    SELECT cs.id, cs.status, cs.amounts_locked, cs.estimated_refund_paise,
           cs.final_refund_paise, cs.updated_at
    FROM checkout_settlements cs
    JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    JOIN bookings b ON b.id = vr.booking_id
    WHERE b.booking_code = ${BOOKING_CODE}
    ORDER BY cs.updated_at DESC
  `);
  console.log('\nCHECKOUT_SETTLEMENTS', cs);

  const audit = await db.execute(sql`
    SELECT created_at, actor_type, entity, action, diff
    FROM audit_log
    WHERE entity_id IN (
      SELECT vr.id::text FROM vacating_requests vr JOIN bookings b ON b.id = vr.booking_id WHERE b.booking_code = ${BOOKING_CODE}
    )
       OR entity_id IN (
      SELECT vdcr.id::text FROM vacating_date_change_requests vdcr JOIN bookings b ON b.id = vdcr.booking_id WHERE b.booking_code = ${BOOKING_CODE}
    )
    ORDER BY created_at DESC LIMIT 20
  `);
  console.log('\nAUDIT (recent)', audit);

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
