/**
 * Invoice document view model — display-only projection for InvoiceDocument UI.
 * Amounts come from financial_invoices + breakdown; no duplicate billing math.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  bookings,
  financialInvoices,
  payments,
  pgs,
  adminUsers,
  auditLog,
} from '@/src/db/schema';
import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import type { FinancialInvoiceStatus, FinancialInvoiceType } from '@/src/db/schema/enums';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import {
  durationModeToStayType,
  getInvoiceStayPolicyNote,
} from '@/src/lib/booking/bookingPolicies';
import { parseDaterange } from '@/src/services/availability';
import { formatDate, titleCase } from '@/src/lib/format';
import { formatDate as formatIsoDate } from '@/src/lib/dates';
import { getUnifiedInvoiceDetail } from '@/src/services/unifiedInvoices';
import { assertCustomerOwnsFinancialInvoiceDetailed } from '@/src/lib/billing/residentInvoiceAccess';
import { clampDueDateOnOrAfterIssueDate } from '@/src/lib/billing/invoiceDueDate';
import {
  loadBookingPaymentFinancialStory,
  type BookingPaymentFinancialStory,
} from '@/src/services/bookingPaymentFinancialProjection';

export type InvoiceDocumentLineItem = {
  kind: string;
  label: string;
  subtitle: string | null;
  period: string | null;
  amountPaise: number;
};

export type InvoiceDocumentStayDates = {
  checkIn: string | null;
  checkOut: string | null;
  isOpenEnded: boolean;
  displayLabel: string;
  /** Monthly open-ended stays only — vacating notice requirement. */
  noticeNote: string | null;
  /** Fixed-date stays only — automatic checkout, no notice. */
  stayPeriodNote: string | null;
};

export type InvoiceDocumentLetterhead = {
  businessName: string;
  pgName: string;
  addressLines: string[];
  gstin: string;
  contactPhone: string | null;
  contactEmail: string | null;
};

export type InvoiceDocumentTotals = {
  subtotalPaise: number;
  lateFeePaise: number;
  discountPaise: number;
  taxPaise?: number;
  taxLabel?: string;
  totalPaise: number;
  paidPaise: number;
  balanceDuePaise: number;
};

export type InvoiceDocumentPayment = {
  paymentId: string | null;
  paymentReference: string | null;
  paymentMode: string | null;
  paidAt: string | null;
  collectedByName: string | null;
  paymentLinkUrl: string | null;
  paymentLinkId: string | null;
};

export type InvoiceDocumentRelatedLinks = {
  bookingHref: string | null;
  residentHref: string | null;
  depositHref: string | null;
  paymentHref: string | null;
  sourceRentInvoiceId: string | null;
};

export type InvoiceDocumentModel = {
  id: string;
  invoiceNumber: string;
  invoiceType: FinancialInvoiceType;
  status: FinancialInvoiceStatus;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  bookingId: string | null;
  bookingCode: string | null;
  pgId: string;
  pgName: string;
  roomNumber: string | null;
  bedCode: string | null;
  letterhead: InvoiceDocumentLetterhead;
  stayDates: InvoiceDocumentStayDates | null;
  lineItems: InvoiceDocumentLineItem[];
  totals: InvoiceDocumentTotals;
  payment: InvoiceDocumentPayment;
  bookingPaymentSummary: BookingPaymentFinancialStory | null;
  relatedLinks: InvoiceDocumentRelatedLinks;
  dueDate: string | null;
  billingMonth: string | null;
  issuedAt: string;
  notes: string | null;
  cancellationReason: string | null;
};

function resolveGstin(): string {
  return process.env.AWESOME_PG_GSTIN?.trim() || 'GSTIN on request';
}

function formatPgAddress(pg: {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
}): string[] {
  const lines = [pg.addressLine1];
  if (pg.addressLine2?.trim()) lines.push(pg.addressLine2.trim());
  lines.push(`${pg.city}, ${pg.state} ${pg.pincode}`);
  return lines;
}

function monthPeriodLabel(billingMonth: string | null | undefined): string | null {
  if (!billingMonth) return null;
  const d = billingMonth.slice(0, 7);
  try {
    const [y, m] = d.split('-').map(Number);
    const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return label;
  } catch {
    return billingMonth;
  }
}

