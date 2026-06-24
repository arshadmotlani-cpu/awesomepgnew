/**
 * Single source of truth for unresolved resident actions surfaced in:
 * - Resident profile workflow / primary actions
 * - Operations queue (via unresolved_actions sync)
 * - Sidebar badges (via unresolved_actions)
 */
import type { UnresolvedActionType } from '@/src/db/schema/enums';
import type { UnresolvedActionRow } from '@/src/services/unresolvedActions';

export type ResidentActionKind =
  | 'kyc_review'
  | 'payment_review'
  | 'bed_assignment'
  | 'checkout'
  | 'move_out'
  | 'deposit_refund'
  | 'invoice'
  | 'maintenance'
  | 'room_transfer';

export type ResidentUnresolvedAction = {
  kind: ResidentActionKind;
  sourceKey: string;
  label: string;
  href: string;
  stateLine?: string;
  nextAction?: string;
  priority: 'low' | 'medium' | 'high';
};

const TYPE_TO_KIND: Record<UnresolvedActionType, ResidentActionKind> = {
  kyc_review: 'kyc_review',
  payment_proof_review: 'payment_review',
  bed_assignment: 'bed_assignment',
  checkout_settlement: 'checkout',
  move_out_approval: 'move_out',
  deposit_refund_approval: 'deposit_refund',
  invoice_review: 'invoice',
  maintenance_approval: 'maintenance',
  room_transfer_approval: 'room_transfer',
};

export function mapUnresolvedActionRow(row: UnresolvedActionRow): ResidentUnresolvedAction {
  const kind = TYPE_TO_KIND[row.actionType];
  return {
    kind,
    sourceKey: row.sourceKey,
    label: row.label ?? row.actionType.replace(/_/g, ' '),
    href: row.href ?? '/admin/actions',
    stateLine: row.label ?? undefined,
    nextAction: 'Complete this step in admin.',
    priority: row.priority,
  };
}

export function pickPrimaryUnresolvedAction(
  actions: ResidentUnresolvedAction[],
): ResidentUnresolvedAction | null {
  if (actions.length === 0) return null;
  const priorityRank = { high: 0, medium: 1, low: 2 };
  return [...actions].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])[0];
}

/** Pending kyc_submissions row — not customers.kyc_status default. */
export function isKycReviewRequired(input: {
  pendingKycSubmissionId: string | null;
}): boolean {
  return Boolean(input.pendingKycSubmissionId);
}

export function buildKycReviewAction(input: {
  customerId: string;
  customerName: string;
  pendingKycSubmissionId: string;
}): ResidentUnresolvedAction {
  return {
    kind: 'kyc_review',
    sourceKey: `unresolved:kyc:${input.pendingKycSubmissionId}`,
    label: 'Review KYC',
    href: `/admin/residents/kyc/${input.pendingKycSubmissionId}`,
    stateLine: `${input.customerName} — identity review required`,
    nextAction: 'Approve or reject Aadhaar and selfie before bed assignment.',
    priority: 'high',
  };
}

export function kycReviewHref(
  customerId: string,
  pendingKycSubmissionId: string | null | undefined,
): string {
  if (pendingKycSubmissionId) {
    return `/admin/residents/kyc/${pendingKycSubmissionId}`;
  }
  return `/admin/residents/kyc?customer=${customerId}`;
}
