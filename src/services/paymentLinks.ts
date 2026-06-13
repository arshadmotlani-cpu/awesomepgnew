import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { paymentLinks } from '@/src/db/schema';
import {
  buildBillingWhatsAppUrl,
  buildRentUpdatedWhatsAppUrl,
} from '@/src/lib/billing/adminWhatsApp';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import { buildKycWhatsAppUrl, publicSiteBaseUrl } from '@/src/lib/kyc/adminWhatsApp';
import { getPgQrForPurpose } from '@/src/services/actionItems';
import type { ActionItemDetail } from '@/src/services/actionItems';

export type CreatePaymentLinkInput = {
  residentId: string;
  pgId: string;
  amountPaise: number;
  purpose: 'rent' | 'electricity' | 'deposit';
  residentName: string;
  residentPhone: string;
  pgName: string;
  dueDate?: string;
  roomNumber?: string;
  isOverdue?: boolean;
  /** When true, WhatsApp uses rent-updated template instead of rent-due. */
  rentUpdated?: boolean;
};

export async function createPaymentLink(input: CreatePaymentLinkInput) {
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
    })
    .returning();

  const publicUrl = paymentLinkPublicUrl(row.id);
  let whatsappShareUrl: string | null = null;

  if (input.purpose === 'rent' && input.rentUpdated) {
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
    });
  }

  if (whatsappShareUrl) {
    await db
      .update(paymentLinks)
      .set({ whatsappShareUrl })
      .where(eq(paymentLinks.id, row.id));
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
