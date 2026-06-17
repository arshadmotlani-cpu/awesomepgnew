import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices, paymentLinks, rentInvoices } from '@/src/db/schema';
import {
  buildBillingWhatsAppUrl,
  buildDepositDueWhatsAppUrl,
  buildRentUpdatedWhatsAppUrl,
} from '@/src/lib/billing/adminWhatsApp';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import { buildKycWhatsAppUrl, publicSiteBaseUrl } from '@/src/lib/kyc/adminWhatsApp';
import { getPgQrForPurpose } from '@/src/services/actionItems';
import { logWhatsAppEvent } from '@/src/services/whatsappLogs';
import type { ActionItemDetail } from '@/src/services/actionItems';

import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';

export type CreatePaymentLinkInput = {
  residentId: string;
  pgId: string;
  amountPaise: number;
  purpose: 'rent' | 'electricity' | 'deposit' | 'combined';
  residentName: string;
  residentPhone: string;
  pgName: string;
  dueDate?: string;
  roomNumber?: string;
  isOverdue?: boolean;
  /** When true, WhatsApp uses rent-updated template instead of rent-due. */
  rentUpdated?: boolean;
  /** Combined rent + deposit link breakdown (WhatsApp + pay page). */
  rentComponentPaise?: number;
  depositComponentPaise?: number;
  invoiceNumber?: string;
  invoiceBreakdown?: InvoiceBreakdown;
  /** Operator charge generator metadata */
  title?: string;
  description?: string;
  bookingId?: string;
  rentInvoiceId?: string;
  createdByAdminId?: string;
  /** Use charge-request WhatsApp template when title is set. */
  chargeRequest?: boolean;
  /** Stable idempotency key for express-sale / charge-generator links. */
  idempotencyKey?: string;
};

export async function getOrCreatePaymentLink(input: CreatePaymentLinkInput) {
  const [existing] = await db
    .select()
    .from(paymentLinks)
    .where(
      and(
        eq(paymentLinks.residentId, input.residentId),
        eq(paymentLinks.pgId, input.pgId),
        eq(paymentLinks.purpose, input.purpose),
        eq(paymentLinks.status, 'active'),
        eq(paymentLinks.amount, input.amountPaise),
      ),
    )
    .orderBy(desc(paymentLinks.createdAt))
    .limit(1);

  if (existing) {
    const publicUrl = paymentLinkPublicUrl(existing.id);
    const whatsappShareUrl =
      existing.whatsappShareUrl ??
      (input.purpose === 'rent' || input.purpose === 'electricity'
        ? buildBillingWhatsAppUrl({
            kind: input.purpose,
            customerName: input.residentName,
            phone: input.residentPhone,
            pgName: input.pgName,
            amountPaise: input.amountPaise,
            dueDate: input.dueDate ?? 'soon',
            roomNumber: input.roomNumber,
            isOverdue: input.isOverdue,
            paymentLinkUrl: publicUrl,
            rentPaise: input.rentComponentPaise,
            depositDuePaise: input.depositComponentPaise,
          })
        : buildDepositDueWhatsAppUrl({
            customerName: input.residentName,
            phone: input.residentPhone,
            pgName: input.pgName,
            amountPaise: input.amountPaise,
            dueDate: input.dueDate ?? 'soon',
            paymentLinkUrl: publicUrl,
            isOverdue: input.isOverdue,
          }));

    return {
      ok: true as const,
      link: { ...existing, whatsappShareUrl },
      upiId: null as string | null,
      publicUrl,
      reused: true as const,
    };
  }

  const created = await createPaymentLink(input);
  if (!created.ok) return created;
  return { ...created, reused: false as const };
}

