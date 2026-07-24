/**
 * Maps documented BR-* business rules to invariants, explainability rule ids, and code SSOT.
 */
import { SETTLEMENT_BUSINESS_RULES } from '@/src/lib/vacating/moveOutSettlementExplanation';

export type SettlementBusinessRuleId =
  | 'BR-ANCHOR'
  | 'BR-FIRST-MONTH'
  | 'BR-LAST-MONTH'
  | 'BR-INVOICE-SUPPRESS'
  | 'BR-RENT-PAID'
  | 'BR-RENT-CONSUMED'
  | 'BR-RENT-UNUSED'
  | 'BR-NOTICE-CHARGE'
  | 'BR-NOTICE-PREPAID'
  | 'BR-NOTICE-ORDER'
  | 'BR-DEPOSIT-ESCROW'
  | 'BR-DEPOSIT-PARTIAL'
  | 'BR-TAIL-CHARGE'
  | 'BR-TAIL-NONE'
  | 'BR-ELECTRICITY'
  | 'BR-DAMAGE'
  | 'BR-OTHER'
  | 'BR-REFUND'
  | 'BR-MONTHLY-STAY'
  | 'BR-FIXED-STAY';

export type SettlementRuleRegistryEntry = {
  id: SettlementBusinessRuleId;
  summary: string;
  ssotModule: string;
  invariantIds: string[];
  explanationRuleIds: string[];
  /** Rules enforced only in docs/UI copy, not a numeric invariant. */
  displayOnly?: boolean;
};

export const SETTLEMENT_RULE_REGISTRY: Record<SettlementBusinessRuleId, SettlementRuleRegistryEntry> = {
  'BR-ANCHOR': {
    id: 'BR-ANCHOR',
    summary: 'Anniversary billing day; paid coverage clamped to move-in',
    ssotModule: 'src/lib/billing/billingCoverageModel.ts',
    invariantIds: ['INV-C1'],
    explanationRuleIds: [],
  },
  'BR-FIRST-MONTH': {
    id: 'BR-FIRST-MONTH',
    summary: 'Move-in proration via checkout/scheduler; settlement uses rent paid ledger',
    ssotModule: 'src/lib/billing/checkoutRentProration.ts',
    invariantIds: ['INV-W1'],
    explanationRuleIds: ['RULE_RENT_PAID_TOTAL'],
  },
  'BR-LAST-MONTH': {
    id: 'BR-LAST-MONTH',
    summary: 'Final period tail vs anniversary invoice',
    ssotModule: 'src/lib/billing/vacatingFinalPeriodRent.ts',
    invariantIds: ['INV-C2', 'INV-C3', 'INV-C4'],
    explanationRuleIds: ['RULE_TAIL_FROM_FINAL_PERIOD'],
  },
  'BR-INVOICE-SUPPRESS': {
    id: 'BR-INVOICE-SUPPRESS',
    summary: 'Suppress pending anniversary rent invoice when approved move-out tail applies',
    ssotModule: 'src/services/billingScheduler.ts',
    invariantIds: ['INV-C2', 'INV-C3'],
    explanationRuleIds: ['RULE_TAIL_FROM_FINAL_PERIOD'],
  },
  'BR-RENT-PAID': {
    id: 'BR-RENT-PAID',
    summary: 'Total rent received on booking ledger',
    ssotModule: 'src/services/bookingMoneyBalances.ts',
    invariantIds: ['INV-W1'],
    explanationRuleIds: ['RULE_RENT_PAID_TOTAL'],
  },
  'BR-RENT-CONSUMED': {
    id: 'BR-RENT-CONSUMED',
    summary: 'Stay days × daily rent capped at rent paid',
    ssotModule: 'src/lib/checkout/checkoutSettlementEngineV2.ts',
    invariantIds: ['INV-W1', 'INV-P1'],
    explanationRuleIds: ['RULE_RENT_CONSUMED_CAP'],
  },
  'BR-RENT-UNUSED': {
    id: 'BR-RENT-UNUSED',
    summary: 'Rent paid minus rent consumed',
    ssotModule: 'src/lib/checkout/checkoutSettlementEngineV2.ts',
    invariantIds: ['INV-W1', 'INV-P1'],
    explanationRuleIds: ['RULE_UNUSED_RENT'],
  },
  'BR-NOTICE-CHARGE': {
    id: 'BR-NOTICE-CHARGE',
    summary: 'Missing notice days × daily rent',
    ssotModule: 'src/lib/vacating/noticeDeductionEngine.ts',
    invariantIds: ['INV-N1', 'INV-N3'],
    explanationRuleIds: ['RULE_NOTICE_CHARGE'],
  },
  'BR-NOTICE-PREPAID': {
    id: 'BR-NOTICE-PREPAID',
    summary: 'Prepaid coverage after vacate reduces chargeable notice',
    ssotModule: 'src/lib/billing/billingCoverageModel.ts',
    invariantIds: ['INV-N3'],
    explanationRuleIds: ['RULE_NOTICE_CHARGE'],
    displayOnly: true,
  },
  'BR-NOTICE-ORDER': {
    id: 'BR-NOTICE-ORDER',
    summary: 'Notice from unused rent first, then deposit',
    ssotModule: 'src/lib/checkout/checkoutSettlementEngineV2.ts',
    invariantIds: ['INV-N1', 'INV-N2', 'INV-W3'],
    explanationRuleIds: ['RULE_NOTICE_FROM_UNUSED_FIRST', 'RULE_NOTICE_FROM_DEPOSIT'],
  },
  'BR-DEPOSIT-ESCROW': {
    id: 'BR-DEPOSIT-ESCROW',
    summary: 'Deposit held is escrow refundable balance',
    ssotModule: 'src/services/deposits.ts',
    invariantIds: ['INV-W2', 'INV-P1'],
    explanationRuleIds: ['RULE_DEPOSIT_REFUNDABLE'],
  },
  'BR-DEPOSIT-PARTIAL': {
    id: 'BR-DEPOSIT-PARTIAL',
    summary: 'Deposit due collection outside move-out waterfall',
    ssotModule: 'src/lib/depositCollectionLabels.ts',
    invariantIds: [],
    explanationRuleIds: [],
    displayOnly: true,
  },
  'BR-TAIL-CHARGE': {
    id: 'BR-TAIL-CHARGE',
    summary: 'Tail rent when final invoice suppressed',
    ssotModule: 'src/lib/billing/vacatingFinalPeriodRent.ts',
    invariantIds: ['INV-C2', 'INV-C4'],
    explanationRuleIds: ['RULE_TAIL_FROM_FINAL_PERIOD'],
  },
  'BR-TAIL-NONE': {
    id: 'BR-TAIL-NONE',
    summary: 'No tail inside paid period or on period end',
    ssotModule: 'src/lib/billing/vacatingFinalPeriodRent.ts',
    invariantIds: ['INV-C3', 'INV-C4'],
    explanationRuleIds: ['RULE_TAIL_FROM_FINAL_PERIOD'],
  },
  'BR-ELECTRICITY': {
    id: 'BR-ELECTRICITY',
    summary: 'Electricity deducted from deposit at checkout when locked',
    ssotModule: 'src/lib/checkout/electricitySettlement.ts',
    invariantIds: ['INV-W2', 'INV-P1'],
    explanationRuleIds: ['RULE_ELECTRICITY_DEDUCTION'],
  },
  'BR-DAMAGE': {
    id: 'BR-DAMAGE',
    summary: 'Damage charges in deposit other bucket',
    ssotModule: 'src/lib/checkout/checkoutSettlementEngineV2.ts',
    invariantIds: ['INV-W2', 'INV-P1'],
    explanationRuleIds: ['RULE_OTHER_DEDUCTIONS'],
  },
  'BR-OTHER': {
    id: 'BR-OTHER',
    summary: 'Cleaning/custom charges in deposit other bucket',
    ssotModule: 'src/lib/checkout/checkoutSettlementEngineV2.ts',
    invariantIds: ['INV-W2', 'INV-P1'],
    explanationRuleIds: ['RULE_OTHER_DEDUCTIONS'],
  },
  'BR-REFUND': {
    id: 'BR-REFUND',
    summary: 'Refund = deposit remaining + unused rent after notice',
    ssotModule: 'src/lib/checkout/checkoutSettlementEngineV2.ts',
    invariantIds: ['INV-W2', 'INV-W3'],
    explanationRuleIds: ['RULE_DEPOSIT_REFUNDABLE', 'RULE_REFUND_TOTAL'],
  },
  'BR-MONTHLY-STAY': {
    id: 'BR-MONTHLY-STAY',
    summary: 'Monthly anniversary rent, notice, room electricity workflow A',
    ssotModule: 'docs/BILLING_ENGINE.md',
    invariantIds: ['INV-N1', 'INV-C2'],
    explanationRuleIds: [],
    displayOnly: true,
  },
  'BR-FIXED-STAY': {
    id: 'BR-FIXED-STAY',
    summary: 'Fixed stay: notice off, checkout electricity only',
    ssotModule: 'src/lib/checkout/noticeDeductionPolicy.ts',
    invariantIds: ['INV-N1'],
    explanationRuleIds: ['RULE_NOTICE_CHARGE'],
  },
};

