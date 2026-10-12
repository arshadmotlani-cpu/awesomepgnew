/**
 * READ-ONLY Room 102 deposit/checkout settlement per occupant.
 * USE_PRODUCTION_DB=1 npx tsx scripts/forensic-room102-settlement-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('forensic-room102-settlement');

async function main() {
  const { sql } = await import('drizzle-orm');
  const { closeDb, db } = await import('@/src/db/client');
  const { getDepositSummaryForBooking } = await import('@/src/services/deposits');
  const { loadRoomElectricityOccupantsForMonth } = await import(
    '@/src/lib/billing/roomElectricityOccupants'
  );
  const { formatDate, addDays, parseDate } = await import('@/src/lib/dates');

  const [room] = (
    await db.execute(sql`
      SELECT r.id::text AS id FROM rooms r
      JOIN floors f ON f.id = r.floor_id JOIN pgs p ON p.id = f.pg_id
      WHERE r.room_number = '102' AND p.name ILIKE '%shantinagar%' LIMIT 1
    `)
  ) as { id: string }[];

  const occupantLoad = await loadRoomElectricityOccupantsForMonth({
    roomId: room.id,
    billingMonth: '2026-10-01',
    includeFixedStay: true,
    useProRataByActiveDays: true,
    meterPeriod: {
      startDate: '2026-09-05',
      endDateExclusive: formatDate(addDays(parseDate('2026-10-04'), 1)),
      previousFinalizedReadingUnits: 424,
    },
  });

  const out = [];
  for (const o of occupantLoad.occupants) {
    const r = {
      booking_id: o.bookingId,
      full_name: o.customerName,
      customer_id: o.customerId,
    };
    const deposit = await getDepositSummaryForBooking(r.booking_id);
    const checkout = await db.execute(sql`
      SELECT cs.id::text, cs.status, cs.electricity_share_paise, cs.electricity_from_deposit_paise,
             cs.electricity_deduct_from_deposit, vr.vacating_date::text
      FROM checkout_settlements cs
      JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
      WHERE cs.booking_id = ${r.booking_id}::uuid
    `);
    const depElec = await db.execute(sql`
      SELECT id::text, amount_paise, reason, created_at::text
      FROM deposit_ledger WHERE booking_id = ${r.booking_id}::uuid AND entry_kind = 'deducted'
      ORDER BY created_at
    `);
    const contrib = await db.execute(sql`
      SELECT id::text, amount_paise, contribution_date::text, kind, checkout_settlement_id::text
      FROM electricity_room_contributions WHERE booking_id = ${r.booking_id}::uuid
    `);
    const [resRow] = await db.execute(sql`
      SELECT br.status AS res_status FROM bed_reservations br
      WHERE br.booking_id = ${r.booking_id}::uuid AND br.kind = 'primary' LIMIT 1
    `);
    out.push({
      name: r.full_name,
      customerId: r.customer_id,
      bookingId: r.booking_id,
      resStatus: (resRow as { res_status?: string })?.res_status ?? null,
      deposit: deposit
        ? {
            refundableBalancePaise: deposit.refundableBalancePaise,
            collectedPaise: deposit.collectedPaise,
            deductedPaise: deposit.deductedPaise,
          }
        : null,
      checkout,
      depositDeductions: depElec,
      contributions: contrib,
    });
  }

  console.log(JSON.stringify({ mutations: 0, roomId: room.id, residents: out }, null, 2));
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
