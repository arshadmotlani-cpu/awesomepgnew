import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { paymentLinks } from '@/src/db/schema';
import { buildBillingWhatsAppUrl } from '@/src/lib/billing/adminWhatsApp';
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
};

export async function createPaymentLink(input: CreatePaymentLinkInput) {
  const qr = await getPgQrForPurpose(input.pgId, input.purpose);
  if (!qr) {
    return { ok: false as const, message: 'No UPI QR configured for this PG.' };
  }

  let whatsappShareUrl: string | null = null;
  if (input.purpose === 'rent' || input.purpose === 'electricity') {
    whatsappShareUrl = buildBillingWhatsAppUrl({
      kind: input.purpose,
      customerName: input.residentName,
      phone: input.residentPhone,
      pgName: input.pgName,
      amountPaise: input.amountPaise,
      dueDate: input.dueDate ?? 'soon',
      roomNumber: input.roomNumber,
      isOverdue: input.isOverdue,
    });
  }

  const [row] = await db
    .insert(paymentLinks)
    .values({
      residentId: input.residentId,
      pgId: input.pgId,
      amount: input.amountPaise,
      purpose: input.purpose,
      upiQrUrl: qr.qrUrl,
      whatsappShareUrl,
      status: 'active',
    })
    .returning();

  return { ok: true as const, link: row, upiId: qr.upiId };
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
    .where(eq(paymentLinks.residentId, residentId))
    .orderBy(paymentLinks.createdAt)
    .limit(1);
  if (!row || row.purpose !== purpose) return null;
  return row;
}
