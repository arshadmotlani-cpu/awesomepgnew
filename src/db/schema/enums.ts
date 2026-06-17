import { pgEnum } from 'drizzle-orm/pg-core';

export const genderPolicyEnum = pgEnum('gender_policy', ['male', 'female', 'coed']);
export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);
export const idProofTypeEnum = pgEnum('id_proof_type', ['aadhaar', 'passport', 'pan', 'dl']);
export const kycStatusEnum = pgEnum('kyc_status', ['pending', 'approved', 'rejected']);
export const kycSubmissionStatusEnum = pgEnum('kyc_submission_status', [
  'pending',
  'approved',
  'rejected',
]);

export const residencyStatusEnum = pgEnum('residency_status', ['active', 'vacated', 'blocked']);

export type ResidencyStatus = (typeof residencyStatusEnum.enumValues)[number];
export const authProviderEnum = pgEnum('auth_provider', ['otp', 'google', 'email']);

export const bedStatusEnum = pgEnum('bed_status', ['available', 'maintenance', 'blocked']);

export const bookingStatusEnum = pgEnum('booking_status', [
  'draft',
  'pending_payment',
  'confirmed',
  'cancelled',
  'completed',
  'refunded',
]);
export const durationModeEnum = pgEnum('duration_mode', [
  'daily',
  'weekly',
  'monthly',
  'open_ended',
  'fixed_stay',
  'reserve',
]);

export const bedReserveStatusEnum = pgEnum('bed_reserve_status', [
  'pending_payment',
  'active',
  'expired',
  'cancelled',
  'converted',
]);
export const createdViaEnum = pgEnum('created_via', ['customer', 'admin']);

export const adminDuesStatusEnum = pgEnum('admin_dues_status', [
  'unknown',
  'cleared',
  'has_dues',
]);

export const adminDepositRefundStatusEnum = pgEnum('admin_deposit_refund_status', [
  'unknown',
  'pending',
  'refunded',
  'blocked',
  'not_applicable',
]);

export const depositCollectionStatusEnum = pgEnum('deposit_collection_status', [
  'pending',
  'full',
  'partial',
  'overdue',
  'waived',
]);

export const reservationKindEnum = pgEnum('reservation_kind', ['primary', 'extension']);
export const reservationStatusEnum = pgEnum('reservation_status', [
  'hold',
  'active',
  'cancelled',
  'completed',
]);

export const extensionRequestedByEnum = pgEnum('extension_requested_by', ['customer', 'admin']);
export const extensionStatusEnum = pgEnum('extension_status', [
  'pending',
  'approved',
  'paid',
  'rejected',
  'cancelled',
]);
export const extensionDurationModeEnum = pgEnum('extension_duration_mode', [
  'daily',
  'weekly',
  'monthly',
]);

export const paymentPurposeEnum = pgEnum('payment_purpose', [
  'booking',
  'extension',
  'deposit',
  'refund',
  'adjustment',
  // Phase 5.5 — recurring billing for monthly residents.
  'rent',
  'electricity',
  'deposit_deduction',
  'bed_reserve',
]);
export const paymentProviderEnum = pgEnum('payment_provider', [
  'razorpay',
  'stripe',
  'cash',
  'upi_manual',
  'bank_transfer',
  // `mock` is the dev/test provider behind PAYMENT_PROVIDER=mock. Keeping it
  // as a real enum member (rather than co-opting `razorpay`) means the
  // payments ledger always tells the truth about which adapter wrote the row,
  // and the `(provider, provider_payment_id)` idempotency index never aliases
  // mock and real Razorpay receipts.
  'mock',
]);
export const paymentStatusEnum = pgEnum('payment_status', [
  'initiated',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
]);

export const adminRoleEnum = pgEnum('admin_role', [
  'super_admin',
  'pg_manager',
  'accountant',
  'viewer',
]);

export const pgPaymentRecordStatusEnum = pgEnum('pg_payment_record_status', [
  'pending',
  'approved',
  'rejected',
]);

export const auditActorTypeEnum = pgEnum('audit_actor_type', ['customer', 'admin', 'system']);

