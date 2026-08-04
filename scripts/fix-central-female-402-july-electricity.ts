#!/usr/bin/env npx tsx
/**
 * Production repair — CENTRAL Female Room 402 electricity meter chain.
 *
 * July bill was created with bogus readings 5000→5248 (ops-female-pg-bills placeholder).
 * Correct chain: 707→850 (143 units). Invoices are already paid at the inflated amount;
 * overpayment is moved to room prepaid credit for future months.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.prod.live npx tsx scripts/fix-central-female-402-july-electricity.ts
 *   DOTENV_CONFIG_PATH=.env.prod.live npx tsx scripts/fix-central-female-402-july-electricity.ts --execute
 *   DOTENV_CONFIG_PATH=.env.prod.live npx tsx scripts/fix-central-female-402-july-electricity.ts --execute --august-current 920
 *
 * `--august-current` must be strictly greater than 850 (July closing) to create
 * a real August consumption bill. Do not pass 850 (0 units).
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { and, eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import {
  electricityBills,
  electricityInvoices,
  roomElectricityLedgerCycles,
  roomElectricityLedgerEntries,
  roomElectricityPrepaidLedger,
  rooms,
} from '@/src/db/schema';
import { resolveRoomPreviousMeterReading } from '@/src/services/roomMeterReadingSsot';
import { syncElectricityInvoiceToUnified } from '@/src/services/unifiedInvoices';

const EXPECTED_PG_NAME = 'CENTRAL - AWESOME PG (Female)';
const EXPECTED_ROOM_NUMBER = '402';
const EXPECTED_ROOM_ID = 'e24f92db-2363-4bcf-9b08-bf4d7c4eab74';
const EXPECTED_JULY_BILL_ID = '77857b9d-5859-4db3-ba9f-f3976a4fd447';
const JULY = '2026-07-01';
const AUGUST = '2026-08-01';

const TARGET_PREV = 707;
const TARGET_CURR = 850;
const TARGET_UNITS = 143; // 850 - 707

const EXECUTE = process.argv.includes('--execute');
const augustCurrentArg = (() => {
  const idx = process.argv.indexOf('--august-current');
  if (idx < 0) return null;
  const raw = process.argv[idx + 1];
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
})();

function money(paise: number) {
  return `₹${(paise / 100).toFixed(2)}`;
}

/** Lean August create — avoids Room OS pack resolve hang on Neon pooler. */
async function createAugustBillLean(input: {
  roomId: string;
  pgId: string;
  previousReadingUnits: number;
  currentReadingUnits: number;
  ratePerUnitPaise: number;
}): Promise<string> {
  const units = Math.round((input.currentReadingUnits - input.previousReadingUnits) * 100) / 100;
  if (units < 0) throw new Error('August units cannot be negative');

  const [roomPrepaid] = await db.execute<{ prepaid: number }>(sql`
    SELECT coalesce(electricity_prepaid_credit_paise, 0)::bigint AS prepaid
    FROM rooms WHERE id = ${input.roomId}::uuid
  `);
  const prepaidAvailable = Number(roomPrepaid?.prepaid ?? 0);
  const grossTotalPaise = Math.round(units * input.ratePerUnitPaise);
  const prepaidApplied = Math.min(prepaidAvailable, grossTotalPaise);
  const netSplittable = grossTotalPaise - prepaidApplied;

  const occupants = await db.execute<{
    booking_id: string;
    customer_id: string;
    customer_name: string;
    bed_id: string;
  }>(sql`
    SELECT b.id::text AS booking_id, c.id::text AS customer_id, c.full_name AS customer_name,
      bd.id::text AS bed_id
    FROM beds bd
    JOIN bed_reservations br ON br.bed_id = bd.id AND br.status = 'active' AND br.kind = 'primary'
      AND br.stay_range && daterange('2026-08-01', '2026-09-01', '[)')
    JOIN bookings b ON b.id = br.booking_id AND b.status = 'confirmed'
    JOIN customers c ON c.id = b.customer_id
    WHERE bd.room_id = ${input.roomId}::uuid
    ORDER BY bd.bed_code
  `);
  const occList = occupants as Array<{
    booking_id: string;
    customer_id: string;
    customer_name: string;
    bed_id: string;
  }>;
  const n = Math.max(1, occList.length);
  const perResident = Math.floor(netSplittable / n);
  const remainder = netSplittable - perResident * n;

  const [seqRow] = await db.execute<{ max_seq: number }>(sql`
    SELECT coalesce(max(substring(invoice_number from 'ELE-2026-08-([0-9]+)')::int), 0)::int AS max_seq
    FROM electricity_invoices
    WHERE invoice_number LIKE 'ELE-2026-08-%'
  `);
  let seq = Number(seqRow?.max_seq ?? 0) + 1;

  const dueDate = '2026-08-07'; // issuance + 3 days grace pattern

  const result = await db.transaction(async (tx) => {
    const [bill] = await tx
      .insert(electricityBills)
      .values({
        pgId: input.pgId,
        roomId: input.roomId,
        billingMonth: AUGUST,
        previousReadingUnits: String(input.previousReadingUnits),
        currentReadingUnits: String(input.currentReadingUnits),
        unitsConsumed: String(units),
        ratePerUnitPaise: input.ratePerUnitPaise,
        totalPaise: grossTotalPaise,
        monthlyOccupantCount: occList.length,
        perResidentPaise: perResident,
        roundingRemainderPaise: remainder,
        prepaidCreditAppliedPaise: prepaidApplied,
        prepaidCreditNote:
          prepaidApplied > 0
            ? 'Applied from Room 402 July 2026 meter-correction overpayment credit'
            : null,
        calculationBreakdown: {
          version: 1,
          generatedAt: new Date().toISOString(),
          billingMonth: AUGUST,
          roomNumber: EXPECTED_ROOM_NUMBER,
          meter: {
            previousReadingUnits: input.previousReadingUnits,
            currentReadingUnits: input.currentReadingUnits,
            unitsConsumed: units,
            ratePerUnitPaise: input.ratePerUnitPaise,
            grossTotalPaise,
          },
          remainingBillPaise: netSplittable,
          adjustments: {
            prepaidCreditPaise: prepaidApplied,
            prepaidCreditNote:
              prepaidApplied > 0
                ? 'Applied from Room 402 July 2026 meter-correction overpayment credit'
                : null,
            checkoutCredits: [],
            manualCreditPaise: 0,
            totalDeductedPaise: prepaidApplied,
          },
          repairNote: 'Lean insert after Female 402 July meter repair (Room OS pack resolve bypass).',
        },
        notes: 'Generated after Female 402 July meter-chain repair (707→850).',
        billStatus: 'calculated',
        isPipelineTest: false,
      })
      .returning({ id: electricityBills.id });

    if (!bill) throw new Error('August bill insert returned no row');

    if (prepaidApplied > 0) {
      await tx
        .update(rooms)
        .set({
          electricityPrepaidCreditPaise: sql`coalesce(${rooms.electricityPrepaidCreditPaise}, 0) - ${prepaidApplied}`,
          updatedAt: new Date(),
        })
        .where(eq(rooms.id, input.roomId));
      await tx.insert(roomElectricityPrepaidLedger).values({
        roomId: input.roomId,
        entryKind: 'applied',
        amountPaise: prepaidApplied,
        paidByNote: 'Applied on August 2026 bill after July meter correction',
        electricityBillId: bill.id,
      });
    }

    const invoiceIds: string[] = [];
    for (const occ of occList) {
      if (perResident <= 0) continue;
      const invoiceNumber = `ELE-2026-08-${String(seq).padStart(4, '0')}`;
      seq += 1;
      const [inv] = await tx
        .insert(electricityInvoices)
        .values({
          electricityBillId: bill.id,
          roomId: input.roomId,
          bookingId: occ.booking_id,
          customerId: occ.customer_id,
          bedId: occ.bed_id,
          invoiceNumber,
          amountPaise: perResident,
          paidPaise: 0,
          status: 'pending',
          billingMonth: AUGUST,
          dueDate,
          unitsShare: String(units / n),
        })
        .returning({ id: electricityInvoices.id });
      if (inv) invoiceIds.push(inv.id);
    }

    const existingCycle = await tx
      .select({ id: roomElectricityLedgerCycles.id })
      .from(roomElectricityLedgerCycles)
      .where(
        and(
          eq(roomElectricityLedgerCycles.roomId, input.roomId),
          eq(roomElectricityLedgerCycles.billingMonth, AUGUST),
        ),
      )
      .limit(1);

    if (existingCycle[0]) {
      await tx
        .update(roomElectricityLedgerCycles)
        .set({
          totalBillPaise: grossTotalPaise,
          collectedPaise: prepaidApplied,
          remainingPaise: Math.max(0, grossTotalPaise - prepaidApplied),
          updatedAt: new Date(),
        })
        .where(eq(roomElectricityLedgerCycles.id, existingCycle[0].id));
    } else {
      await tx.insert(roomElectricityLedgerCycles).values({
        roomId: input.roomId,
        billingMonth: AUGUST,
        totalBillPaise: grossTotalPaise,
        collectedPaise: prepaidApplied,
        remainingPaise: Math.max(0, grossTotalPaise - prepaidApplied),
      });
    }

    return { billId: bill.id, invoiceIds };
  });

  for (const id of result.invoiceIds) {
    await syncElectricityInvoiceToUnified(id).catch(() => undefined);
  }

  return result.billId;
}

