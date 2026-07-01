#!/usr/bin/env npx tsx
/**
 * Trace why Harshad/Harish appears in Room 203 June electricity allocation.
 */
import { readFileSync } from 'node:fs';
import { and, eq, ilike, sql } from 'drizzle-orm';

function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.off', '.env.bak', '.env.local', '.env.production.pull']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value) {
        process.env.DATABASE_URL = value;
        return;
      }
    } catch {
      // next
    }
  }
}

loadDatabaseUrl();

const BILLING_MONTH = '2026-06-01';

async function main() {
  const { db, closeDb } = await import('@/src/db/client');
  const {
    bedReservations,
    beds,
    bookings,
    checkoutSettlements,
    customers,
    electricityBills,
    electricityInvoices,
    floors,
    pgs,
    rooms,
    vacatingRequests,
  } = await import('@/src/db/schema');
  const { loadRoomElectricityOccupantsForMonth, listCheckoutSettledCustomerIdsForRoomMonth } =
    await import('@/src/lib/billing/roomElectricityOccupants');
  const { listBedOccupantsForBillingMonth, resolveBedOccupantForBillingMonth } = await import(
    '@/src/lib/billing/electricityOccupantEligibility',
  );
  const { auditElectricityInvoiceOwnership } = await import(
    '@/src/services/electricityInvoiceOwnership',
  );
  const { paiseToInr } = await import('@/src/lib/format');

  const [room] = await db
    .select({ id: rooms.id, roomNumber: rooms.roomNumber, pgName: pgs.name })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(and(eq(rooms.roomNumber, '203'), ilike(pgs.name, '%shanti%')))
    .limit(1);

  if (!room) {
    console.error('Room 203 not found');
    process.exit(1);
  }

  console.log(`\n=== Room 203 (${room.pgName}) ===\n`);

  const harshadCustomers = await db
    .select({
      id: customers.id,
      fullName: customers.fullName,
      email: customers.email,
      phone: customers.phone,
    })
    .from(customers)
    .where(
      sql`(${customers.fullName} ILIKE '%harshad%' OR ${customers.fullName} ILIKE '%harish%')`,
    );

  console.log('Matching customers:', harshadCustomers);

  for (const cust of harshadCustomers) {
    console.log(`\n--- ${cust.fullName} (${cust.id}) ---`);

    const reservations = await db.execute<{
      bed_code: string;
      room_number: string;
      status: string;
      kind: string;
      stay_from: string;
      stay_to: string | null;
      booking_code: string;
      booking_status: string;
      duration_mode: string;
    }>(sql`
      SELECT b.bed_code, r.room_number, br.status, br.kind,
             lower(br.stay_range)::text AS stay_from,
             upper(br.stay_range)::text AS stay_to,
             bk.booking_code, bk.status AS booking_status, bk.duration_mode
      FROM bed_reservations br
      JOIN bookings bk ON bk.id = br.booking_id
      JOIN beds b ON b.id = br.bed_id
      JOIN rooms r ON r.id = b.room_id
      WHERE bk.customer_id = ${cust.id}::uuid
      ORDER BY lower(br.stay_range)
    `);
    console.log('All reservations:', reservations);

    const activeToday = await db.execute(sql`
      SELECT b.bed_code, r.room_number, br.status, br.kind,
             lower(br.stay_range)::text AS stay_from,
             upper(br.stay_range)::text AS stay_to,
             bk.booking_code
      FROM bed_reservations br
      JOIN bookings bk ON bk.id = br.booking_id
      JOIN beds b ON b.id = br.bed_id
      JOIN rooms r ON r.id = b.room_id
      WHERE bk.customer_id = ${cust.id}::uuid
        AND br.status = 'active'
        AND br.kind = 'primary'
        AND CURRENT_DATE <@ br.stay_range
    `);
    console.log('Active primary TODAY:', activeToday);

    const juneOverlap = await db.execute(sql`
      SELECT b.bed_code, r.room_number, br.status, br.kind,
             lower(br.stay_range)::text AS stay_from,
             upper(br.stay_range)::text AS stay_to,
             bk.booking_code
      FROM bed_reservations br
      JOIN bookings bk ON bk.id = br.booking_id
      JOIN beds b ON b.id = br.bed_id
      JOIN rooms r ON r.id = b.room_id
      WHERE bk.customer_id = ${cust.id}::uuid
        AND br.kind = 'primary'
        AND br.stay_range && daterange('2026-06-01'::date, '2026-07-01'::date, '[)')
    `);
    console.log('June 2026 overlap (any status):', juneOverlap);

    const settlements = await db
      .select({
        id: checkoutSettlements.id,
        status: checkoutSettlements.status,
        electricitySharePaise: checkoutSettlements.electricitySharePaise,
        manualChargePaise: checkoutSettlements.manualChargePaise,
        electricityDeductFromDeposit: checkoutSettlements.electricityDeductFromDeposit,
        electricityCalculationMethod: checkoutSettlements.electricityCalculationMethod,
        vacatingDate: vacatingRequests.vacatingDate,
      })
      .from(checkoutSettlements)
      .innerJoin(vacatingRequests, eq(vacatingRequests.id, checkoutSettlements.vacatingRequestId))
      .where(eq(checkoutSettlements.customerId, cust.id));
    console.log('Checkout settlements:', settlements);

    const invoices = await db
      .select({
        invoiceNumber: electricityInvoices.invoiceNumber,
        amountPaise: electricityInvoices.amountPaise,
        paidPaise: electricityInvoices.paidPaise,
        status: electricityInvoices.status,
        bedId: electricityInvoices.bedId,
        billingMonth: electricityInvoices.billingMonth,
        createdAt: electricityInvoices.createdAt,
      })
      .from(electricityInvoices)
      .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
      .where(
        and(
          eq(electricityInvoices.customerId, cust.id),
          eq(electricityBills.roomId, room.id),
          eq(electricityInvoices.billingMonth, BILLING_MONTH),
        ),
      );
    console.log('June electricity invoices (room 203):', invoices);
    for (const inv of invoices) {
      console.log(`  → ${inv.invoiceNumber}: ${paiseToInr(inv.amountPaise)} status=${inv.status}`);
    }
  }

  const settled = await listCheckoutSettledCustomerIdsForRoomMonth(room.id, BILLING_MONTH);
  console.log('\nCheckout-settled customer IDs for June:', [...settled]);

  const occupantLoad = await loadRoomElectricityOccupantsForMonth({
    roomId: room.id,
    billingMonth: BILLING_MONTH,
    includeFixedStay: true,
    useProRataByActiveDays: true,
  });
  console.log('\nAllocation engine occupants:', occupantLoad.occupants);
  console.log('Excluded:', occupantLoad.excludedCustomerIds);

  const roomBeds = await db
    .select({ id: beds.id, bedCode: beds.bedCode })
    .from(beds)
    .where(eq(beds.roomId, room.id));

  console.log('\nPer-bed June occupant resolution:');
  for (const bed of roomBeds) {
    const occupants = await listBedOccupantsForBillingMonth(bed.id, BILLING_MONTH, {
      includeFixedStay: true,
    });
    const canonical = await resolveBedOccupantForBillingMonth(bed.id, BILLING_MONTH, {
      includeFixedStay: true,
    });
    console.log(`  ${bed.bedCode}:`, occupants.map((o) => o.customerName), 'canonical:', canonical?.customerName ?? 'null');
  }

  const ownership = await auditElectricityInvoiceOwnership(BILLING_MONTH, { roomNumber: '203' });
  console.log('\nOwnership audit room 203:');
  for (const row of ownership.room203) {
    console.log(
      `  ${row.invoiceNumber} · ${row.residentName} · ${row.bedCode} · ${paiseToInr(row.amountPaise)} · flags: ${row.flags.join(', ') || 'ok'}`,
    );
  }

  const allJuneInvoices = await db
    .select({
      invoiceNumber: electricityInvoices.invoiceNumber,
      customerName: customers.fullName,
      amountPaise: electricityInvoices.amountPaise,
      status: electricityInvoices.status,
      bedCode: beds.bedCode,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .innerJoin(beds, eq(beds.id, electricityInvoices.bedId))
    .where(
      and(
        eq(electricityBills.roomId, room.id),
        eq(electricityBills.billingMonth, BILLING_MONTH),
        sql`${electricityInvoices.status} <> 'cancelled'`,
      ),
    );
  console.log('\nAll active June invoices room 203:');
  for (const inv of allJuneInvoices) {
    console.log(`  ${inv.customerName} · ${inv.bedCode} · ${paiseToInr(inv.amountPaise)} · ${inv.invoiceNumber}`);
  }

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
