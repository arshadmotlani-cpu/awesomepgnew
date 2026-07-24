/**
 * Move-out settlement explainability SSOT — every displayed amount must have
 * value, formula, business rule, and source. Unexplainable values are bugs.
 */
import { paiseToInr } from '@/src/lib/format';
import { assertCheckoutSettlementWaterfallConsistent } from '@/src/lib/checkout/settlementInvariants';
import { formatSettlementPaise } from '@/src/lib/checkout/settlementDisplayFormat';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import type { VacatingBillingPresentation } from '@/src/lib/vacating/loadVacatingBillingPresentation';

export const SETTLEMENT_EXPLANATION_LINE_IDS = [
  'rent_paid',
  'rent_consumed',
  'unused_rent',
  'notice_charge',
  'notice_from_unused_rent',
  'notice_from_deposit',
  'tail_rent',
  'refund_total',
  'deposit_refundable',
] as const;

export type SettlementExplanationLineId = (typeof SETTLEMENT_EXPLANATION_LINE_IDS)[number];

export type SettlementExplanationSource =
  | 'BookingMoneyBalances'
  | 'BillingCoverageModel'
  | 'CheckoutSettlementEngineV2'
  | 'NoticeDeductionEngine';

export type SettlementAmountExplanation = {
  id: SettlementExplanationLineId;
  label: string;
  valuePaise: number;
  valueDisplay: string;
  formula: string;
  businessRuleId: string;
  businessRule: string;
  source: SettlementExplanationSource;
  reasonLines: string[];
};

export type MoveOutSettlementExplanationReport = {
  bookingId: string;
  bookingCode: string;
  residentName: string;
  vacatingRequestId?: string;
  vacatingDate: string;
  lines: SettlementAmountExplanation[];
};

export type SettlementExplanationFailure = {
  code: string;
  message: string;
  lineId?: SettlementExplanationLineId;
  signature: string;
};

export type SettlementExplanationValidation = {
  ok: boolean;
  failures: SettlementExplanationFailure[];
};

export const SETTLEMENT_BUSINESS_RULES = {
  RULE_RENT_PAID_TOTAL: {
    id: 'RULE_RENT_PAID_TOTAL',
    prose:
      'Rent paid is total rent received on the booking ledger (checkout + monthly payments), before move-out allocation.',
  },
  RULE_RENT_CONSUMED_CAP: {
    id: 'RULE_RENT_CONSUMED_CAP',
    prose:
      'Rent consumed is stay days × daily rent (monthly ÷ 30), capped at rent paid — you cannot consume more rent than was collected.',
  },
  RULE_UNUSED_RENT: {
    id: 'RULE_UNUSED_RENT',
    prose: 'Unused rent is rent paid minus rent consumed for the actual stay (inclusive check-in through vacating date).',
  },
  RULE_NOTICE_CHARGE: {
    id: 'RULE_NOTICE_CHARGE',
    prose:
      'When notice applies, missing notice days × daily rent is the full notice charge (from NoticeDeductionEngine / billing coverage).',
  },
  RULE_NOTICE_FROM_UNUSED_FIRST: {
    id: 'RULE_NOTICE_FROM_UNUSED_FIRST',
    prose:
      'Settlement order: notice charge is applied to the rent bucket first (unused rent), then any remainder from deposit.',
  },
  RULE_NOTICE_FROM_DEPOSIT: {
    id: 'RULE_NOTICE_FROM_DEPOSIT',
    prose: 'Notice remainder after unused rent is deducted from the deposit escrow balance.',
  },
  RULE_TAIL_FROM_FINAL_PERIOD: {
    id: 'RULE_TAIL_FROM_FINAL_PERIOD',
    prose:
      'When final anniversary rent invoice is suppressed for approved move-out, tail days through vacate are collected via deposit (BillingCoverageModel.tailRent).',
  },
  RULE_DEPOSIT_REFUNDABLE: {
    id: 'RULE_DEPOSIT_REFUNDABLE',
    prose:
      'Refundable deposit is deposit held minus notice-from-deposit, tail rent, electricity, and other checkout deductions.',
  },
  RULE_REFUND_TOTAL: {
    id: 'RULE_REFUND_TOTAL',
    prose: 'Total refund is refundable deposit plus unused rent credit remaining after notice (single resident payout).',
  },
} as const;

function billingContextReasons(presentation: VacatingBillingPresentation): string[] {
  const { coverage, noticeDisplay } = presentation;
  const lines: string[] = [];
  if (coverage.currentBillingPeriod) {
    lines.push(
      `Billing period: ${coverage.currentBillingPeriod.periodStart} → ${coverage.currentBillingPeriod.periodEnd}`,
    );
  } else if (noticeDisplay.billingCycleLabel && noticeDisplay.billingCycleLabel !== '—') {
    lines.push(`Billing cycle: ${noticeDisplay.billingCycleLabel}`);
  }
  if (coverage.vacatingDate) {
    lines.push(`Vacating: ${coverage.vacatingDate}`);
  }
  if (noticeDisplay.paidUntilDate) {
    lines.push(`Paid until: ${noticeDisplay.paidUntilDate}`);
  }
  return lines;
}

