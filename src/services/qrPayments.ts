import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  beds,
  bedReservations,
  bookings,
  customers,
  floors,
  payments,
  pgPaymentCategories,
  pgPaymentRecords,
  pgs,
  rooms,
} from '@/src/db/schema';
import { isBookingCheckoutEligibleForPaymentReview } from '@/src/lib/operations/paymentReviewSsot';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { RENT_DEPOSIT_BOOKING_CATEGORY_NAME } from '@/src/lib/payments/defaultQr';
import { getRentDepositBookingCategory } from '@/src/services/pgPaymentDefaults';

export type PaymentCategoryInput = {
  name: string;
  qrCodeImageUrl: string;
  upiId?: string;
  isActive?: boolean;
};

export type SubmitPaymentInput = {
  pgId: string;
  categoryId: string;
  customerId: string;
  amountPaise: number;
  month?: string;
  paymentScreenshotUrl: string;
  transactionRef?: string;
  bookingId?: string;
};

export type SubmitBookingPaymentInput = {
  bookingCode: string;
  customerId: string;
  amountPaise: number;
  paymentScreenshotUrl: string;
  transactionRef?: string;
  /** Pending PS4 add-on purchased with this booking — proof stored separately. */
  membershipId?: string;
  membershipAmountPaise?: number;
};

function assertPgAccess(session: AdminSession, pgId: string) {
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId)) {
    throw new Error('You do not have access to this PG.');
  }
}

