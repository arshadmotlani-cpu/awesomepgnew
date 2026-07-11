/**
 * Payment proof rejection SSOT — one pipeline for all proof types.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, type Database } from '@/src/db/client';
import {
  adminUsers,
  bedReservations,
  beds,
  bookings,
  customers,
  electricityInvoices,
  financialInvoices,
  floors,
  invoiceAuditEvents,
  paymentLinks,
  paymentProofRejections,
  pgPaymentRecords,
  rentInvoices,
  rooms,
  stayExtensions,
  type PaymentProofEntityType,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import {
  buildPaymentRejectionWhatsAppUrl,
  rejectionReasonLabel,
  validateRejectionInput,
  type PaymentProofRejectionReasonCode,
} from '@/src/lib/approvals/paymentProofRejectionReasons';
import { writeAuditLogNonBlocking } from '@/src/lib/audit/writeAuditLog';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { revalidateReservationLifecycleViews } from '@/src/lib/occupancyRevalidate';
import { projectInvoice } from '@/src/services/rentInvoices';

/** Drizzle client or transaction — pass when superseding inside an upload transaction. */
export type DbExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export type RejectPaymentProofInput = {
  reviewKey: string;
  entityType: PaymentProofEntityType;
  entityId: string;
  reasonCode: PaymentProofRejectionReasonCode;
  reasonDetail?: string;
  adminNote?: string;
  residentMessage: string;
  sendWhatsApp: boolean;
  /** Context from review queue item — avoids extra lookups when available. */
  context?: {
    customerId?: string | null;
    pgId?: string;
    bookingId?: string | null;
    residentName?: string;
    phone?: string | null;
    billLabel?: string;
    amountPaise?: number;
  };
};

export type PaymentProofRejectionRow = typeof paymentProofRejections.$inferSelect;

export type PaymentProofRejectionHistoryRow = PaymentProofRejectionRow & {
  rejectedByName: string | null;
};

export function reviewKindToEntityType(
  kind: PendingPaymentReviewItem['kind'],
): PaymentProofEntityType {
  switch (kind) {
    case 'qr':
      return 'pg_payment_record';
    case 'rent':
      return 'rent_invoice';
    case 'electricity':
      return 'electricity_invoice';
    case 'extension':
      return 'stay_extension';
    case 'deposit_link':
      return 'payment_link';
  }
}

export function residentPayHrefForEntity(
  entityType: PaymentProofEntityType,
  entityId: string,
  bookingCode?: string | null,
): string {
  switch (entityType) {
    case 'rent_invoice':
      return `/account/resident/pay-rent/${entityId}`;
    case 'electricity_invoice':
      return `/account/resident/pay-electricity/${entityId}`;
    case 'payment_link':
      return `/pay/${entityId}`;
    case 'pg_payment_record':
      return bookingCode ? `/booking/${bookingCode}/pay` : '/account';
    case 'stay_extension':
      return bookingCode ? `/booking/${bookingCode}/pay` : '/account';
  }
}

async function loadEntityContext(
  entityType: PaymentProofEntityType,
  entityId: string,
): Promise<
  | {
      customerId: string;
      pgId: string;
      bookingId: string | null;
      residentName: string;
      phone: string | null;
      billLabel: string;
      amountPaise: number;
      hasProof: boolean;
    }
  | null
