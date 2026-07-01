import { appAbsoluteUrl, getAppUrl } from '@/src/lib/url';
import type { InvoiceDocumentModel } from '@/src/lib/billing/invoiceDocumentModel';
import {
  buildCollectionWhatsAppMessageForInvoiceType,
  buildCollectionWhatsAppUrl,
} from '@/src/lib/billing/invoiceCollectionWhatsApp';
import { invoiceDetailHref } from '@/src/lib/billing/invoiceRoutes';
import {
  ensureInvoiceShareToken,
  getInvoiceShareToken,
  invoicePublicSharePath,
  resolveInvoiceIdByShareToken,
} from '@/src/lib/billing/invoiceShareToken';
import { getInvoiceDocumentDetail } from '@/src/lib/billing/invoiceDocumentModel';

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
    | 'invoiceType'
    | 'customerName'
    | 'customerPhone'
    | 'pgName'
    | 'billingMonth'
    | 'totals'
  >,
  publicInvoiceUrl: string,
): InvoiceWhatsAppSendPayload {
  const amountPaise =
    detail.totals.balanceDuePaise > 0
      ? detail.totals.balanceDuePaise
      : detail.totals.totalPaise;

  const message = buildCollectionWhatsAppMessageForInvoiceType({
    invoiceType: detail.invoiceType,
    customerName: detail.customerName,
    pgName: detail.pgName,
    invoiceNumber: detail.invoiceNumber,
    billingMonth: detail.billingMonth,
    amountPaise,
    publicInvoiceUrl,
  });

  const whatsappUrl = buildCollectionWhatsAppUrl({
    customerPhone: detail.customerPhone,
    message,
  });

  return { message, whatsappUrl, publicInvoiceUrl };
}

export type InvoiceWhatsAppShareResult =
  | { ok: true; whatsappUrl: string; publicInvoiceUrl: string; message: string }
  | { ok: false; error: string };

/** Validate phone, invoice, and public URL before opening WhatsApp. */
export async function prepareInvoiceWhatsAppShare(
  invoiceId: string,
  baseUrl?: string,
): Promise<InvoiceWhatsAppShareResult> {
  const detail = await getInvoiceDocumentDetail(invoiceId);
  if (!detail) {
    return { ok: false, error: 'Invoice not found.' };
  }

  if (!detail.customerPhone?.trim()) {
    return { ok: false, error: 'Resident phone number is missing.' };
  }

  let publicInvoiceUrl: string;
  try {
    publicInvoiceUrl = await buildInvoicePublicUrlForInvoice(invoiceId, baseUrl);
  } catch {
    return { ok: false, error: 'Could not generate public invoice link.' };
  }

  const shareToken = await getInvoiceShareToken(invoiceId);
  if (!shareToken) {
    return { ok: false, error: 'Invoice share token is missing.' };
  }

  const resolvedId = await resolveInvoiceIdByShareToken(shareToken);
  if (resolvedId !== invoiceId) {
    return { ok: false, error: 'Public invoice URL does not resolve to this invoice.' };
  }

  const payload = buildInvoiceWhatsAppSendPayload(detail, publicInvoiceUrl);
  if (!payload.whatsappUrl) {
    return { ok: false, error: 'Resident phone number is invalid for WhatsApp.' };
  }

  return {
    ok: true,
    whatsappUrl: payload.whatsappUrl,
    publicInvoiceUrl: payload.publicInvoiceUrl,
    message: payload.message,
  };
}

/** Client-side helper — opens WhatsApp in a new tab. */
export function openInvoiceWhatsAppUrl(whatsappUrl: string | null | undefined): void {
  if (!whatsappUrl) return;
  window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
}
