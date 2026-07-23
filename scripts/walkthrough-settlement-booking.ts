/**
 * Read-only settlement walkthrough for a booking — 15 steps + V1 vs V2 comparison.
 *
 * Usage:
 *   CHECKOUT_SETTLEMENT_V2=1 npx tsx scripts/walkthrough-settlement-booking.ts --code APG-2026-0045
 */
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
import { db } from '../src/db/client';
import {
  bookings,
  customers,
  vacatingRequests,
} from '../src/db/schema';
import { computeCheckoutRefundPreview } from '../src/lib/billing/checkoutRefundPreview';
import { computeCheckoutSettlementV2 } from '../src/lib/checkout/checkoutSettlementEngineV2';
import { noticeDeductionAppliesToBooking } from '../src/lib/checkout/noticeDeductionPolicy';
import { resolveStayCheckInDate } from '../src/lib/checkout/checkoutSettlementV2Compute';
import { diffDays, normalizeIsoDateOnly } from '../src/lib/dates';
import { paiseToInr } from '../src/lib/format';
import {
  VACATING_NOTICE_MIN_DAYS,
  dailyRateFromMonthly,
} from '../src/services/billing';
import { getBookingMoneyBalances } from '../src/services/bookingMoneyBalances';
import { getDepositSummaryForBooking } from '../src/services/deposits';
import { computeNoticeDeductionForBooking } from '../src/services/noticeDeduction';

loadProductionAuditEnv();
requireDatabaseUrl('walkthrough-settlement-booking.ts');

function argValue(flag: string): string | null {
  const direct = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (direct) return direct.split('=').slice(1).join('=');
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!;
  return null;
}

function fmtPaise(paise: number): string {
  return `${paiseToInr(paise)} (${paise.toLocaleString('en-IN')} paise)`;
}

function printStep(
  n: number,
  label: string,
  paise: number | string,
  formula: string,
  source: string,
) {
  const value =
    typeof paise === 'number' ? fmtPaise(paise) : typeof paise === 'string' && paise.includes('paise') ? paise : paise;
  console.log(`\nStep ${n} — ${label}`);
  console.log(`  Value: ${value}`);
  console.log(`  Formula: ${formula}`);
  console.log(`  Source: ${source}`);
}

