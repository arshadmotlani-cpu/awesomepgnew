import { pgEnum } from 'drizzle-orm/pg-core';

export const genderPolicyEnum = pgEnum('gender_policy', ['male', 'female', 'coed']);
export const roomBillingModeEnum = pgEnum('room_billing_mode', ['per_bed', 'private_room']);
export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);
export const idProofTypeEnum = pgEnum('id_proof_type', ['aadhaar', 'passport', 'pan', 'dl']);
export const kycStatusEnum = pgEnum('kyc_status', ['pending', 'approved', 'rejected']);
export const kycSubmissionStatusEnum = pgEnum('kyc_submission_status', [
  'pending',
  'approved',
  'rejected',
]);

export const checkoutSettlementStatusEnum = pgEnum('checkout_settlement_status', [
  'awaiting_resident_details',
  'awaiting_admin_review',
  'approved',
  'refund_pending',
  'refund_paid',
  'completed',
  'archived',
]);

export type CheckoutSettlementStatus =
  (typeof checkoutSettlementStatusEnum.enumValues)[number];

export const residencyStatusEnum = pgEnum('residency_status', ['active', 'vacated', 'blocked']);

export type ResidencyStatus = (typeof residencyStatusEnum.enumValues)[number];

export const residencyLifecycleEnum = pgEnum('residency_lifecycle', [
  'onboarding',
  'active',
  'vacating',
  'checkout',
  'ended',
  'cancelled',
]);

export type ResidencyLifecycle = (typeof residencyLifecycleEnum.enumValues)[number];
export const authProviderEnum = pgEnum('auth_provider', ['otp', 'google', 'email']);

export const bedStatusEnum = pgEnum('bed_status', ['available', 'maintenance', 'blocked']);

export const monthlyDepositPolicyEnum = pgEnum('monthly_deposit_policy', [
  'one_month',
  'two_month',
]);

export type MonthlyDepositPolicy = (typeof monthlyDepositPolicyEnum.enumValues)[number];

export const bookingStatusEnum = pgEnum('booking_status', [
  'draft',
  'pending_payment',
  /** UPI proof submitted — awaiting admin review before resident activation. */
  'pending_approval',
  'confirmed',
  /** Replaced by a newer confirmed booking for the same customer stay at this PG. */
  'superseded',
  'cancelled',
  'completed',
  'refunded',
]);

export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];
export const durationModeEnum = pgEnum('duration_mode', [
  'daily',
  'weekly',
  'monthly',
  'open_ended',
  'fixed_stay',
  'reserve',
]);

/** User-facing stay category — residents never pick daily/weekly plans. */
export const stayTypeEnum = pgEnum('stay_type', ['monthly_stay', 'fixed_date_stay']);

export type StayType = (typeof stayTypeEnum.enumValues)[number];

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
  'financial_audit_review',
  'fixed_stay_checkout_due',
  'refund_request_submitted',
  'booking_approval',
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
  'room_shift',
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

export const unresolvedActionTypeEnum = pgEnum('unresolved_action_type', [
  'kyc_review',
  'payment_proof_review',
  'bed_assignment',
  'move_out_approval',
  'checkout_settlement',
  'deposit_refund_approval',
  'invoice_review',
  'room_transfer_approval',
  'maintenance_approval',
]);

export const unresolvedActionStatusEnum = pgEnum('unresolved_action_status', [
  'OPEN',
  'CLOSED',
]);

export const unresolvedActionPriorityEnum = pgEnum('unresolved_action_priority', [
  'low',
  'medium',
  'high',
]);

export const paymentProofEntityTypeEnum = pgEnum('payment_proof_entity_type', [
  'rent_invoice',
  'electricity_invoice',
  'payment_link',
  'pg_payment_record',
  'stay_extension',
]);

export const paymentProofRejectionStatusEnum = pgEnum('payment_proof_rejection_status', [
  'active',
  'superseded',
]);

export const discountTypeEnum = pgEnum('discount_type', [
  'referral',
  'promo_code',
  'date_coupon',
  'reservation',
]);

export const promoCouponTypeEnum = pgEnum('promo_coupon_type', ['percentage', 'fixed']);

export const promoCouponScopeEnum = pgEnum('promo_coupon_scope', [
  'booking_rent',
  'rent_invoice',
  'bed_reserve',
]);

export const referralWithdrawalStatusEnum = pgEnum('referral_withdrawal_status', [
  'pending',
  'approved',
  'paid',
  'rejected',
]);

export type ActionItemType = (typeof actionItemTypeEnum.enumValues)[number];
export type ActionItemStatus = (typeof actionItemStatusEnum.enumValues)[number];
export type ActionItemPriority = (typeof actionItemPriorityEnum.enumValues)[number];
export type DepositCollectionStatus = (typeof depositCollectionStatusEnum.enumValues)[number];
export type PaymentLinkPurpose = (typeof paymentLinkPurposeEnum.enumValues)[number];
export type PaymentLinkStatus = (typeof paymentLinkStatusEnum.enumValues)[number];
export type FinancialInvoiceType = (typeof financialInvoiceTypeEnum.enumValues)[number];
export type FinancialInvoiceStatus = (typeof financialInvoiceStatusEnum.enumValues)[number];
export type UnresolvedActionType = (typeof unresolvedActionTypeEnum.enumValues)[number];
export type UnresolvedActionStatus = (typeof unresolvedActionStatusEnum.enumValues)[number];
export type UnresolvedActionPriority = (typeof unresolvedActionPriorityEnum.enumValues)[number];
export type PaymentProofEntityType = (typeof paymentProofEntityTypeEnum.enumValues)[number];
export type PaymentProofRejectionStatus = (typeof paymentProofRejectionStatusEnum.enumValues)[number];

export const sidebarLayoutTypeEnum = pgEnum('sidebar_layout_type', ['global', 'personal']);

export type SidebarLayoutType = (typeof sidebarLayoutTypeEnum.enumValues)[number];
