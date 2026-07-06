import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { customers } from './customers';
import type { PricingLineItem } from '@/src/lib/pricing/types';
import {
  bookingStatusEnum,
  createdViaEnum,
  durationModeEnum,
  stayTypeEnum,
  adminDepositRefundStatusEnum,
  adminDuesStatusEnum,
  depositCollectionStatusEnum,
} from './enums';
import type { StayType } from './enums';

/**
 * Per-bed pricing snapshot stored on the booking so historical totals stay
 * stable when bed_prices change.
 */
export type PricingSnapshot = {
  /** User-facing stay category at booking time. */
  stayType?: StayType;
  perBed: Array<{
    bedId: string;
    dailyRatePaise: number;
    weeklyRatePaise: number;
    monthlyRatePaise: number;
    /** Per-bed deposit captured at booking time. Summed into bookings.deposit_paise. */
    securityDepositPaise: number;
    durationMode: 'daily' | 'weekly' | 'monthly' | 'open_ended' | 'fixed_stay';
    /** Nights / weeks / months consumed for the quote. */
    units: number;
    /**
     * Per-bed RENT (this bed's contribution to bookings.subtotal_paise).
     * Deposits are tracked separately via securityDepositPaise so the
     * invariant `Σ perBed[i].lineTotalPaise === bookings.subtotal_paise`
     * holds and the customer-facing ledger reads cleanly as
     * "lines → Subtotal → Refundable deposit → Total".
     */
    lineTotalPaise: number;
  }>;
  computedAt: string; // ISO timestamp
  notes?: string;
  /**
   * Cancellation policy in effect at the moment this booking was created.
   * Snapshotted (rather than read live) so a later policy change doesn't
   * silently rewrite refunds owed to past customers. The runtime policy
   * type lives in src/services/cancellationPolicy.ts; we keep the field
   * shape loose here to avoid a cyclic import.
   */
  cancellationPolicy?: {
    fullRefundUntilHrsBefore: number;
    partialRefundUntilHrsBefore: number;
    partialRefundPct: number;
    depositRefundPct: number;
    label: string;
  };
  /** Date-based rent coupon (DDMMYY) applied at checkout — rent only. */
  dateCoupon?: {
    code: string;
    couponDate: string;
    discountPct: number;
    discountPaise: number;
    appliedAt: string;
  };
  /**
   * Admin-explicit deposit transfer from a prior booking — reduces cash/UPI due now.
   * Never set automatically at customer checkout; only via admin "Transfer old deposit".
   */
  depositCredit?: {
    requiredPaise: number;
    appliedPaise: number;
    additionalDuePaise: number;
    appliedAt: string;
    adminTransferred?: boolean;
    sourceBookingId?: string;
    sourceBookingCode?: string;
    transferredByAdminId?: string;
  };
  /** Prior stay balance included in checkout total (display + payment collection). */
  priorOutstanding?: {
    totalPaise: number;
    items: Array<{
      label: string;
      amountPaise: number;
      bookingId?: string;
      bookingCode?: string;
      kind: 'deposit' | 'rent' | 'electricity' | 'other';
    }>;
  };
  /** Credits from checkout overpayment or admin adjustments — applied to future billing. */
  checkoutCredits?: Array<{
    amountPaise: number;
    kind: 'future_rent_adjustment' | 'refund_pending' | 'advance_rent_credit';
    relatedPaymentId?: string;
    createdAt: string;
    note?: string;
  }>;
  /** Rent line items (excludes deposit) snapshotted for checkout display. */
  rentLineItems?: PricingLineItem[];
  /**
   * Phase 5 — append-only log of paid extensions stamped onto the booking
   * for historical record. The actual inventory rows live in
   * `bed_reservations` (`kind = 'extension'`); this is the JSONB
   * "receipt strip" the customer + admin UI render under the original
   * `perBed` lines.
   *
   * Pushed by `recordExtensionPaymentSuccess()` — never mutated in place.
   */
  extensions?: Array<{
    extensionId: string;
    paidAt: string; // ISO timestamp
    /** Inclusive start = the booking's previous expected_checkout_date. */
    fromDate: string; // YYYY-MM-DD
    /** Exclusive end = new expected_checkout_date. */
    untilDate: string; // YYYY-MM-DD
    durationMode: 'daily' | 'weekly' | 'monthly';
    amountPaise: number;
    perBed: Array<{
      bedId: string;
      reservationId: string;
      units: number;
      lineTotalPaise: number;
    }>;
  }>;
};

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bookingCode: text('booking_code').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    status: bookingStatusEnum('status').notNull().default('draft'),
    durationMode: durationModeEnum('duration_mode').notNull(),
    stayType: stayTypeEnum('stay_type').notNull().default('monthly_stay'),
    expectedCheckoutDate: date('expected_checkout_date'),
    billingAnchorDate: date('billing_anchor_date'),
    subtotalPaise: bigint('subtotal_paise', { mode: 'number' }).notNull().default(0),
    discountPaise: bigint('discount_paise', { mode: 'number' }).notNull().default(0),
    taxPaise: bigint('tax_paise', { mode: 'number' }).notNull().default(0),
    totalPaise: bigint('total_paise', { mode: 'number' }).notNull().default(0),
    depositPaise: bigint('deposit_paise', { mode: 'number' }).notNull().default(0),
    pricingSnapshot: jsonb('pricing_snapshot').$type<PricingSnapshot>(),
    notes: text('notes'),
    createdVia: createdViaEnum('created_via').notNull().default('customer'),
    createdByAdminId: uuid('created_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    adminDuesStatus: adminDuesStatusEnum('admin_dues_status').notNull().default('unknown'),
    adminDepositRefundStatus: adminDepositRefundStatusEnum('admin_deposit_refund_status')
      .notNull()
      .default('unknown'),
    depositCollectionStatus: depositCollectionStatusEnum('deposit_collection_status')
      .notNull()
      .default('pending'),
    depositDuePaise: bigint('deposit_due_paise', { mode: 'number' }).notNull().default(0),
    depositDueDate: date('deposit_due_date'),
    isTest: boolean('is_test').notNull().default(false),
    depositDueApprovedByAdminId: uuid('deposit_due_approved_by_admin_id').references(
      () => adminUsers.id,
      { onDelete: 'set null' },
    ),
    adminOpsNotes: text('admin_ops_notes'),
    /** When true, reservations cover all beds in the room (single-tenant whole room). */
    blocksRoomAvailability: boolean('blocks_room_availability').notNull().default(false),
    draftExpiresAt: timestamp('draft_expires_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bookings_booking_code_unique').on(t.bookingCode),
    index('bookings_customer_id_idx').on(t.customerId),
    index('bookings_status_idx').on(t.status),
  ],
);

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
