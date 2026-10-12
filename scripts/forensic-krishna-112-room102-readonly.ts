/**
 * READ-ONLY: Krishna Hundani ₹112 prior + Room 102 occupants Sep 5–Oct 4.
 * USE_PRODUCTION_DB=1 npx tsx scripts/forensic-krishna-112-room102-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';

loadProductionAuditEnv();
requireDatabaseUrl('forensic-krishna-112-room102');

function rows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: T[] })?.rows ?? []) as T[];
}

async function main() {
  const { sql } = await import('drizzle-orm');
  const { closeDb, db } = await import('@/src/db/client');
  const { loadRoomElectricityOccupantsForMonth } = await import(
    '@/src/lib/billing/roomElectricityOccupants'
  );
  const { loadVerifiedPriorElectricityCollectionsForOpenMeterPeriod } = await import(
    '@/src/lib/billing/electricityMeterPeriodPriorCollections'
  );
  const { loadPgElectricityRoomGenerationPreview } = await import(
    '@/src/lib/billing/pgElectricityGenerationPreview'
  );

  const PERIOD_START = '2026-09-05';
  const PERIOD_END = '2026-10-04';
  const PERIOD_END_EXCL = formatDate(addDays(parseDate(PERIOD_END), 1));
  const PREV = 424;
  const CURR = 496;
  const BILLING_MONTH = '2026-10-01';
  const LEDGER_ID_SUFFIX = 'f4b763';

  const [room] = rows<{ id: string; room_number: string }>(
    await db.execute(sql`
      SELECT r.id::text AS id, r.room_number
      FROM rooms r
      JOIN floors f ON f.id = r.floor_id JOIN pgs p ON p.id = f.pg_id
      WHERE r.room_number = '102' AND p.name ILIKE '%shantinagar%' LIMIT 1
    `),
  );

  const ledgerRows = rows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT esl.*,
             c.full_name AS customer_name,
             c.id::text AS customer_id_text,
             b.booking_code,
             cs.status AS checkout_status,
             cs.electricity_share_paise,
             cs.electricity_from_deposit_paise,
             cs.electricity_previous_reading::text,
             cs.electricity_current_reading::text,
             cs.electricity_units::text,
             cs.electricity_calculation_method,
             cs.electricity_deduct_from_deposit,
             cs.electricity_unit_rate_paise,
             cs.electricity_occupants,
             cs.electricity_meter_photo_url,
             vr.vacating_date::text AS vacating_date,
             vr.status AS vacating_status,
             vr.id::text AS vacating_request_id,
             r.room_number AS ledger_room_number,
             bd.bed_code
      FROM electricity_settlement_ledger esl
      JOIN customers c ON c.id = esl.customer_id
      JOIN bookings b ON b.id = esl.booking_id
      JOIN checkout_settlements cs ON cs.id = esl.checkout_settlement_id
      JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
      JOIN rooms r ON r.id = esl.room_id
      LEFT JOIN bed_reservations br ON br.booking_id = esl.booking_id AND br.kind = 'primary'
      LEFT JOIN beds bd ON bd.id = br.bed_id
      WHERE esl.id::text LIKE ${'%' + LEDGER_ID_SUFFIX}
         OR esl.room_id = ${room.id}::uuid
      ORDER BY esl.created_at
    `),
  );

  const targetLedger =
    ledgerRows.find((r) => String(r.id).endsWith(LEDGER_ID_SUFFIX)) ?? ledgerRows.find(
      (r) => Number(r.amount_paise) === 11200,
    );

  let depositLedger: Record<string, unknown>[] = [];
  let contributions: Record<string, unknown>[] = [];
  let invoices: Record<string, unknown>[] = [];
  let otherLedgerForSettlement: Record<string, unknown>[] = [];
  let appliedBills: Record<string, unknown>[] = [];

  if (targetLedger?.checkout_settlement_id) {
    const csId = String(targetLedger.checkout_settlement_id);
    const bookingId = String(targetLedger.booking_id);

    depositLedger = rows(
      await db.execute(sql`
        SELECT dl.id::text, dl.entry_kind, dl.reason, dl.amount_paise, dl.created_at::text, dl.booking_id::text
        FROM deposit_ledger dl
        WHERE dl.booking_id = ${bookingId}::uuid
          AND dl.entry_kind = 'deducted'
        ORDER BY dl.created_at
      `),
    );

    contributions = rows(
      await db.execute(sql`
        SELECT erc.*
        FROM electricity_room_contributions erc
        WHERE erc.checkout_settlement_id = ${csId}::uuid
           OR erc.booking_id = ${bookingId}::uuid
           OR erc.customer_id = ${targetLedger.customer_id}::uuid
      `),
    );

    invoices = rows(
      await db.execute(sql`
        SELECT ei.invoice_number, ei.amount_paise, ei.billing_month::text, ei.status,
               eb.previous_reading_units::text, eb.current_reading_units::text,
               eb.period_start_date::text, eb.period_end_date::text
        FROM electricity_invoices ei
        JOIN electricity_bills eb ON eb.id = ei.electricity_bill_id
        WHERE ei.customer_id = ${targetLedger.customer_id}::uuid
          AND eb.room_id = ${room.id}::uuid
        ORDER BY ei.created_at
      `),
    );

    otherLedgerForSettlement = rows(
      await db.execute(sql`
        SELECT * FROM electricity_settlement_ledger
        WHERE checkout_settlement_id = ${csId}::uuid
      `),
    );

    if (targetLedger.electricity_bill_id) {
      appliedBills = rows(
        await db.execute(sql`
          SELECT id::text, billing_month::text, previous_reading_units::text, current_reading_units::text
          FROM electricity_bills WHERE id = ${targetLedger.electricity_bill_id}::uuid
        `),
      );
    }
  }

  const stayHistory = targetLedger
    ? rows(
        await db.execute(sql`
          SELECT br.id::text AS reservation_id, br.status, br.kind,
                 br.stay_range::text,
                 lower(br.stay_range)::text AS stay_start,
                 upper(br.stay_range)::text AS stay_end,
                 bd.bed_code, r.room_number, r.id::text AS room_id
          FROM bed_reservations br
          JOIN beds bd ON bd.id = br.bed_id
          JOIN rooms r ON r.id = bd.room_id
          JOIN bookings bk ON bk.id = br.booking_id
          WHERE bk.customer_id = ${targetLedger.customer_id}::uuid
            AND br.kind = 'primary'
          ORDER BY lower(br.stay_range)
        `),
      )
    : [];

  const finalizedBills102 = rows(
    await db.execute(sql`
      SELECT id::text, billing_month::text, period_start_date::text, period_end_date::text,
             previous_reading_units::text, current_reading_units::text, created_at::text
      FROM electricity_bills
      WHERE room_id = ${room.id}::uuid AND is_pipeline_test = false
      ORDER BY created_at
    `),
  );

  const occupantLoad = await loadRoomElectricityOccupantsForMonth({
    roomId: room.id,
    billingMonth: BILLING_MONTH,
    includeFixedStay: true,
    useProRataByActiveDays: true,
    meterPeriod: { startDate: PERIOD_START, endDateExclusive: PERIOD_END_EXCL },
  });

  const verifiedPrior = await loadVerifiedPriorElectricityCollectionsForOpenMeterPeriod({
    roomId: room.id,
    reportingBillingMonth: BILLING_MONTH,
    periodStartDate: PERIOD_START,
    periodEndExclusive: PERIOD_END_EXCL,
  });

  const preview = await loadPgElectricityRoomGenerationPreview({
    roomId: room.id,
    billingMonth: BILLING_MONTH,
    previousReadingUnits: PREV,
    currentReadingUnits: CURR,
    ratePerUnitPaise: 1600,
    readingDate: PERIOD_END,
  });

  const allPrimaryOverlapping = rows(
    await db.execute(sql`
      SELECT c.full_name, c.id::text AS customer_id, bk.booking_code, br.status AS res_status,
             lower(br.stay_range)::text AS stay_start,
             upper(br.stay_range)::text AS stay_end,
             bd.bed_code,
             (
               SELECT vr.vacating_date::text
               FROM vacating_requests vr
               WHERE vr.booking_id = br.booking_id AND vr.status IN ('approved','completed')
               ORDER BY CASE vr.status WHEN 'completed' THEN 0 ELSE 1 END, vr.vacating_date DESC NULLS LAST
               LIMIT 1
             ) AS vacating_date
      FROM bed_reservations br
      JOIN bookings bk ON bk.id = br.booking_id
      JOIN customers c ON c.id = bk.customer_id
      JOIN beds bd ON bd.id = br.bed_id
      WHERE bd.room_id = ${room.id}::uuid
        AND br.kind = 'primary'
        AND br.status IN ('active','completed')
        AND bk.status IN ('confirmed','completed','superseded')
        AND bk.is_test = false AND c.is_test = false
        AND br.stay_range && daterange(${PERIOD_START}::date, ${PERIOD_END_EXCL}::date, '[)')
      ORDER BY lower(br.stay_range), c.full_name
    `),
  );

  const krishnaInVerified = verifiedPrior.collections.filter(
    (c) => c.amountPaise === 11200 || String(c.checkoutSettlementId ?? '').includes('f4b763'),
  );

  console.log(
    JSON.stringify(
      {
        mutations: 0,
        room102Id: room.id,
        meterPeriod: { start: PERIOD_START, end: PERIOD_END, prev: PREV, curr: CURR },
        targetLedger: targetLedger
          ? {
              ...targetLedger,
              amount_inr: paiseToInr(Number(targetLedger.amount_paise)),
            }
          : null,
        depositLedger,
        electricity_room_contributions: contributions,
        electricity_invoices_for_customer_in_room: invoices,
        all_ledger_rows_same_checkout: otherLedgerForSettlement,
        applied_bill_if_any: appliedBills,
        krishna_stay_history_all_rooms: stayHistory,
        finalized_bills_room102: finalizedBills102,
        ssot_occupants: occupantLoad.occupants.map((o) => ({
          name: o.customerName,
          customerId: o.customerId,
          bookingId: o.bookingId,
          days: o.occupiedDates?.length ?? o.weight,
          intervals: o.intervals,
          occupiedDates: o.occupiedDates,
        })),
        raw_sql_overlapping_reservations: allPrimaryOverlapping,
        verified_prior_krishna: krishnaInVerified,
        verified_prior_total_paise: verifiedPrior.totalPaise,
        allocation_preview: preview.allocationPreview
          ? {
              gross: preview.allocationPreview.grossTotalPaise,
              invoiceTotal: preview.allocationPreview.invoiceTotalPaise,
              remainder: preview.allocationPreview.remainderPaise,
              lines: preview.allocationPreview.lines.map((l) => ({
                name: l.customerName,
                start: l.occupancyStart,
                end: l.occupancyEnd,
                days: l.occupancyDays,
                grossPaise: l.grossAllocationPaise,
                invoicePaise: l.finalInvoicePaise,
              })),
            }
          : null,
        inclusion_logic: {
          ledger_created_date: targetLedger?.created_at,
          stay_period_start: targetLedger?.stay_period_start,
          stay_period_end: targetLedger?.stay_period_end,
          billing_month_on_ledger: targetLedger?.billing_month,
        },
      },
      null,
      2,
    ),
  );

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
