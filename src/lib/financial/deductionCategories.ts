/**
 * Structured deposit deduction categories — SSOT for refund console and revenue routing.
 *
 * Electricity → Electricity Revenue.
 * Every other category → Other Income.
 */

export const DEDUCTION_CATEGORIES = [
  'electricity',
  'notice_policy',
  'five_day_policy',
  'damage',
  'cleaning',
  'mattress',
  'furniture',
  'lock',
  'key',
  'penalty',
  'miscellaneous',
] as const;

export type DeductionCategory = (typeof DEDUCTION_CATEGORIES)[number];

export type DeductionRevenueBucket = 'electricity' | 'other_income';

export const DEDUCTION_CATEGORY_LABELS: Record<DeductionCategory, string> = {
  electricity: 'Electricity',
  notice_policy: 'Notice Policy',
  five_day_policy: 'Five Day Policy',
  damage: 'Damage',
  cleaning: 'Cleaning',
  mattress: 'Mattress',
  furniture: 'Furniture',
  lock: 'Lock',
  key: 'Key',
  penalty: 'Penalty',
  miscellaneous: 'Miscellaneous',
};

export function revenueBucketForCategory(category: DeductionCategory): DeductionRevenueBucket {
  return category === 'electricity' ? 'electricity' : 'other_income';
}

export function isDeductionCategory(value: string): value is DeductionCategory {
  return (DEDUCTION_CATEGORIES as readonly string[]).includes(value);
}

/** Prefix stored in ledger `reason` and mirrored in `deduction_category`. */
export function formatDeductionReason(category: DeductionCategory, note: string): string {
  const trimmed = note.trim();
  const label = DEDUCTION_CATEGORY_LABELS[category];
  return trimmed ? `[${category}] ${label}: ${trimmed}` : `[${category}] ${label}`;
}

/** Parse category from stored reason or explicit column value. */
export function parseDeductionCategory(input: {
  deductionCategory?: string | null;
  reason?: string | null;
}): DeductionCategory {
  if (input.deductionCategory && isDeductionCategory(input.deductionCategory)) {
    return input.deductionCategory;
  }
  const reason = input.reason ?? '';
  const bracket = reason.match(/^\[([a-z_]+)\]/);
  if (bracket && isDeductionCategory(bracket[1])) {
    return bracket[1];
  }
  const lower = reason.toLowerCase();
  if (lower.includes('electricity')) return 'electricity';
  if (lower.includes('5-day') || lower.includes('five day')) return 'five_day_policy';
  if (lower.includes('notice')) return 'notice_policy';
  if (lower.includes('damage')) return 'damage';
  if (lower.includes('clean')) return 'cleaning';
  if (lower.includes('mattress')) return 'mattress';
  if (lower.includes('furniture')) return 'furniture';
  if (lower.includes('lock')) return 'lock';
  if (lower.includes('key')) return 'key';
  if (lower.includes('penalty')) return 'penalty';
  if (lower.includes('deposit credit transferred')) return 'miscellaneous';
  return 'miscellaneous';
}

export function isDepositTransferReason(reason: string | null | undefined): boolean {
  return Boolean(reason && reason.includes('Deposit credit transferred to booking'));
}

export function ledgerEntryKindLabel(input: {
  entryKind: string;
  deductionCategory?: string | null;
  reason?: string | null;
}): string {
  if (input.entryKind !== 'deducted') return input.entryKind;
  const category = parseDeductionCategory({
    deductionCategory: input.deductionCategory,
    reason: input.reason,
  });
  return DEDUCTION_CATEGORY_LABELS[category];
}