function lineSubtitleForKind(kind: string): string | null {
  switch (kind) {
    case 'rent':
      return 'Monthly accommodation charge';
    case 'electricity':
      return 'Room electricity share';
    case 'deposit':
      return 'Security deposit';
    case 'ps4':
      return 'PlayStation membership';
    case 'custom':
    case 'damage':
    case 'penalty':
    case 'cleaning':
    case 'maintenance':
      return 'Additional charge';
    default:
      return null;
  }
}

export function buildInvoiceDocumentLineItems(
  breakdown: InvoiceBreakdown | null | undefined,
  billingMonth: string | null | undefined,
): InvoiceDocumentLineItem[] {
  const lines = breakdown?.lines ?? [];
  const period = monthPeriodLabel(billingMonth ?? null);

  if (lines.length > 0) {
    return lines.map((l) => ({
      kind: l.kind,
      label: l.label,
      subtitle: lineSubtitleForKind(l.kind),
      period: l.kind === 'rent' || l.kind === 'electricity' ? period : null,
      amountPaise: l.amountPaise,
    }));
  }

  const fallback: InvoiceDocumentLineItem[] = [];
  if (breakdown?.rentPaise) {
    fallback.push({
      kind: 'rent',
      label: 'Rent',
      subtitle: lineSubtitleForKind('rent'),
      period,
      amountPaise: breakdown.rentPaise,
    });
  }
  if (breakdown?.electricityPaise) {
    fallback.push({
      kind: 'electricity',
      label: 'Electricity',
      subtitle: lineSubtitleForKind('electricity'),
      period,
      amountPaise: breakdown.electricityPaise,
    });
  }
  if (breakdown?.depositPaise) {
    fallback.push({
      kind: 'deposit',
      label: 'Deposit',
      subtitle: lineSubtitleForKind('deposit'),
      period: null,
      amountPaise: breakdown.depositPaise,
    });
  }
  if (breakdown?.ps4Paise) {
    fallback.push({
      kind: 'ps4',
      label: 'PS4',
      subtitle: lineSubtitleForKind('ps4'),
      period: null,
      amountPaise: breakdown.ps4Paise,
    });
  }
  if (breakdown?.otherPaise) {
    fallback.push({
      kind: 'custom',
      label: 'Other charges',
      subtitle: lineSubtitleForKind('custom'),
      period: null,
      amountPaise: breakdown.otherPaise,
    });
  }
  return fallback;
}

export function buildInvoiceDocumentStayDates(input: {
  durationMode: string | null;
  stayRangeRaw: string | null;
}): InvoiceDocumentStayDates | null {
  if (!input.stayRangeRaw) return null;

  const range = parseDaterange(input.stayRangeRaw);
  const checkIn = range.lower ? formatDate(range.lower) : null;
  const checkOut = range.upper ? formatDate(range.upper) : null;
  const isOpenEnded = input.durationMode === 'open_ended' || (!range.upper && !range.upperInc);

  if (isOpenEnded) {
    const stayType = durationModeToStayType(input.durationMode);
    return {
      checkIn,
      checkOut: null,
      isOpenEnded: true,
      displayLabel: checkIn
        ? `Continue living (open-ended) from ${checkIn}`
        : 'Continue living (open-ended)',
      noticeNote: getInvoiceStayPolicyNote(stayType),
      stayPeriodNote: null,
    };
  }

  if (checkIn && checkOut) {
    const stayType = durationModeToStayType(input.durationMode);
    return {
      checkIn,
      checkOut,
      isOpenEnded: false,
      displayLabel: `${checkIn} → ${checkOut}`,
      noticeNote: null,
      stayPeriodNote: getInvoiceStayPolicyNote(stayType),
    };
  }

  if (checkIn) {
    return {
      checkIn,
      checkOut,
      isOpenEnded: false,
      displayLabel: checkIn,
      noticeNote: null,
      stayPeriodNote: null,
    };
  }

  return null;
}