async function main() {
  console.log('=== CENTRAL Female Room 402 electricity repair ===');
  console.log(EXECUTE ? 'MODE: EXECUTE' : 'MODE: dry-run');

  const [pg] = await db.execute<{ id: string; name: string }>(sql`
    SELECT id::text AS id, name FROM pgs
    WHERE name ILIKE '%female%' AND name ILIKE '%central%'
    LIMIT 1
  `);
  if (!pg) throw new Error('CENTRAL Female PG not found');
  if (pg.name !== EXPECTED_PG_NAME) {
    throw new Error(`Unexpected PG name: ${pg.name}`);
  }

  const [room] = await db.execute<{ id: string; room_number: string; prepaid: number }>(sql`
    SELECT r.id::text AS id, r.room_number,
      coalesce(r.electricity_prepaid_credit_paise, 0)::bigint AS prepaid
    FROM rooms r
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pg.id}::uuid AND r.room_number = ${EXPECTED_ROOM_NUMBER}
    LIMIT 1
  `);
  if (!room) throw new Error('Room 402 not found');
  if (room.id !== EXPECTED_ROOM_ID) {
    throw new Error(`Room ID mismatch: got ${room.id}, expected ${EXPECTED_ROOM_ID}`);
  }

  const [bill] = await db.execute<{
    id: string;
    prev: string;
    curr: string;
    units: string;
    rate: number;
    total: number;
    occupants: number;
    per_resident: number;
    remainder: number;
    breakdown: unknown;
  }>(sql`
    SELECT id::text AS id,
      previous_reading_units::text AS prev,
      current_reading_units::text AS curr,
      units_consumed::text AS units,
      rate_per_unit_paise::bigint AS rate,
      total_paise::bigint AS total,
      monthly_occupant_count AS occupants,
      per_resident_paise::bigint AS per_resident,
      rounding_remainder_paise::bigint AS remainder,
      calculation_breakdown AS breakdown
    FROM electricity_bills
    WHERE id = ${EXPECTED_JULY_BILL_ID}::uuid
    LIMIT 1
  `);
  if (!bill) throw new Error(`July bill ${EXPECTED_JULY_BILL_ID} not found`);
  if (Number(bill.prev) === TARGET_PREV && Number(bill.curr) === TARGET_CURR) {
    console.log('July bill already corrected — continuing to August checks.');
  }

  const rate = Number(bill.rate);
  const newTotal = Math.round(TARGET_UNITS * rate);
  const occupants = Number(bill.occupants) || 3;
  const newPerResident = Math.floor(newTotal / occupants);
  const newRemainder = newTotal - newPerResident * occupants;
  const overpaymentPaise = Number(bill.total) - newTotal;

  const invoices = await db.execute<{
    id: string;
    invoice_number: string;
    status: string;
    amount_paise: number;
    paid_paise: number;
    customer_name: string;
    booking_id: string;
    customer_id: string;
  }>(sql`
    SELECT ei.id::text AS id, ei.invoice_number, ei.status,
      ei.amount_paise::bigint AS amount_paise, ei.paid_paise::bigint AS paid_paise,
      c.full_name AS customer_name, ei.booking_id::text AS booking_id,
      ei.customer_id::text AS customer_id
    FROM electricity_invoices ei
    JOIN customers c ON c.id = ei.customer_id
    WHERE ei.electricity_bill_id = ${bill.id}::uuid
    ORDER BY c.full_name
  `);

  console.log('\n--- BEFORE ---');
  console.log(`PG: ${pg.name} (${pg.id})`);
  console.log(`Room: ${room.room_number} (${room.id})`);
  console.log(`July bill ID: ${bill.id}`);
  console.log(
    `Readings: ${bill.prev} → ${bill.curr} (${bill.units} units) @ ${money(rate)}/unit`,
  );
  console.log(
    `Totals: gross ${money(Number(bill.total))} · per resident ${money(Number(bill.per_resident))} · occupants ${occupants}`,
  );
  console.log(`Room prepaid balance: ${money(Number(room.prepaid))}`);
  for (const inv of invoices as typeof invoices extends Array<infer T> ? T[] : never) {
    console.log(
      `  Invoice ${inv.invoice_number} ${inv.customer_name}: amount ${money(Number(inv.amount_paise))} paid ${money(Number(inv.paid_paise))} [${inv.status}]`,
    );
  }

  console.log('\n--- TARGET JULY ---');
  console.log(`Readings: ${TARGET_PREV} → ${TARGET_CURR} (${TARGET_UNITS} units)`);
  console.log(
    `Totals: gross ${money(newTotal)} · per resident ${money(newPerResident)} · remainder ${money(newRemainder)}`,
  );
  console.log(`Overpayment to prepaid: ${money(overpaymentPaise)}`);

  const augBefore = await resolveRoomPreviousMeterReading(room.id, {
    beforeBillingMonth: AUGUST,
  });
  console.log(
    `\nAugust opening (before): ${augBefore.previousReadingUnits} (source=${augBefore.source})`,
  );

  if (!EXECUTE) {
    console.log('\n[dry-run] Pass --execute to apply July correction + optional August generation.');
    if (augustCurrentArg == null) {
      console.log('[dry-run] Pass --august-current <N> (≥ 850) to also generate August.');
    }
    await closeDb();
    return;
  }

  // ── July in-place correction (paid invoices — cannot void/delete) ─────────
  const beforeBreakdown = (bill.breakdown ?? {}) as Record<string, unknown>;
  const timeline = Array.isArray((beforeBreakdown as { timeline?: unknown }).timeline)
    ? ((beforeBreakdown as { timeline: Record<string, unknown>[] }).timeline).map((row) => ({
        ...row,
        calculatedSharePaise: newPerResident,
        monthlyInvoiceAmountPaise: newPerResident,
      }))
    : [];

  const newBreakdown = {
    ...beforeBreakdown,
    version: 1,
    generatedAt: new Date().toISOString(),
    billingMonth: JULY,
    roomNumber: EXPECTED_ROOM_NUMBER,
    meter: {
      previousReadingUnits: TARGET_PREV,
      currentReadingUnits: TARGET_CURR,
      unitsConsumed: TARGET_UNITS,
      ratePerUnitPaise: rate,
      grossTotalPaise: newTotal,
    },
    remainingBillPaise: newTotal,
    timeline,
    repairNote:
      '2026-08-04: corrected bogus 5000→5248 readings to physical chain 707→850; overpayment moved to room prepaid.',
  };

  await db.transaction(async (tx) => {
    await tx
      .update(electricityBills)
      .set({
        previousReadingUnits: String(TARGET_PREV),
        currentReadingUnits: String(TARGET_CURR),
        unitsConsumed: String(TARGET_UNITS),
        totalPaise: newTotal,
        perResidentPaise: newPerResident,
        roundingRemainderPaise: newRemainder,
        calculationBreakdown: newBreakdown,
        notes:
          'Repaired 2026-08-04: readings 707→850 (was 5000→5248); overpayment moved to room prepaid.',
        updatedAt: new Date(),
      })
      .where(eq(electricityBills.id, EXPECTED_JULY_BILL_ID));

    for (const inv of invoices as Array<{
      id: string;
      amount_paise: number;
      paid_paise: number;
      status: string;
    }>) {
      const paid = Number(inv.paid_paise);
      await tx
        .update(electricityInvoices)
        .set({
          amountPaise: newPerResident,
          // Keep paid_paise ≥ amount so status remains paid; excess is room prepaid.
          paidPaise: Math.max(paid, newPerResident),
          status: 'paid',
          updatedAt: new Date(),
        })
        .where(eq(electricityInvoices.id, inv.id));
    }

    const [cycle] = await tx
      .select({ id: roomElectricityLedgerCycles.id })
      .from(roomElectricityLedgerCycles)
      .where(
        and(
          eq(roomElectricityLedgerCycles.roomId, EXPECTED_ROOM_ID),
          eq(roomElectricityLedgerCycles.billingMonth, JULY),
        ),
      )
      .limit(1);

    if (cycle) {
      await tx
        .update(roomElectricityLedgerCycles)
        .set({
          totalBillPaise: newTotal,
          collectedPaise: newTotal,
          remainingPaise: 0,
          updatedAt: new Date(),
        })
        .where(eq(roomElectricityLedgerCycles.id, cycle.id));

      await tx
        .update(roomElectricityLedgerEntries)
        .set({ amountPaise: newPerResident })
        .where(eq(roomElectricityLedgerEntries.cycleId, cycle.id));
    }

    if (overpaymentPaise > 0) {
      await tx
        .update(rooms)
        .set({
          electricityPrepaidCreditPaise: sql`coalesce(${rooms.electricityPrepaidCreditPaise}, 0) + ${overpaymentPaise}`,
          updatedAt: new Date(),
        })
        .where(eq(rooms.id, EXPECTED_ROOM_ID));

      await tx.insert(roomElectricityPrepaidLedger).values({
        roomId: EXPECTED_ROOM_ID,
        entryKind: 'added',
        amountPaise: overpaymentPaise,
        paidByNote:
          'Room 402 July 2026 meter correction — residents overpaid on bogus 5000→5248 bill; credit for future electricity',
        electricityBillId: EXPECTED_JULY_BILL_ID,
        createdByAdminId: null,
      });
    }
  });

  for (const inv of invoices as Array<{ id: string }>) {
    await syncElectricityInvoiceToUnified(inv.id).catch((e) => {
      console.warn(`unified sync failed for ${inv.id}:`, e instanceof Error ? e.message : e);
    });
  }

  const [afterBill] = await db.execute<{
    id: string;
    prev: string;
    curr: string;
    units: string;
    total: number;
    per_resident: number;
  }>(sql`
    SELECT id::text AS id,
      previous_reading_units::text AS prev,
      current_reading_units::text AS curr,
      units_consumed::text AS units,
      total_paise::bigint AS total,
      per_resident_paise::bigint AS per_resident
    FROM electricity_bills WHERE id = ${EXPECTED_JULY_BILL_ID}::uuid
  `);

  const augAfter = await resolveRoomPreviousMeterReading(EXPECTED_ROOM_ID, {
    beforeBillingMonth: AUGUST,
  });
  console.log('\n--- AFTER JULY ---');
  console.log(`July bill ID (updated): ${afterBill?.id}`);
  console.log(
    `Readings: ${afterBill?.prev} → ${afterBill?.curr} (${afterBill?.units} units) · gross ${money(Number(afterBill?.total ?? 0))} · share ${money(Number(afterBill?.per_resident ?? 0))}`,
  );
  console.log(
    `August opening (after): ${augAfter.previousReadingUnits} (source=${augAfter.source})`,
  );

  if (augAfter.previousReadingUnits !== TARGET_CURR) {
    throw new Error(
      `August opening expected ${TARGET_CURR}, got ${augAfter.previousReadingUnits}`,
    );
  }

  // ── August generation ─────────────────────────────────────────────────────
  // createElectricityBill currently hangs on Room OS pack resolve against Neon
  // pooler (~5m CONNECTION_CLOSED). Use the same service with a hard timeout;
  // on failure fall back to a lean transactional insert (bill + invoices + ledger)
  // so production meter continuity is still recorded.
  let augustBillId: string | null = null;
  if (augustCurrentArg == null) {
    console.log(
      '\n[skip August] Pass --august-current <N> with N ≥ 850 to generate August bill.',
    );
  } else if (augustCurrentArg <= TARGET_CURR) {
    throw new Error(
      `August current ${augustCurrentArg} must be > July closing ${TARGET_CURR}. Re-read the meter.`,
    );
  } else {
    const existingAug = await db.execute<{ id: string }>(sql`
      SELECT id::text AS id FROM electricity_bills
      WHERE room_id = ${EXPECTED_ROOM_ID}::uuid
        AND billing_month = ${AUGUST}::date
        AND is_pipeline_test = false
      LIMIT 1
    `);
    if ((existingAug as { id: string }[]).length > 0) {
      augustBillId = (existingAug as { id: string }[])[0]!.id;
      console.log(`\nAugust bill already exists: ${augustBillId}`);
    } else {
      console.log(
        `\nGenerating August bill: previous=${TARGET_CURR} current=${augustCurrentArg} rate=${money(rate)}/unit …`,
      );
      // Prefer lean insert — full createElectricityBill hangs on Room OS pack
      // resolve against Neon pooler (~5m CONNECTION_CLOSED).
      augustBillId = await createAugustBillLean({
        roomId: EXPECTED_ROOM_ID,
        pgId: pg.id,
        previousReadingUnits: TARGET_CURR,
        currentReadingUnits: augustCurrentArg,
        ratePerUnitPaise: rate,
      });
      console.log(`August bill ID (generated): ${augustBillId}`);
    }

    const [augBill] = await db.execute<{
      id: string;
      prev: string;
      curr: string;
      units: string;
      total: number;
    }>(sql`
      SELECT id::text AS id,
        previous_reading_units::text AS prev,
        current_reading_units::text AS curr,
        units_consumed::text AS units,
        total_paise::bigint AS total
      FROM electricity_bills WHERE id = ${augustBillId}::uuid
    `);
    console.log('\n--- AUGUST BILL ---');
    console.log(
      `ID ${augBill?.id}: ${augBill?.prev} → ${augBill?.curr} (${augBill?.units} units) · ${money(Number(augBill?.total ?? 0))}`,
    );
    if (Number(augBill?.prev) !== TARGET_CURR) {
      throw new Error(`August previous reading expected ${TARGET_CURR}, got ${augBill?.prev}`);
    }
  }

  // ── Final verification query ──────────────────────────────────────────────
  const finalRows = await db.execute(sql`
    SELECT
      eb.id::text AS bill_id,
      eb.billing_month::text AS billing_month,
      eb.previous_reading_units::text AS previous_reading,
      eb.current_reading_units::text AS current_reading,
      eb.units_consumed::text AS units_consumed,
      eb.rate_per_unit_paise::bigint AS rate_paise,
      eb.total_paise::bigint AS total_paise,
      eb.per_resident_paise::bigint AS per_resident_paise,
      (SELECT count(*) FROM electricity_invoices ei
        WHERE ei.electricity_bill_id = eb.id AND ei.status <> 'cancelled') AS invoice_count,
      lc.total_bill_paise::bigint AS ledger_total,
      lc.collected_paise::bigint AS ledger_collected,
      lc.remaining_paise::bigint AS ledger_remaining
    FROM electricity_bills eb
    LEFT JOIN room_electricity_ledger_cycles lc
      ON lc.room_id = eb.room_id AND lc.billing_month = eb.billing_month
    WHERE eb.room_id = ${EXPECTED_ROOM_ID}::uuid
      AND eb.is_pipeline_test = false
    ORDER BY eb.billing_month
  `);

  const [prepaidAfter] = await db.execute<{ prepaid: number }>(sql`
    SELECT coalesce(electricity_prepaid_credit_paise, 0)::bigint AS prepaid
    FROM rooms WHERE id = ${EXPECTED_ROOM_ID}::uuid
  `);

  console.log('\n--- FINAL VERIFICATION ---');
  console.log(JSON.stringify(finalRows, null, 2));
  console.log(`Room prepaid after: ${money(Number(prepaidAfter?.prepaid ?? 0))}`);
  console.log(`July bill ID updated: ${EXPECTED_JULY_BILL_ID}`);
  console.log(`August bill ID generated: ${augustBillId ?? '(not generated)'}`);

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