export async function createPaymentLink(input: CreatePaymentLinkInput) {
  if (input.idempotencyKey) {
    const [existingByKey] = await db
      .select()
      .from(paymentLinks)
      .where(eq(paymentLinks.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existingByKey) {
      const publicUrl = paymentLinkPublicUrl(existingByKey.id);
      return {
        ok: true as const,
        link: { ...existingByKey, whatsappShareUrl: existingByKey.whatsappShareUrl },
        upiId: null as string | null,
        publicUrl,
      };
    }
  }

  const qr = await getPgQrForPurpose(input.pgId, input.purpose);
  if (!qr) {
    return { ok: false as const, message: 'No UPI QR configured for this PG.' };
  }

  const [row] = await db
    .insert(paymentLinks)
    .values({
      residentId: input.residentId,
      pgId: input.pgId,
      amount: input.amountPaise,
      purpose: input.purpose,
      upiQrUrl: qr.qrUrl,
      whatsappShareUrl: null,
      status: 'active',
      title: input.title?.trim() || null,
      description: input.description?.trim() || null,
      bookingId: input.bookingId ?? null,
      rentInvoiceId: input.rentInvoiceId ?? null,
      createdByAdminId: input.createdByAdminId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .returning();

  const publicUrl = paymentLinkPublicUrl(row.id);
  let whatsappShareUrl: string | null = null;

  if (input.chargeRequest && input.title) {
    const { buildChargeRequestWhatsAppUrl } = await import('@/src/lib/billing/adminWhatsApp');
    whatsappShareUrl = buildChargeRequestWhatsAppUrl({
      customerName: input.residentName,
      customerPhone: input.residentPhone,
      title: input.title,
      amountPaise: input.amountPaise,
      paymentLinkUrl: publicUrl,
    });
  } else if (input.purpose === 'rent' && input.rentUpdated) {
    whatsappShareUrl = buildRentUpdatedWhatsAppUrl({
      customerName: input.residentName,
      phone: input.residentPhone,
      pgName: input.pgName,
      newAmountPaise: input.amountPaise,
      paymentLinkUrl: publicUrl,
    });
  } else if (input.purpose === 'rent' || input.purpose === 'electricity') {
    whatsappShareUrl = buildBillingWhatsAppUrl({
      kind: input.purpose,
      customerName: input.residentName,
      phone: input.residentPhone,
      pgName: input.pgName,
      amountPaise: input.amountPaise,
      dueDate: input.dueDate ?? 'soon',
      roomNumber: input.roomNumber,
      isOverdue: input.isOverdue,
      paymentLinkUrl: publicUrl,
      rentPaise: input.rentComponentPaise,
      depositDuePaise: input.depositComponentPaise,
    });
  } else if (input.purpose === 'deposit') {
    whatsappShareUrl = buildDepositDueWhatsAppUrl({
      customerName: input.residentName,
      phone: input.residentPhone,
      pgName: input.pgName,
      amountPaise: input.amountPaise,
      dueDate: input.dueDate ?? 'soon',
      paymentLinkUrl: publicUrl,
      isOverdue: input.isOverdue,
    });
  } else if (input.purpose === 'combined' && input.invoiceNumber) {
    const { buildInvoiceWhatsAppUrl } = await import('@/src/lib/billing/invoiceWhatsApp');
    whatsappShareUrl = buildInvoiceWhatsAppUrl({
      customerName: input.residentName,
      customerPhone: input.residentPhone,
      invoiceNumber: input.invoiceNumber,
      amountPaise: input.amountPaise,
      paymentLinkUrl: publicUrl,
      breakdown: input.invoiceBreakdown,
    });
  }

  if (whatsappShareUrl) {
    await db
      .update(paymentLinks)
      .set({ whatsappShareUrl })
      .where(eq(paymentLinks.id, row.id));

    void logWhatsAppEvent({
      adminId: null,
      residentId: input.residentId,
      phone: input.residentPhone,
      kind:
        input.purpose === 'rent'
          ? input.rentUpdated
            ? 'rent_updated'
            : 'rent_due'
          : input.purpose === 'electricity'
            ? 'electricity_due'
            : 'deposit',
      messagePreview: whatsappShareUrl,
      paymentLinkId: row.id,
      metadata: { pgId: input.pgId, amountPaise: input.amountPaise },
    });
  }

  return {
    ok: true as const,
    link: { ...row, whatsappShareUrl },
    upiId: qr.upiId,
    publicUrl,
  };
}

export function buildWhatsAppUrlForActionItem(detail: ActionItemDetail): string | null {
  const meta = detail.metadata;
  const phone = detail.residentPhone ?? meta.residentPhone;
  if (!phone) return null;

  if (detail.type === 'kyc_pending') {
    return buildKycWhatsAppUrl({
      customerName: meta.residentName ?? detail.residentName ?? 'Resident',
      phone,
      baseUrl: publicSiteBaseUrl(),
    });
  }

  if (detail.type === 'rent_due' || detail.type === 'electricity_due') {
    return buildBillingWhatsAppUrl({
      kind: detail.type === 'rent_due' ? 'rent' : 'electricity',
      customerName: meta.residentName ?? detail.residentName ?? 'Resident',
      phone,
      pgName: meta.pgName ?? detail.pgName,
      amountPaise: detail.amount ?? 0,
      dueDate: detail.dueDate ?? 'soon',
      roomNumber: meta.roomNumber ?? detail.roomNumber ?? undefined,
      billingMonth: meta.billingMonth,
      isOverdue: meta.isOverdue,
    });
  }

  if (detail.type === 'deposit_collection_due') {
    return buildDepositDueWhatsAppUrl({
      customerName: meta.residentName ?? detail.residentName ?? 'Resident',
      phone,
      pgName: meta.pgName ?? detail.pgName ?? 'PG',
      amountPaise: detail.amount ?? 0,
      dueDate: detail.dueDate ?? 'soon',
      isOverdue: meta.isOverdue,
    });
  }

  return null;
}

export async function getLatestPaymentLinkForResident(
  residentId: string,
  purpose: 'rent' | 'electricity' | 'deposit',
) {
  const [row] = await db
    .select()
    .from(paymentLinks)
    .where(
      and(eq(paymentLinks.residentId, residentId), eq(paymentLinks.purpose, purpose)),
    )
    .orderBy(desc(paymentLinks.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listRecentPaymentLinks(limit = 50) {
  return db
    .select()
    .from(paymentLinks)
    .orderBy(desc(paymentLinks.createdAt))
    .limit(limit);
}

export async function getPaymentLinkById(linkId: string) {
  const [row] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.id, linkId))
    .limit(1);
  return row ?? null;
}

/** Mark active links paid when resident completes rent/electricity/deposit payment. */
export async function markActivePaymentLinksPaid(args: {
  residentId: string;
  purpose: 'rent' | 'electricity' | 'deposit';
  amountPaise?: number;
}) {
  const conditions = [
    eq(paymentLinks.residentId, args.residentId),
    eq(paymentLinks.purpose, args.purpose),
    eq(paymentLinks.status, 'active'),
  ];
  const rows = await db
    .select({ id: paymentLinks.id })
    .from(paymentLinks)
    .where(and(...conditions))
    .orderBy(desc(paymentLinks.createdAt))
    .limit(5);

  if (rows.length === 0) return 0;

  await db
    .update(paymentLinks)
    .set({ status: 'paid' })
    .where(
      inArray(
        paymentLinks.id,
        rows.map((r) => r.id),
      ),
    );
  return rows.length;
}

/** Expire active links older than N days (run on panel load / cron). */
export async function expireStalePaymentLinks(maxAgeDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  const staleLinks = await db
    .select({
      id: paymentLinks.id,
      rentInvoiceId: paymentLinks.rentInvoiceId,
      invoiceId: paymentLinks.invoiceId,
    })
    .from(paymentLinks)
    .where(
      and(
        eq(paymentLinks.status, 'active'),
        sql`${paymentLinks.createdAt} < ${cutoff}`,
        isNull(paymentLinks.paymentProofUrl),
      ),
    );

  let expiredCount = 0;
  const { logInvoiceStateTransition } = await import('@/src/lib/billing/invoiceStateMachine');

  for (const link of staleLinks) {
    if (link.rentInvoiceId) {
      const [rent] = await db
        .select({ status: rentInvoices.status })
        .from(rentInvoices)
        .where(eq(rentInvoices.id, link.rentInvoiceId))
        .limit(1);
      if (
        rent &&
        (rent.status === 'payment_in_progress' ||
          rent.status === 'paid' ||
          rent.status === 'cancelled')
      ) {
        continue;
      }
    }

    const [updated] = await db
      .update(paymentLinks)
      .set({ status: 'expired' })
      .where(
        and(eq(paymentLinks.id, link.id), eq(paymentLinks.status, 'active')),
      )
      .returning({ id: paymentLinks.id });

    if (!updated) continue;
    expiredCount += 1;

    if (link.rentInvoiceId) {
      const [rentRow] = await db
        .select({ status: rentInvoices.status })
        .from(rentInvoices)
        .where(eq(rentInvoices.id, link.rentInvoiceId))
        .limit(1);
      if (rentRow && (rentRow.status === 'pending' || rentRow.status === 'overdue')) {
        await db
          .update(rentInvoices)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(
            and(
              eq(rentInvoices.id, link.rentInvoiceId),
              inArray(rentInvoices.status, ['pending', 'overdue']),
            ),
          );
        logInvoiceStateTransition({
          invoiceId: link.rentInvoiceId,
          layer: 'rent',
          previousStatus: rentRow.status,
          newStatus: 'expired',
          source: 'cron',
          meta: { paymentLinkId: link.id },
        });
        const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
        await syncRentInvoiceToUnified(link.rentInvoiceId).catch(() => undefined);
      }
    }

    if (link.invoiceId) {
      const [fi] = await db
        .select({ status: financialInvoices.status })
        .from(financialInvoices)
        .where(eq(financialInvoices.id, link.invoiceId))
        .limit(1);
      if (fi && ['draft', 'sent', 'overdue'].includes(fi.status)) {
        await db
          .update(financialInvoices)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(
            and(
              eq(financialInvoices.id, link.invoiceId),
              inArray(financialInvoices.status, ['draft', 'sent', 'overdue']),
            ),
          );
        logInvoiceStateTransition({
          invoiceId: link.invoiceId,
          layer: 'financial',
          previousStatus: fi.status,
          newStatus: 'expired',
          source: 'cron',
          meta: { paymentLinkId: link.id },
        });
      }
    }
  }

  return expiredCount;
}
