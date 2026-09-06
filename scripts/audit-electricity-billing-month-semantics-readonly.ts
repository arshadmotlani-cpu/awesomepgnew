/**
 * READ-ONLY audit: what does billing_month=2026-09-01 mean?
 * Production mutation count: 0
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-elec-billing-month-semantics');

import { writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { loadRoomElectricityContributionsForMonth } from '@/src/services/electricityRoomContributions';
import { countActiveBedsInRoom } from '@/src/lib/roomCapacitySsotDb';
import { resolveOfficialPreviousReading } from '@/src/services/meterTimelineService';
import { paiseToInr } from '@/src/lib/format';

async function occupantsFor(roomId: string, month: string) {
  const load = await loadRoomElectricityOccupantsForMonth({
    roomId,
    billingMonth: month,
    includeFixedStay: true,
    useProRataByActiveDays: true,
  });
  return load.occupants.map((o) => ({
    name: o.customerName,
    bookingId: o.bookingId,
    days: o.occupiedDates?.length ?? 0,
    first: o.occupiedDates?.[0] ?? null,
    last: o.occupiedDates?.at(-1) ?? null,
  }));
}

async function main() {
  const room102 = (
    await db.execute(sql`
      SELECT r.id::text AS room_id, r.room_number, p.name AS pg_name
      FROM rooms r
      JOIN floors f ON f.id = r.floor_id
      JOIN pgs p ON p.id = f.pg_id
      WHERE r.room_number = '102' AND p.name ILIKE '%shantinagar%'
      LIMIT 1
    `)
  )[0] as { room_id: string; room_number: string; pg_name: string };

  const bills = await db.execute(sql`
    SELECT eb.id::text, eb.billing_month::text, eb.created_at::text,
           eb.previous_reading_units::text AS prev,
           eb.current_reading_units::text AS curr,
           eb.units_consumed::text AS units,
           eb.rate_per_unit_paise, eb.total_paise,
           eb.prepaid_credit_applied_paise
    FROM electricity_bills eb
    WHERE eb.room_id = ${room102.room_id}::uuid
      AND eb.is_pipeline_test = false
      AND eb.billing_month IN ('2026-07-01','2026-08-01','2026-09-01')
    ORDER BY eb.billing_month
  `);

  const fleetSep = await db.execute(sql`
    SELECT p.name AS pg, count(*)::int AS bill_count,
           min(eb.created_at)::text AS first_created,
           max(eb.created_at)::text AS last_created,
           min(eb.previous_reading_units::numeric)::text AS min_prev,
           max(eb.current_reading_units::numeric)::text AS max_curr
    FROM electricity_bills eb
    JOIN rooms r ON r.id = eb.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    WHERE eb.billing_month = '2026-09-01'
      AND eb.is_pipeline_test = false
    GROUP BY p.name
    ORDER BY p.name
  `);

  const chain = await db.execute(sql`
    SELECT eb.billing_month::text, eb.previous_reading_units::text,
           eb.current_reading_units::text, eb.created_at::text,
           r.room_number, p.name AS pg
    FROM electricity_bills eb
    JOIN rooms r ON r.id = eb.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    WHERE r.room_number = '102' AND p.name ILIKE '%shantinagar%'
      AND eb.is_pipeline_test = false
    ORDER BY eb.billing_month
  `);

  const invoicesSep = await db.execute(sql`
    SELECT c.full_name, bk.booking_code, ei.invoice_number, ei.status::text,
           ei.amount_paise, ei.active_days, ei.due_date::text, ei.created_at::text,
           ei.billing_month::text
    FROM electricity_invoices ei
    JOIN electricity_bills eb ON eb.id = ei.electricity_bill_id
    JOIN bookings bk ON bk.id = ei.booking_id
    JOIN customers c ON c.id = ei.customer_id
    WHERE eb.room_id = ${room102.room_id}::uuid
      AND ei.billing_month = '2026-09-01'
    ORDER BY ei.status, c.full_name
  `);

  const baselineForSep = await resolveOfficialPreviousReading(room102.room_id, '2026-09-01');
  const baselineForAug = await resolveOfficialPreviousReading(room102.room_id, '2026-08-01');

  const occAug = await occupantsFor(room102.room_id, '2026-08-01');
  const occSep = await occupantsFor(room102.room_id, '2026-09-01');

  // If Sep bill exists, compute both Aug and Sep allocations against THAT meter total
  const sepBill = (bills as any[]).find((b) => String(b.billing_month).startsWith('2026-09'));
  let allocationCompare: unknown = null;
  if (sepBill) {
    const contributions = await loadRoomElectricityContributionsForMonth(
      room102.room_id,
      '2026-09-01',
    );
    const activeBedCount = await countActiveBedsInRoom(room102.room_id);
    const gross = Number(sepBill.total_paise);
    const prepaid = Number(sepBill.prepaid_credit_applied_paise ?? 0);

    async function alloc(month: string) {
      const load = await loadRoomElectricityOccupantsForMonth({
        roomId: room102.room_id,
        billingMonth: month,
        includeFixedStay: true,
        useProRataByActiveDays: true,
      });
      const allocation = allocateMonthlyElectricityInvoices({
        grossTotalPaise: gross,
        prepaidCreditPaise: prepaid,
        contributionsByCustomerId:
          contributions.contributions.length > 0 ? contributions.byCustomerId : undefined,
        occupants: load.occupants,
        checkoutCollectedByCustomerId: load.checkoutCollectedByCustomerId,
        useProRata: true,
        activeBedCount,
        billingDays: load.billingDays,
      });
      return allocation.invoices.map((i) => {
        const occ = load.occupants.find((o) => o.customerId === i.customerId);
        return {
          name: occ?.customerName,
          days: occ?.occupiedDates?.length,
          amountPaise: i.amountPaise,
          amountInr: paiseToInr(i.amountPaise),
        };
      });
    }

    allocationCompare = {
      usingSeptemberOccupancyAgainstSepMeter: await alloc('2026-09-01'),
      usingAugustOccupancyAgainstSepMeter: await alloc('2026-08-01'),
      note: 'Same meter total from billing_month=2026-09-01 bill; only occupancy month differs',
    };
  }

  // Label samples from invoice display fields
  const labelSample = await db.execute(sql`
    SELECT ei.invoice_number, ei.billing_month::text, ei.due_date::text,
           ei.created_at::text, c.full_name
    FROM electricity_invoices ei
    JOIN customers c ON c.id = ei.customer_id
    WHERE ei.invoice_number = 'ELE-2026-09-0006'
    LIMIT 1
  `);

  const out = {
    mutations: 0,
    interpretationQuestion:
      'Does billing_month=2026-09-01 mean September consumption or August consumption billed in September?',
    room102,
    billChainRoom102: bills,
    fullMeterChainRoom102: chain,
    fleetSeptemberBills: fleetSep,
    invoicesForSepBillingMonth: invoicesSep,
    meterBaselines: {
      beforeAugustBill: baselineForAug,
      beforeSeptemberBill: baselineForSep,
    },
    occupancyAugust: occAug,
    occupancySeptember: occSep,
    allocationCompare,
    saswatInvoiceLabelSample: labelSample,
  };

  writeFileSync('/tmp/elec-billing-month-semantics.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
