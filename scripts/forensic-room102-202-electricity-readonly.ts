/* eslint-disable no-console */
/**
 * READ-ONLY forensic: Room 102 configuration + Room 202 electricity ledger.
 * Mutations: 0
 *
 * USE_PRODUCTION_DB=1 npx tsx scripts/forensic-room102-202-electricity-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('forensic-room102-202-electricity-readonly.ts');

function rows<T extends Record<string, unknown>>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: T[] })?.rows ?? []) as T[];
}

async function main() {
  const { sql } = await import('drizzle-orm');
  const { closeDb, db } = await import('../src/db/client');
  const { paiseToInr } = await import('../src/lib/format');
  const {
    getRoomConfigurationEffectiveOn,
    resolveEffectiveBedCountForRoom,
  } = await import('../src/services/roomConfigurationSchedule');
  const { sharingTypeName } = await import('../src/lib/roomSharing');

  const pgFilter = sql`p.name ILIKE '%shantinagar%'`;

  async function roomByNumber(num: string) {
    const [room] = rows<{ room_id: string; room_number: string; room_type_name: string }>(
      await db.execute(sql`
        SELECT r.id::text AS room_id, r.room_number, rt.name AS room_type_name
        FROM rooms r
        JOIN floors f ON f.id = r.floor_id
        JOIN pgs p ON p.id = f.pg_id
        LEFT JOIN room_types rt ON rt.id = r.room_type_id
        WHERE r.room_number = ${num} AND ${pgFilter}
        LIMIT 1
      `),
    );
    return room;
  }

  // ── PART 1: Room 102 ──
  const r102 = await roomByNumber('102');
  if (!r102) throw new Error('Room 102 not found');

  const beds102 = rows(
    await db.execute(sql`
      SELECT b.bed_code, b.id::text AS bed_id, b.archived_at IS NOT NULL AS archived
      FROM beds b WHERE b.room_id = ${r102.room_id}::uuid ORDER BY b.bed_code
    `),
  );

  const schedules102 = rows(
    await db.execute(sql`
      SELECT id::text, status::text, effective_from::text, applied_at::text,
             target_bed_count, room_type_name, created_at::text, updated_at::text,
             previous_snapshot
      FROM room_configuration_schedules
      WHERE room_id = ${r102.room_id}::uuid
      ORDER BY effective_from, created_at
    `),
  );

  const effToday = await getRoomConfigurationEffectiveOn(r102.room_id, '2026-10-02');
  const effSep30 = await getRoomConfigurationEffectiveOn(r102.room_id, '2026-09-30');
  const effOct1 = await getRoomConfigurationEffectiveOn(r102.room_id, '2026-10-01');

  const bills102 = rows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT eb.id::text, eb.billing_month::text, eb.period_start_date::text, eb.period_end_date::text,
             eb.previous_reading_units::text, eb.current_reading_units::text, eb.units_consumed::text,
             eb.rate_per_unit_paise, eb.total_paise, eb.monthly_occupant_count,
             eb.bill_status::text, eb.is_estimated, eb.notes, eb.created_at::text,
             eb.calculation_breakdown
      FROM electricity_bills eb
      WHERE eb.room_id = ${r102.room_id}::uuid AND eb.is_pipeline_test = false
      ORDER BY eb.created_at ASC
    `),
  );

  const bills102Analysis = [];
  for (const b of bills102) {
    const billingMonth = String(b.billing_month).slice(0, 10);
    const periodEnd = b.period_end_date ? String(b.period_end_date).slice(0, 10) : billingMonth;
    const resolverAtMonth = await resolveEffectiveBedCountForRoom(r102.room_id, billingMonth);
    const resolverAtPeriodEnd = await resolveEffectiveBedCountForRoom(r102.room_id, periodEnd);
    const breakdown = b.calculation_breakdown as Record<string, unknown> | null;
    const storedOccupant = Number(b.monthly_occupant_count);
    bills102Analysis.push({
      billId: b.id,
      generated: String(b.created_at).slice(0, 10),
      billingMonth,
      period: `${b.period_start_date ?? '?'} → ${b.period_end_date ?? '?'}`,
      storedMonthlyOccupantCount: storedOccupant,
      resolverSharingAtBillingMonth: resolverAtMonth,
      resolverSharingAtPeriodEnd: resolverAtPeriodEnd,
      breakdownActiveBedCount: breakdown?.activeBedCount ?? breakdown?.sharing ?? null,
      totalInr: paiseToInr(Number(b.total_paise)),
      units: b.units_consumed,
    });
  }

  console.log('\n=== PART 1 — ROOM 102 CONFIGURATION ===\n');
  console.log(
    JSON.stringify(
      {
        roomId: r102.room_id,
        roomsTableRoomTypeName: r102.room_type_name,
        physicalBedsInDb: beds102.filter((b) => !b.archived).length,
        beds: beds102,
        configurationSchedules: schedules102,
        resolverGetRoomConfigurationEffectiveOn: {
          '2026-09-30': effSep30,
          '2026-10-01': effOct1,
          '2026-10-02': effToday,
        },
        sharingLabelOct2: sharingTypeName(effToday.sharingCapacity),
        electricityBillsSharingAnalysis: bills102Analysis,
      },
      null,
      2,
    ),
  );

  // ── PART 2: Room 202 ──
  const r202 = await roomByNumber('202');
  if (!r202) throw new Error('Room 202 not found');

  const bills202 = rows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT eb.id::text, eb.billing_month::text, eb.period_start_date::text, eb.period_end_date::text,
             eb.previous_reading_units::text, eb.current_reading_units::text, eb.units_consumed::text,
             eb.rate_per_unit_paise, eb.total_paise, eb.monthly_occupant_count, eb.per_resident_paise,
             eb.bill_status::text, eb.is_estimated, eb.notes, eb.created_at::text, eb.updated_at::text,
             eb.calculation_breakdown, eb.checkout_credit_applied_paise, eb.prepaid_credit_applied_paise
      FROM electricity_bills eb
      WHERE eb.room_id = ${r202.room_id}::uuid AND eb.is_pipeline_test = false
      ORDER BY eb.created_at ASC
    `),
  );

  const ledger202 = rows(
    await db.execute(sql`
      SELECT esl.id::text, esl.billing_month::text, esl.status, esl.amount_paise,
             esl.units::text, esl.stay_period_start::text, esl.stay_period_end::text,
             esl.created_at::text, esl.electricity_bill_id::text, c.full_name
      FROM electricity_settlement_ledger esl
      JOIN customers c ON c.id = esl.customer_id
      WHERE esl.room_id = ${r202.room_id}::uuid
      ORDER BY esl.created_at ASC
    `),
  );

  const history = [];
  let n = 0;
  for (const b of bills202) {
    n += 1;
    const billingMonth = String(b.billing_month).slice(0, 10);
    const periodStart = b.period_start_date ? String(b.period_start_date).slice(0, 10) : null;
    const periodEnd = b.period_end_date ? String(b.period_end_date).slice(0, 10) : null;
    const resolverDate = periodEnd ?? billingMonth;
    const sharingUsed = await resolveEffectiveBedCountForRoom(r202.room_id, billingMonth);
    const breakdown = b.calculation_breakdown as Record<string, unknown> | null;
    const billType = b.notes
      ? String(b.notes)
      : b.is_estimated
        ? 'estimated meter bill'
        : periodStart && periodEnd
          ? 'meter-period bill'
          : 'monthly electricity bill';

    const invs = rows(
      await db.execute(sql`
        SELECT ei.id::text, ei.invoice_number, ei.status::text, ei.amount_paise, ei.active_days,
               c.full_name, b.bed_code, ei.created_at::text
        FROM electricity_invoices ei
        JOIN customers c ON c.id = ei.customer_id
        LEFT JOIN beds b ON b.id = ei.bed_id
        WHERE ei.electricity_bill_id = ${b.id as string}::uuid
        ORDER BY c.full_name
      `),
    );

    history.push({
      index: n,
      billLedgerId: b.id,
      generatedDate: String(b.created_at).slice(0, 10),
      generatedAt: b.created_at,
      billingMonthLabel: billingMonth,
      periodStart,
      periodEnd,
      meterOpening: b.previous_reading_units,
      meterClosing: b.current_reading_units,
      units: b.units_consumed,
      ratePerUnitInr: paiseToInr(Number(b.rate_per_unit_paise)),
      totalRoomAmountInr: paiseToInr(Number(b.total_paise)),
      storedMonthlyOccupantCount: Number(b.monthly_occupant_count),
      resolverSharingAtBillingMonth: sharingUsed,
      breakdownActiveBedCount: breakdown?.activeBedCount ?? null,
      billStatus: b.bill_status,
      billType,
      residentInvoices: invs.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoice_number,
        resident: i.full_name,
        bed: i.bed_code,
        amountInr: paiseToInr(Number(i.amount_paise)),
        status: i.status,
        activeDays: i.active_days,
        generated: String(i.created_at).slice(0, 10),
      })),
    });
  }

  console.log('\n=== PART 2 — ROOM 202 ELECTRICITY BILL HISTORY ===\n');
  console.log(JSON.stringify({ roomId: r202.room_id, billCount: bills202.length, ledgerRows: ledger202, bills: history }, null, 2));

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  const { closeDb } = await import('../src/db/client');
  await closeDb().catch(() => undefined);
  process.exit(1);
});