async function main() {
  const bookingCode = argValue('--code') ?? 'APG-2026-0045';

  const [bookingRow] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      status: bookings.status,
      stayType: bookings.stayType,
      durationMode: bookings.durationMode,
      subtotalPaise: bookings.subtotalPaise,
      depositPaise: bookings.depositPaise,
      rentReceivedPaise: bookings.rentReceivedPaise,
      customerName: customers.fullName,
      customerPhone: customers.phone,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);

  if (!bookingRow) {
    console.error(`Booking not found: ${bookingCode}`);
    process.exit(1);
  }

  const [vacating] = await db
    .select()
    .from(vacatingRequests)
    .where(
      and(
        eq(vacatingRequests.bookingId, bookingRow.id),
        ne(vacatingRequests.status, 'rejected'),
      ),
    )
    .orderBy(desc(vacatingRequests.createdAt))
    .limit(1);

  const [settlementRow] = await db.execute<{
    id: string;
    status: string;
    notice_shortfall_days: number;
    notice_deduction_paise: number;
    notice_rent_covered_days: number;
    notice_chargeable_days: number;
    monthly_rent_paise_snapshot: number;
    electricity_share_paise: number;
    electricity_deduct_from_deposit: boolean;
    damage_charge_paise: number;
    cleaning_charge_paise: number;
    custom_charge_paise: number;
    final_refund_paise: number | null;
    amounts_locked: boolean;
  }>(sql`
    SELECT cs.id, cs.status, cs.notice_shortfall_days, cs.notice_deduction_paise,
           cs.notice_rent_covered_days, cs.notice_chargeable_days,
           cs.monthly_rent_paise_snapshot, cs.electricity_share_paise,
           cs.electricity_deduct_from_deposit, cs.damage_charge_paise,
           cs.cleaning_charge_paise, cs.custom_charge_paise, cs.final_refund_paise,
           cs.amounts_locked
    FROM checkout_settlements cs
    WHERE cs.booking_id = ${bookingRow.id}::uuid
      AND cs.status <> 'archived'
    ORDER BY cs.updated_at DESC
    LIMIT 1
  `);
  const settlement = settlementRow ?? null;

  const settlementFields = settlement
    ? {
        noticeShortfallDays: Number(settlement.notice_shortfall_days ?? 0),
        noticeDeductionPaise: Number(settlement.notice_deduction_paise ?? 0),
        noticeRentCoveredDays: Number(settlement.notice_rent_covered_days ?? 0),
        noticeChargeableDays: Number(settlement.notice_chargeable_days ?? 0),
        monthlyRentPaiseSnapshot: Number(settlement.monthly_rent_paise_snapshot ?? 0),
        electricitySharePaise: Number(settlement.electricity_share_paise ?? 0),
        electricityDeductFromDeposit: settlement.electricity_deduct_from_deposit !== false,
        damageChargePaise: Number(settlement.damage_charge_paise ?? 0),
        cleaningChargePaise: Number(settlement.cleaning_charge_paise ?? 0),
        customChargePaise: Number(settlement.custom_charge_paise ?? 0),
        finalRefundPaise:
          settlement.final_refund_paise != null
            ? Number(settlement.final_refund_paise)
            : null,
        amountsLocked: settlement.amounts_locked === true,
        status: settlement.status,
        id: settlement.id,
      }
    : null;

  const checkInDate = await resolveStayCheckInDate(bookingRow.id);
  const noticeGivenDate = vacating
    ? normalizeIsoDateOnly(String(vacating.noticeGivenDate))
    : null;
  const checkoutDate = vacating
    ? normalizeIsoDateOnly(String(vacating.vacatingDate))
    : null;

  const monthlyRentPaise =
    settlementFields?.monthlyRentPaiseSnapshot ??
    vacating?.monthlyRentPaiseSnapshot ??
    bookingRow.subtotalPaise;
  const dailyRentPaise = dailyRateFromMonthly(monthlyRentPaise);

  const [wallet, money, noticeBreakdown, invoiceRows, ledgerRows] = await Promise.all([
    getDepositSummaryForBooking(bookingRow.id),
    getBookingMoneyBalances(bookingRow.id),
    vacating && noticeGivenDate && checkoutDate
      ? computeNoticeDeductionForBooking({
          bookingId: bookingRow.id,
          noticeGivenDate,
          vacatingDate: checkoutDate,
          monthlyRentPaise,
          stayType: bookingRow.stayType,
          durationMode: bookingRow.durationMode,
        })
      : Promise.resolve(null),
    db.execute(sql`
      SELECT invoice_number, billing_month, rent_paise, paid_principal_paise, status
      FROM rent_invoices
      WHERE booking_id = ${bookingRow.id}::uuid
      ORDER BY billing_month
    `),
    db.execute(sql`
      SELECT entry_kind, amount_paise, reason, created_at
      FROM deposit_ledger
      WHERE booking_id = ${bookingRow.id}::uuid
      ORDER BY created_at
    `),
  ]);

  const depositHeldPaise = wallet?.refundableBalancePaise ?? 0;
  const depositCollectedPaise = wallet?.collectedPaise ?? 0;
  const rentPaidPaise = money?.rent.receivedPaise ?? 0;

  const settlementDraft = settlementFields ?? {
    id: '(none)',
    noticeShortfallDays: noticeBreakdown?.missingNoticeDays ?? 0,
    noticeDeductionPaise: noticeBreakdown?.noticeDeductionPaise ?? 0,
    noticeRentCoveredDays: noticeBreakdown?.rentCoveredDays ?? 0,
    noticeChargeableDays: noticeBreakdown?.chargeableNoticeDays ?? 0,
    monthlyRentPaiseSnapshot: monthlyRentPaise,
    electricitySharePaise: 0,
    electricityDeductFromDeposit: true,
    damageChargePaise: 0,
    cleaningChargePaise: 0,
    customChargePaise: 0,
    amountsLocked: false,
  };

  const electricitySharePaise = settlementFields?.electricitySharePaise ?? 0;
  const damagePaise = settlementFields?.damageChargePaise ?? 0;
  const cleaningPaise = settlementFields?.cleaningChargePaise ?? 0;
  const customPaise = settlementFields?.customChargePaise ?? 0;
  const otherPaise = damagePaise + cleaningPaise + customPaise;
  const electricityDeduct = settlementFields?.electricityDeductFromDeposit !== false;

  const missingNoticeDays =
    settlementFields?.noticeShortfallDays ?? noticeBreakdown?.missingNoticeDays ?? 0;
  const noticeGivenDays =
    noticeGivenDate && checkoutDate ? diffDays(noticeGivenDate, checkoutDate) : 0;

  const stayDays =
    checkInDate && checkoutDate
      ? Math.max(1, diffDays(checkInDate, checkoutDate) + 1)
      : 0;
  const rentConsumedRaw = dailyRentPaise * stayDays;
  const rentConsumedPaise = Math.min(rentPaidPaise, rentConsumedRaw);
  const unusedRentPaise = Math.max(0, rentPaidPaise - rentConsumedPaise);

  const noticeFullPaise = missingNoticeDays * dailyRentPaise;
  const noticeFromUnusedRentPaise = Math.min(unusedRentPaise, noticeFullPaise);
  const noticeFromDepositPaise = Math.max(0, noticeFullPaise - noticeFromUnusedRentPaise);
  const unusedRentAfterNoticePaise = Math.max(0, unusedRentPaise - noticeFromUnusedRentPaise);

  const v1Preview = computeCheckoutRefundPreview({
    depositHeldPaise,
    noticeDeductionPaise: settlementDraft.noticeDeductionPaise,
    electricitySharePaise,
    electricityDeductFromDeposit: electricityDeduct,
    damageChargePaise: damagePaise,
    cleaningChargePaise: cleaningPaise,
    customChargePaise: customPaise,
    finalRefundPaise: settlementFields?.finalRefundPaise,
    amountsLocked: settlementFields?.amountsLocked ?? false,
  });

  const v2Waterfall =
    checkInDate && checkoutDate
      ? computeCheckoutSettlementV2({
          stayCheckInDate: checkInDate,
          stayCheckoutDate: checkoutDate,
          rentPaidPaise,
          monthlyRentPaise,
          depositCollectedPaise: depositHeldPaise,
          missingNoticeDays,
          electricityPaise: electricitySharePaise,
          electricityDeductFromDeposit: electricityDeduct,
          damageChargePaise: damagePaise,
          cleaningChargePaise: cleaningPaise,
          customChargePaise: customPaise,
          noticeApplies: noticeDeductionAppliesToBooking({
            stayType: bookingRow.stayType,
            durationMode: bookingRow.durationMode,
          }),
        })
      : null;

  console.log('='.repeat(72));
  console.log('CHECKOUT SETTLEMENT WALKTHROUGH (read-only)');
  console.log('='.repeat(72));
  console.log(`Resident: ${bookingRow.customerName} (${bookingRow.customerPhone})`);
  console.log(`Booking: ${bookingRow.bookingCode} · UUID ${bookingRow.id}`);
  console.log(`Booking status: ${bookingRow.status} · ${bookingRow.stayType} / ${bookingRow.durationMode}`);
  console.log(
    `Vacating: ${vacating ? `${vacating.status} · request ${vacating.id}` : 'none'}`,
  );
  console.log(
    `Settlement: ${settlementFields ? `${settlementFields.status} · id ${settlementFields.id} · locked=${settlementFields.amountsLocked}` : 'not created yet'}`,
  );

  console.log('\n--- Raw inputs ---');
  console.log(`  bed_reservations.stay_range lower → check-in: ${checkInDate ?? 'missing'}`);
  console.log(`  vacating_requests.notice_given_date: ${noticeGivenDate ?? 'n/a'}`);
  console.log(`  vacating_requests.vacating_date: ${checkoutDate ?? 'n/a'}`);
  console.log(`  monthly rent snapshot: ${fmtPaise(monthlyRentPaise)}`);
  console.log(`  deposit_ledger refundable balance: ${fmtPaise(depositHeldPaise)}`);
  console.log(`  deposit_ledger collected sum: ${fmtPaise(depositCollectedPaise)}`);
  console.log(`  rent received (invoices + booking): ${fmtPaise(rentPaidPaise)}`);
  console.log(`  bookings.rent_received_paise: ${bookingRow.rentReceivedPaise}`);
  if (noticeBreakdown) {
    console.log(`  notice missing days: ${noticeBreakdown.missingNoticeDays}`);
    console.log(`  notice prepaid covered days: ${noticeBreakdown.rentCoveredDays}`);
    console.log(`  notice chargeable days (V1): ${noticeBreakdown.chargeableNoticeDays}`);
    console.log(`  notice_deduction_paise (V1 deposit): ${fmtPaise(noticeBreakdown.noticeDeductionPaise)}`);
    console.log(`  paid-until date: ${noticeBreakdown.paidUntilDate ?? 'none'}`);
    console.log(`  unused prepaid rent days: ${noticeBreakdown.unusedPrepaidRentDays}`);
  }

  if (invoiceRows.length > 0) {
    console.log('\n  Rent invoices:');
    for (const inv of invoiceRows) {
      console.log(
        `    ${inv.invoice_number} · ${inv.billing_month} · paid ${fmtPaise(Number(inv.paid_principal_paise))} / ${fmtPaise(Number(inv.rent_paise))} · ${inv.status}`,
      );
    }
  }

  if (ledgerRows.length > 0) {
    console.log('\n  Deposit ledger:');
    for (const row of ledgerRows) {
      console.log(
        `    ${row.entry_kind} · ${fmtPaise(Number(row.amount_paise))} · ${String(row.reason).slice(0, 60)}`,
      );
    }
  }

  console.log('\n' + '='.repeat(72));
  console.log('15-STEP SETTLEMENT WALKTHROUGH');
  console.log('='.repeat(72));

  printStep(
    1,
    'Check-in date',
    checkInDate ?? 'missing',
    'lower(bed_reservations.stay_range) for primary reservation',
    'bed_reservations.stay_range → to_char(lower(...), YYYY-MM-DD)',
  );

  printStep(
    2,
    'Move-out request date (notice given)',
    noticeGivenDate ?? 'n/a',
    'Date resident submitted move-out / notice',
    'vacating_requests.notice_given_date',
  );

  printStep(
    3,
    'Effective checkout date',
    checkoutDate ?? 'n/a',
    'Approved vacating / checkout date used for settlement anchors',
    'vacating_requests.vacating_date',
  );

  printStep(
    4,
    'Monthly rent',
    monthlyRentPaise,
    `dailyRent = floor(monthlyRent / 30) = floor(${monthlyRentPaise} / 30) = ${dailyRentPaise}`,
    settlement
      ? 'checkout_settlements.monthly_rent_paise_snapshot'
      : vacating
        ? 'vacating_requests.monthly_rent_paise_snapshot'
        : 'bookings.subtotal_paise',
  );

  printStep(
    5,
    'Deposit collected (escrow balance)',
    depositHeldPaise,
    'sum(deposit_ledger.amount_paise) = collected − deducted − refunded',
    'getDepositSummaryForBooking() → deposit_ledger',
  );

  printStep(
    6,
    'Rent collected',
    rentPaidPaise,
    'sum(rent_invoices.paid_principal_paise) aligned with bookings.rent_received_paise',
    'getBookingMoneyBalances().rent.receivedPaise',
  );

  printStep(
    7,
    'Total stay days',
    `${stayDays} days`,
    checkInDate && checkoutDate
      ? `max(1, diffDays(${checkInDate}, ${checkoutDate}) + 1) = ${stayDays}`
      : 'requires check-in + checkout',
    'computed from bed_reservations + vacating_requests.vacating_date',
  );

  printStep(
    8,
    'Rent consumed',
    rentConsumedPaise,
    `min(rentPaid, stayDays × dailyRent) = min(${rentPaidPaise}, ${stayDays} × ${dailyRentPaise}) = min(${rentPaidPaise}, ${rentConsumedRaw})`,
    'V2 engine — derived from stay, not invoices',
  );

  printStep(
    9,
    'Unused rent',
    unusedRentPaise,
    `max(0, rentPaid − rentConsumed) = max(0, ${rentPaidPaise} − ${rentConsumedPaise})`,
    'V2 rent bucket — surplus prepaid rent after stay consumption',
  );

  printStep(
    10,
    '14-day notice deduction (full missing notice)',
    noticeFullPaise,
    `missingNoticeDays × dailyRent where missing = max(0, ${VACATING_NOTICE_MIN_DAYS} − noticeGivenDays); noticeGivenDays=${noticeGivenDays}, missing=${missingNoticeDays}`,
    'checkout_settlements.notice_shortfall_days × dailyRateFromMonthly()',
  );

  printStep(
    11,
    'Notice taken from unused rent (V2)',
    noticeFromUnusedRentPaise,
    `min(unusedRent, noticeFull) = min(${unusedRentPaise}, ${noticeFullPaise})`,
    'V2 waterfall step 4 — rent bucket first',
  );

  printStep(
    12,
    'Notice taken from deposit',
    noticeFromDepositPaise,
    `max(0, noticeFull − noticeFromRent) = max(0, ${noticeFullPaise} − ${noticeFromUnusedRentPaise})`,
    `V2: deposit portion · V1 uses chargeableDays×daily=${fmtPaise(noticeBreakdown?.noticeDeductionPaise ?? settlementDraft.noticeDeductionPaise)} (${noticeBreakdown?.chargeableNoticeDays ?? settlementDraft.noticeChargeableDays} chargeable days after ${noticeBreakdown?.rentCoveredDays ?? settlementDraft.noticeRentCoveredDays} prepaid days)`,
  );

  printStep(
    13,
    'Electricity deduction',
    electricityDeduct ? electricitySharePaise : 0,
    electricityDeduct
      ? `electricity_share_paise = ${electricitySharePaise}`
      : 'electricity_deduct_from_deposit = false — not deducted from deposit',
    settlementFields
      ? 'checkout_settlements.electricity_share_paise'
      : 'none on settlement yet (assumed 0)',
  );

  printStep(
    14,
    'Other deductions (damage + cleaning + custom)',
    otherPaise,
    `${damagePaise} + ${cleaningPaise} + ${customPaise}`,
    'checkout_settlements.damage/cleaning/custom_charge_paise',
  );

  const v2Total = v2Waterfall?.refund.totalPaise ?? 0;
  const v2DepositPortion = v2Waterfall?.depositBucket.refundablePaise ?? 0;
  const v2UnusedPortion = v2Waterfall?.refund.unusedRentPortionPaise ?? 0;

  printStep(
    15,
    'Final refundable amount (total resident refund)',
    v2Total,
    `V2: depositRefundable + unusedRentAfterNotice = ${v2DepositPortion} + ${v2UnusedPortion}`,
    'checkout_settlements.total_refund_paise (V2) / final_refund_paise (compat)',
  );

  console.log('\n' + '='.repeat(72));
  console.log('LEGACY V1 vs ENGINE V2');
  console.log('='.repeat(72));

  const v1Notice = settlementDraft.noticeDeductionPaise;
  const v1Elec = v1Preview.electricityDeductionPaise;
  const v1Other = v1Preview.otherDeductionsPaise;
  const v1Final = v1Preview.finalRefundPaise;

  const rows: Array<{
    label: string;
    v1: number;
    v2: number;
    why: string;
  }> = [
    {
      label: 'Notice (total economic charge)',
      v1: v1Notice,
      v2: noticeFullPaise,
      why:
        v1Notice < noticeFullPaise
          ? 'V1 uses chargeable days after prepaid-day offset; V2 charges full missing notice then splits buckets'
          : 'Same total notice charge',
    },
    {
      label: 'Notice from unused rent',
      v1: 0,
      v2: noticeFromUnusedRentPaise,
      why: 'V1 has no rent bucket — prepaid offset is day-count only, not ₹ from unused rent',
    },
    {
      label: 'Notice from deposit',
      v1: v1Notice,
      v2: noticeFromDepositPaise,
      why: 'V1 puts entire chargeable notice on deposit; V2 only puts remainder after rent bucket',
    },
    {
      label: 'Unused rent refunded to resident',
      v1: 0,
      v2: v2UnusedPortion,
      why:
        v2UnusedPortion > 0
          ? 'Remaining unused rent after notice is paid out in V2 total refund'
          : noticeFromUnusedRentPaise > 0
            ? 'All unused rent applied to notice — no rent credit left, but deposit is protected'
            : 'No unused rent bucket',
    },
    {
      label: 'Electricity from deposit',
      v1: v1Elec,
      v2: v2Waterfall?.depositBucket.electricityPaise ?? 0,
      why: 'Same ₹ when settlement row matches; V2 applies after notice waterfall',
    },
    {
      label: 'Other from deposit',
      v1: v1Other,
      v2: v2Waterfall?.depositBucket.otherPaise ?? 0,
      why: 'Same charges; ordering differs only when deposit exhausted',
    },
    {
      label: 'Deposit refund portion',
      v1: v1Final,
      v2: v2DepositPortion,
      why: 'V1 deposit refund equals total refund; V2 splits deposit vs rent credit',
    },
    {
      label: 'TOTAL resident refund',
      v1: v1Final,
      v2: v2Total,
      why:
        v2Total > v1Final
          ? `V2 higher by ${fmtPaise(v2Total - v1Final)} — unused rent credit returned`
          : v2Total < v1Final
            ? `V2 lower by ${fmtPaise(v1Final - v2Total)} — full notice charged before prepaid-day offset`
            : 'Same total',
    },
  ];

  console.log('\n| Line item | V1 | V2 | Delta | Why |');
  console.log('|---|---:|---:|---:|---|');
  for (const row of rows) {
    const delta = row.v2 - row.v1;
    const deltaStr =
      delta === 0 ? '₹0' : delta > 0 ? `+${paiseToInr(delta)}` : `−${paiseToInr(Math.abs(delta))}`;
    console.log(
      `| ${row.label} | ${paiseToInr(row.v1)} | ${paiseToInr(row.v2)} | ${deltaStr} | ${row.why} |`,
    );
  }

  console.log('\n--- Why V2 is more correct for this booking ---');
  console.log('1. Rent paid is modeled as a real bucket — stay consumption is subtracted first.');
  console.log('2. Notice is applied to unused rent ₹ before touching deposit.');
  if (v2UnusedPortion > 0) {
    console.log(
      `3. Surplus unused rent (${fmtPaise(v2UnusedPortion)}) is refunded in the total UPI payout; V1 returns ₹0 of this.`,
    );
  } else if (noticeFromUnusedRentPaise > 0) {
    console.log(
      `3. ₹${paiseToInr(noticeFromUnusedRentPaise)} of notice is correctly funded from prepaid rent — V1 would charge that amount to deposit instead.`,
    );
  } else {
    console.log('3. No unused rent remains after notice — deposit bears the full notice remainder.');
  }
  console.log('4. Admin approval, resident eligibility, and payout all use the same total_refund_paise snapshot.');
  console.log('5. Every step is auditable in settlement_waterfall_json.');

  if (settlementFields?.amountsLocked) {
    console.log('\nNOTE: Settlement amounts are LOCKED — stored final_refund_paise is authoritative.');
    console.log(`  Stored final_refund_paise: ${fmtPaise(settlementFields.finalRefundPaise ?? 0)}`);
  }

  console.log('\n' + '='.repeat(72));
  console.log('END — no database writes performed');
  console.log('='.repeat(72));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
