/** Ledger reason prefix — not a resident charge; admin collected-balance correction. */
export const DEPOSIT_COLLECTION_ADJUSTMENT_PREFIX = 'DEPOSIT_COLLECTION_ADJUSTMENT:';

export function depositCollectionAdjustmentReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.startsWith(DEPOSIT_COLLECTION_ADJUSTMENT_PREFIX)) {
    return trimmed;
  }
  return `${DEPOSIT_COLLECTION_ADJUSTMENT_PREFIX} ${trimmed}`;
}

/** SQL LIKE pattern for excluding collection adjustments from business deductions. */
export const DEPOSIT_COLLECTION_ADJUSTMENT_SQL_PATTERN = `${DEPOSIT_COLLECTION_ADJUSTMENT_PREFIX}%`;