function line(
  id: SettlementExplanationLineId,
  label: string,
  valuePaise: number,
  formula: string,
  rule: (typeof SETTLEMENT_BUSINESS_RULES)[keyof typeof SETTLEMENT_BUSINESS_RULES],
  source: SettlementExplanationSource,
  reasonLines: string[],
): SettlementAmountExplanation {
  const n = Math.max(0, Math.round(valuePaise));
  return {
    id,
    label,
    valuePaise: n,
    valueDisplay: paiseToInr(n),
    formula,
    businessRuleId: rule.id,
    businessRule: rule.prose,
    source,
    reasonLines,
  };
}

export function buildMoveOutSettlementExplanations(
  presentation: VacatingBillingPresentation,
  meta: { bookingId: string; bookingCode: string; residentName: string; vacatingRequestId?: string },
): MoveOutSettlementExplanationReport {
  const w = presentation.waterfall;
  const { coverage, ctx } = presentation;
  const reasons = billingContextReasons(presentation);
  const stayDays = w.stay.stayDays;
  const daily = w.rentBucket.dailyRentPaise;
  const rentPaid = w.rentBucket.paidPaise;
  const consumedRaw = daily * stayDays;

  const lines: SettlementAmountExplanation[] = [
    line(
      'rent_paid',
      'Rent paid',
      rentPaid,
      `Total rent received = ${paiseToInr(rentPaid)}`,
      SETTLEMENT_BUSINESS_RULES.RULE_RENT_PAID_TOTAL,
      'BookingMoneyBalances',
      reasons,
    ),
    line(
      'rent_consumed',
      'Rent used',
      w.rentBucket.consumedPaise,
      `min(rent paid ${paiseToInr(rentPaid)}, stayDays ${stayDays} × daily ${paiseToInr(daily)} = ${paiseToInr(consumedRaw)}) = ${paiseToInr(w.rentBucket.consumedPaise)}`,
      SETTLEMENT_BUSINESS_RULES.RULE_RENT_CONSUMED_CAP,
      'CheckoutSettlementEngineV2',
      [
        `Stay: ${w.stay.checkInDate} → ${w.stay.checkoutDate} (${stayDays} days)`,
        ...reasons,
      ],
    ),
    line(
      'unused_rent',
      'Unused rent',
      w.rentBucket.unusedPaise,
      `${paiseToInr(rentPaid)} − ${paiseToInr(w.rentBucket.consumedPaise)} = ${paiseToInr(w.rentBucket.unusedPaise)}`,
      SETTLEMENT_BUSINESS_RULES.RULE_UNUSED_RENT,
      'CheckoutSettlementEngineV2',
      reasons,
    ),
    line(
      'notice_charge',
      'Notice charge',
      w.notice.fullPaise,
      w.notice.missingNoticeDays > 0
        ? `missingNoticeDays ${w.notice.missingNoticeDays} × daily ${paiseToInr(daily)} = ${paiseToInr(w.notice.fullPaise)}`
        : `Notice satisfied — charge ${paiseToInr(0)}`,
      SETTLEMENT_BUSINESS_RULES.RULE_NOTICE_CHARGE,
      'NoticeDeductionEngine',
      [
        `Notice given: ${presentation.noticeDisplay.noticeGivenDays ?? '—'} days`,
        `Required: ${presentation.noticeDisplay.noticeRequiredDays ?? 14} days`,
        ...reasons,
      ],
    ),
    line(
      'notice_from_unused_rent',
      'Notice covered by unused rent',
      w.notice.fromUnusedRentPaise,
      `min(unused rent ${paiseToInr(w.rentBucket.unusedPaise)}, notice charge ${paiseToInr(w.notice.fullPaise)}) = ${paiseToInr(w.notice.fromUnusedRentPaise)}`,
      SETTLEMENT_BUSINESS_RULES.RULE_NOTICE_FROM_UNUSED_FIRST,
      'CheckoutSettlementEngineV2',
      reasons,
    ),
    line(
      'notice_from_deposit',
      'Deposit deduction (notice)',
      w.notice.fromDepositPaise,
      `max(0, notice ${paiseToInr(w.notice.fullPaise)} − from unused rent ${paiseToInr(w.notice.fromUnusedRentPaise)}) = ${paiseToInr(w.notice.fromDepositPaise)}`,
      SETTLEMENT_BUSINESS_RULES.RULE_NOTICE_FROM_DEPOSIT,
      'CheckoutSettlementEngineV2',
      reasons,
    ),
    line(
      'tail_rent',
      'Tail rent',
      w.depositBucket.tailRentPaise,
      coverage.tailRent.tailDays > 0
        ? `tailDays ${coverage.tailRent.tailDays} × daily ${paiseToInr(daily)} = ${paiseToInr(w.depositBucket.tailRentPaise)} (final invoice suppressed: ${coverage.finalInvoiceSuppression})`
        : `No tail rent — ${coverage.tailRent.cancellationReason ?? 'vacate inside paid period or on period end'}`,
      SETTLEMENT_BUSINESS_RULES.RULE_TAIL_FROM_FINAL_PERIOD,
      'BillingCoverageModel',
      [
        ...(coverage.tailRent.tailPeriodStart && coverage.tailRent.tailPeriodEnd
          ? [`Tail period: ${coverage.tailRent.tailPeriodStart} → ${coverage.tailRent.tailPeriodEnd}`]
          : []),
        ...reasons,
      ],
    ),
    line(
      'deposit_refundable',
      'Deposit remaining',
      w.depositBucket.refundablePaise,
      `${paiseToInr(ctx.depositHeldPaise)} − notice deposit ${paiseToInr(w.notice.fromDepositPaise)} − tail ${paiseToInr(w.depositBucket.tailRentPaise)} − electricity ${paiseToInr(w.depositBucket.electricityPaise)} − other ${paiseToInr(w.depositBucket.otherPaise)} = ${paiseToInr(w.depositBucket.refundablePaise)}`,
      SETTLEMENT_BUSINESS_RULES.RULE_DEPOSIT_REFUNDABLE,
      'CheckoutSettlementEngineV2',
      reasons,
    ),
    line(
      'refund_total',
      'Refund',
      w.refund.totalPaise,
      `${paiseToInr(w.depositBucket.refundablePaise)} (deposit remaining) + ${paiseToInr(w.notice.unusedRentRemainingPaise)} (unused rent after notice) = ${paiseToInr(w.refund.totalPaise)}`,
      SETTLEMENT_BUSINESS_RULES.RULE_REFUND_TOTAL,
      'CheckoutSettlementEngineV2',
      reasons,
    ),
  ];

  return {
    bookingId: meta.bookingId,
    bookingCode: meta.bookingCode,
    residentName: meta.residentName,
    vacatingRequestId: meta.vacatingRequestId,
    vacatingDate: coverage.vacatingDate ?? w.stay.checkoutDate,
    lines,
  };
}