export async function customerLinkedToPg(customerId: string, pgId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(bookings.customerId, customerId),
        eq(floors.pgId, pgId),
        inArray(bookings.status, ['pending_payment', 'confirmed', 'completed']),
        inArray(bedReservations.status, ['hold', 'active']),
        isNull(beds.archivedAt),
        isNull(rooms.archivedAt),
        isNull(floors.archivedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function listActiveCategoriesForPg(pgId: string) {
  return db
    .select()
    .from(pgPaymentCategories)
    .where(and(eq(pgPaymentCategories.pgId, pgId), eq(pgPaymentCategories.isActive, true)))
    .orderBy(pgPaymentCategories.name);
}

export async function listCategoriesForPgAdmin(session: AdminSession, pgId: string) {
  assertPgAccess(session, pgId);
  return db
    .select()
    .from(pgPaymentCategories)
    .where(eq(pgPaymentCategories.pgId, pgId))
    .orderBy(pgPaymentCategories.name);
}

export async function createPaymentCategory(
  session: AdminSession,
  pgId: string,
  input: PaymentCategoryInput,
) {
  assertPgAccess(session, pgId);
  const name = input.name.trim();
  const qrCodeImageUrl = input.qrCodeImageUrl.trim();
  if (!name) throw new Error('Category name is required.');
  if (!qrCodeImageUrl) throw new Error('QR code image is required.');

  const [row] = await db
    .insert(pgPaymentCategories)
    .values({
      pgId,
      name,
      qrCodeImageUrl,
      upiId: input.upiId?.trim() || null,
      isActive: input.isActive ?? true,
    })
    .returning();

  return row;
}

export async function updatePaymentCategory(
  session: AdminSession,
  categoryId: string,
  input: Partial<PaymentCategoryInput>,
) {
  const [cat] = await db
    .select({ pgId: pgPaymentCategories.pgId })
    .from(pgPaymentCategories)
    .where(eq(pgPaymentCategories.id, categoryId))
    .limit(1);
  if (!cat) throw new Error('Category not found.');
  assertPgAccess(session, cat.pgId);

  await db
    .update(pgPaymentCategories)
    .set({
      name: input.name?.trim() ?? undefined,
      qrCodeImageUrl: input.qrCodeImageUrl?.trim() ?? undefined,
      upiId: input.upiId !== undefined ? input.upiId.trim() || null : undefined,
      isActive: input.isActive ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(pgPaymentCategories.id, categoryId));
}

export async function setPgPaymentEnabled(session: AdminSession, pgId: string, enabled: boolean) {
  assertPgAccess(session, pgId);
  await db
    .update(pgs)
    .set({ hasPaymentEnabled: enabled, updatedAt: new Date() })
    .where(eq(pgs.id, pgId));
}

export async function submitPaymentRecord(input: SubmitPaymentInput) {
  if (input.amountPaise <= 0) throw new Error('Amount must be greater than zero.');

  if (input.bookingId) {
    const [booking] = await db
      .select({ bookingCode: bookings.bookingCode, customerId: bookings.customerId })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId))
      .limit(1);
    if (!booking) throw new Error('Booking not found.');
    if (booking.customerId !== input.customerId) throw new Error('Access denied.');
    return submitBookingPaymentRecord({
      bookingCode: booking.bookingCode,
      customerId: input.customerId,
      amountPaise: input.amountPaise,
      paymentScreenshotUrl: input.paymentScreenshotUrl,
      transactionRef: input.transactionRef,
    });
  }

  const linked = await customerLinkedToPg(input.customerId, input.pgId);
  if (!linked) throw new Error('You are not linked to this PG as a resident.');

  const [pg] = await db
    .select({ hasPaymentEnabled: pgs.hasPaymentEnabled, isActive: pgs.isActive })
    .from(pgs)
    .where(and(eq(pgs.id, input.pgId), isNull(pgs.archivedAt)))
    .limit(1);
  if (!pg?.hasPaymentEnabled || !pg.isActive) {
    throw new Error('Payments are not enabled for this PG.');
  }

  const [category] = await db
    .select()
    .from(pgPaymentCategories)
    .where(
      and(
        eq(pgPaymentCategories.id, input.categoryId),
        eq(pgPaymentCategories.pgId, input.pgId),
        eq(pgPaymentCategories.isActive, true),
      ),
    )
    .limit(1);
  if (!category) throw new Error('Payment category not found.');

  const month = input.month?.trim() || null;
  const isRent = /rent/i.test(category.name);
  if (isRent && !month) throw new Error('Month is required for rent payments.');

  if (month) {
    const [dup] = await db
      .select({ id: pgPaymentRecords.id })
      .from(pgPaymentRecords)
      .where(
        and(
          eq(pgPaymentRecords.categoryId, input.categoryId),
          eq(pgPaymentRecords.customerId, input.customerId),
          eq(pgPaymentRecords.month, month),
          eq(pgPaymentRecords.status, 'pending'),
        ),
      )
      .limit(1);
    if (dup) throw new Error('You already have a pending payment for this category and month.');
  }

  const [row] = await db
    .insert(pgPaymentRecords)
    .values({
      pgId: input.pgId,
      categoryId: input.categoryId,
      customerId: input.customerId,
      bookingId: input.bookingId ?? null,
      amountPaise: input.amountPaise,
      month,
      paymentScreenshotUrl: input.paymentScreenshotUrl.trim(),
      transactionRef: input.transactionRef?.trim() || null,
      status: 'pending',
    })
    .returning();

  const { linkResidentUpload } = await import('@/src/services/residentUploadEvents');
  await linkResidentUpload({
    storagePath: input.paymentScreenshotUrl.trim(),
    adminQueue: 'collections',
    linkedEntity: 'pg_payment_record',
    linkedEntityId: row.id,
    bookingId: input.bookingId ?? null,
    pgId: input.pgId,
  }).catch(() => undefined);

  return row;
}

/** Submit UPI proof for a new booking checkout (rent + deposit + reservation request). */
export async function submitBookingPaymentRecord(input: SubmitBookingPaymentInput) {
  if (input.amountPaise <= 0) throw new Error('Amount must be greater than zero.');

  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      status: bookings.status,
      durationMode: bookings.durationMode,
      totalPaise: bookings.totalPaise,
    })
    .from(bookings)
    .where(eq(bookings.bookingCode, input.bookingCode))
    .limit(1);

  if (!booking) throw new Error('Booking not found.');
  if (booking.customerId !== input.customerId) throw new Error('Access denied.');
  if (
    booking.status !== 'draft' &&
    booking.status !== 'pending_payment' &&
    booking.status !== 'pending_approval'
  ) {
    throw new Error('This booking is not awaiting payment.');
  }

  const { pgIdForBookingDraft } = await import('@/src/services/reservationRequest');
  const pgId = await pgIdForBookingDraft(booking.id);
  if (!pgId) throw new Error('Could not resolve PG for this booking.');

  const category = await getRentDepositBookingCategory(pgId);
  if (!category) {
    throw new Error('Payment QR is not configured for this PG yet.');
  }

  const [dup] = await db
    .select({
      id: pgPaymentRecords.id,
      paymentScreenshotUrl: pgPaymentRecords.paymentScreenshotUrl,
    })
    .from(pgPaymentRecords)
    .where(
      and(
        eq(pgPaymentRecords.bookingId, booking.id),
        eq(pgPaymentRecords.status, 'pending'),
      ),
    )
    .limit(1);
  if (dup?.paymentScreenshotUrl?.trim()) {
    throw new Error('Payment proof is already pending review for this booking.');
  }

  const proof = {
    paymentScreenshotUrl: input.paymentScreenshotUrl.trim(),
    transactionRef: input.transactionRef,
  };

  const row = await db.transaction(async (tx) => {
    const [dupInTx] = await tx
      .select({
        id: pgPaymentRecords.id,
        paymentScreenshotUrl: pgPaymentRecords.paymentScreenshotUrl,
      })
      .from(pgPaymentRecords)
      .where(
        and(
          eq(pgPaymentRecords.bookingId, booking.id),
          eq(pgPaymentRecords.status, 'pending'),
        ),
      )
      .limit(1);
    if (dupInTx?.paymentScreenshotUrl?.trim()) {
      throw new Error('Payment proof is already pending review for this booking.');
    }

    let paymentRow: typeof pgPaymentRecords.$inferSelect;
    if (dupInTx) {
      const [updated] = await tx
        .update(pgPaymentRecords)
        .set({
          amountPaise: input.amountPaise,
          paymentScreenshotUrl: proof.paymentScreenshotUrl,
          transactionRef: proof.transactionRef?.trim() || null,
          reviewedByAdminId: null,
          reviewedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(pgPaymentRecords.id, dupInTx.id))
        .returning();
      if (!updated) throw new Error('Could not update payment record.');
      paymentRow = updated;
    } else {
      const [inserted] = await tx
        .insert(pgPaymentRecords)
        .values({
          pgId,
          categoryId: category.id,
          customerId: input.customerId,
          amountPaise: input.amountPaise,
          paymentScreenshotUrl: proof.paymentScreenshotUrl,
          transactionRef: proof.transactionRef?.trim() || null,
          status: 'pending',
          bookingId: booking.id,
        })
        .returning();
      if (!inserted) throw new Error('Could not create payment record.');
      paymentRow = inserted;
    }

    const { supersedeActiveRejection } = await import('@/src/services/paymentProofRejectionService');
    await supersedeActiveRejection('pg_payment_record', paymentRow.id, tx);

    if (booking.durationMode === 'reserve') {
      const { activateBedReserveRequestForBooking } = await import('@/src/services/bedReserve');
      await activateBedReserveRequestForBooking(booking.id, proof, tx);
    }

    return paymentRow;
  });

  if (booking.durationMode !== 'reserve') {
    const { activateReservationRequestForBooking } = await import(
      '@/src/services/reservationRequest'
    );
    await activateReservationRequestForBooking(booking.id);
  }

  void runPostBookingPaymentSubmitSideEffects({
    row,
    bookingId: booking.id,
    bookingCode: input.bookingCode,
    pgId,
    proofUrl: proof.paymentScreenshotUrl,
    membershipId: input.membershipId,
    membershipAmountPaise: input.membershipAmountPaise,
    customerId: input.customerId,
    transactionRef: input.transactionRef,
  });

  return row;
}

