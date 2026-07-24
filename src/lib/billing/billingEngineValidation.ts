/**
 * Unified billing engine invariant runner — settlement invalid if any check fails.
 */
import { clampPaidInvoiceCoverage } from '@/src/lib/billing/billingCoverageModel';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { assertCheckoutSettlementWaterfallConsistent } from '@/src/lib/checkout/settlementInvariants';
import { formatSettlementPaise } from '@/src/lib/checkout/settlementDisplayFormat';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import type { VacatingBillingPresentation } from '@/src/lib/vacating/loadVacatingBillingPresentation';
import type {
  MoveOutSettlementExplanationReport,
  SettlementExplanationFailure,
  SettlementExplanationLineId,
  SettlementExplanationValidation,
} from '@/src/lib/vacating/moveOutSettlementExplanation';
import { SETTLEMENT_EXPLANATION_LINE_IDS } from '@/src/lib/vacating/moveOutSettlementExplanation';

export type BillingEngineValidationOptions = {
  storedNoticeDeductionPaise?: number | null;
  /** When set, assert presentation waterfall matches this locked checkout waterfall (INV-X1). */
  lockedWaterfall?: CheckoutSettlementWaterfall | null;
  /** Skip explainability / UI parity (math-only). */
  skipExplainability?: boolean;
};

function fail(
  code: string,
  message: string,
  signature: string,
  lineId?: SettlementExplanationLineId,
): SettlementExplanationFailure {
  return { code, message, signature, lineId };
}

function collectWaterfallPaise(w: CheckoutSettlementWaterfall): number[] {
  return [
    w.rentBucket.paidPaise,
    w.rentBucket.consumedPaise,
    w.rentBucket.unusedPaise,
    w.rentBucket.dailyRentPaise,
    w.notice.fullPaise,
    w.notice.fromUnusedRentPaise,
    w.notice.fromDepositPaise,
    w.notice.unusedRentRemainingPaise,
    w.depositBucket.collectedPaise,
    w.depositBucket.electricityPaise,
    w.depositBucket.tailRentPaise,
    w.depositBucket.otherPaise,
    w.depositBucket.refundablePaise,
    w.refund.depositPortionPaise,
    w.refund.unusedRentPortionPaise,
    w.refund.totalPaise,
  ];
}

function datesInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = parseDate(start);
  const last = parseDate(end);
  for (let i = 0; i < 400; i += 1) {
    const s = formatDate(cur);
    out.push(s);
    if (s >= end) break;
    cur = addDays(cur, 1);
    if (formatDate(cur) > formatDate(last) && s >= end) break;
  }
  return out;
}

function dateInPaidCoverage(
  date: string,
  periods: Array<{ periodStart: string; periodEnd: string }>,
): boolean {
  return periods.some((p) => p.periodStart <= date && date <= p.periodEnd);
}

function findPreviewRow(preview: EstimatedSettlementPreview, rowId: string): string | undefined {
  for (const section of preview.sections) {
    const row = section.rows.find((r) => r.id === rowId);
    if (row) return row.value;
  }
  return undefined;
}

function displayMatchesPaise(display: string | undefined, paise: number, deduct = false): boolean {
  if (display === undefined) return false;
  const expected = formatSettlementPaise(paise, deduct);
  if (display.trim() === expected.trim()) return true;
  return display.includes(expected.replace(/^−/, ''));
}

function assertNoticeInvariants(
  w: CheckoutSettlementWaterfall,
  noticeApplies: boolean,
  failures: SettlementExplanationFailure[],
): void {
  if (!noticeApplies) {
    if (w.notice.fullPaise !== 0 || w.notice.fromDepositPaise !== 0) {
      failures.push(
        fail(
          'NOTICE_SPLIT_MISMATCH',
          'Fixed-stay: notice buckets must be zero',
          'NOTICE_SPLIT_MISMATCH',
        ),
      );
    }
    return;
  }
  const full = guardDepositPaise(w.notice.fullPaise);
  const fromUnused = guardDepositPaise(w.notice.fromUnusedRentPaise);
  const fromDeposit = guardDepositPaise(w.notice.fromDepositPaise);
  if (full !== fromUnused + fromDeposit) {
    failures.push(
      fail(
        'NOTICE_SPLIT_MISMATCH',
        `notice full ${full} !== fromUnused ${fromUnused} + fromDeposit ${fromDeposit}`,
        'NOTICE_SPLIT_MISMATCH',
      ),
    );
  }
  const unused = guardDepositPaise(w.rentBucket.unusedPaise);
  if (fromUnused > Math.min(unused, full)) {
    failures.push(
      fail(
        'NOTICE_UNUSED_CAP',
        `notice from unused ${fromUnused} > min(unused ${unused}, full ${full})`,
        'NOTICE_UNUSED_CAP',
      ),
    );
  }
}