function fail(
  code: string,
  message: string,
  signature: string,
  lineId?: SettlementExplanationLineId,
): SettlementExplanationFailure {
  return { code, message, signature, lineId };
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

export function validateMoveOutSettlementExplanations(
  report: MoveOutSettlementExplanationReport,
  presentation: VacatingBillingPresentation,
  opts?: { storedNoticeDeductionPaise?: number | null },
): SettlementExplanationValidation {
  const failures: SettlementExplanationFailure[] = [];
  const w = presentation.waterfall;
  const preview = presentation.estimatedSettlement;
  const { coverage } = presentation;

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
  }

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

  const waterfallById: Record<SettlementExplanationLineId, number> = {
    rent_paid: w.rentBucket.paidPaise,
    rent_consumed: w.rentBucket.consumedPaise,
    unused_rent: w.rentBucket.unusedPaise,
    notice_charge: w.notice.fullPaise,
    notice_from_unused_rent: w.notice.fromUnusedRentPaise,
    notice_from_deposit: w.notice.fromDepositPaise,
    tail_rent: w.depositBucket.tailRentPaise,
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

  if (w.depositBucket.tailRentPaise !== coverage.tailRentPaise) {
    failures.push(
      fail(
        'TAIL_MISMATCH',
        `Waterfall tail ${w.depositBucket.tailRentPaise} !== BillingCoverageModel ${coverage.tailRentPaise}`,
        'TAIL_MISMATCH',
      ),
    );
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

export function groupFailuresBySignature(
  items: Array<{ bookingCode: string; failures: SettlementExplanationFailure[] }>,
): Map<string, { count: number; bookingCodes: string[]; sample: string }> {
  const map = new Map<string, { count: number; bookingCodes: string[]; sample: string }>();
  for (const item of items) {
    for (const f of item.failures) {
      const sig = f.signature;
      const entry = map.get(sig) ?? { count: 0, bookingCodes: [], sample: f.message };
      entry.count += 1;
      if (!entry.bookingCodes.includes(item.bookingCode)) {
        entry.bookingCodes.push(item.bookingCode);
      }
      map.set(sig, entry);
    }
  }
  return map;
}