function runPostBookingPaymentSubmitSideEffects(input: {
  row: { id: string };
  bookingId: string;
  bookingCode: string;
  pgId: string;
  proofUrl: string;
  customerId: string;
  membershipId?: string;
  membershipAmountPaise?: number;
  transactionRef?: string | null;
}): void {
  void (async () => {
    try {
      const { linkResidentUpload } = await import('@/src/services/residentUploadEvents');
      await linkResidentUpload({
        storagePath: input.proofUrl,
        adminQueue: 'collections',
        linkedEntity: 'pg_payment_record',
        linkedEntityId: input.row.id,
        bookingId: input.bookingId,
        pgId: input.pgId,
      }).catch(() => undefined);

      if (input.membershipId && input.membershipAmountPaise) {
        const { submitMembershipPaymentProof } = await import('./playstationMembership');
        await submitMembershipPaymentProof({
          membershipId: input.membershipId,
          customerId: input.customerId,
          paymentProofUrl: input.proofUrl,
          transactionRef: input.transactionRef ?? undefined,
        });
      }

      const { scheduleAdminNotificationSync } = await import('@/src/services/adminLiveSync');
      scheduleAdminNotificationSync();

      const { trackAnalyticsEvent } = await import('./visitorAnalytics');
      void trackAnalyticsEvent({
        eventType: 'payment_uploaded',
        metadata: { bookingCode: input.bookingCode, bookingId: input.bookingId },
      });

      const { revalidateOccupancyViews } = await import('@/src/lib/occupancyRevalidate');
      revalidateOccupancyViews(input.pgId);
    } catch (err) {
      console.error('post booking payment submit side effects failed', err);
    }
  })();
}

