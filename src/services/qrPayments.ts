import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  beds,
  bedReservations,
  bookings,
  customers,
  floors,
  pgPaymentCategories,
  pgPaymentRecords,
  pgs,
  rooms,
} from '@/src/db/schema';
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

  return row;
}

/** Submit UPI proof for a new booking checkout (rent + deposit + reservation). */
export async function submitBookingPaymentRecord(input: SubmitBookingPaymentInput) {
  if (input.amountPaise <= 0) throw new Error('Amount must be greater than zero.');

  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      status: bookings.status,
      totalPaise: bookings.totalPaise,
      pgId: floors.pgId,
    })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(bookings.bookingCode, input.bookingCode))
    .limit(1);

  if (!booking) throw new Error('Booking not found.');
  if (booking.customerId !== input.customerId) throw new Error('Access denied.');
  if (booking.status !== 'pending_payment') {
    throw new Error('This booking is not awaiting payment.');
  }

  const category = await getRentDepositBookingCategory(booking.pgId);
  if (!category) {
    throw new Error('Payment QR is not configured for this PG yet.');
  }

  const [dup] = await db
    .select({ id: pgPaymentRecords.id })
    .from(pgPaymentRecords)
    .where(
      and(
        eq(pgPaymentRecords.bookingId, booking.id),
        eq(pgPaymentRecords.status, 'pending'),
      ),
    )
    .limit(1);
  if (dup) throw new Error('Payment proof is already pending review for this booking.');

  const [row] = await db
    .insert(pgPaymentRecords)
    .values({
      pgId: booking.pgId,
      categoryId: category.id,
      customerId: input.customerId,
      amountPaise: input.amountPaise,
      paymentScreenshotUrl: input.paymentScreenshotUrl.trim(),
      transactionRef: input.transactionRef?.trim() || null,
      status: 'pending',
      bookingId: booking.id,
    })
    .returning();

  // Keep the booking alive while admin reviews proof — holds no longer block
  // the public calendar, but we still cancel abandoned checkouts via cron.
  const reviewHoldUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db
    .update(bedReservations)
    .set({ holdExpiresAt: reviewHoldUntil, updatedAt: new Date() })
    .where(
      and(
        eq(bedReservations.bookingId, booking.id),
        eq(bedReservations.status, 'hold'),
      ),
    );

  if (input.membershipId && input.membershipAmountPaise) {
    const { submitMembershipPaymentProof } = await import('./playstationMembership');
    await submitMembershipPaymentProof({
      membershipId: input.membershipId,
      customerId: input.customerId,
      paymentProofUrl: input.paymentScreenshotUrl,
      transactionRef: input.transactionRef,
    });
  }

  return row!;
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

export async function reviewPaymentRecord(
  session: AdminSession,
  recordId: string,
  status: 'approved' | 'rejected',
) {
  const [record] = await db
    .select()
    .from(pgPaymentRecords)
    .where(eq(pgPaymentRecords.id, recordId))
    .limit(1);
  if (!record) throw new Error('Payment record not found.');
  assertPgAccess(session, record.pgId);
  if (record.status !== 'pending') throw new Error('Only pending payments can be reviewed.');

  if (status === 'approved' && record.bookingId) {
    const [booking] = await db
      .select({ bookingCode: bookings.bookingCode, status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, record.bookingId))
      .limit(1);
    if (booking?.status === 'pending_payment') {
      const { recordPaymentSuccess } = await import('./bookingLifecycle');
      const paymentResult = await recordPaymentSuccess({
        provider: 'upi_manual',
        providerPaymentId: `qr_record_${recordId}`,
        providerOrderId: record.transactionRef ?? recordId,
        amountPaise: record.amountPaise,
        bookingCode: booking.bookingCode,
        rawPayload: { pgPaymentRecordId: recordId, category: RENT_DEPOSIT_BOOKING_CATEGORY_NAME },
      });
      if (!paymentResult.ok) {
        throw new Error(
          paymentResult.reason ??
            'Could not confirm booking — the bed may already be taken by another approved payment.',
        );
      }
      const { activatePendingMembershipForBooking } = await import('./playstationMembership');
      await activatePendingMembershipForBooking(record.bookingId);
    }
  }

  await db
    .update(pgPaymentRecords)
    .set({
      status,
      reviewedByAdminId: session.adminId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(pgPaymentRecords.id, recordId));
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