// ───────────────────────────────────────────────────────────────────────────
// Phase 5.5 — resident billing.
// ───────────────────────────────────────────────────────────────────────────

export const rentInvoiceStatusEnum = pgEnum('rent_invoice_status', [
  'pending',
  'payment_in_progress',
  'paid',
  'overdue',
  'expired',
  'cancelled',
]);

export const electricityInvoiceStatusEnum = pgEnum('electricity_invoice_status', [
  'pending',
  'paid',
  'cancelled',
]);

export const meterReadingTypeEnum = pgEnum('meter_reading_type', [
  'checkin',
  'monthly',
  'checkout',
]);

export const meterRecordedByEnum = pgEnum('meter_recorded_by', ['admin', 'tenant', 'system']);

export const electricityBillStatusEnum = pgEnum('electricity_bill_status', [
  'calculated',
  'pending',
  'paid',
]);

export const depositEntryKindEnum = pgEnum('deposit_entry_kind', [
  'collected',
  'deducted',
  'refunded',
]);

export const vacatingStatusEnum = pgEnum('vacating_status', [
  'pending',
  'approved',
  'completed',
  'rejected',
]);

export const playstationMembershipPlanEnum = pgEnum('playstation_membership_plan', [
  'weekly',
  'biweekly',
  'monthly',
]);

export const playstationMembershipStatusEnum = pgEnum('playstation_membership_status', [
  'pending_payment',
  'active',
  'expired',
  'cancelled',
]);

export const membershipTransactionKindEnum = pgEnum('membership_transaction_kind', [
  'purchase',
  'renew',
  'upgrade',
  'admin_activate',
  'admin_deactivate',
  'admin_extend',
  'admin_cancel',
  'payment_proof',
]);

export const actionItemTypeEnum = pgEnum('action_item_type', [
  'rent_due',
  'electricity_due',
  'refund_pending',
  'kyc_pending',
  'vacating_alert',
  'payment_received',
  'maintenance_issue',
  'deposit_refund_request',
  'extension_request',
  'deposit_collection_due',
]);

export const actionItemStatusEnum = pgEnum('action_item_status', [
  'open',
  'in_progress',
  'resolved',
]);

export const actionItemPriorityEnum = pgEnum('action_item_priority', [
  'low',
  'medium',
  'high',
]);

export const paymentLinkPurposeEnum = pgEnum('payment_link_purpose', [
  'rent',
  'electricity',
  'deposit',
  'combined',
]);

export const financialInvoiceTypeEnum = pgEnum('financial_invoice_type', [
  'rent',
  'deposit',
  'electricity',
  'ps4',
  'penalty',
  'damage',
  'custom',
  'combined',
]);

export const financialInvoiceStatusEnum = pgEnum('financial_invoice_status', [
  'draft',
  'sent',
  'payment_in_progress',
  'processing',
  'paid',
  'partial',
  'settled',
  'overdue',
  'expired',
  'cancelled',
  'refunded',
]);

export const paymentLinkStatusEnum = pgEnum('payment_link_status', [
  'active',
  'paid',
  'expired',
]);

export const residentRequestTypeEnum = pgEnum('resident_request_type', [
  'deposit_refund',
  'stay_extension',
  'deposit_due_extension',
]);

export const residentRequestStatusEnum = pgEnum('resident_request_status', [
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'completed',
]);

export const adminNotificationStateEnum = pgEnum('admin_notification_state', [
  'unread',
  'read',
  'archived',
]);

export type ActionItemType = (typeof actionItemTypeEnum.enumValues)[number];
export type ActionItemStatus = (typeof actionItemStatusEnum.enumValues)[number];
export type ActionItemPriority = (typeof actionItemPriorityEnum.enumValues)[number];
export type DepositCollectionStatus = (typeof depositCollectionStatusEnum.enumValues)[number];
export type PaymentLinkPurpose = (typeof paymentLinkPurposeEnum.enumValues)[number];
export type PaymentLinkStatus = (typeof paymentLinkStatusEnum.enumValues)[number];
export type FinancialInvoiceType = (typeof financialInvoiceTypeEnum.enumValues)[number];
export type FinancialInvoiceStatus = (typeof financialInvoiceStatusEnum.enumValues)[number];