/** Pending UPI proof for a booking checkout (rent + deposit ± PS4 add-on). */
export async function getPendingBookingPaymentRecord(bookingId: string, customerId: string) {
  const [row] = await db
    .select({
      id: pgPaymentRecords.id,
      paymentScreenshotUrl: pgPaymentRecords.paymentScreenshotUrl,
    })
    .from(pgPaymentRecords)
    .where(
      and(
        eq(pgPaymentRecords.bookingId, bookingId),
        eq(pgPaymentRecords.customerId, customerId),
        eq(pgPaymentRecords.status, 'pending'),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Booking checkout context for admin payment review (rent/deposit split). */
export async function getQrBookingPaymentReview(recordId: string) {
  const [record] = await db
    .select({
      id: pgPaymentRecords.id,
      bookingId: pgPaymentRecords.bookingId,
      amountPaise: pgPaymentRecords.amountPaise,
    })
    .from(pgPaymentRecords)
    .where(eq(pgPaymentRecords.id, recordId))
    .limit(1);
  if (!record?.bookingId) return null;

  const { getBookingPaymentContext, splitBookingPayment } = await import('./depositCollection');
  const ctx = await getBookingPaymentContext(record.bookingId);
  if (!ctx) return null;

  const bookingPaymentPaise = record.amountPaise;
  const split = splitBookingPayment(ctx, bookingPaymentPaise);

  return {
    bookingCode: ctx.bookingCode,
    bookingTotalDuePaise: ctx.totalPaise,
    amountSubmittedPaise: record.amountPaise,
    rentDuePaise: split.rentDuePaise,
    depositCashDuePaise: split.depositCashDuePaise,
    rentPaisePaid: split.rentPaisePaid,
    depositPaisePaid: split.depositPaisePaid,
    depositDuePaise: split.depositDuePaise,
    isFullPayment: split.isFullPayment,
    canPartialApprove: !split.isFullPayment && split.depositPaisePaid > 0,
  };
}

export async function listOwnerPayments(
  session: AdminSession,
  filters?: { pgId?: string; status?: 'pending' | 'approved' | 'rejected'; month?: string },
) {
  const pgRows = await db
    .select({ id: pgs.id })
    .from(pgs)
    .where(isNull(pgs.archivedAt));

  const allowedPgIds = pgRows
    .map((r) => r.id)
    .filter((id) => adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, id));

  if (allowedPgIds.length === 0) return [];

  const conditions = [inArray(pgPaymentRecords.pgId, allowedPgIds)];
  if (filters?.pgId) {
    if (!allowedPgIds.includes(filters.pgId)) throw new Error('Access denied.');
    conditions.push(eq(pgPaymentRecords.pgId, filters.pgId));
  }
  if (filters?.status) conditions.push(eq(pgPaymentRecords.status, filters.status));
  if (filters?.month) conditions.push(eq(pgPaymentRecords.month, filters.month));

  return db
    .select({
      id: pgPaymentRecords.id,
      pgId: pgPaymentRecords.pgId,
      pgName: pgs.name,
      categoryId: pgPaymentRecords.categoryId,
      categoryName: pgPaymentCategories.name,
      customerId: pgPaymentRecords.customerId,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      customerEmail: customers.email,
      amountPaise: pgPaymentRecords.amountPaise,
      month: pgPaymentRecords.month,
      status: pgPaymentRecords.status,
      paymentScreenshotUrl: pgPaymentRecords.paymentScreenshotUrl,
      transactionRef: pgPaymentRecords.transactionRef,
      createdAt: pgPaymentRecords.createdAt,
      bookingId: pgPaymentRecords.bookingId,
      bookingCode: bookings.bookingCode,
    })
    .from(pgPaymentRecords)
    .innerJoin(pgs, eq(pgs.id, pgPaymentRecords.pgId))
    .innerJoin(pgPaymentCategories, eq(pgPaymentCategories.id, pgPaymentRecords.categoryId))
    .innerJoin(customers, eq(customers.id, pgPaymentRecords.customerId))
    .leftJoin(bookings, eq(bookings.id, pgPaymentRecords.bookingId))
    .where(and(...conditions))
    .orderBy(desc(pgPaymentRecords.createdAt));
}

export async function listCustomerPaymentsForPg(
  customerId: string,
  pgId: string,
  filters?: { status?: 'pending' | 'approved' | 'rejected'; month?: string; categoryId?: string },
) {
  const conditions = [
    eq(pgPaymentRecords.customerId, customerId),
    eq(pgPaymentRecords.pgId, pgId),
  ];
  if (filters?.status) conditions.push(eq(pgPaymentRecords.status, filters.status));
  if (filters?.month) conditions.push(eq(pgPaymentRecords.month, filters.month));
  if (filters?.categoryId) conditions.push(eq(pgPaymentRecords.categoryId, filters.categoryId));

  return db
    .select({
      id: pgPaymentRecords.id,
      categoryId: pgPaymentRecords.categoryId,
      categoryName: pgPaymentCategories.name,
      amountPaise: pgPaymentRecords.amountPaise,
      month: pgPaymentRecords.month,
      status: pgPaymentRecords.status,
      paymentScreenshotUrl: pgPaymentRecords.paymentScreenshotUrl,
      transactionRef: pgPaymentRecords.transactionRef,
      createdAt: pgPaymentRecords.createdAt,
    })
    .from(pgPaymentRecords)
    .innerJoin(pgPaymentCategories, eq(pgPaymentCategories.id, pgPaymentRecords.categoryId))
    .where(and(...conditions))
    .orderBy(desc(pgPaymentRecords.createdAt));
}

export type ReviewPaymentRecordResult =
  | { outcome: 'approved' }
  | { outcome: 'already_approved' };

async function bookingQrPaymentAlreadyProcessed(
  bookingId: string,
  recordId: string,
): Promise<boolean> {
  const [byProviderId] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.provider, 'upi_manual'),
        eq(payments.providerPaymentId, `qr_record_${recordId}`),
        eq(payments.status, 'succeeded'),
      ),
    )
    .limit(1);
  if (byProviderId) return true;

  const [byBooking] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, bookingId),
        inArray(payments.purpose, ['booking', 'bed_reserve']),
        eq(payments.status, 'succeeded'),
      ),
    )
    .limit(1);
  return Boolean(byBooking);
}

