import { publicSiteBaseUrl } from '@/src/lib/kyc/adminWhatsApp';
import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';
import { paiseToInr } from '@/src/lib/format';
import type { InvoiceDocumentModel } from '@/src/lib/billing/invoiceDocumentModel';
import { invoiceDetailHref } from '@/src/lib/billing/invoiceRoutes';

export type InvoiceWhatsAppSendPayload = {
  message: string;
  whatsappUrl: string | null;
  publicInvoiceUrl: string;
};

export function resolveAppBaseUrl(baseUrl?: string): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    baseUrl;
  return (fromEnv ?? publicSiteBaseUrl()).replace(/\/$/, '');
}

export function buildInvoicePublicUrl(
  invoiceId: string,
  audience: 'admin' | 'resident',
  baseUrl?: string,
): string {
  const origin = resolveAppBaseUrl(baseUrl);
  return `${origin}${invoiceDetailHref(invoiceId, audience)}`;
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