> {
  switch (entityType) {
    case 'rent_invoice': {
      const [row] = await db
        .select({
          invoice: rentInvoices,
          customerName: customers.fullName,
          phone: customers.phone,
        })
        .from(rentInvoices)
        .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
        .where(eq(rentInvoices.id, entityId))
        .limit(1);
      if (!row) return null;
      const { projectInvoice } = await import('@/src/services/rentInvoices');
      const projected = projectInvoice(row.invoice);
      return {
        customerId: row.invoice.customerId,
        pgId: row.invoice.pgId,
        bookingId: row.invoice.bookingId,
        residentName: row.customerName,
        phone: row.phone,
        billLabel: `Rent · ${row.invoice.billingMonth.slice(0, 7)} (${row.invoice.invoiceNumber})`,
        amountPaise: projected.outstandingPaise,
        hasProof: Boolean(row.invoice.paymentProofUrl),
      };
    }
    case 'electricity_invoice': {
      const [row] = await db
        .select({
          customerId: electricityInvoices.customerId,
          bookingId: electricityInvoices.bookingId,
          paymentProofUrl: electricityInvoices.paymentProofUrl,
          invoiceNumber: electricityInvoices.invoiceNumber,
          billingMonth: electricityInvoices.billingMonth,
          amountPaise: electricityInvoices.amountPaise,
          customerName: customers.fullName,
          phone: customers.phone,
          pgId: financialInvoices.pgId,
        })
        .from(electricityInvoices)
        .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
        .leftJoin(
          financialInvoices,
          and(
            eq(financialInvoices.sourceId, electricityInvoices.id),
            eq(financialInvoices.sourceTable, 'electricity_invoices'),
          ),
        )
        .where(eq(electricityInvoices.id, entityId))
        .limit(1);
      if (!row || !row.pgId) return null;
      return {
        customerId: row.customerId,
        pgId: row.pgId,
        bookingId: row.bookingId,
        residentName: row.customerName,
        phone: row.phone,
        billLabel: `Electricity · ${row.billingMonth.slice(0, 7)} (${row.invoiceNumber})`,
        amountPaise: row.amountPaise,
        hasProof: Boolean(row.paymentProofUrl),
      };
    }
    case 'payment_link': {
      const [row] = await db
        .select({
          customerId: paymentLinks.residentId,
          pgId: paymentLinks.pgId,
          bookingId: paymentLinks.bookingId,
          paymentProofUrl: paymentLinks.paymentProofUrl,
          title: paymentLinks.title,
          amount: paymentLinks.amount,
          customerName: customers.fullName,
          phone: customers.phone,
        })
        .from(paymentLinks)
        .innerJoin(customers, eq(customers.id, paymentLinks.residentId))
        .where(eq(paymentLinks.id, entityId))
        .limit(1);
      if (!row) return null;
      return {
        customerId: row.customerId,
        pgId: row.pgId,
        bookingId: row.bookingId,
        residentName: row.customerName,
        phone: row.phone,
        billLabel: row.title ?? 'Security deposit',
        amountPaise: row.amount,
        hasProof: Boolean(row.paymentProofUrl),
      };
    }
    case 'stay_extension': {
      const [row] = await db
        .select({
          bookingId: stayExtensions.bookingId,
          paymentProofUrl: stayExtensions.paymentProofUrl,
          quotedTotalPaise: stayExtensions.quotedTotalPaise,
          customerId: bookings.customerId,
          customerName: customers.fullName,
          phone: customers.phone,
          bookingCode: bookings.bookingCode,
          pgId: floors.pgId,
        })
        .from(stayExtensions)
        .innerJoin(bookings, eq(bookings.id, stayExtensions.bookingId))
        .innerJoin(customers, eq(customers.id, bookings.customerId))
        .innerJoin(
          bedReservations,
          and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
        )
        .innerJoin(beds, eq(beds.id, bedReservations.bedId))
        .innerJoin(rooms, eq(rooms.id, beds.roomId))
        .innerJoin(floors, eq(floors.id, rooms.floorId))
        .where(eq(stayExtensions.id, entityId))
        .limit(1);
      if (!row) return null;
      return {
        customerId: row.customerId,
        pgId: row.pgId,
        bookingId: row.bookingId,
        residentName: row.customerName,
        phone: row.phone,
        billLabel: `Extension · ${row.bookingCode}`,
        amountPaise: row.quotedTotalPaise,
        hasProof: Boolean(row.paymentProofUrl),
      };
    }
    case 'pg_payment_record': {
      const [row] = await db
        .select({
          customerId: pgPaymentRecords.customerId,
          pgId: pgPaymentRecords.pgId,
          bookingId: pgPaymentRecords.bookingId,
          paymentScreenshotUrl: pgPaymentRecords.paymentScreenshotUrl,
          amountPaise: pgPaymentRecords.amountPaise,
          customerName: customers.fullName,
          phone: customers.phone,
          bookingCode: bookings.bookingCode,
        })
        .from(pgPaymentRecords)
        .innerJoin(customers, eq(customers.id, pgPaymentRecords.customerId))
        .leftJoin(bookings, eq(bookings.id, pgPaymentRecords.bookingId))
        .where(eq(pgPaymentRecords.id, entityId))
        .limit(1);
      if (!row) return null;
      return {
        customerId: row.customerId,
        pgId: row.pgId,
        bookingId: row.bookingId,
        residentName: row.customerName,
        phone: row.phone,
        billLabel: row.bookingCode
          ? `Booking checkout · ${row.bookingCode}`
          : 'Booking payment',
        amountPaise: row.amountPaise,
        hasProof: Boolean(row.paymentScreenshotUrl),
      };
    }
  }
}