function assertCoverageInvariants(
  presentation: VacatingBillingPresentation,
  failures: SettlementExplanationFailure[],
): void {
  const { coverage, waterfall: w } = presentation;
  const clamped = clampPaidInvoiceCoverage(
    coverage.paidInvoiceCoverage,
    coverage.moveInDate,
  );
  for (const p of clamped) {
    if (p.periodStart < coverage.moveInDate) {
      failures.push(
        fail(
          'COVERAGE_BEFORE_MOVEIN',
          `Paid coverage starts ${p.periodStart} before move-in ${coverage.moveInDate}`,
          'COVERAGE_BEFORE_MOVEIN',
        ),
      );
    }
  }

  if (w.depositBucket.tailRentPaise !== coverage.tailRentPaise) {
    failures.push(
      fail(
        'TAIL_MISMATCH',
        `Waterfall tail ${w.depositBucket.tailRentPaise} !== BCM ${coverage.tailRentPaise}`,
        'TAIL_MISMATCH',
      ),
    );
  }

  const vac = coverage.vacatingDate;
  if (vac && w.depositBucket.tailRentPaise > 0) {
    const insidePaid = coverage.paidInvoiceCoverage.some(
      (p) => p.periodStart <= vac && vac <= p.periodEnd,
    );
    if (insidePaid) {
      failures.push(
        fail(
          'TAIL_IN_PAID_PERIOD',
          `Tail ${w.depositBucket.tailRentPaise} but vacate ${vac} inside paid window`,
          'TAIL_IN_PAID_PERIOD',
        ),
      );
    }
  }

  const tailStart = coverage.tailRent.tailPeriodStart;
  const tailEnd = coverage.tailRent.tailPeriodEnd;
  if (w.depositBucket.tailRentPaise > 0 && tailStart && tailEnd) {
    for (const d of datesInclusive(tailStart, tailEnd)) {
      if (dateInPaidCoverage(d, coverage.paidInvoiceCoverage)) {
        failures.push(
          fail(
            'TAIL_OVERLAP_PAID',
            `Tail day ${d} overlaps paid invoice coverage`,
            'TAIL_OVERLAP_PAID',
          ),
        );
        break;
      }
    }
  }

  const coverageMissing = coverage.noticeBreakdown?.missingNoticeDays ?? 0;
  if (w.notice.missingNoticeDays !== coverageMissing) {
    failures.push(
      fail(
        'NOTICE_DAYS_DRIFT',
        `Waterfall missingNoticeDays ${w.notice.missingNoticeDays} !== coverage ${coverageMissing}`,
        'NOTICE_DAYS_DRIFT',
      ),
    );
  }
}

function assertExplainabilityInvariants(
  report: MoveOutSettlementExplanationReport,
  presentation: VacatingBillingPresentation,
  failures: SettlementExplanationFailure[],
): void {
  const w = presentation.waterfall;
  const preview = presentation.estimatedSettlement;

  for (const requiredId of SETTLEMENT_EXPLANATION_LINE_IDS) {
    const found = report.lines.find((l) => l.id === requiredId);
    if (!found) {
      failures.push(
        fail('EXPLANATION_GAP', `Missing explanation for ${requiredId}`, 'EXPLANATION_GAP', requiredId),
      );
      continue;
    }
    if (!found.formula.trim() || !found.businessRule.trim() || !found.source) {
      failures.push(
        fail(
          'EXPLANATION_GAP',
          `Incomplete explanation for ${requiredId}`,
          'EXPLANATION_GAP',
          requiredId,
        ),
      );
    }
    if (found.valuePaise === 0) {
      const hasReason = found.reasonLines.some((r) => r.trim().length > 0);
      if (!hasReason) {
        failures.push(
          fail(
            'ZERO_WITHOUT_REASON',
            `${requiredId} is ₹0 without reasonLines`,
            'ZERO_WITHOUT_REASON',
            requiredId,
          ),
        );
      }
    }
  }

  const waterfallById: Partial<Record<SettlementExplanationLineId, number>> = {
    rent_paid: w.rentBucket.paidPaise,
    rent_consumed: w.rentBucket.consumedPaise,
    unused_rent: w.rentBucket.unusedPaise,
    notice_charge: w.notice.fullPaise,
    notice_from_unused_rent: w.notice.fromUnusedRentPaise,
    notice_from_deposit: w.notice.fromDepositPaise,
    tail_rent: w.depositBucket.tailRentPaise,
    electricity_deduction: w.depositBucket.electricityPaise,
    other_deductions: w.depositBucket.otherPaise,
    refund_total: w.refund.totalPaise,
    deposit_refundable: w.depositBucket.refundablePaise,
  };

  for (const line of report.lines) {
    const expected = waterfallById[line.id];
    if (expected !== undefined && line.valuePaise !== expected) {
      failures.push(
        fail(
          'EXPLANATION_VALUE_MISMATCH',
          `${line.id}: explained ${line.valuePaise} !== waterfall ${expected}`,
          'EXPLANATION_VALUE_MISMATCH',
          line.id,
        ),
      );
    }
  }

  const uiChecks: Array<{
    lineId: SettlementExplanationLineId;
    rowId: string;
    deduct?: boolean;
  }> = [
    { lineId: 'rent_paid', rowId: 'rent_paid' },
    { lineId: 'rent_consumed', rowId: 'rent_consumed' },
    { lineId: 'unused_rent', rowId: 'unused_prepaid_rent' },
    { lineId: 'notice_from_deposit', rowId: 'notice_from_deposit', deduct: true },
    { lineId: 'tail_rent', rowId: 'tail_rent_through_vacate', deduct: true },
    { lineId: 'deposit_refundable', rowId: 'estimated_refundable_deposit' },
  ];

  for (const check of uiChecks) {
    const explained = report.lines.find((l) => l.id === check.lineId);
    if (!explained) continue;
    const uiValue = findPreviewRow(preview, check.rowId);
    if (uiValue === undefined) {
      if (check.lineId === 'tail_rent' && explained.valuePaise === 0) continue;
      failures.push(
        fail(
          'UI_ROW_MISSING',
          `Preview row ${check.rowId} missing for ${check.lineId}`,
          'UI_ROW_MISSING',
          check.lineId,
        ),
      );
      continue;
    }
    if (!displayMatchesPaise(uiValue, explained.valuePaise, check.deduct)) {
      failures.push(
        fail(
          'UI_ROW_MISMATCH',
          `${check.lineId}: UI "${uiValue}" !== ${formatSettlementPaise(explained.valuePaise, check.deduct)}`,
          'UI_ROW_MISMATCH',
          check.lineId,
        ),
      );
    }
  }

  if (preview.estimatedRefundPaise !== w.refund.totalPaise) {
    failures.push(
      fail(
        'UI_REFUND_MISMATCH',
        `Preview estimatedRefund ${preview.estimatedRefundPaise} !== waterfall refund ${w.refund.totalPaise}`,
        'UI_REFUND_MISMATCH',
      ),
    );
  }
}

