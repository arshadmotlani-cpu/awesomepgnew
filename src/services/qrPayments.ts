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
import { isDatabaseSchemaMismatchError, schemaMismatchHint } from '@/src/lib/db/schemaMismatchError';
import type { PriorOutstandingItem } from '@/src/lib/billing/bookingCheckoutTotals';
import { isBookingCheckoutEligibleForPaymentReview } from '@/src/lib/operations/paymentReviewSsot';
import type { OverpaymentDisposition } from '@/src/lib/operations/paymentReviewTypes';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { RENT_DEPOSIT_BOOKING_CATEGORY_NAME } from '@/src/lib/payments/defaultQr';
import { revalidateReservationLifecycleViews } from '@/src/lib/occupancyRevalidate';
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

  const { getBookingPaymentContext } = await import('./depositCollection');
  const paymentCtx = await getBookingPaymentContext(booking.id);
  if (!paymentCtx) throw new Error('Could not load booking payment context.');

  const {
    buildBookingPaymentProofSnapshot,
    proofSnapshotRowValues,
    validateSubmittedAmountAgainstProofSnapshot,
  } = await import('@/src/lib/billing/bookingPaymentProofSnapshot');

  const proofSnapshot = buildBookingPaymentProofSnapshot({
    rentDuePaise: paymentCtx.breakdown.rentDuePaise,
    depositCashDuePaise: paymentCtx.breakdown.depositCashDuePaise,
    priorOutstandingPaise: paymentCtx.priorOutstanding?.totalPaise ?? 0,
    priorOutstandingItems: paymentCtx.priorOutstanding?.items ?? [],
  });

  const amountCheck = validateSubmittedAmountAgainstProofSnapshot(
    input.amountPaise,
    proofSnapshot,
  );
  if (!amountCheck.ok) throw new Error(amountCheck.message);

  const snapshotValues = proofSnapshotRowValues(proofSnapshot, input.amountPaise);

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
          ...snapshotValues,
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
          ...snapshotValues,
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

  revalidateReservationLifecycleViews({ pgId, bookingCode: input.bookingCode });

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

type QrPaymentReviewRecord = {
  id: string;
  bookingId: string | null;
  amountPaise: number;
  status: string;
  proofSnapshotCheckoutTotalPaise: number | null;
  proofSnapshotRentDuePaise: number | null;
  proofSnapshotDepositDuePaise: number | null;
  proofSnapshotPriorOutstandingPaise: number | null;
  proofSnapshotPriorOutstandingJson: PriorOutstandingItem[] | null;
  proofSnapshotSubmittedPaise: number | null;
  snapshotColumnsAvailable: boolean;
};

async function loadQrPaymentRecordForReview(recordId: string): Promise<QrPaymentReviewRecord | null> {
  try {
    const [record] = await db
      .select({
        id: pgPaymentRecords.id,
        bookingId: pgPaymentRecords.bookingId,
        amountPaise: pgPaymentRecords.amountPaise,
        status: pgPaymentRecords.status,
        proofSnapshotCheckoutTotalPaise: pgPaymentRecords.proofSnapshotCheckoutTotalPaise,
        proofSnapshotRentDuePaise: pgPaymentRecords.proofSnapshotRentDuePaise,
        proofSnapshotDepositDuePaise: pgPaymentRecords.proofSnapshotDepositDuePaise,
        proofSnapshotPriorOutstandingPaise: pgPaymentRecords.proofSnapshotPriorOutstandingPaise,
        proofSnapshotPriorOutstandingJson: pgPaymentRecords.proofSnapshotPriorOutstandingJson,
        proofSnapshotSubmittedPaise: pgPaymentRecords.proofSnapshotSubmittedPaise,
      })
      .from(pgPaymentRecords)
      .where(eq(pgPaymentRecords.id, recordId))
      .limit(1);
    if (!record) return null;
    return { ...record, snapshotColumnsAvailable: true };
  } catch (err) {
    if (!isDatabaseSchemaMismatchError(err)) throw err;
    console.error(
      '[payment-review] proof snapshot columns unavailable — using legacy record load.',
      schemaMismatchHint(err),
    );
    const [record] = await db
      .select({
        id: pgPaymentRecords.id,
        bookingId: pgPaymentRecords.bookingId,
        amountPaise: pgPaymentRecords.amountPaise,
        status: pgPaymentRecords.status,
      })
      .from(pgPaymentRecords)
      .where(eq(pgPaymentRecords.id, recordId))
      .limit(1);
    if (!record) return null;
    return {
      ...record,
      proofSnapshotCheckoutTotalPaise: null,
      proofSnapshotRentDuePaise: null,
      proofSnapshotDepositDuePaise: null,
      proofSnapshotPriorOutstandingPaise: null,
      proofSnapshotPriorOutstandingJson: null,
      proofSnapshotSubmittedPaise: null,
      snapshotColumnsAvailable: false,
    };
  }
}