async function clearEntityProof(
  entityType: PaymentProofEntityType,
  entityId: string,
  executor: DbExecutor = db,
): Promise<void> {
  const now = new Date();
  switch (entityType) {
    case 'rent_invoice': {
      const [invoice] = await executor
        .select()
        .from(rentInvoices)
        .where(eq(rentInvoices.id, entityId))
        .limit(1);
      if (!invoice) return;
      const projected = projectInvoice({ ...invoice, status: 'pending', paymentProofUrl: null });
      const nextStatus = projected.effectiveStatus === 'overdue' ? 'overdue' : 'pending';
      await executor
        .update(rentInvoices)
        .set({
          paymentProofUrl: null,
          status: nextStatus,
          proofSubmittedAt: null,
          proofSnapshotOutstandingPaise: null,
          proofSnapshotLateFeePaise: null,
          proofSnapshotPrincipalDuePaise: null,
          updatedAt: now,
        })
        .where(eq(rentInvoices.id, entityId));
      break;
    }
    case 'electricity_invoice':
      await executor
        .update(electricityInvoices)
        .set({ paymentProofUrl: null, updatedAt: now })
        .where(eq(electricityInvoices.id, entityId));
      break;
    case 'payment_link':
      await executor
        .update(paymentLinks)
        .set({ paymentProofUrl: null })
        .where(eq(paymentLinks.id, entityId));
      break;
    case 'stay_extension':
      await executor
        .update(stayExtensions)
        .set({ paymentProofUrl: null, updatedAt: now })
        .where(eq(stayExtensions.id, entityId));
      break;
    case 'pg_payment_record':
      await executor
        .update(pgPaymentRecords)
        .set({
          paymentScreenshotUrl: null,
          status: 'pending',
          reviewedByAdminId: null,
          reviewedAt: null,
          updatedAt: now,
        })
        .where(eq(pgPaymentRecords.id, entityId));
      break;
  }
}

async function appendInvoiceAuditEvent(
  entityType: PaymentProofEntityType,
  entityId: string,
  adminId: string,
  diff: Record<string, unknown>,
  executor: DbExecutor = db,
): Promise<void> {
  if (entityType !== 'rent_invoice' && entityType !== 'electricity_invoice') return;
  const sourceTable =
    entityType === 'rent_invoice' ? 'rent_invoices' : 'electricity_invoices';
  const [fi] = await executor
    .select({ id: financialInvoices.id })
    .from(financialInvoices)
    .where(
      and(eq(financialInvoices.sourceTable, sourceTable), eq(financialInvoices.sourceId, entityId)),
    )
    .limit(1);
  if (!fi) return;
  await executor.insert(invoiceAuditEvents).values({
    invoiceId: fi.id,
    action: 'payment_proof_rejected',
    actorType: 'admin',
    actorId: adminId,
    diff,
  });
}

