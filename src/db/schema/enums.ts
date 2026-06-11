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
]);
export const createdViaEnum = pgEnum('created_via', ['customer', 'admin']);

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
  'paid',
  'overdue',
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
