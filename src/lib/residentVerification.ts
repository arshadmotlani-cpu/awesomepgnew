import { sql } from 'drizzle-orm';

/** Customer registered on the website (not admin-created at assign time only). */
export const customerIsWebsiteSignupSql = sql`(
  c.password_hash IS NOT NULL
  OR c.profile_completed_at IS NOT NULL
  OR c.must_set_password = true
)`;

/** At least one of KYC approved or an approved/succeeded payment on record. */
export const customerIsVerifiedSql = sql`(
  c.kyc_status = 'approved'
  OR EXISTS (
    SELECT 1 FROM payments p
    INNER JOIN bookings b ON b.id = p.booking_id
    WHERE b.customer_id = c.id AND p.status = 'succeeded'
  )
  OR EXISTS (
    SELECT 1 FROM pg_payment_records pr
    WHERE pr.customer_id = c.id AND pr.status = 'approved'
  )
)`;

export type ResidentVerificationSource = 'kyc' | 'payment' | null;

export type ResidentVerificationStatus = {
  isWebsiteSignup: boolean;
  isVerified: boolean;
  verificationSource: ResidentVerificationSource;
  hasPendingPayment: boolean;
};

type VerificationDbRow = {
  is_website_signup: boolean;
  is_verified: boolean;
  verified_via_kyc: boolean;
  verified_via_payment: boolean;
  has_pending_payment: boolean;
};

export function mapVerificationStatus(row: VerificationDbRow): ResidentVerificationStatus {
  const verificationSource: ResidentVerificationSource = row.verified_via_kyc
    ? 'kyc'
    : row.verified_via_payment
      ? 'payment'
      : null;
  return {
    isWebsiteSignup: row.is_website_signup,
    isVerified: row.is_verified,
    verificationSource,
    hasPendingPayment: row.has_pending_payment,
  };
}

/** SQL selects for list queries — alias customer table as `c`. */
export const customerVerificationSelectSql = sql`
  ${customerIsWebsiteSignupSql} AS is_website_signup,
  ${customerIsVerifiedSql} AS is_verified,
  (c.kyc_status = 'approved') AS verified_via_kyc,
  (
    EXISTS (
      SELECT 1 FROM payments p
      INNER JOIN bookings b ON b.id = p.booking_id
      WHERE b.customer_id = c.id AND p.status = 'succeeded'
    )
    OR EXISTS (
      SELECT 1 FROM pg_payment_records pr
      WHERE pr.customer_id = c.id AND pr.status = 'approved'
    )
  ) AS verified_via_payment,
  (
    EXISTS (
      SELECT 1 FROM payments p
      INNER JOIN bookings b ON b.id = p.booking_id
      WHERE b.customer_id = c.id AND p.status IN ('initiated', 'succeeded')
    )
    OR EXISTS (
      SELECT 1 FROM pg_payment_records pr
      WHERE pr.customer_id = c.id AND pr.status = 'pending'
    )
  ) AS has_pending_payment
`;