export async function supersedeActiveRejection(
  entityType: PaymentProofEntityType,
  entityId: string,
  executor: DbExecutor = db,
): Promise<void> {
  await executor
    .update(paymentProofRejections)
    .set({ status: 'superseded', updatedAt: new Date() })
    .where(
      and(
        eq(paymentProofRejections.entityType, entityType),
        eq(paymentProofRejections.entityId, entityId),
        eq(paymentProofRejections.status, 'active'),
      ),
    );
}

export async function getActiveRejectionForEntity(
  entityType: PaymentProofEntityType,
  entityId: string,
): Promise<PaymentProofRejectionRow | null> {
  const [row] = await db
    .select()
    .from(paymentProofRejections)
    .where(
      and(
        eq(paymentProofRejections.entityType, entityType),
        eq(paymentProofRejections.entityId, entityId),
        eq(paymentProofRejections.status, 'active'),
      ),
    )
    .orderBy(desc(paymentProofRejections.rejectedAt))
    .limit(1);
  return row ?? null;
}

export async function listActiveRejectionsForCustomer(
  customerId: string,
): Promise<PaymentProofRejectionRow[]> {
  return db
    .select()
    .from(paymentProofRejections)
    .where(
      and(
        eq(paymentProofRejections.customerId, customerId),
        eq(paymentProofRejections.status, 'active'),
      ),
    )
    .orderBy(desc(paymentProofRejections.rejectedAt));
}

export async function listPaymentProofRejectionsForEntity(
  entityType: PaymentProofEntityType,
  entityId: string,
): Promise<PaymentProofRejectionHistoryRow[]> {
  const rows = await db
    .select({
      rejection: paymentProofRejections,
      rejectedByName: adminUsers.fullName,
    })
    .from(paymentProofRejections)
    .leftJoin(adminUsers, eq(adminUsers.id, paymentProofRejections.rejectedByAdminId))
    .where(
      and(
        eq(paymentProofRejections.entityType, entityType),
        eq(paymentProofRejections.entityId, entityId),
      ),
    )
    .orderBy(desc(paymentProofRejections.rejectedAt));

  return rows.map((r) => ({ ...r.rejection, rejectedByName: r.rejectedByName }));
}

/** Recent rejections across PGs the admin can access — Operations history panel. */
export async function listRecentPaymentProofRejectionsForAdmin(
  session: AdminSession,
  limit = 40,
): Promise<PaymentProofRejectionHistoryRow[]> {
  const rows = await db
    .select({
      rejection: paymentProofRejections,
      rejectedByName: adminUsers.fullName,
    })
    .from(paymentProofRejections)
    .leftJoin(adminUsers, eq(adminUsers.id, paymentProofRejections.rejectedByAdminId))
    .orderBy(desc(paymentProofRejections.rejectedAt))
    .limit(Math.min(Math.max(limit * 3, limit), 200));

  const scoped = rows
    .filter((r) =>
      adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, r.rejection.pgId),
    )
    .slice(0, limit);

  return scoped.map((r) => ({ ...r.rejection, rejectedByName: r.rejectedByName }));
}

export async function rejectPaymentProof(
  session: AdminSession,
  input: RejectPaymentProofInput,
): Promise<
  | { ok: true; rejectionId: string; whatsappUrl?: string; message?: string }
  | { ok: false; message: string }
