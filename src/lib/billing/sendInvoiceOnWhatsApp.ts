import { appAbsoluteUrl, getAppUrl } from '@/src/lib/url';
import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';
import { paiseToInr } from '@/src/lib/format';
import type { InvoiceDocumentModel } from '@/src/lib/billing/invoiceDocumentModel';
import { invoiceDetailHref } from '@/src/lib/billing/invoiceRoutes';
import {
  ensureInvoiceShareToken,
  invoicePublicSharePath,
} from '@/src/lib/billing/invoiceShareToken';

export type InvoiceWhatsAppSendPayload = {
  message: string;
  whatsappUrl: string | null;
  publicInvoiceUrl: string;
};

export function resolveAppBaseUrl(baseUrl?: string): string {
  if (baseUrl?.trim()) return baseUrl.trim().replace(/\/$/, '');
  return getAppUrl();
}

/**
 * @deprecated External sharing must use `/i/{shareToken}` — call ensureInvoiceShareToken first.
 * Kept for legacy redirects only.
 */
export function legacyResidentInvoiceSharePath(invoiceId: string): string {
  return `/resident/invoices/${invoiceId.trim()}`;
}

/** Public share path — requires share token, never invoice UUID. */
export function buildInvoicePublicSharePath(shareToken: string): string {
  return invoicePublicSharePath(shareToken);
}

export function buildInvoicePublicUrl(shareToken: string, baseUrl?: string): string {
  const path = buildInvoicePublicSharePath(shareToken);
  return baseUrl?.trim()
    ? `${resolveAppBaseUrl(baseUrl)}${path}`
    : appAbsoluteUrl(path);
}

export async function buildInvoicePublicUrlForInvoice(
  invoiceId: string,
  baseUrl?: string,
): Promise<string> {
  const shareToken = await ensureInvoiceShareToken(invoiceId);
  return buildInvoicePublicUrl(shareToken, baseUrl);
}

export function buildInvoiceAdminUrl(invoiceId: string, baseUrl?: string): string {
  const path = invoiceDetailHref(invoiceId, 'admin');
  return baseUrl?.trim() ? `${resolveAppBaseUrl(baseUrl)}${path}` : appAbsoluteUrl(path);
}

export function buildInvoiceWhatsAppSendPayload(
  detail: Pick<
    InvoiceDocumentModel,
    | 'id'
    | 'invoiceNumber'
    | 'customerName'
    | 'customerPhone'
    | 'totals'
    | 'lineItems'
    | 'payment'
  >,
  publicInvoiceUrl: string,
): InvoiceWhatsAppSendPayload {
  const firstName = detail.customerName.trim().split(/\s+/)[0] || 'there';
  const balanceDue = detail.totals.balanceDuePaise;
  const amountLine =
    balanceDue > 0
      ? `Amount due: ${paiseToInr(balanceDue)}`
      : `Total: ${paiseToInr(detail.totals.totalPaise)}`;

  const breakdownBlock =
    detail.lineItems.length > 1
      ? '\n\nBreakdown:\n' +
        detail.lineItems.map((l) => `• ${l.label}: ${paiseToInr(l.amountPaise)}`).join('\n')
      : '';

  const payBlock = detail.payment?.paymentLinkUrl
    ? `\n\nPay here:\n${detail.payment.paymentLinkUrl}`
    : '';

  const message =
    `Hi ${firstName},\n\n` +
    `Invoice #${detail.invoiceNumber}\n\n` +
    `${amountLine}${breakdownBlock}${payBlock}\n\n` +
    `View invoice:\n${publicInvoiceUrl}`;

  const digits = whatsAppPhoneDigits(detail.customerPhone);
  const whatsappUrl = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    : null;

  return { message, whatsappUrl, publicInvoiceUrl };
}

/** Client-side helper — opens WhatsApp in a new tab. */
export function openInvoiceWhatsAppUrl(whatsappUrl: string | null | undefined): void {
  if (!whatsappUrl) return;
  window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
}
