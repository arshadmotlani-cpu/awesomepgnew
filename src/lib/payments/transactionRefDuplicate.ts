/**
 * Shared transaction-reference normalize + duplicate match helpers.
 * Used by Awesome PG proof queues and Platform SaaS manual subscription payments.
 * Products keep separate DBs; behavior is isomorphic via this module.
 */

export type TransactionRefMatch = {
  id: string;
  status: string;
  sourceKind?: string;
  submittedAt?: string | Date | null;
  reviewedAt?: string | Date | null;
  organizationId?: string | null;
  customerId?: string | null;
};

/** Trim + case-fold. Empty / whitespace-only → null. */
export function normalizeTransactionRef(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function assertTransactionRefRequired(
  raw: string | null | undefined,
): string {
  const normalized = normalizeTransactionRef(raw);
  if (!normalized) {
    throw new Error('Transaction ID is required.');
  }
  return normalized;
}

/**
 * Given a candidate set of existing submissions with the same normalized ref,
 * compute flag + sibling ids for the new row (always insert; never hard-reject).
 */
export function buildDuplicateFlags(matches: TransactionRefMatch[]): {
  possibleDuplicate: boolean;
  duplicateOfIds: string[];
} {
  if (matches.length === 0) {
    return { possibleDuplicate: false, duplicateOfIds: [] };
  }
  return {
    possibleDuplicate: true,
    duplicateOfIds: matches.map((m) => m.id),
  };
}

/**
 * Recompute display labels at read time: pending that matches an approved sibling
 * should surface as a duplicate of that approved payment.
 */
export function labelDuplicateContext(
  self: TransactionRefMatch,
  siblings: TransactionRefMatch[],
): {
  isDuplicate: boolean;
  badge: string | null;
  primarySibling: TransactionRefMatch | null;
  defaultRejectNote: string | null;
} {
  if (siblings.length === 0) {
    return {
      isDuplicate: false,
      badge: null,
      primarySibling: null,
      defaultRejectNote: null,
    };
  }

  const approved = siblings.find((s) => s.status === 'approved' || s.status === 'active');
  const primary = approved ?? siblings[0]!;
  const statusWord =
    primary.status === 'approved' || primary.status === 'active'
      ? 'approved'
      : primary.status === 'pending'
        ? 'pending'
        : primary.status;

  return {
    isDuplicate: true,
    badge: 'Duplicate reference ID',
    primarySibling: primary,
    defaultRejectNote: `Duplicate of ${statusWord} payment #${primary.id.slice(0, 8)}`,
  };
}

/** Confirm copy when approving a flagged row that already has an approved sibling. */
export function approveDuplicateConfirmMessage(
  sibling: TransactionRefMatch,
): string {
  const when =
    sibling.reviewedAt != null
      ? ` (reviewed ${formatWhen(sibling.reviewedAt)})`
      : sibling.submittedAt != null
        ? ` (submitted ${formatWhen(sibling.submittedAt)})`
        : '';
  const who =
    sibling.organizationId != null
      ? `org ${sibling.organizationId.slice(0, 8)}`
      : sibling.customerId != null
        ? `customer ${sibling.customerId.slice(0, 8)}`
        : 'another submission';
  return `This transaction ID was already approved for ${who}${when}. Approving again will fail if the unique approved index blocks it. Continue?`;
}

function formatWhen(value: string | Date): string {
  try {
    const d = typeof value === 'string' ? new Date(value) : value;
    return d.toISOString().slice(0, 10);
  } catch {
    return String(value);
  }
}

/** User-facing error when partial unique on approved txn ID fires. */
export function approvedTransactionRefConflictMessage(): string {
  return 'This transaction ID is already approved on another payment. Reject this submission or use a different ID.';
}

export function isApprovedTransactionRefUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e.code !== '23505') return false;
  const hay = `${e.constraint ?? ''} ${e.message ?? ''}`.toLowerCase();
  return (
    hay.includes('approved_transaction') ||
    hay.includes('transaction_ref') ||
    hay.includes('pg_approved_transaction_refs') ||
    hay.includes('subscription_payment_submissions')
  );
}