> {
  const validation = validateRejectionInput({
    reasonCode: input.reasonCode,
    reasonDetail: input.reasonDetail,
    residentMessage: input.residentMessage,
  });
  if (!validation.ok) return validation;

  const ctx =
    input.context?.customerId && input.context.pgId
      ? {
          customerId: input.context.customerId,
          pgId: input.context.pgId,
          bookingId: input.context.bookingId ?? null,
          residentName: input.context.residentName ?? 'Resident',
          phone: input.context.phone ?? null,
          billLabel: input.context.billLabel ?? 'Payment',
          amountPaise: input.context.amountPaise ?? 0,
          hasProof: true,
        }
      : await loadEntityContext(input.entityType, input.entityId);

  if (!ctx) return { ok: false, message: 'Payment proof not found.' };
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, ctx.pgId)) {
    return { ok: false, message: 'Access denied.' };
  }

  if (!ctx.hasProof) {
    return { ok: false, message: 'No payment photo uploaded.' };
  }

  const reasonLabel = rejectionReasonLabel(input.reasonCode);
  const messagePreview = input.residentMessage.trim().slice(0, 500);
  const whatsappUrl = input.sendWhatsApp
    ? buildPaymentRejectionWhatsAppUrl({ phone: ctx.phone, message: input.residentMessage.trim() })
    : null;

  const auditDiff = {
    reviewKey: input.reviewKey,
    reasonCode: input.reasonCode,
    reasonLabel,
    reasonDetail: input.reasonDetail?.trim() || null,
    adminNote: input.adminNote?.trim() || null,
    residentMessage: messagePreview,
    whatsappSent: Boolean(input.sendWhatsApp && whatsappUrl),
    billLabel: ctx.billLabel,
  };

  const rejectionId = await db.transaction(async (tx) => {
    await supersedeActiveRejection(input.entityType, input.entityId, tx);
    await clearEntityProof(input.entityType, input.entityId, tx);

    const [rejection] = await tx
      .insert(paymentProofRejections)
      .values({
        reviewKey: input.reviewKey,
        entityType: input.entityType,
        entityId: input.entityId,
        customerId: ctx.customerId,
        pgId: ctx.pgId,
        bookingId: ctx.bookingId,
        reasonCode: input.reasonCode,
        reasonLabel,
        reasonDetail: input.reasonDetail?.trim() || null,
        adminNote: input.adminNote?.trim() || null,
        residentMessage: input.residentMessage.trim(),
        rejectedByAdminId: session.adminId,
        rejectedAt: new Date(),
        whatsappSent: Boolean(input.sendWhatsApp && whatsappUrl),
        whatsappMessagePreview: input.sendWhatsApp ? messagePreview : null,
        status: 'active',
      })
      .returning({ id: paymentProofRejections.id });

    await appendInvoiceAuditEvent(
      input.entityType,
      input.entityId,
      session.adminId,
      auditDiff,
      tx,
    );

    if (!rejection) throw new Error('Could not create payment proof rejection.');
    return rejection.id;
  });

  await writeAuditLogNonBlocking(db, {
    actorType: 'admin',
    actorId: session.adminId,
    entity: input.entityType,
    entityId: input.entityId,
    action: 'payment_proof_rejected',
    diff: auditDiff,
  });

  const payHref = residentPayHrefForEntity(
    input.entityType,
    input.entityId,
    ctx.bookingId ? undefined : undefined,
  );

  if (input.entityType === 'rent_invoice' || input.entityType === 'electricity_invoice') {
    const { notifyInvoicePaymentProofRejected } = await import('@/src/lib/email/notifications');
    const invoiceNumber =
      input.entityType === 'rent_invoice'
        ? ctx.billLabel.match(/\(([^)]+)\)/)?.[1] ?? ctx.billLabel
        : ctx.billLabel.match(/\(([^)]+)\)/)?.[1] ?? ctx.billLabel;
    notifyInvoicePaymentProofRejected({
      customerId: ctx.customerId,
      invoiceNumber,
      billType: input.entityType === 'rent_invoice' ? 'rent' : 'electricity',
      reason: reasonLabel,
      message: input.residentMessage.trim(),
      payHref,
    });
  } else if (input.entityType === 'pg_payment_record') {
    const [booking] = ctx.bookingId
      ? await db
          .select({ bookingCode: bookings.bookingCode })
          .from(bookings)
          .where(eq(bookings.id, ctx.bookingId))
          .limit(1)
      : [];
    const { notifyBookingPaymentProofRejected } = await import('@/src/lib/email/notifications');
    notifyBookingPaymentProofRejected({
      customerId: ctx.customerId,
      bookingCode: booking?.bookingCode ?? 'your booking',
      reason: reasonLabel,
      message: input.residentMessage.trim(),
      payHref: booking?.bookingCode ? `/booking/${booking.bookingCode}/pay` : payHref,
    });
  } else {
    const { notifyGenericPaymentProofRejected } = await import('@/src/lib/email/notifications');
    notifyGenericPaymentProofRejected({
      customerId: ctx.customerId,
      billLabel: ctx.billLabel,
      reason: reasonLabel,
      message: input.residentMessage.trim(),
      payHref,
    });
  }

  if (input.sendWhatsApp && whatsappUrl && ctx.phone) {
    const { logWhatsAppEvent } = await import('@/src/services/whatsappLogs');
    await logWhatsAppEvent({
      adminId: session.adminId,
      residentId: ctx.customerId,
      phone: ctx.phone,
      kind: 'payment_rejection',
      messagePreview,
      metadata: { entityType: input.entityType, entityId: input.entityId },
    }).catch(() => undefined);
  }

  if (input.entityType === 'pg_payment_record' && ctx.bookingId) {
    const { cleanupRejectedBookingRequest } = await import('@/src/lib/bookingApproval');
    const [bookingRow] = await db
      .select({ bookingCode: bookings.bookingCode })
      .from(bookings)
      .where(eq(bookings.id, ctx.bookingId))
      .limit(1);
    await cleanupRejectedBookingRequest({
      bookingId: ctx.bookingId,
      reason: input.residentMessage.trim() || reasonLabel,
      rejectedByAdminId: session.adminId,
      pgPaymentRecordId: input.entityId,
      customerId: ctx.customerId,
      bookingCode: bookingRow?.bookingCode ?? null,
    });
  }

  if (input.entityType === 'pg_payment_record' && ctx.bookingId) {
    const { resolveDuplicateBookingPaymentProofs } = await import(
      '@/src/services/paymentProofReviewCleanup'
    );
    await resolveDuplicateBookingPaymentProofs({
      bookingId: ctx.bookingId,
      keepRecordId: input.entityId,
      resolution: 'rejected',
    });
  }

  const { scheduleAdminNotificationSync } = await import('@/src/services/adminLiveSync');
  scheduleAdminNotificationSync();

  await revalidateAfterPaymentProofMutation(ctx.pgId, ctx.bookingId);

  return {
    ok: true,
    rejectionId,
    whatsappUrl: whatsappUrl ?? undefined,
  };
}

async function revalidateAfterPaymentProofMutation(
  pgId: string,
  bookingId: string | null,
): Promise<void> {
  if (!bookingId) {
    revalidateReservationLifecycleViews({ pgId });
    return;
  }
  const [booking] = await db
    .select({ bookingCode: bookings.bookingCode })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  revalidateReservationLifecycleViews({
    pgId,
    bookingCode: booking?.bookingCode ?? null,
  });
}

export async function batchActiveRejectionsByEntity(
  keys: Array<{ entityType: PaymentProofEntityType; entityId: string }>,
): Promise<Map<string, PaymentProofRejectionRow>> {
  if (keys.length === 0) return new Map();
  const entityIds = keys.map((k) => k.entityId);
  const rows = await db
    .select()
    .from(paymentProofRejections)
    .where(
      and(
        inArray(paymentProofRejections.entityId, entityIds),
        eq(paymentProofRejections.status, 'active'),
      ),
    );
  const map = new Map<string, PaymentProofRejectionRow>();
  for (const row of rows) {
    map.set(`${row.entityType}:${row.entityId}`, row);
  }
  return map;
}
