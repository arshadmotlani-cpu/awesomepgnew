/**
 * Admin approval queue — SSOT for Waiting For Approval counts and grouped items.
 */
import type { AdminSession } from '@/src/lib/auth/session';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import {
  approvalSectionForReviewItem,
  type ApprovalSectionId,
} from '@/src/lib/admin/approvalDeepLinks';

export type { ApprovalSectionId };

export const APPROVAL_SECTION_ORDER: ApprovalSectionId[] = [
  'booking',
  'rent',
  'electricity',
  'deposit',
  'extension',
];

export const APPROVAL_SECTION_LABELS: Record<ApprovalSectionId, string> = {
  booking: 'Booking Approvals',
  rent: 'Rent Payments',
  electricity: 'Electricity Payments',
  deposit: 'Deposit Payments',
  extension: 'Extension Payments',
};

export type AdminApprovalSection = {
  id: ApprovalSectionId;
  label: string;
  count: number;
  items: PendingPaymentReviewItem[];
};

export type AdminApprovalQueue = {
  totalCount: number;
  sections: AdminApprovalSection[];
  allItems: PendingPaymentReviewItem[];
};

function groupItemsBySection(items: PendingPaymentReviewItem[]): AdminApprovalSection[] {
  const buckets = new Map<ApprovalSectionId, PendingPaymentReviewItem[]>();
  for (const id of APPROVAL_SECTION_ORDER) {
    buckets.set(id, []);
  }

  for (const item of items) {
    const section = approvalSectionForReviewItem(item);
    buckets.get(section)?.push(item);
  }

  return APPROVAL_SECTION_ORDER.map((id) => {
    const sectionItems = buckets.get(id) ?? [];
    return {
      id,
      label: APPROVAL_SECTION_LABELS[id],
      count: sectionItems.length,
      items: sectionItems,
    };
  }).filter((section) => section.count > 0);
}

export async function loadAdminApprovalQueue(session: AdminSession): Promise<AdminApprovalQueue> {
  const allItems = await listPendingPaymentReviews(session);
  return {
    totalCount: allItems.length,
    sections: groupItemsBySection(allItems),
    allItems,
  };
}

export async function countAdminApprovalQueue(session: AdminSession): Promise<number> {
  const items = await listPendingPaymentReviews(session);
  return items.length;
}

export function findApprovalQueueItem(
  queue: AdminApprovalQueue,
  itemKey: string,
): { section: AdminApprovalSection; item: PendingPaymentReviewItem } | null {
  for (const section of queue.sections) {
    const item = section.items.find((row) => row.key === itemKey);
    if (item) return { section, item };
  }
  return null;
}
