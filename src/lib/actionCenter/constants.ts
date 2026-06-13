import type { ActionItem } from '@/src/db/schema/actionItems';

export type ActionItemType = ActionItem['type'];

export const ACTION_EXECUTION_TYPES = [
  'send_whatsapp',
  'send_email',
  'generate_payment_link',
  'open_payment_qr',
  'view_ledger',
  'mark_resolved',
] as const;

export type ActionExecutionType = (typeof ACTION_EXECUTION_TYPES)[number];

export const ACTION_ITEM_GROUP_LABELS: Record<ActionItemType, string> = {
  rent_due: 'Rent Due',
  electricity_due: 'Electricity Due',
  refund_pending: 'Refunds Pending',
  kyc_pending: 'KYC Pending',
  vacating_alert: 'Vacating Alerts',
  payment_received: 'Payments to Review',
  maintenance_issue: 'Maintenance Issues',
};

export const ACTION_ITEM_GROUP_ORDER: ActionItemType[] = [
  'rent_due',
  'electricity_due',
  'payment_received',
  'refund_pending',
  'kyc_pending',
  'vacating_alert',
  'maintenance_issue',
];

export type ActionItemMetadata = {
  residentName?: string;
  residentPhone?: string;
  residentEmail?: string;
  pgName?: string;
  roomNumber?: string;
  bedCode?: string;
  bookingId?: string;
  invoiceId?: string;
  submissionId?: string;
  vacatingRequestId?: string;
  paymentReviewKey?: string;
  isOverdue?: boolean;
  billingMonth?: string;
  notes?: string;
};