export function computeInvoiceDocumentTotals(input: {
  amountPaise: number;
  status: FinancialInvoiceStatus;
  breakdown: InvoiceBreakdown | null | undefined;
  lineItems: InvoiceDocumentLineItem[];
  taxPaise?: number;
  taxLabel?: string;
  discountPaise?: number;
}): InvoiceDocumentTotals {
  const lateFeePaise = input.breakdown?.lateFeePaise ?? 0;
  const discountPaise = input.discountPaise ?? 0;
  const lineSum = input.lineItems.reduce((s, l) => s + l.amountPaise, 0);
  const subtotalPaise = lineSum > 0 ? lineSum : Math.max(0, input.amountPaise - lateFeePaise);

  let paidPaise = input.breakdown?.paidPaise ?? 0;
  if (paidPaise <= 0 && input.status === 'paid') {
    paidPaise = input.amountPaise;
  } else if (paidPaise <= 0 && input.status === 'partial') {
    paidPaise = Math.max(0, input.amountPaise - (input.breakdown?.depositOutstandingPaise ?? 0));
  }

  const totalPaise = input.amountPaise;
  const balanceDuePaise =
    input.status === 'paid' || input.status === 'cancelled' || input.status === 'refunded'
      ? 0
      : Math.max(0, totalPaise - paidPaise);

  return {
    subtotalPaise,
    lateFeePaise,
    discountPaise,
    taxPaise: input.taxPaise,
    taxLabel: input.taxLabel,
    totalPaise,
    paidPaise,
    balanceDuePaise,
  };
}

function formatPaymentReference(
  provider: string | null,
  providerPaymentId: string | null,
): string | null {
  if (!provider && !providerPaymentId) return null;
  const label = provider ? titleCase(provider.replace(/_/g, ' ')) : 'Payment';
  if (providerPaymentId) return `${label} · ${providerPaymentId}`;
  return label;
}

function formatPaymentModeLabel(provider: string | null): string | null {
  if (!provider) return null;
  if (provider === 'cash') return 'Cash';
  if (provider === 'upi_manual' || provider === 'razorpay' || provider === 'stripe') return 'UPI';
  if (provider === 'bank_transfer') return 'Bank transfer';
  if (provider === 'mock') return 'Other';
  return titleCase(provider.replace(/_/g, ' '));
}

function adminNameFromPaymentPayload(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const payload = rawPayload as Record<string, unknown>;
  if (payload.source !== 'admin_cash_settlement') return null;
  const name = payload.receivedByAdminName;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return null;
}