/** Every SETTLEMENT_BUSINESS_RULES key must map to a BR-* via explanationRuleIds. */
export const EXPLANATION_RULE_TO_BR: Record<
  (typeof SETTLEMENT_BUSINESS_RULES)[keyof typeof SETTLEMENT_BUSINESS_RULES]['id'],
  SettlementBusinessRuleId
> = {
  RULE_RENT_PAID_TOTAL: 'BR-RENT-PAID',
  RULE_RENT_CONSUMED_CAP: 'BR-RENT-CONSUMED',
  RULE_UNUSED_RENT: 'BR-RENT-UNUSED',
  RULE_NOTICE_CHARGE: 'BR-NOTICE-CHARGE',
  RULE_NOTICE_FROM_UNUSED_FIRST: 'BR-NOTICE-ORDER',
  RULE_NOTICE_FROM_DEPOSIT: 'BR-NOTICE-ORDER',
  RULE_TAIL_FROM_FINAL_PERIOD: 'BR-TAIL-CHARGE',
  RULE_DEPOSIT_REFUNDABLE: 'BR-REFUND',
  RULE_REFUND_TOTAL: 'BR-REFUND',
  RULE_ELECTRICITY_DEDUCTION: 'BR-ELECTRICITY',
  RULE_OTHER_DEDUCTIONS: 'BR-OTHER',
};

export const ALL_SETTLEMENT_BUSINESS_RULE_IDS = Object.keys(
  SETTLEMENT_RULE_REGISTRY,
) as SettlementBusinessRuleId[];