/** After reserve payment approval — activate/repair hold and bust occupancy caches. */
async function finalizeApprovedReserveBooking(
  bookingId: string | null | undefined,
  pgId?: string | null,
): Promise<void> {
  if (!bookingId) return;
  const [booking] = await db
    .select({ durationMode: bookings.durationMode })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (booking?.durationMode !== 'reserve') return;
  const { ensureBedReserveHoldActiveForBooking } = await import('./bedReserve');
  await ensureBedReserveHoldActiveForBooking(bookingId);
  const { revalidateOccupancyViews } = await import('@/src/lib/occupancyRevalidate');
  revalidateOccupancyViews(pgId);
}

export async function reviewPaymentRecord(
  session: AdminSession,
  recordId: string,
  status: 'approved' | 'rejected',
  opts?: {
    partialDeposit?: { depositDueDate: string };
    reviewMeta?: {
      overpaymentDisposition?: string;
      reviewNotes?: string;
      approvalNotes?: string;
    };
  },
): Promise<ReviewPaymentRecordResult> {
  const [record] = await db
    .select()
    .from(pgPaymentRecords)
    .where(eq(pgPaymentRecords.id, recordId))
    .limit(1);
  if (!record) throw new Error('Payment record not found.');
  assertPgAccess(session, record.pgId);

  const { finalizeStaleBookingPaymentReview } = await import('./paymentProofReviewCleanup');

  if (record.status === 'approved') {
    await finalizeStaleBookingPaymentReview({
      recordId,
      bookingId: record.bookingId,
      reviewedByAdminId: session.adminId,
    });
    return { outcome: 'already_approved' };
  }
  if (record.status !== 'pending') {
    throw new Error('Only pending payments can be reviewed.');
  }

  if (record.bookingId) {
    const [bookingRow] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, record.bookingId))
      .limit(1);
    if (
      bookingRow &&
      !isBookingCheckoutEligibleForPaymentReview(bookingRow.status)
    ) {
      await finalizeStaleBookingPaymentReview({
        recordId,
        bookingId: record.bookingId,
        reviewedByAdminId: session.adminId,
      });
      return { outcome: 'already_approved' };
    }
  }

  if (status === 'approved' && record.bookingId) {
    const [booking] = await db
      .select({
        bookingCode: bookings.bookingCode,
        status: bookings.status,
        subtotalPaise: bookings.subtotalPaise,
        discountPaise: bookings.discountPaise,
        depositPaise: bookings.depositPaise,
        totalPaise: bookings.totalPaise,
        pricingSnapshot: bookings.pricingSnapshot,
      })
      .from(bookings)
      .where(eq(bookings.id, record.bookingId))
      .limit(1);

    const financialAlreadyApplied = await bookingQrPaymentAlreadyProcessed(
      record.bookingId,
      recordId,
    );

    if (
      booking &&
      (financialAlreadyApplied ||
        !isBookingCheckoutEligibleForPaymentReview(booking.status)) &&
      status === 'approved'
    ) {
      await finalizeStaleBookingPaymentReview({
        recordId,
        bookingId: record.bookingId,
        reviewedByAdminId: session.adminId,
      });
      await finalizeApprovedReserveBooking(record.bookingId, record.pgId);
      return financialAlreadyApplied
        ? { outcome: 'already_approved' }
        : { outcome: 'approved' };
    }

    if (booking?.status === 'pending_payment' || booking?.status === 'pending_approval') {
      const { recordPaymentSuccess } = await import('./bookingLifecycle');
      const {
        computeBookingCheckoutOverpaymentPaise,
        normalizeOverpaymentDisposition,
      } = await import('./bookingOverpayment');

      let overpayment:
        | {
            excessPaise: number;
            disposition: 'wallet_credit' | 'future_adjustment' | 'refund' | 'refund_later';
            approvedByAdminId: string;
          }
        | undefined;

      const excessPaise = computeBookingCheckoutOverpaymentPaise({
        booking,
        amountPaise: record.amountPaise,
      });
      if (excessPaise > 0) {
        const disposition = normalizeOverpaymentDisposition(
          opts?.reviewMeta?.overpaymentDisposition,
        );
        if (!disposition) {
          throw new Error(
            `Payment exceeds checkout total by ₹${(excessPaise / 100).toFixed(0)}. Select an overpayment disposition before approving.`,
          );
        }
        overpayment = {
          excessPaise,
          disposition,
          approvedByAdminId: session.adminId,
        };
      }

      const paymentResult = await recordPaymentSuccess({
        provider: 'upi_manual',
        providerPaymentId: `qr_record_${recordId}`,
        providerOrderId: record.transactionRef ?? recordId,
        amountPaise: record.amountPaise,
        bookingCode: booking.bookingCode,
        rawPayload: {
          pgPaymentRecordId: recordId,
          category: RENT_DEPOSIT_BOOKING_CATEGORY_NAME,
          partialDeposit: opts?.partialDeposit ?? null,
          operationsReview: opts?.reviewMeta ?? null,
        },
        partialDeposit: opts?.partialDeposit
          ? {
              depositDueDate: opts.partialDeposit.depositDueDate,
              approvedByAdminId: session.adminId,
            }
          : undefined,
        overpayment,
      });
      if (!paymentResult.ok) {
        const alreadyProcessed = await bookingQrPaymentAlreadyProcessed(
          record.bookingId,
          recordId,
        );
        if (alreadyProcessed) {
          await finalizeStaleBookingPaymentReview({
            recordId,
            bookingId: record.bookingId,
            reviewedByAdminId: session.adminId,
          });
          await finalizeApprovedReserveBooking(record.bookingId, record.pgId);
          return { outcome: 'already_approved' };
        }
        throw new Error(
          paymentResult.reason ??
            'Could not confirm booking — the bed may already be taken by another approved payment.',
        );
      }
    }
  }

  if (status === 'rejected') {
    throw new Error(
      'Use rejectPaymentProof for payment proof rejection — booking stays active for re-upload.',
    );
  }

  await finalizeStaleBookingPaymentReview({
    recordId,
    bookingId: record.bookingId,
    reviewedByAdminId: session.adminId,
  });

  await finalizeApprovedReserveBooking(record.bookingId, record.pgId);

  if (status === 'approved') {
    const { trackAnalyticsEvent } = await import('./visitorAnalytics');
    void trackAnalyticsEvent({
      eventType: 'booking_approved',
      metadata: { bookingId: record.bookingId, pgId: record.pgId },
    });
  }

  return { outcome: 'approved' };
}

export async function listPublicPgsWithPayments() {
  return db
    .select({
      id: pgs.id,
      slug: pgs.slug,
      name: pgs.name,
      city: pgs.city,
      state: pgs.state,
      pincode: pgs.pincode,
      genderPolicy: pgs.genderPolicy,
      amenities: pgs.amenities,
      description: pgs.description,
      images: pgs.images,
      hasPaymentEnabled: pgs.hasPaymentEnabled,
    })
    .from(pgs)
    .where(and(isNull(pgs.archivedAt), eq(pgs.isActive, true)))
    .orderBy(pgs.name);
}