export async function getInvoiceDocumentDetail(
  invoiceId: string,
): Promise<InvoiceDocumentModel | null> {
  const base = await getUnifiedInvoiceDetail(invoiceId);
  if (!base) return null;

  const [pgRow] = await db
    .select({
      addressLine1: pgs.addressLine1,
      addressLine2: pgs.addressLine2,
      city: pgs.city,
      state: pgs.state,
      pincode: pgs.pincode,
      contactPhone: pgs.contactPhone,
      contactEmail: pgs.contactEmail,
    })
    .from(pgs)
    .where(eq(pgs.id, base.pgId))
    .limit(1);

  let bookingCode: string | null = null;
  let durationMode: string | null = null;
  let stayRangeRaw: string | null = null;

  if (base.bookingId) {
    const [bookingCtx] = await db
      .select({
        bookingCode: bookings.bookingCode,
        durationMode: bookings.durationMode,
        stayRange: bedReservations.stayRange,
      })
      .from(bookings)
      .leftJoin(
        bedReservations,
        and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
      )
      .where(eq(bookings.id, base.bookingId))
      .limit(1);

    bookingCode = bookingCtx?.bookingCode ?? null;
    durationMode = bookingCtx?.durationMode ?? null;
    stayRangeRaw = (bookingCtx?.stayRange as unknown as string) ?? null;
  }

  let paymentReference: string | null = null;
  let paymentMode: string | null = null;
  let collectedByName: string | null = null;
  if (base.paymentId) {
    const [pay] = await db
      .select({
        provider: payments.provider,
        providerPaymentId: payments.providerPaymentId,
        rawPayload: payments.rawPayload,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .where(eq(payments.id, base.paymentId))
      .limit(1);
    paymentReference = formatPaymentReference(
      pay?.provider ?? null,
      pay?.providerPaymentId ?? null,
    );
    paymentMode = formatPaymentModeLabel(pay?.provider ?? null);
    collectedByName = adminNameFromPaymentPayload(pay?.rawPayload);
    if (!collectedByName && pay?.rawPayload && typeof pay.rawPayload === 'object') {
      const adminId = (pay.rawPayload as Record<string, unknown>).collectedByAdminId;
      if (typeof adminId === 'string') {
        const [admin] = await db
          .select({ fullName: adminUsers.fullName, email: adminUsers.email })
          .from(adminUsers)
          .where(eq(adminUsers.id, adminId))
          .limit(1);
        collectedByName = admin?.fullName ?? admin?.email ?? null;
      }
    }
  }

  if (!collectedByName && base.status === 'paid') {
    const [auditRow] = await db
      .select({ diff: auditLog.diff })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entity, 'financial_invoice'),
          eq(auditLog.entityId, base.id),
          eq(auditLog.action, 'mark_paid_cash'),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(1);
    const diff = auditRow?.diff as { receivedByAdminName?: string } | null | undefined;
    if (diff?.receivedByAdminName) {
      collectedByName = diff.receivedByAdminName;
      if (!paymentMode) paymentMode = 'Cash';
    }
  }

  const paymentLinkUrl = base.paymentLink ? paymentLinkPublicUrl(base.paymentLink.id) : null;

  const lineItems = buildInvoiceDocumentLineItems(base.breakdown, base.billingMonth);
  const totals = computeInvoiceDocumentTotals({
    amountPaise: base.amountPaise,
    status: base.status,
    breakdown: base.breakdown,
    lineItems,
  });

  const issuedAtIso = formatIsoDate(base.createdAt);
  const issuedAt = formatDate(base.createdAt);
  const dueDate =
    base.dueDate != null
      ? clampDueDateOnOrAfterIssueDate(base.dueDate, issuedAtIso)
      : null;

  const bookingPaymentSummary =
    base.bookingId && base.invoiceType === 'rent'
      ? await loadBookingPaymentFinancialStory({
          bookingId: base.bookingId,
          paymentId: base.paymentId,
        })
      : null;

  const relatedLinks: InvoiceDocumentRelatedLinks = {
    bookingHref: base.bookingId ? `/admin/bookings/${base.bookingId}` : null,
    residentHref: `/admin/residents/${base.customerId}`,
    depositHref: base.bookingId ? `/admin/deposits/${base.bookingId}` : null,
    paymentHref:
      base.bookingId && base.paymentId
        ? `/admin/bookings/${base.bookingId}?paymentId=${base.paymentId}`
        : base.bookingId
          ? `/admin/bookings/${base.bookingId}`
          : null,
    sourceRentInvoiceId:
      base.sourceTable === 'rent_invoices' && base.sourceId ? base.sourceId : null,
  };

  const letterhead: InvoiceDocumentLetterhead = {
    businessName: 'Awesome PG',
    pgName: base.pgName,
    addressLines: pgRow ? formatPgAddress(pgRow) : [base.pgName],
    gstin: resolveGstin(),
    contactPhone: pgRow?.contactPhone ?? null,
    contactEmail: pgRow?.contactEmail ?? null,
  };

  return {
    id: base.id,
    invoiceNumber: base.invoiceNumber,
    invoiceType: base.invoiceType,
    status: base.status,
    customerId: base.customerId,
    customerName: base.customerName,
    customerPhone: base.customerPhone,
    customerEmail: base.customerEmail,
    bookingId: base.bookingId,
    bookingCode,
    pgId: base.pgId,
    pgName: base.pgName,
    roomNumber: base.roomNumber,
    bedCode: base.bedCode,
    letterhead,
    stayDates: buildInvoiceDocumentStayDates({ durationMode, stayRangeRaw }),
    lineItems,
    totals,
    payment: {
      paymentId: base.paymentId ?? null,
      paymentReference,
      paymentMode,
      paidAt: base.paidAt ? formatDate(base.paidAt) : null,
      collectedByName,
      paymentLinkUrl:
        base.status !== 'paid' && base.status !== 'cancelled' && base.status !== 'refunded'
          ? paymentLinkUrl
          : null,
      paymentLinkId: base.paymentLink?.id ?? null,
    },
    bookingPaymentSummary,
    relatedLinks,
    dueDate,
    billingMonth: base.billingMonth,
    issuedAt,
    notes: base.notes,
    cancellationReason: base.cancellationReason,
  };
}

export async function assertCustomerOwnsFinancialInvoice(
  customerId: string,
  invoiceId: string,
): Promise<boolean> {
  const result = await assertCustomerOwnsFinancialInvoiceDetailed(customerId, invoiceId);
  return result.owns;
}