/** Booking checkout context for admin payment review (rent/deposit split). */
export async function getQrBookingPaymentReview(recordId: string) {
  const record = await loadQrPaymentRecordForReview(recordId);
  if (!record?.bookingId) return null;

  const { getBookingPaymentContext, splitBookingPayment } = await import('./depositCollection');
  const ctx = await getBookingPaymentContext(record.bookingId);
  if (!ctx) return null;

  const {
    buildBookingPaymentProofSnapshot,
    resolveBookingProofExpectedCheckout,
  } = await import('@/src/lib/billing/bookingPaymentProofSnapshot');
  const { resolveVerifiedProofAmountPaise, shouldApplyProofAmountSelfHeal, shouldFreezeSubmittedSnapshotOnRepair } = await import(
    '@/src/lib/operations/paymentReviewProofAmount'
  );

  const liveSnapshot = buildBookingPaymentProofSnapshot({
    rentDuePaise: ctx.breakdown.rentDuePaise,
    depositCashDuePaise: ctx.breakdown.depositCashDuePaise,
    priorOutstandingPaise: ctx.priorOutstanding?.totalPaise ?? 0,
    priorOutstandingItems: ctx.priorOutstanding?.items ?? [],
  });

  const expected = resolveBookingProofExpectedCheckout(record, liveSnapshot, {
    storedProofAmountPaise: record.amountPaise,
  });

  const resolution = resolveVerifiedProofAmountPaise({
    storedAmountPaise: record.amountPaise,
    proofSnapshotSubmittedPaise: record.proofSnapshotSubmittedPaise,
    rentDuePaise: expected.rentDuePaise,
    expectedCheckoutPaise: expected.checkoutTotalPaise,
  });

  if (
    record.status === 'pending' &&
    shouldApplyProofAmountSelfHeal({
      resolution,
      storedAmountPaise: record.amountPaise,
      proofSnapshotSubmittedPaise: record.proofSnapshotSubmittedPaise,
      expectedCheckoutPaise: expected.checkoutTotalPaise,
      rentDuePaise: expected.rentDuePaise,
    })
  ) {
    if (record.snapshotColumnsAvailable) {
      const patch: {
        amountPaise: number;
        updatedAt: Date;
        proofSnapshotSubmittedPaise?: number;
      } = {
        amountPaise: resolution.verifiedAmountPaise,
        updatedAt: new Date(),
      };
      if (
        shouldFreezeSubmittedSnapshotOnRepair(
          resolution,
          record.proofSnapshotSubmittedPaise,
        )
      ) {
        patch.proofSnapshotSubmittedPaise = resolution.verifiedAmountPaise;
      } else if (resolution.shouldRepairSubmittedSnapshot) {
        patch.proofSnapshotSubmittedPaise = resolution.verifiedAmountPaise;
      }
      await db.update(pgPaymentRecords).set(patch).where(eq(pgPaymentRecords.id, recordId));
    } else {
      await db
        .update(pgPaymentRecords)
        .set({ amountPaise: resolution.verifiedAmountPaise, updatedAt: new Date() })
        .where(eq(pgPaymentRecords.id, recordId));
    }
  }

  const bookingPaymentPaise = resolution.verifiedAmountPaise;
  const split = splitBookingPayment(
    {
      ...ctx,
      pricingSnapshot: ctx.pricingSnapshot
        ? {
            ...ctx.pricingSnapshot,
            priorOutstanding:
              expected.priorOutstandingPaise > 0
                ? {
                    totalPaise: expected.priorOutstandingPaise,
                    items: expected.priorOutstandingItems,
                  }
                : undefined,
          }
        : null,
    },
    bookingPaymentPaise,
  );

  return {
    bookingCode: ctx.bookingCode,
    bookingTotalDuePaise: expected.checkoutTotalPaise,
    amountSubmittedPaise: bookingPaymentPaise,
    verifiedProofAmountPaise: bookingPaymentPaise,
    rentDuePaise: expected.rentDuePaise,
    depositCashDuePaise: expected.depositDuePaise,
    priorOutstandingDuePaise: expected.priorOutstandingPaise,
    priorOutstandingItems: expected.priorOutstandingItems,
    rentPaisePaid: split.rentPaisePaid,
    depositPaisePaid: split.depositPaisePaid,
    depositDuePaise: split.depositDuePaise,
    isFullPayment: bookingPaymentPaise >= expected.checkoutTotalPaise,
    canPartialApprove: !split.isFullPayment && split.depositPaisePaid > 0,
    liveCheckoutTotalPaise: liveSnapshot.checkoutTotalPaise,
    proofSnapshotFrozen: record.proofSnapshotCheckoutTotalPaise != null,
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
      proofSnapshotSubmittedPaise: pgPaymentRecords.proofSnapshotSubmittedPaise,
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

/** After reserve payment approval — activate/repair hold (no cache bust; caller revalidates). */
async function finalizeApprovedReserveBooking(
  bookingId: string | null | undefined,
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
}

async function revalidateAfterBookingPaymentReview(input: {
  pgId: string;
  bookingId: string | null;
}): Promise<void> {
  if (!input.bookingId) {
    revalidateReservationLifecycleViews({ pgId: input.pgId });
    return;
  }
  const [bookingRow] = await db
    .select({ bookingCode: bookings.bookingCode })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  revalidateReservationLifecycleViews({
    pgId: input.pgId,
    bookingCode: bookingRow?.bookingCode ?? null,
  });
}

export type AdminPaymentAllocationInput = {
  confirmedReceivedPaise: number;
  rentAllocatedPaise: number;
  depositAllocatedPaise: number;
  electricityAllocatedPaise?: number;
  otherAllocatedPaise?: number;
  depositDueDate?: string;
  allocationNotes?: string;
};

export async function reviewPaymentRecord(
  session: AdminSession,
  recordId: string,
  status: 'approved' | 'rejected',
  opts?: {
    partialDeposit?: { depositDueDate: string };
    paymentAllocation?: AdminPaymentAllocationInput;
    reviewMeta?: {
      overpaymentDisposition?: string;
      reviewNotes?: string;
      approvalNotes?: string;
    };
    /** Verification-only approve — confirm booking without rent/deposit allocation. */
    verificationOnly?: boolean;
  },
): Promise<ReviewPaymentRecordResult> {
  if (status === 'rejected') {
    throw new Error(
      'Use rejectPaymentProof for payment proof rejection — booking stays active for re-upload.',
    );
  }

  const [record] = await db
    .select()
    .from(pgPaymentRecords)
    .where(eq(pgPaymentRecords.id, recordId))
    .limit(1);
  if (!record) throw new Error('Payment record not found.');
  assertPgAccess(session, record.pgId);

  const { finalizeStaleBookingPaymentReview } = await import('./paymentProofReviewCleanup');

  let outcome: ReviewPaymentRecordResult;

  if (record.status === 'approved') {
    await finalizeStaleBookingPaymentReview({
      recordId,
      bookingId: record.bookingId,
      reviewedByAdminId: session.adminId,
    });
    outcome = { outcome: 'already_approved' };
  } else if (record.status !== 'pending') {
    throw new Error('Only pending payments can be reviewed.');
  } else if (record.bookingId) {
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
      outcome = { outcome: 'already_approved' };
    } else {
      const [booking] = await db
        .select({
          bookingCode: bookings.bookingCode,
          status: bookings.status,
          durationMode: bookings.durationMode,
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
          !isBookingCheckoutEligibleForPaymentReview(booking.status))
      ) {
        await finalizeStaleBookingPaymentReview({
          recordId,
          bookingId: record.bookingId,
          reviewedByAdminId: session.adminId,
        });
        await finalizeApprovedReserveBooking(record.bookingId);
        outcome = financialAlreadyApplied
          ? { outcome: 'already_approved' }
          : { outcome: 'approved' };
      } else if (booking?.status === 'pending_payment' || booking?.status === 'pending_approval') {
        if (opts?.verificationOnly) {
          const screenshotAmountPaise =
            record.proofSnapshotSubmittedPaise != null && record.proofSnapshotSubmittedPaise > 0
              ? record.proofSnapshotSubmittedPaise
              : record.amountPaise;

          const { breakdownBookingCheckoutPayment } = await import(
            '@/src/lib/billing/bookingCheckoutTotals'
          );
          const checkoutBreakdown = breakdownBookingCheckoutPayment({
            subtotalPaise: booking.subtotalPaise,
            discountPaise: booking.discountPaise,
            depositPaise: booking.depositPaise,
            pricingSnapshot: booking.pricingSnapshot,
          });
          const contractAmountPaise =
            checkoutBreakdown.rentDuePaise + checkoutBreakdown.depositCashDuePaise;

          const { recordPaymentSuccess } = await import('./bookingLifecycle');

          const paymentResult = await recordPaymentSuccess({
            provider: 'upi_manual',
            providerPaymentId: `qr_record_${recordId}`,
            providerOrderId: record.transactionRef ?? recordId,
            amountPaise: contractAmountPaise,
            bookingCode: booking.bookingCode,
            rawPayload: {
              pgPaymentRecordId: recordId,
              category: RENT_DEPOSIT_BOOKING_CATEGORY_NAME,
              verificationOnly: true,
              screenshotAmountPaise,
              operationsReview: opts?.reviewMeta ?? null,
            },
            recordedByAdminId: session.adminId,
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
              await finalizeApprovedReserveBooking(record.bookingId);
              outcome = { outcome: 'already_approved' };
            } else {
              throw new Error(
                paymentResult.reason ??
                  'Could not confirm booking — the bed may already be taken by another approved payment.',
              );
            }
          } else {
            await finalizeStaleBookingPaymentReview({
              recordId,
              bookingId: record.bookingId,
              reviewedByAdminId: session.adminId,
              confirmedAmountPaise: screenshotAmountPaise,
            });
            await finalizeApprovedReserveBooking(record.bookingId);
            outcome = { outcome: 'approved' };
          }
        } else {
        const allocation = opts?.paymentAllocation;
        if (!allocation) {
          throw new Error(
            'Admin payment allocation is required before approving booking checkout payments.',
          );
        }

        const { recordPaymentSuccess } = await import('./bookingLifecycle');

        const confirmedReceivedPaise = allocation.confirmedReceivedPaise;
        const electricityAllocatedPaise = allocation.electricityAllocatedPaise ?? 0;
        const otherAllocatedPaise = allocation.otherAllocatedPaise ?? 0;

        const unallocatedPaise = Math.max(
          0,
          confirmedReceivedPaise -
            allocation.rentAllocatedPaise -
            allocation.depositAllocatedPaise -
            electricityAllocatedPaise -
            otherAllocatedPaise,
        );

        if (unallocatedPaise > 0) {
          throw new Error(
            `₹${(unallocatedPaise / 100).toFixed(0)} is unallocated. Allocate the full payment before approving.`,
          );
        }

        const { correctPendingPaymentProofAmount } = await import('./paymentProofCorrection');
        const correction = await correctPendingPaymentProofAmount({
          recordId,
          verifiedAmountPaise: confirmedReceivedPaise,
          adminId: session.adminId,
          reason: allocation.allocationNotes ?? 'Admin allocation approval',
        });
        if (!correction.ok) {
          throw new Error(correction.reason);
        }

        const paymentResult = await recordPaymentSuccess({
          provider: 'upi_manual',
          providerPaymentId: `qr_record_${recordId}`,
          providerOrderId: record.transactionRef ?? recordId,
          amountPaise: confirmedReceivedPaise,
          bookingCode: booking.bookingCode,
          rawPayload: {
            pgPaymentRecordId: recordId,
            category: RENT_DEPOSIT_BOOKING_CATEGORY_NAME,
            partialDeposit: opts?.partialDeposit ?? null,
            paymentAllocation: allocation ?? null,
            operationsReview: opts?.reviewMeta ?? null,
          },
          partialDeposit: opts?.partialDeposit
            ? {
                depositDueDate: opts.partialDeposit.depositDueDate,
                approvedByAdminId: session.adminId,
              }
            : undefined,
          paymentAllocation: {
                confirmedReceivedPaise,
                rentAllocatedPaise: allocation.rentAllocatedPaise,
                depositAllocatedPaise: allocation.depositAllocatedPaise,
                electricityAllocatedPaise,
                otherAllocatedPaise,
                depositDueDate: allocation.depositDueDate,
                approvedByAdminId: session.adminId,
                allocationNotes: allocation.allocationNotes,
                pgPaymentRecordId: recordId,
              },
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
            await finalizeApprovedReserveBooking(record.bookingId);
            outcome = { outcome: 'already_approved' };
          } else {
            throw new Error(
              paymentResult.reason ??
                'Could not confirm booking — the bed may already be taken by another approved payment.',
            );
          }
        } else {
          await finalizeStaleBookingPaymentReview({
            recordId,
            bookingId: record.bookingId,
            reviewedByAdminId: session.adminId,
            confirmedAmountPaise: allocation ? confirmedReceivedPaise : undefined,
          });
          await finalizeApprovedReserveBooking(record.bookingId);
          outcome = { outcome: 'approved' };
        }
        }
      } else {
        await finalizeStaleBookingPaymentReview({
          recordId,
          bookingId: record.bookingId,
          reviewedByAdminId: session.adminId,
        });
        await finalizeApprovedReserveBooking(record.bookingId);
        outcome = { outcome: 'approved' };
      }
    }
  } else {
    await finalizeStaleBookingPaymentReview({
      recordId,
      bookingId: record.bookingId,
      reviewedByAdminId: session.adminId,
    });
    await finalizeApprovedReserveBooking(record.bookingId);
    outcome = { outcome: 'approved' };
  }

  const { trackAnalyticsEvent } = await import('./visitorAnalytics');
  void trackAnalyticsEvent({
    eventType: 'booking_approved',
    metadata: { bookingId: record.bookingId, pgId: record.pgId },
  });

  await revalidateAfterBookingPaymentReview({
    pgId: record.pgId,
    bookingId: record.bookingId,
  });
  return outcome;
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
