/**
 * Read-only Room 102 / Saswat September 2026 electricity audit.
 * Mutations: 0
 *
 * Usage: USE_PRODUCTION_DB=1 npx tsx scripts/audit-room-102-september-electricity-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-room-102-sep-elec');

import { writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import { loadRoomElectricityContributionsForMonth } from '@/src/services/electricityRoomContributions';
import { listCheckoutElectricityLedgerForRoomMonth } from '@/src/services/electricitySettlementLedger';
import { sumManualElectricityCreditsForRoomMonth } from '@/src/services/electricitySettlementLedgerView';
import { countActiveBedsInRoom } from '@/src/lib/roomCapacitySsotDb';
import { paiseToInr } from '@/src/lib/format';

const BILLING_MONTH = '2026-09-01';

function rows<T extends Record<string, unknown>>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: T[] })?.rows ?? []) as T[];
}

async function main() {
  const room = rows<{ room_id: string; room_number: string; pg_name: string }>(
    await db.execute(sql`
      SELECT r.id::text AS room_id, r.room_number, p.name AS pg_name
      FROM rooms r
      JOIN floors f ON f.id = r.floor_id
      JOIN pgs p ON p.id = f.pg_id
      WHERE r.room_number = '102' AND p.name ILIKE '%shantinagar%'
      LIMIT 1
    `),
  )[0];
  if (!room) throw new Error('Room 102 Shantinagar not found');

  const bill = rows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT eb.id::text, eb.previous_reading_units::text AS previous_reading_units,
             eb.current_reading_units::text AS current_reading_units,
             eb.units_consumed::text AS units_consumed, eb.rate_per_unit_paise,
             eb.total_paise, eb.prepaid_credit_applied_paise, eb.checkout_credit_applied_paise,
             eb.monthly_occupant_count, eb.per_resident_paise, eb.rounding_remainder_paise,
             eb.calculation_breakdown, eb.created_at::text AS created_at
      FROM electricity_bills eb
      WHERE eb.room_id = ${room.room_id}::uuid
        AND eb.billing_month = ${BILLING_MONTH}::date
        AND eb.is_pipeline_test = false
      LIMIT 1
    `),
  )[0];
  if (!bill) throw new Error('No September bill for Room 102');

  const invoices = rows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT ei.id::text, ei.invoice_number, ei.status::text, ei.amount_paise::text,
             ei.paid_paise::text, ei.active_days, bk.booking_code, c.full_name, b.bed_code,
             ei.customer_id::text, ei.booking_id::text,
             (ei.payment_proof_url IS NOT NULL) AS has_proof,
             ei.superseded_by_invoice_id::text AS superseded_by,
             ei.created_at::text AS created_at
      FROM electricity_invoices ei
      JOIN bookings bk ON bk.id = ei.booking_id
      JOIN customers c ON c.id = ei.customer_id
      LEFT JOIN beds b ON b.id = ei.bed_id
      WHERE ei.electricity_bill_id = ${bill.id as string}::uuid
      ORDER BY c.full_name
    `),
  );

  const rejections = rows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT ppr.id::text, ppr.reason_code, ppr.reason_label, ppr.resident_message,
             ppr.status::text, ei.invoice_number, ppr.created_at::text
      FROM payment_proof_rejections ppr
      JOIN electricity_invoices ei ON ei.id = ppr.entity_id
      WHERE ei.electricity_bill_id = ${bill.id as string}::uuid
      ORDER BY ppr.created_at DESC
    `),
  );

  const payments = rows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT ppr.id::text AS rejection_id, ppr.reason_code, ppr.reason_label,
             ppr.status::text AS rejection_status, ppr.created_at::text,
             ei.invoice_number, ei.amount_paise::text AS invoice_amount_paise,
             c.full_name, ei.payment_proof_url IS NOT NULL AS has_proof_url
      FROM payment_proof_rejections ppr
      JOIN electricity_invoices ei ON ei.id = ppr.entity_id
      JOIN customers c ON c.id = ei.customer_id
      WHERE ei.electricity_bill_id = ${bill.id as string}::uuid
      ORDER BY ppr.created_at DESC
    `),
  );

  // Current bed snapshot (intentionally NOT used for allocation — audit contrast only)
  const currentBeds = rows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT b.bed_code, br.status::text AS res_status,
             lower(br.stay_range)::text AS stay_start,
             upper(br.stay_range)::text AS stay_end_exclusive,
             bk.booking_code, c.full_name, bk.status::text AS booking_status
      FROM beds b
      LEFT JOIN bed_reservations br
        ON br.bed_id = b.id AND br.status = 'active' AND br.kind = 'primary'
      LEFT JOIN bookings bk ON bk.id = br.booking_id
      LEFT JOIN customers c ON c.id = bk.customer_id
      WHERE b.room_id = ${room.room_id}::uuid
      ORDER BY b.bed_code
    `),
  );

  const occupantLoad = await loadRoomElectricityOccupantsForMonth({
    roomId: room.room_id,
    billingMonth: BILLING_MONTH,
    includeFixedStay: true,
    useProRataByActiveDays: true,
  });

  const checkoutRows = await listCheckoutElectricityLedgerForRoomMonth(
    room.room_id,
    BILLING_MONTH,
    { status: 'collected' },
  );
  const checkoutCollectedByCustomerId = new Map<string, number>();
  for (const row of checkoutRows) {
    checkoutCollectedByCustomerId.set(
      row.customerId,
      (checkoutCollectedByCustomerId.get(row.customerId) ?? 0) + row.amountPaise,
    );
  }
  const contributionsLoad = await loadRoomElectricityContributionsForMonth(
    room.room_id,
    BILLING_MONTH,
  );
  const manualCreditPaise = await sumManualElectricityCreditsForRoomMonth(
    room.room_id,
    BILLING_MONTH,
  );
  const activeBedCount = await countActiveBedsInRoom(room.room_id);

  const allocation = allocateMonthlyElectricityInvoices({
    grossTotalPaise: Number(bill.total_paise),
    prepaidCreditPaise: Number(bill.prepaid_credit_applied_paise ?? 0),
    contributionsByCustomerId:
      contributionsLoad.contributions.length > 0 ? contributionsLoad.byCustomerId : undefined,
    manualCreditPaise: contributionsLoad.contributions.length > 0 ? undefined : manualCreditPaise,
    occupants: occupantLoad.occupants.map((o) => ({
      bookingId: o.invoiceBookingId ?? o.bookingId,
      customerId: o.customerId,
      bedCount: o.bedIds?.length ?? 1,
      weight: o.weight ?? o.activeDays ?? 1,
      occupiedDates: o.occupiedDates,
    })),
    checkoutCollectedByCustomerId,
    useProRata: true,
    activeBedCount,
    billingDays: occupantLoad.billingDays,
  });

  const nameByCustomer = new Map(
    occupantLoad.occupants.map((o) => [o.customerId, o.customerName] as const),
  );
  const bookingByCustomer = new Map(
    occupantLoad.occupants.map((o) => [o.customerId, o.bookingCode] as const),
  );

  const dayOccupantCounts: Record<string, number> = {};
  for (const d of allocation.dailyAllocation) {
    const key = String(d.occupantCustomerIds.length);
    dayOccupantCounts[key] = (dayOccupantCounts[key] ?? 0) + 1;
  }

  const breakdown =
    typeof bill.calculation_breakdown === 'string'
      ? JSON.parse(bill.calculation_breakdown as string)
      : bill.calculation_breakdown;

  const saswatStored = invoices.find(
    (i) =>
      String(i.full_name).toLowerCase().includes('saswat') ||
      String(i.booking_code) === 'APG-2026-0094',
  );
  const saswatCanonical = allocation.invoices.find((line) => {
    const occ = occupantLoad.occupants.find((o) => o.customerId === line.customerId);
    return (
      occ?.bookingCode === 'APG-2026-0094' ||
      (occ?.customerName ?? '').toLowerCase().includes('saswat')
    );
  });
  const saswatOcc = occupantLoad.occupants.find(
    (o) =>
      o.bookingCode === 'APG-2026-0094' ||
      (o.customerName ?? '').toLowerCase().includes('saswat'),
  );

  const out = {
    mutations: 0,
    room,
    billMeter: {
      previous: bill.previous_reading_units,
      current: bill.current_reading_units,
      units: bill.units_consumed,
      ratePaise: bill.rate_per_unit_paise,
      rateInr: paiseToInr(Number(bill.rate_per_unit_paise)),
      totalPaise: Number(bill.total_paise),
      totalInr: paiseToInr(Number(bill.total_paise)),
      prepaid: bill.prepaid_credit_applied_paise,
      checkoutCredit: bill.checkout_credit_applied_paise,
      monthlyOccupantCount: bill.monthly_occupant_count,
      perResidentPaise: bill.per_resident_paise,
      remainder: bill.rounding_remainder_paise,
      createdAt: bill.created_at,
    },
    currentBedSnapshot: currentBeds,
    storedInvoices: invoices.map((i) => ({
      ...i,
      amountInr: paiseToInr(Number(i.amount_paise)),
    })),
    rejections,
    payments,
    canonicalOccupants: occupantLoad.occupants.map((o) => ({
      name: o.customerName,
      bookingCode: o.bookingCode,
      customerId: o.customerId,
      invoiceBookingId: o.invoiceBookingId ?? o.bookingId,
      activeDays: o.activeDays,
      occupiedDatesCount: o.occupiedDates?.length,
      firstDate: o.occupiedDates?.[0],
      lastDate: o.occupiedDates?.[o.occupiedDates.length - 1],
      stayStart: o.stayStart,
      stayEnd: o.stayEnd,
      bedCodes: o.bedCodes,
    })),
    dayOccupantCounts,
    canonicalInvoices: allocation.invoices.map((i) => ({
      name: nameByCustomer.get(i.customerId),
      bookingCode: bookingByCustomer.get(i.customerId),
      customerId: i.customerId,
      bookingId: i.bookingId,
      amountPaise: i.amountPaise,
      amountInr: paiseToInr(i.amountPaise),
      excluded: i.excludedBecauseCheckoutPaid,
    })),
    emptyDayPaise: allocation.emptyDayPaise,
    remainderPaise: allocation.remainderPaise,
    saswat: {
      storedInvoice: saswatStored
        ? {
            number: saswatStored.invoice_number,
            amountPaise: Number(saswatStored.amount_paise),
            amountInr: paiseToInr(Number(saswatStored.amount_paise)),
            status: saswatStored.status,
            paidPaise: Number(saswatStored.paid_paise),
          }
        : null,
      canonicalAmountPaise: saswatCanonical?.amountPaise ?? null,
      canonicalAmountInr: saswatCanonical
        ? paiseToInr(saswatCanonical.amountPaise)
        : null,
      septemberDays: saswatOcc?.activeDays ?? saswatOcc?.occupiedDates?.length ?? null,
      occupancy: saswatOcc
        ? {
            first: saswatOcc.occupiedDates?.[0],
            last: saswatOcc.occupiedDates?.[saswatOcc.occupiedDates.length - 1],
            stayStart: saswatOcc.stayStart,
            stayEnd: saswatOcc.stayEnd,
            bedCodes: saswatOcc.bedCodes,
          }
        : null,
      differencePaise:
        saswatStored && saswatCanonical
          ? Number(saswatStored.amount_paise) - saswatCanonical.amountPaise
          : null,
    },
    breakdownKeys: breakdown ? Object.keys(breakdown) : [],
    breakdownMethod: breakdown?.allocationMethod ?? breakdown?.method ?? breakdown?.mode,
    breakdownTimeline: (breakdown?.timeline ?? []).map(
      (t: {
        customerName?: string;
        customerId?: string;
        activeDays?: number;
        amountPaise?: number;
        occupiedDates?: string[];
      }) => ({
        name: t.customerName,
        customerId: t.customerId,
        activeDays: t.activeDays,
        amountPaise: t.amountPaise,
        dateCount: t.occupiedDates?.length,
      }),
    ),
  };

  writeFileSync('/tmp/saswat-elec-audit.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
