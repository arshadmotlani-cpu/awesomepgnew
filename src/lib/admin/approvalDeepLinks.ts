import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

export type ApprovalSectionId =
  | 'booking'
  | 'rent'
  | 'electricity'
  | 'deposit'
  | 'extension';

export function approvalSectionForReviewItem(
  item: PendingPaymentReviewItem,
): ApprovalSectionId {
  if (item.kind === 'qr' && item.bookingCode) return 'booking';
  if (item.kind === 'rent') return 'rent';
  if (item.kind === 'electricity') return 'electricity';
  if (item.kind === 'deposit_link') return 'deposit';
  if (item.kind === 'extension') return 'extension';
  return 'rent';
}

export function buildApprovalDeepLink(input: {
  section: ApprovalSectionId;
  itemKey: string;
  dialog?: boolean;
}): string {
  const params = new URLSearchParams({
    tab: 'waiting',
    section: input.section,
    item: input.itemKey,
  });
  if (input.dialog !== false) params.set('dialog', 'review');
  return `/admin/operations?${params.toString()}`;
}

export function buildApprovalDeepLinkForReviewItem(item: PendingPaymentReviewItem): string {
  return buildApprovalDeepLink({
    section: approvalSectionForReviewItem(item),
    itemKey: item.key,
  });
}

export type OperationsApprovalSearchParams = {
  tab: string | null;
  section: ApprovalSectionId | null;
  item: string | null;
  dialog: boolean;
  /** @deprecated use item */
  focus: string | null;
  /** @deprecated use item */
  key: string | null;
  filter: string | null;
};

const SECTION_IDS = new Set<ApprovalSectionId>([
  'booking',
  'rent',
  'electricity',
  'deposit',
  'extension',
]);

export function parseOperationsApprovalSearchParams(
  params: Record<string, string | string[] | undefined>,
): OperationsApprovalSearchParams {
  const one = (name: string): string | null => {
    const raw = params[name];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    return null;
  };

  const sectionRaw = one('section');
  const section =
    sectionRaw && SECTION_IDS.has(sectionRaw as ApprovalSectionId)
      ? (sectionRaw as ApprovalSectionId)
      : null;

  const item = one('item') ?? one('focus') ?? one('key');

  return {
    tab: one('tab'),
    section,
    item,
    dialog: one('dialog') === 'review',
    focus: one('focus'),
    key: one('key'),
    filter: one('filter'),
  };
}

export function shouldShowWaitingForApprovalTab(
  parsed: OperationsApprovalSearchParams,
  totalApprovalCount: number,
): boolean {
  if (parsed.tab === 'waiting') return true;
  if (
    parsed.filter === 'payment_proof' ||
    parsed.filter === 'waiting_for_admin_review' ||
    parsed.filter === 'booking_approval'
  ) {
    return true;
  }
  if (parsed.item || parsed.dialog) return true;
  return totalApprovalCount > 0;
}
