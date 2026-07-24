/**
 * Move-out settlement explainability SSOT — every displayed amount must have
 * value, formula, business rule, and source. Unexplainable values are bugs.
 */
import { validateBillingEngineSettlement } from '@/src/lib/billing/billingEngineValidation';
import { paiseToInr } from '@/src/lib/format';
import {
  PENDING_ELECTRICITY_LABEL,
  PENDING_OTHER_LABEL,
} from '@/src/lib/checkout/settlementDisplayFormat';
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
  'electricity_deduction',
  'other_deductions',
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
  RULE_ELECTRICITY_DEDUCTION: {
    id: 'RULE_ELECTRICITY_DEDUCTION',
    prose:
      'Electricity owed at checkout is deducted from deposit escrow when finalized (monthly ledger or checkout meter).',
  },
  RULE_OTHER_DEDUCTIONS: {
    id: 'RULE_OTHER_DEDUCTIONS',
    prose: 'Damage, cleaning, and custom checkout charges reduce refundable deposit via the other deductions bucket.',
  },
} as const;

function zeroAmountReasons(
  id: SettlementExplanationLineId,
  presentation: VacatingBillingPresentation,
  w: VacatingBillingPresentation['waterfall'],
): string[] {
  const mode = presentation.estimatedSettlement.mode;
  const noticeOff = presentation.ctx.noticeApplies === false;
  switch (id) {
    case 'unused_rent':
      return w.rentBucket.consumedPaise >= w.rentBucket.paidPaise
        ? ['Stay consumption equals or exceeds rent paid — no unused rent credit.']
        : ['No unused rent after stay allocation.'];
    case 'notice_charge':
      if (noticeOff) return ['Fixed-stay — notice charge does not apply.'];
      if (w.notice.missingNoticeDays === 0) return ['Notice period satisfied — no notice charge.'];
      return ['Notice charge is zero after prepaid coverage offsets.'];
    case 'notice_from_unused_rent':
      return w.notice.fullPaise === 0
        ? ['No notice charge to apply from unused rent.']
        : ['Entire notice charge taken from deposit — unused rent was zero or already allocated.'];
    case 'notice_from_deposit':
      return w.notice.fromDepositPaise === 0
        ? ['Notice fully covered by unused rent — no deposit notice deduction.']
        : [];
    case 'tail_rent':
      return [
        w.depositBucket.tailRentPaise === 0
          ? presentation.coverage.tailRent.cancellationReason ??
            'No tail rent — vacate inside paid period, on period end, or move-out not in final unpaid window.'
          : '',
      ].filter(Boolean);
    case 'electricity_deduction':
      if (w.depositBucket.electricityPaise > 0) return [];
      return mode === 'estimate'
        ? [`${PENDING_ELECTRICITY_LABEL} — not deducted in estimate until finalized.`]
        : ['No electricity deduction on deposit at settlement.'];
    case 'other_deductions':
      if (w.depositBucket.otherPaise > 0) return [];
      return mode === 'estimate'
        ? [`${PENDING_OTHER_LABEL} — no damage/cleaning entered yet.`]
        : ['No damage, cleaning, or custom deductions.'];
    case 'rent_paid':
    case 'rent_consumed':
    case 'deposit_refundable':
    case 'refund_total':
      return [];
    default:
      return [];
  }
}

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
    (() => {
      const l = line(
        'unused_rent',
        'Unused rent',
        w.rentBucket.unusedPaise,
        `${paiseToInr(rentPaid)} − ${paiseToInr(w.rentBucket.consumedPaise)} = ${paiseToInr(w.rentBucket.unusedPaise)}`,
        SETTLEMENT_BUSINESS_RULES.RULE_UNUSED_RENT,
        'CheckoutSettlementEngineV2',
        reasons,
      );
      if (l.valuePaise === 0) l.reasonLines.push(...zeroAmountReasons('unused_rent', presentation, w));
      return l;
    })(),
    (() => {
      const l = line(
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
      );
      if (l.valuePaise === 0) l.reasonLines.push(...zeroAmountReasons('notice_charge', presentation, w));
      return l;
    })(),
    (() => {
      const l = line(
        'notice_from_unused_rent',
        'Notice covered by unused rent',
        w.notice.fromUnusedRentPaise,
        `min(unused rent ${paiseToInr(w.rentBucket.unusedPaise)}, notice charge ${paiseToInr(w.notice.fullPaise)}) = ${paiseToInr(w.notice.fromUnusedRentPaise)}`,
        SETTLEMENT_BUSINESS_RULES.RULE_NOTICE_FROM_UNUSED_FIRST,
        'CheckoutSettlementEngineV2',
        reasons,
      );
      if (l.valuePaise === 0) l.reasonLines.push(...zeroAmountReasons('notice_from_unused_rent', presentation, w));
      return l;
    })(),
    (() => {
      const l = line(
        'notice_from_deposit',
        'Deposit deduction (notice)',
        w.notice.fromDepositPaise,
        `max(0, notice ${paiseToInr(w.notice.fullPaise)} − from unused rent ${paiseToInr(w.notice.fromUnusedRentPaise)}) = ${paiseToInr(w.notice.fromDepositPaise)}`,
        SETTLEMENT_BUSINESS_RULES.RULE_NOTICE_FROM_DEPOSIT,
        'CheckoutSettlementEngineV2',
        reasons,
      );
      if (l.valuePaise === 0) l.reasonLines.push(...zeroAmountReasons('notice_from_deposit', presentation, w));
      return l;
    })(),
    (() => {
      const l = line(
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
      );
      if (l.valuePaise === 0) l.reasonLines.push(...zeroAmountReasons('tail_rent', presentation, w));
      return l;
    })(),
    (() => {
      const l = line(
        'electricity_deduction',
        'Electricity (deposit)',
        w.depositBucket.electricityPaise,
        w.depositBucket.electricityPaise > 0
          ? `Electricity deducted from deposit = ${paiseToInr(w.depositBucket.electricityPaise)}`
          : `Electricity deduction ${paiseToInr(0)} at this stage`,
        SETTLEMENT_BUSINESS_RULES.RULE_ELECTRICITY_DEDUCTION,
        'CheckoutSettlementEngineV2',
        reasons,
      );
      if (l.valuePaise === 0) l.reasonLines.push(...zeroAmountReasons('electricity_deduction', presentation, w));
      return l;
    })(),
    (() => {
      const l = line(
        'other_deductions',
        'Other deductions',
        w.depositBucket.otherPaise,
        w.depositBucket.otherPaise > 0
          ? `Damage/cleaning/custom = ${paiseToInr(w.depositBucket.otherPaise)}`
          : `Other deductions ${paiseToInr(0)}`,
        SETTLEMENT_BUSINESS_RULES.RULE_OTHER_DEDUCTIONS,
        'CheckoutSettlementEngineV2',
        reasons,
      );
      if (l.valuePaise === 0) l.reasonLines.push(...zeroAmountReasons('other_deductions', presentation, w));
      return l;
    })(),
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

export function validateMoveOutSettlementExplanations(
  report: MoveOutSettlementExplanationReport,
  presentation: VacatingBillingPresentation,
  opts?: {
    storedNoticeDeductionPaise?: number | null;
    lockedWaterfall?: VacatingBillingPresentation['waterfall'] | null;
  },
): SettlementExplanationValidation {
  return validateBillingEngineSettlement(report, presentation, {
    storedNoticeDeductionPaise: opts?.storedNoticeDeductionPaise,
    lockedWaterfall: opts?.lockedWaterfall ?? null,
  });
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
