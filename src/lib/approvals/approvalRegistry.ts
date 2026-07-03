/**
 * Approval type registry — SSOT mapping for every human approval workflow.
 *
 * Business decisions (Phase 0):
 * - Operations is the entry point; specialized pages handle approve/reject.
 * - Booking QR reject cancels the booking (resident must rebook).
 * - Billing Centre shows metrics only; all approval CTAs route to Operations.
 * - Refund counts appear in Operations refund_due; action on refund console.
 * - PlayStation proofs excluded from unified Operations queue (dedicated page).
 * - Room change requests deprecated until admin handler exists.
 * - Operations dismissals remain super-admin only.
 * - WhatsApp on payment-proof reject is optional per admin.
 */

import type { ActionItem } from '@/src/db/schema/actionItems';
import type { OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';

export type ApprovalKind =
  | 'payment_proof_qr'
  | 'payment_proof_rent'
  | 'payment_proof_electricity'
  | 'payment_proof_extension'
  | 'payment_proof_deposit_link'
  | 'booking_approval'
  | 'kyc_review'
  | 'vacating_notice'
  | 'checkout_settlement'
  | 'deposit_refund'
  | 'deposit_extension_request'
  | 'partial_deposit';

export type ApprovalRegistryEntry = {
  kind: ApprovalKind;
  label: string;
  /** Operations filter chip when applicable. */
  operationsFilter: OpsQueueFilter | null;
  actionItemType: ActionItem['type'] | null;
  permission: string;
  workspacePath: string;
  /** Included in unified Operations WFA payment proof queue. */
  inPaymentProofQueue: boolean;
  /** Generates admin notifications via action_items sync. */
  notifiesAdmin: boolean;
};

export const APPROVAL_REGISTRY: ApprovalRegistryEntry[] = [
  {
    kind: 'payment_proof_qr',
    label: 'Booking checkout payment proof',
    operationsFilter: 'waiting_for_approval',
    actionItemType: 'payment_received',
    permission: 'payments:write',
    workspacePath: '/admin/operations?filter=waiting_for_approval',
    inPaymentProofQueue: true,
    notifiesAdmin: true,
  },
  {
    kind: 'payment_proof_rent',
    label: 'Rent payment proof',
    operationsFilter: 'waiting_for_approval',
    actionItemType: 'payment_received',
    permission: 'payments:write',
    workspacePath: '/admin/operations?filter=waiting_for_approval',
    inPaymentProofQueue: true,
    notifiesAdmin: true,
  },
  {
    kind: 'payment_proof_electricity',
    label: 'Electricity payment proof',
    operationsFilter: 'waiting_for_approval',
    actionItemType: 'payment_received',
    permission: 'payments:write',
    workspacePath: '/admin/operations?filter=waiting_for_approval',
    inPaymentProofQueue: true,
    notifiesAdmin: true,
  },
  {
    kind: 'payment_proof_extension',
    label: 'Stay extension payment proof',
    operationsFilter: 'waiting_for_approval',
    actionItemType: 'payment_received',
    permission: 'payments:write',
    workspacePath: '/admin/operations?filter=waiting_for_approval',
    inPaymentProofQueue: true,
    notifiesAdmin: true,
  },
  {
    kind: 'payment_proof_deposit_link',
    label: 'Deposit payment link proof',
    operationsFilter: 'waiting_for_approval',
    actionItemType: 'payment_received',
    permission: 'payments:write',
    workspacePath: '/admin/operations?filter=waiting_for_approval',
    inPaymentProofQueue: true,
    notifiesAdmin: true,
  },
  {
    kind: 'booking_approval',
    label: 'Booking approval',
    operationsFilter: 'booking_approval',
    actionItemType: 'booking_approval',
    permission: 'payments:write',
    workspacePath: '/admin/bookings',
    inPaymentProofQueue: false,
    notifiesAdmin: true,
  },
  {
    kind: 'kyc_review',
    label: 'KYC review',
    operationsFilter: 'kyc_review',
    actionItemType: 'kyc_pending',
    permission: 'kyc:write',
    workspacePath: '/admin/residents/kyc',
    inPaymentProofQueue: false,
    notifiesAdmin: true,
  },
  {
    kind: 'vacating_notice',
    label: 'Move-out notice',
    operationsFilter: 'vacating_requests',
    actionItemType: 'vacating_alert',
    permission: 'bookings:write',
    workspacePath: '/admin/vacating',
    inPaymentProofQueue: false,
    notifiesAdmin: true,
  },
  {
    kind: 'checkout_settlement',
    label: 'Checkout settlement',
    operationsFilter: 'vacating_requests',
    actionItemType: 'fixed_stay_checkout_due',
    permission: 'deposits:write',
    workspacePath: '/admin/checkout-settlements',
    inPaymentProofQueue: false,
    notifiesAdmin: true,
  },
  {
    kind: 'deposit_refund',
    label: 'Deposit refund',
    operationsFilter: 'refund_due',
    actionItemType: 'refund_pending',
    permission: 'deposits:write',
    workspacePath: '/admin/refunds',
    inPaymentProofQueue: false,
    notifiesAdmin: true,
  },
  {
    kind: 'deposit_extension_request',
    label: 'Deposit due extension',
    operationsFilter: null,
    actionItemType: 'extension_request',
    permission: 'deposits:write',
    workspacePath: '/admin/requests',
    inPaymentProofQueue: false,
    notifiesAdmin: true,
  },
  {
    kind: 'partial_deposit',
    label: 'Partial deposit approval',
    operationsFilter: null,
    actionItemType: null,
    permission: 'payments:write',
    workspacePath: '/admin/operations?filter=waiting_for_approval',
    inPaymentProofQueue: false,
    notifiesAdmin: false,
  },
];

export function registryByActionItemType(
  type: ActionItem['type'],
): ApprovalRegistryEntry | undefined {
  return APPROVAL_REGISTRY.find((e) => e.actionItemType === type);
}

export function registryByOperationsFilter(
  filter: OpsQueueFilter,
): ApprovalRegistryEntry[] {
  return APPROVAL_REGISTRY.filter((e) => e.operationsFilter === filter);
}

/** Billing Centre invoice-in-review — not a proof approval; separate billing workflow. */
export const BILLING_INVOICE_REVIEW_HREF = '/admin/billing?tab=billing';

export function operationsHrefForFilter(
  filter: OpsQueueFilter,
  focus?: string,
): string {
  return operationsFilterHref(filter, focus);
}

export function refundApprovalHref(bookingId: string): string {
  return refundConsoleHref(bookingId);
}
