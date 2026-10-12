/* eslint-disable no-console */
/**
 * READ-ONLY: Shantinagar Oct 2026 electricity generation eligibility audit.
 * Uses live services: loadPgElectricityBillingChecklist, loadRoomElectricityOccupantsForMonth.
 *
 * USE_PRODUCTION_DB=1 npx tsx scripts/forensic-shantinagar-oct2026-electricity-eligibility-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('forensic-shantinagar-oct2026-electricity-eligibility-readonly.ts');

const BILLING_MONTH = '2026-10-01';
const PG_NAME_PATTERN = 'shantinagar';

function rows<T extends Record<string, unknown>>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: T[] })?.rows ?? []) as T[];
}

async function main() {
  const { sql, eq, and } = await import('drizzle-orm');
  const { closeDb, db } = await import('../src/db/client');
  const { pgs, floors, rooms, roomTypes, beds } = await import('../src/db/schema');
  const { loadPgElectricityBillingChecklist } = await import(
    '../src/lib/billing/pgElectricityBillingChecklist'
  );
  const { loadRoomElectricityOccupantsForMonth } = await import(
    '../src/lib/billing/roomElectricityOccupants'
  );
  const { isMonthlyElectricityBillableOccupant } = await import(
    '../src/lib/billing/electricityOccupancyEligibility'
  );
  const { summarizeRentBillingOverviewCounts } = await import('../src/services/rentInvoices');
  const { resolveRoomPreviousMeterReading } = await import(
    '../src/services/roomMeterReadingSsot'
  );
  const { getRoomConfigurationEffectiveOn } = await import(
    '../src/services/roomConfigurationSchedule'
  );

  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(sql`${pgs.name} ILIKE ${`%${PG_NAME_PATTERN}%`} AND ${pgs.archivedAt} IS NULL`)
    .limit(1);
  if (!pg) throw new Error('Shantinagar PG not found');

  console.log('\n=== PG ===');
  console.log(JSON.stringify(pg, null, 2));

  const checklist = await loadPgElectricityBillingChecklist({
    pgId: pg.id,
    billingMonth: BILLING_MONTH,
  });
  if (!checklist) throw new Error('Checklist null');

  const allPhysicalRooms = rows<{
    room_id: string;
    room_number: string;
    has_ac: boolean;
    room_type: string;
  }>(
    await db.execute(sql`
      SELECT r.id::text AS room_id, r.room_number, rt.has_ac, rt.name AS room_type
      FROM rooms r
      JOIN floors f ON f.id = r.floor_id
      JOIN room_types rt ON rt.id = r.room_type_id
      WHERE f.pg_id = ${pg.id}::uuid AND r.archived_at IS NULL
      ORDER BY r.room_number
    `),
  );

  const rentOverviewRows = rows<{
    room_number: string;
    full_name: string;
    booking_code: string;
    invoice_status: string;
    duration_mode: string;
  }>(
    await db.execute(sql`
      SELECT r.room_number, c.full_name, bk.booking_code, ri.status::text AS invoice_status,
             bk.duration_mode::text
      FROM bookings bk
      JOIN customers c ON c.id = bk.customer_id
      JOIN bed_reservations br ON br.booking_id = bk.id AND br.kind = 'primary' AND br.status = 'active'
      JOIN beds b ON b.id = br.bed_id
      JOIN rooms r ON r.id = b.room_id
      JOIN floors f ON f.id = r.floor_id
      LEFT JOIN rent_invoices ri ON ri.booking_id = bk.id AND ri.billing_month = '2026-10-01'::date
      WHERE f.pg_id = ${pg.id}::uuid
        AND bk.status = 'confirmed'
        AND bk.is_test = false
        AND c.is_test = false
        AND br.stay_range && daterange('2026-10-01'::date, '2026-11-01'::date, '[)')
        AND bk.duration_mode IN ('monthly', 'open_ended')
      ORDER BY r.room_number, c.full_name
    `),
  );

  const rentByRoom = new Map<string, typeof rentOverviewRows>();
  for (const r of rentOverviewRows) {
    const list = rentByRoom.get(r.room_number) ?? [];
    list.push(r);
    rentByRoom.set(r.room_number, list);
  }

  async function roomDeepFixed(roomNumber: string) {
    const room = allPhysicalRooms.find((r) => r.room_number === roomNumber);
    if (!room) return { error: 'room not found' };

    const bedRows = rows(
      await db.execute(sql`
        SELECT b.id::text AS bed_id, b.bed_code, b.status::text, b.archived_at IS NOT NULL AS archived,
               b.manual_occupied
        FROM beds b WHERE b.room_id = ${room.room_id}::uuid ORDER BY b.bed_code
      `),
    );

    const reservationsOct = rows(
      await db.execute(sql`
        SELECT c.full_name, c.id::text AS customer_id, c.residency_status::text,
               bk.id::text AS booking_id, bk.booking_code, bk.status::text AS booking_status,
               bk.duration_mode::text, bk.expected_checkout_date::text,
               br.id::text AS reservation_id, br.status::text AS reservation_status,
               br.kind::text, b.bed_code, b.status::text AS bed_status,
               lower(br.stay_range)::text AS stay_from, upper(br.stay_range)::text AS stay_to,
               (SELECT vr.vacating_date::text FROM vacating_requests vr
                WHERE vr.booking_id = bk.id AND vr.status IN ('approved','completed')
                ORDER BY CASE vr.status WHEN 'completed' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
                         vr.vacating_date DESC NULLS LAST LIMIT 1) AS vacating_date,
               (SELECT vr.status::text FROM vacating_requests vr
                WHERE vr.booking_id = bk.id ORDER BY vr.created_at DESC LIMIT 1) AS latest_vr_status
        FROM bed_reservations br
        JOIN bookings bk ON bk.id = br.booking_id
        JOIN customers c ON c.id = bk.customer_id
        JOIN beds b ON b.id = br.bed_id
        WHERE b.room_id = ${room.room_id}::uuid
          AND br.kind = 'primary'
          AND br.stay_range && daterange('2026-10-01'::date, '2026-11-01'::date, '[)')
        ORDER BY br.status, c.full_name
      `),
    );

    const occupantLoad = await loadRoomElectricityOccupantsForMonth({
      roomId: room.room_id,
      billingMonth: BILLING_MONTH,
      includeFixedStay: true,
      useProRataByActiveDays: true,
    });

    const checklistRoom = checklist.rooms.find((r) => r.roomNumber === roomNumber);

    let meterBaseline: unknown = null;
    try {
      meterBaseline = await resolveRoomPreviousMeterReading(room.room_id, {
        beforeBillingMonth: BILLING_MONTH,
        enforceContinuity: true,
      });
    } catch (e) {
      meterBaseline = { error: String(e) };
    }

    const bills = rows(
      await db.execute(sql`
        SELECT billing_month::text, created_at::text, previous_reading_units::text,
               current_reading_units::text, units_consumed::text, bill_status::text
        FROM electricity_bills
        WHERE room_id = ${room.room_id}::uuid AND is_pipeline_test = false
        ORDER BY billing_month DESC, created_at DESC
        LIMIT 5
      `),
    );

    const config = await getRoomConfigurationEffectiveOn(room.room_id, '2026-10-02');

    const billableChecks = reservationsOct.map((r) => ({
      name: r.full_name,
      billable: isMonthlyElectricityBillableOccupant({
        reservationStatus: String(r.reservation_status),
        bookingStatus: String(r.booking_status),
        residencyStatus: String(r.residency_status),
        customerEmail: null,
        historicalCoverage: true,
      }),
    }));

    return {
      roomId: room.room_id,
      roomNumber,
      hasAc: room.has_ac,
      roomType: room.room_type,
      checklistStatus: checklistRoom?.status ?? 'NOT_IN_AC_CHECKLIST',
      billableOccupantCount: checklistRoom?.billableOccupantCount,
      activeBedCount: checklistRoom?.activeBedCount,
      maintenanceBedCount: checklistRoom?.maintenanceBedCount,
      configEffectiveOct2: config,
      beds: bedRows,
      reservationsOct,
      billableChecks,
      occupantLoad: {
        occupantCount: occupantLoad.occupants.length,
        occupants: occupantLoad.occupants.map((o) => ({
          customerId: o.customerId,
          name: o.customerName,
          activeDays: o.weight,
          bookingIds: o.bookingIds,
        })),
        exclusionTraces: occupantLoad.exclusionTraces,
      },
      rentOverviewRows: rentByRoom.get(roomNumber) ?? [],
      recentBills: bills,
      meterBaseline,
    };
  }

  console.log('\n=== PART 1 — ROOM 201 DEEP ===\n');
  console.log(JSON.stringify(await roomDeepFixed('201'), null, 2));

  console.log('\n=== PART 2 — ROOM 203 DEEP ===\n');
  console.log(JSON.stringify(await roomDeepFixed('203'), null, 2));

  console.log('\n=== PART 3 — FULL SHANTINAGAR TABLE (AC rooms on checklist) ===\n');
  const table: unknown[] = [];
  for (const cr of checklist.rooms) {
    const phys = allPhysicalRooms.find((r) => r.room_number === cr.roomNumber);
    const occ = await loadRoomElectricityOccupantsForMonth({
      roomId: cr.roomId,
      billingMonth: BILLING_MONTH,
      includeFixedStay: true,
      useProRataByActiveDays: true,
    });
    const rentRows = rentByRoom.get(cr.roomNumber) ?? [];
    const residents = rentRows.map((r) => r.full_name).join('; ') || '—';
    const monthlyRent = rentRows.length > 0 ? 'yes' : 'no';
    let backendReason = cr.status;
    if (cr.status === 'not_eligible') {
      backendReason = `not_eligible: loadRoomElectricityOccupantsForMonth returned ${occ.occupants.length} occupants; traces=${JSON.stringify(occ.exclusionTraces)}`;
    } else if (cr.status === 'maintenance_excluded') {
      backendReason = 'maintenance_excluded: all beds maintenance (physicalActiveBedCount=0)';
    } else if (cr.status === 'reading_required') {
      backendReason = `reading_required: ${occ.occupants.length} billable occupant(s), baseline ok`;
    }

    table.push({
      room: cr.roomNumber,
      physicalStatus: phys ? `AC=${phys.has_ac}` : '?',
      beds: `${cr.activeBedCount} active / ${cr.maintenanceBedCount} maint (config effective=${cr.activeBedCount})`,
      currentResidentsRentSsot: residents,
      monthlyRentEligible: monthlyRent,
      electricityEligible: cr.status === 'reading_required' || cr.status === 'already_billed',
      uiStatus: cr.status,
      backendReason,
      billableOccupantCount: cr.billableOccupantCount,
    });
  }

  const acRoomNumbers = new Set(checklist.rooms.map((r) => r.roomNumber));
  for (const pr of allPhysicalRooms.filter((r) => r.has_ac && !acRoomNumbers.has(r.room_number))) {
    table.push({
      room: pr.room_number,
      note: 'AC room missing from checklist (unexpected)',
    });
  }
  for (const pr of allPhysicalRooms.filter((r) => !r.has_ac)) {
    table.push({
      room: pr.room_number,
      physicalStatus: 'non-AC — excluded from electricity checklist by has_ac filter',
    });
  }

  console.log(JSON.stringify(table, null, 2));

  console.log('\n=== PART 4 — RENT vs ELECTRICITY (occupied rooms with mismatch) ===\n');
  const mismatches: unknown[] = [];
  for (const cr of checklist.rooms) {
    const rentRows = rentByRoom.get(cr.roomNumber) ?? [];
    const hasRentCandidate = rentRows.length > 0;
    const elecOk = ['reading_required', 'already_billed'].includes(cr.status);
    if (rentRows.length > 0 && !elecOk && cr.status === 'not_eligible') {
      mismatches.push({
        room: cr.roomNumber,
        rentResidents: rentRows,
        electricityStatus: cr.status,
        occupantTraces: (
          await loadRoomElectricityOccupantsForMonth({
            roomId: cr.roomId,
            billingMonth: BILLING_MONTH,
            includeFixedStay: true,
            useProRataByActiveDays: true,
          })
        ).exclusionTraces,
      });
    }
  }
  console.log(JSON.stringify(mismatches, null, 2));

  console.log('\n=== PART 5 — ROOM 102 CONFIG SCHEDULES ===\n');
  const r102 = allPhysicalRooms.find((r) => r.room_number === '102');
  if (r102) {
    const schedules = rows(
      await db.execute(sql`
        SELECT id::text, status::text, effective_from::text, target_bed_count, room_type_name
        FROM room_configuration_schedules
        WHERE room_id = ${r102.room_id}::uuid
        ORDER BY effective_from
      `),
    );
    console.log(JSON.stringify({ schedules, room201Config: await getRoomConfigurationEffectiveOn(
      allPhysicalRooms.find((r) => r.room_number === '201')!.room_id,
      '2026-10-01',
    ), room203Config: await getRoomConfigurationEffectiveOn(
      allPhysicalRooms.find((r) => r.room_number === '203')!.room_id,
      '2026-10-01',
    ) }, null, 2));
  }

  console.log('\n=== PART 6 — LAST ELECTRICITY BILL PER AC ROOM ===\n');
  for (const cr of checklist.rooms.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber))) {
    const [last] = rows(
      await db.execute(sql`
        SELECT billing_month::text, previous_reading_units::text, current_reading_units::text,
               units_consumed::text, created_at::text
        FROM electricity_bills
        WHERE room_id = ${cr.roomId}::uuid AND is_pipeline_test = false
        ORDER BY billing_month DESC LIMIT 1
      `),
    );
    console.log(
      `Room ${cr.roomNumber} | status=${cr.status} | lastBill=${last ? JSON.stringify(last) : 'none'}`,
    );
  }

  console.log('\n=== CODE PATHS ===');
  console.log(
    JSON.stringify(
      {
        page: 'app/(admin)/admin/billing/electricity/generate/page.tsx → loadPgElectricityBillingChecklist',
        notEligiblePredicate:
          'pgElectricityBillingChecklist.ts: billableOccupantCount === 0 after loadRoomElectricityOccupantsForMonth',
        occupantLoader: 'roomElectricityOccupants.ts → loadRoomElectricityOccupantsForMonth',
        billablePredicate: 'electricityOccupancyEligibility.ts → isMonthlyElectricityBillableOccupant (historicalCoverage: true)',
        uiCopyMisleading:
          'PgElectricityBillingChecklist.tsx: not_eligible shows "No monthly residents on available beds" — NOT tied to bed.status=available',
        acRoomFilter: 'pgElectricityBillingChecklist.ts: room_types.has_ac = true',
      },
      null,
      2,
    ),
  );

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  const { closeDb } = await import('../src/db/client');
  await closeDb().catch(() => undefined);
  process.exit(1);
});
