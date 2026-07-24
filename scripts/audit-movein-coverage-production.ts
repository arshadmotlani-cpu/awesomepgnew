#!/usr/bin/env npx tsx
/**
 * Production audit — BR-MOVEIN-COVERAGE paid coverage + refund delta vs pre-fix.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/audit-movein-coverage-production.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, ne, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-movein-coverage-production.ts');

import { closeDb, db } from '@/src/db/client';
import { bookings, vacatingRequests } from '@/src/db/schema';
import {
  buildBillingCoverageModel,
  clampPaidInvoiceCoverage,
  expandMoveInCheckoutPeriodCoverage,
} from '@/src/lib/billing/billingCoverageModel';
import { computeCheckoutSettlementV2 } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { noticeDeductionAppliesToBooking } from '@/src/lib/checkout/noticeDeductionPolicy';
import { resolveAnniversaryPeriodContainingDate } from '@/src/lib/billing/vacatingFinalPeriodRent';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import {
  loadBillingCoverageRawPeriods,
  type BillingCoveragePeriod,
} from '@/src/services/billingCoverage';

type RiskTag =
  | 'partial_deposit'
  | 'custom_deposit_below_contract'
  | 'legacy_movein_invoice'
  | 'first_cycle_invoice'
  | 'moveout_in_first_billing_cycle'
  | 'movein_day_clamp_candidate';

type BookingAuditRow = {
  bookingCode: string;
  bookingId: string;
  moveInDate: string | null;
  billingDay: number;
  depositRequiredPaise: number;
  depositReceivedPaise: number;
  depositDuePaise: number;
  rentReceivedPaise: number;
  monthlyRentPaise: number;
  tags: RiskTag[];
  paidCoverageBefore: BillingCoveragePeriod[];
  paidCoverageAfter: BillingCoveragePeriod[];
  expansionApplied: boolean;
  vacatingDate: string | null;
  vacatingStatus: string | null;
  refundBeforePaise: number | null;
  refundAfterPaise: number | null;
  refundDeltaPaise: number | null;
  tailBeforePaise: number | null;
  tailAfterPaise: number | null;
  coverageNotes: string[];
};

function firstResidencyPeriodEnd(moveIn: string, billingDay: number): string | null {
  const anchor = resolveAnniversaryPeriodContainingDate({
    date: formatDate(addDays(moveIn, 1)),
    billingDay,
    moveInDate: moveIn,
  });
  return anchor?.periodStart === moveIn ? anchor.periodEnd : null;
}

function classifyTags(args: {
  moveIn: string | null;
  billingDay: number;
  rawPeriods: BillingCoveragePeriod[];
  clamped: BillingCoveragePeriod[];
  expanded: BillingCoveragePeriod[];
  depositRequired: number;
  depositReceived: number;
  depositDue: number;
  rentReceived: number;
  monthlyRent: number;
  vacatingDate: string | null;
}): { tags: RiskTag[]; notes: string[]; expansionApplied: boolean } {
  const tags = new Set<RiskTag>();
  const notes: string[] = [];

  if (args.depositDue > 0 || args.depositReceived < args.depositRequired) {
    tags.add('partial_deposit');
  }
  if (args.depositReceived > 0 && args.depositReceived < args.depositRequired) {
    tags.add('custom_deposit_below_contract');
  }

  if (args.moveIn) {
    const moveIn = formatDate(parseDate(args.moveIn));
    for (const raw of args.rawPeriods) {
      if (raw.source !== 'rent_invoice') continue;
      const rawStart = formatDate(parseDate(raw.periodStart));
      const rawEnd = formatDate(parseDate(raw.periodEnd));
      if (rawEnd === moveIn && rawStart < moveIn) {
        tags.add('legacy_movein_invoice');
        notes.push(`Invoice window ${rawStart}→${rawEnd} ends on move-in`);
      }
      if (rawEnd === moveIn) {
        tags.add('first_cycle_invoice');
      }
    }

    const clampSingleDay = args.clamped.some(
      (p) => p.periodStart === moveIn && p.periodEnd === moveIn,
    );
    if (clampSingleDay) {
      tags.add('movein_day_clamp_candidate');
    }

    const residencyEnd = firstResidencyPeriodEnd(moveIn, args.billingDay);
    if (residencyEnd && args.vacatingDate) {
      const vac = formatDate(parseDate(args.vacatingDate));
      if (moveIn <= vac && vac <= residencyEnd) {
        tags.add('moveout_in_first_billing_cycle');
      }
    }
  }

  const expansionApplied =
    JSON.stringify(args.clamped) !== JSON.stringify(args.expanded);
  if (expansionApplied) {
    notes.push('BR-MOVEIN-COVERAGE expanded paid window');
  }

  return { tags: [...tags], notes, expansionApplied };
}

async function refundForCoverage(args: {
  bookingId: string;
  moveIn: string;
  billingDay: number;
  rawPeriods: BillingCoveragePeriod[];
  vacatingDate: string;
  noticeGivenDate: string;
  monthlyRentPaise: number;
  rentReceivedPaise: number;
  stayType: string | null;
  durationMode: string | null;
  skipExpansion: boolean;
}): Promise<{ refund: number; tail: number }> {
  const coverage = buildBillingCoverageModel({
    bookingId: args.bookingId,
    moveInDate: args.moveIn,
    billingDay: args.billingDay,
    rawPaidPeriods: args.rawPeriods,
    vacatingDate: args.vacatingDate,
    noticeGivenDate: args.noticeGivenDate,
    monthlyRentPaise: args.monthlyRentPaise,
    rentReceivedPaise: args.rentReceivedPaise,
    treatAsApprovedForTail: true,
    skipMoveInCoverageExpansion: args.skipExpansion,
    noticeApplies: noticeDeductionAppliesToBooking({
      stayType: args.stayType,
      durationMode: args.durationMode,
    }),
  });

  const [money, wallet] = await Promise.all([
    getBookingMoneyBalances(args.bookingId),
    getDepositSummaryForBooking(args.bookingId),
  ]);

  const w = computeCheckoutSettlementV2({
    stayCheckInDate: args.moveIn,
    stayCheckoutDate: args.vacatingDate,
    rentPaidPaise: money.rent.receivedPaise,
    monthlyRentPaise: args.monthlyRentPaise,
    depositCollectedPaise: wallet.refundableBalancePaise,
    missingNoticeDays: coverage.noticeBreakdown?.missingNoticeDays ?? 0,
    checkoutTailRentPaise: coverage.tailRentPaise,
    noticeApplies: noticeDeductionAppliesToBooking({
      stayType: args.stayType,
      durationMode: args.durationMode,
    }),
  });

  return { refund: w.refund.totalPaise, tail: w.depositBucket.tailRentPaise };
}

async function main() {
  const bookingRows = await db.execute<{
    id: string;
    booking_code: string;
    deposit_paise: number;
    deposit_due_paise: number;
    subtotal_paise: number;
    stay_type: string | null;
    duration_mode: string | null;
    status: string;
  }>(sql`
    SELECT id, booking_code,
      deposit_paise::bigint::int,
      coalesce(deposit_due_paise, 0)::bigint::int AS deposit_due_paise,
      subtotal_paise::bigint::int,
      stay_type, duration_mode, status
    FROM bookings
    WHERE status IN ('confirmed', 'completed', 'pending_payment')
    ORDER BY booking_code
  `);

  const vacatingByBooking = await db
    .select({
      bookingId: vacatingRequests.bookingId,
      vacatingDate: vacatingRequests.vacatingDate,
      noticeGivenDate: vacatingRequests.noticeGivenDate,
      status: vacatingRequests.status,
      monthlyRentPaiseSnapshot: vacatingRequests.monthlyRentPaiseSnapshot,
    })
    .from(vacatingRequests)
    .where(ne(vacatingRequests.status, 'rejected'));

  const vacatingMap = new Map<string, (typeof vacatingByBooking)[0]>();
  for (const v of vacatingByBooking) {
    if (!vacatingMap.has(v.bookingId)) vacatingMap.set(v.bookingId, v);
  }

  const audited: BookingAuditRow[] = [];
  const refundChanged: BookingAuditRow[] = [];

  for (const b of bookingRows) {
    const rawLoad = await loadBillingCoverageRawPeriods(b.id);
    if (!rawLoad.moveInDate) continue;

    const money = await getBookingMoneyBalances(b.id);
    const monthlyRent =
      vacatingMap.get(b.id)?.monthlyRentPaiseSnapshot ?? b.subtotal_paise;
    const moveIn = rawLoad.moveInDate;
    const billingDay = rawLoad.billingDay;

    const clamped = clampPaidInvoiceCoverage(rawLoad.rawPaidPeriods, moveIn);
    const expanded = expandMoveInCheckoutPeriodCoverage(clamped, rawLoad.rawPaidPeriods, {
      moveInDate: moveIn,
      billingDay,
      monthlyRentPaise: monthlyRent,
      rentReceivedPaise: money.rent.receivedPaise,
    });

    const vac = vacatingMap.get(b.id);
    const { tags, notes, expansionApplied } = classifyTags({
      moveIn,
      billingDay,
      rawPeriods: rawLoad.rawPaidPeriods,
      clamped,
      expanded,
      depositRequired: b.deposit_paise,
      depositReceived: money.deposit.receivedPaise,
      depositDue: b.deposit_due_paise,
      rentReceived: money.rent.receivedPaise,
      monthlyRent,
      vacatingDate: vac ? String(vac.vacatingDate) : null,
    });

    const isRisk = tags.length > 0;
    if (!isRisk) continue;

    let refundBefore: number | null = null;
    let refundAfter: number | null = null;
    let tailBefore: number | null = null;
    let tailAfter: number | null = null;

    if (vac) {
      const base = {
        bookingId: b.id,
        moveIn,
        billingDay,
        rawPeriods: rawLoad.rawPaidPeriods,
        vacatingDate: String(vac.vacatingDate),
        noticeGivenDate: String(vac.noticeGivenDate),
        monthlyRentPaise: vac.monthlyRentPaiseSnapshot ?? monthlyRent,
        rentReceivedPaise: money.rent.receivedPaise,
        stayType: b.stay_type,
        durationMode: b.duration_mode,
      };
      const before = await refundForCoverage({ ...base, skipExpansion: true });
      const after = await refundForCoverage({ ...base, skipExpansion: false });
      refundBefore = before.refund;
      refundAfter = after.refund;
      tailBefore = before.tail;
      tailAfter = after.tail;
    }

    const row: BookingAuditRow = {
      bookingCode: b.booking_code,
      bookingId: b.id,
      moveInDate: moveIn,
      billingDay,
      depositRequiredPaise: b.deposit_paise,
      depositReceivedPaise: money.deposit.receivedPaise,
      depositDuePaise: b.deposit_due_paise,
      rentReceivedPaise: money.rent.receivedPaise,
      monthlyRentPaise: monthlyRent,
      tags,
      paidCoverageBefore: clamped,
      paidCoverageAfter: expanded,
      expansionApplied,
      vacatingDate: vac ? String(vac.vacatingDate) : null,
      vacatingStatus: vac?.status ?? null,
      refundBeforePaise: refundBefore,
      refundAfterPaise: refundAfter,
      refundDeltaPaise:
        refundBefore != null && refundAfter != null ? refundAfter - refundBefore : null,
      tailBeforePaise: tailBefore,
      tailAfterPaise: tailAfter,
      coverageNotes: notes,
    };

    audited.push(row);
    if (row.refundDeltaPaise != null && row.refundDeltaPaise !== 0) {
      refundChanged.push(row);
    }
  }

  await closeDb();

  const artifact = {
    generatedAt: new Date().toISOString(),
    rule: 'BR-MOVEIN-COVERAGE',
    summary: {
      riskBookingsScanned: audited.length,
      withVacating: audited.filter((r) => r.vacatingDate).length,
      expansionAppliedCount: audited.filter((r) => r.expansionApplied).length,
      refundChangedCount: refundChanged.length,
    },
    refundChanged: refundChanged.map((r) => ({
      bookingCode: r.bookingCode,
      tags: r.tags,
      vacatingDate: r.vacatingDate,
      depositHeldPaise: r.depositReceivedPaise,
      refundBeforePaise: r.refundBeforePaise,
      refundAfterPaise: r.refundAfterPaise,
      refundDeltaPaise: r.refundDeltaPaise,
      tailBeforePaise: r.tailBeforePaise,
      tailAfterPaise: r.tailAfterPaise,
      paidCoverageBefore: r.paidCoverageBefore,
      paidCoverageAfter: r.paidCoverageAfter,
      coverageNotes: r.coverageNotes,
    })),
    allRiskBookings: audited,
  };

  const outDir = join(process.cwd(), 'docs', 'validation');
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, 'movein-coverage-production-audit.json');
  writeFileSync(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  console.log('='.repeat(72));
  console.log('BR-MOVEIN-COVERAGE production audit');
  console.log('='.repeat(72));
  console.log(`Risk-tagged bookings: ${audited.length}`);
  console.log(`Expansion applied: ${artifact.summary.expansionAppliedCount}`);
  console.log(`Refunds changed (with vacating): ${refundChanged.length}`);
  console.log('');

  if (refundChanged.length === 0) {
    console.log('No bookings with refund delta after BR-MOVEIN-COVERAGE.');
  } else {
    console.log('Bookings whose estimated refund changed:');
    for (const r of refundChanged) {
      console.log(
        `  ${r.bookingCode}  ${paiseToInr(r.refundBeforePaise ?? 0)} → ${paiseToInr(r.refundAfterPaise ?? 0)} (Δ ${paiseToInr(r.refundDeltaPaise ?? 0)})  tail ${r.tailBeforePaise}→${r.tailAfterPaise}  tags: ${r.tags.join(', ')}`,
      );
    }
  }

  console.log('');
  console.log('Coverage-only (expansion, no vacating refund):');
  for (const r of audited.filter((x) => x.expansionApplied && !x.vacatingDate)) {
    console.log(`  ${r.bookingCode}  before: ${JSON.stringify(r.paidCoverageBefore)}  after: ${JSON.stringify(r.paidCoverageAfter)}`);
  }

  console.log('');
  console.log(`Full artifact: ${jsonPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