function assertCheckoutPreviewDrift(
  presentation: VacatingBillingPresentation,
  locked: CheckoutSettlementWaterfall,
  failures: SettlementExplanationFailure[],
): void {
  const w = presentation.waterfall;
  const fields: Array<[string, number, number]> = [
    ['rentPaid', w.rentBucket.paidPaise, locked.rentBucket.paidPaise],
    ['rentConsumed', w.rentBucket.consumedPaise, locked.rentBucket.consumedPaise],
    ['unusedRent', w.rentBucket.unusedPaise, locked.rentBucket.unusedPaise],
    ['noticeFull', w.notice.fullPaise, locked.notice.fullPaise],
    ['tailRent', w.depositBucket.tailRentPaise, locked.depositBucket.tailRentPaise],
    ['electricity', w.depositBucket.electricityPaise, locked.depositBucket.electricityPaise],
    ['other', w.depositBucket.otherPaise, locked.depositBucket.otherPaise],
    ['refundTotal', w.refund.totalPaise, locked.refund.totalPaise],
  ];
  for (const [name, a, b] of fields) {
    if (a !== b) {
      failures.push(
        fail(
          'CHECKOUT_PREVIEW_DRIFT',
          `Locked vs presentation ${name}: ${a} !== ${b}`,
          'CHECKOUT_PREVIEW_DRIFT',
        ),
      );
    }
  }
}

export function validateBillingEngineSettlement(
  report: MoveOutSettlementExplanationReport,
  presentation: VacatingBillingPresentation,
  opts?: BillingEngineValidationOptions,
): SettlementExplanationValidation {
  const failures: SettlementExplanationFailure[] = [];
  const w = presentation.waterfall;
  const noticeApplies = presentation.ctx.noticeApplies !== false;

  try {
    assertCheckoutSettlementWaterfallConsistent(w);
  } catch (err) {
    failures.push(
      fail(
        'WATERFALL_INCONSISTENT',
        err instanceof Error ? err.message : String(err),
        'WATERFALL_INCONSISTENT',
      ),
    );
  }

  for (const p of collectWaterfallPaise(w)) {
    if (p < 0) {
      failures.push(
        fail('NEGATIVE_PAISE', `Negative waterfall amount: ${p}`, 'NEGATIVE_PAISE'),
      );
      break;
    }
  }

  assertNoticeInvariants(w, noticeApplies, failures);
  assertCoverageInvariants(presentation, failures);

  if (opts?.lockedWaterfall) {
    assertCheckoutPreviewDrift(presentation, opts.lockedWaterfall, failures);
  }

  if (!opts?.skipExplainability) {
    assertExplainabilityInvariants(report, presentation, failures);
  }

  if (opts?.storedNoticeDeductionPaise != null) {
    const stored = Math.max(0, Math.round(opts.storedNoticeDeductionPaise));
    const explainedNoticeDeposit = w.notice.fromDepositPaise;
    if (stored !== explainedNoticeDeposit && stored !== w.notice.fullPaise) {
      failures.push(
        fail(
          'STORED_ROW_DRIFT',
          `vacating_requests.deduction_paise ${stored} !== engine notice-from-deposit ${explainedNoticeDeposit} (full notice ${w.notice.fullPaise})`,
          'STORED_ROW_DRIFT',
        ),
      );
    }
  }

  return { ok: failures.length === 0, failures };
}

export function billingEngineStrictEnabled(): boolean {
  return process.env.BILLING_ENGINE_STRICT === '1';
}
