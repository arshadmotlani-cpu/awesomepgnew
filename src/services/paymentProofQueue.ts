import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { parseDaterange } from '@/src/services/availability';
import { listPendingExtensionProofsForPg } from '@/src/services/extension';
import { listPendingElectricityProofsForPg } from '@/src/services/meterElectricity';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { listPendingRentProofsForPg, projectInvoice } from '@/src/services/rentInvoices';
import { listPendingDepositLinkProofsForPg } from '@/src/services/residentCharges';
import { listOwnerPayments, getQrBookingPaymentReview } from '@/src/services/qrPayments';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  electricityInvoices,
  paymentLinks,
  pgs,
  rentInvoices,
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import type {
  PaymentReviewBookingDetails,
  PaymentReviewExpectedLine,
  PendingPaymentReviewItem,
} from '@/src/lib/operations/paymentReviewTypes';
import { titleCase } from '@/src/lib/format';
import { formatDate as formatIsoDate } from '@/src/lib/dates';
import { and, eq, isNull } from 'drizzle-orm';

export type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';


function monthlyRentFromSnapshot(snapshot: PricingSnapshot | null | undefined): number | null {
  if (!snapshot?.perBed?.length) return null;
  const monthly = snapshot.perBed
    .filter((bed) => bed.durationMode === 'monthly' || bed.durationMode === 'open_ended')
    .reduce((acc, bed) => acc + bed.monthlyRatePaise, 0);
  if (monthly > 0) return monthly;
  return snapshot.perBed.reduce((acc, bed) => acc + bed.monthlyRatePaise, 0) || null;
}

async function loadBookingReviewDetails(
  bookingId: string,
): Promise<PaymentReviewBookingDetails | null> {
  const [row] = await db
    .select({
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      durationMode: bookings.durationMode,
      stayType: bookings.stayType,
      depositPaise: bookings.depositPaise,
      pricingSnapshot: bookings.pricingSnapshot,
      bedCode: beds.bedCode,
      stayRange: bedReservations.stayRange,
    })
    .from(bookings)
    .leftJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .leftJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!row) return null;

  let moveInDate: string | null = null;
  let moveOutDate: string | null = row.expectedCheckoutDate ?? null;
  if (row.stayRange) {
    try {
      const parsed = parseDaterange(String(row.stayRange));
      moveInDate = parsed.lower ? formatIsoDate(parsed.lower) : null;
      if (!moveOutDate && parsed.upper) moveOutDate = formatIsoDate(parsed.upper);
    } catch {
      moveInDate = null;
    }
  }

  const durationLabel = row.durationMode
    ? titleCase(String(row.durationMode).replace(/_/g, ' '))
    : null;

  return {
    moveInDate,
    moveOutDate,
    durationLabel,
    roomType: row.stayType ? titleCase(String(row.stayType).replace(/_/g, ' ')) : null,
    bedCode: row.bedCode ?? null,
    monthlyRentPaise: monthlyRentFromSnapshot(row.pricingSnapshot as PricingSnapshot | null),
    depositRequiredPaise: row.depositPaise ?? null,
  };
}

function buildOutstandingSummary(args: {
  outstandingAfterApprovalPaise: number;
  overpaidPaise: number;
  partialLabel?: string | null;
}): string | null {
  if (args.overpaidPaise > 0) {
    return `Overpaid by ₹${(args.overpaidPaise / 100).toLocaleString('en-IN')}`;
  }
  if (args.outstandingAfterApprovalPaise <= 0) {
    return 'Fully settled after approval';
  }
  if (args.partialLabel) return args.partialLabel;
  return `₹${(args.outstandingAfterApprovalPaise / 100).toLocaleString('en-IN')} still due after approval`;
}

function buildQrReviewItem(
  p: Awaited<ReturnType<typeof listOwnerPayments>>[number],
  bookingPaymentReview: Awaited<ReturnType<typeof getQrBookingPaymentReview>> | null,
  bookingDetails: PaymentReviewBookingDetails | null,
): PendingPaymentReviewItem {
  const isBookingCheckout = Boolean(p.bookingCode);
  const paymentTypeLabel = isBookingCheckout
    ? bookingPaymentReview?.canPartialApprove
      ? 'Partial payment'
      : 'New booking'
    : p.categoryName;

  let expectedLines: PaymentReviewExpectedLine[] = [];
  let expectedTotalPaise = p.amountPaise;
  let receivedPaise: number | null = p.amountPaise;
  let outstandingAfterApprovalPaise = 0;
  let overpaidPaise = 0;
  let canPartialApprove = false;
  let outstandingSummary: string | null = null;

  if (bookingPaymentReview) {
    expectedLines = [
      { label: 'Rent', amountPaise: bookingPaymentReview.rentDuePaise },
      { label: 'Deposit', amountPaise: bookingPaymentReview.depositCashDuePaise },
    ];
    expectedTotalPaise = bookingPaymentReview.bookingTotalDuePaise;
    receivedPaise = bookingPaymentReview.amountSubmittedPaise;
    outstandingAfterApprovalPaise = bookingPaymentReview.depositDuePaise;
    overpaidPaise = Math.max(0, receivedPaise - expectedTotalPaise);
    canPartialApprove = bookingPaymentReview.canPartialApprove;
    outstandingSummary = buildOutstandingSummary({
      outstandingAfterApprovalPaise,
      overpaidPaise,
      partialLabel:
        canPartialApprove && outstandingAfterApprovalPaise > 0
          ? `₹${(bookingPaymentReview.depositPaisePaid / 100).toLocaleString('en-IN')} deposit collected now · ₹${(outstandingAfterApprovalPaise / 100).toLocaleString('en-IN')} deposit still pending`
          : null,
    });
  } else {
    expectedLines = [{ label: paymentTypeLabel, amountPaise: p.amountPaise }];
    expectedTotalPaise = p.amountPaise;
    receivedPaise = p.amountPaise;
    outstandingAfterApprovalPaise = 0;
    overpaidPaise = 0;
    outstandingSummary = 'Approval records this collection';
  }

  return {
    key: `qr-${p.id}`,
    kind: 'qr',
    pgId: p.pgId,
    pgName: p.pgName,
    residentName: p.customerName,
    phone: p.customerPhone ?? null,
    bookingCode: p.bookingCode ?? null,
    roomNumber: null,
    bedCode: bookingDetails?.bedCode ?? null,
    paymentTypeLabel,
    title: isBookingCheckout
      ? `${p.customerName} · Booking ${p.bookingCode}`
      : `${p.customerName} · ${p.categoryName}`,
    subtitle: isBookingCheckout
      ? 'Booking checkout — rent, deposit & reservation'
      : p.month
        ? `Month ${p.month}`
        : 'QR payment',
    amountPaise: p.amountPaise,
    screenshotUrl: p.paymentScreenshotUrl,
    entityId: p.id,
    customerId: p.customerId,
    bookingId: p.bookingId ?? null,
    expectedLines,
    expectedTotalPaise,
    receivedPaise,
    outstandingAfterApprovalPaise,
    overpaidPaise,
    outstandingSummary,
    canPartialApprove,
    canReject: true,
    bookingDetails: bookingDetails ?? undefined,
    bookingPaymentReview: bookingPaymentReview ?? undefined,
  };
}

async function buildRentReviewItem(
  pg: { id: string; name: string },
  r: Awaited<ReturnType<typeof listPendingRentProofsForPg>>[number],
): Promise<PendingPaymentReviewItem | null> {
  const [invoice] = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.id, r.invoiceId))
    .limit(1);
  if (!invoice) return null;

  const projected = projectInvoice(invoice);
  const expectedLines: PaymentReviewExpectedLine[] = [
    { label: 'Amount due', amountPaise: projected.outstandingPaise },
  ];

  const [customer] = await db
    .select({ phone: customers.phone, bookingCode: bookings.bookingCode })
    .from(customers)
    .leftJoin(bookings, eq(bookings.id, invoice.bookingId))
    .where(eq(customers.id, invoice.customerId))
    .limit(1);

  return {
    key: `rent-${r.invoiceId}`,
    kind: 'rent',
    pgId: pg.id,
    pgName: pg.name,
    residentName: r.customerName,
    phone: customer?.phone ?? null,
    bookingCode: customer?.bookingCode ?? null,
    roomNumber: r.roomNumber,
    bedCode: r.bedCode,
    paymentTypeLabel: 'Monthly rent',
    title: `${r.customerName} · Rent ${r.invoiceNumber}`,
    subtitle: `Room ${r.roomNumber} · ${r.bedCode} · ${r.billingMonth.slice(0, 7)}`,
    amountPaise: projected.outstandingPaise,
    screenshotUrl: r.paymentProofUrl!,
    entityId: r.invoiceId,
    customerId: invoice.customerId,
    bookingId: invoice.bookingId,
    expectedLines,
    expectedTotalPaise: projected.outstandingPaise,
    receivedPaise: null,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary:
      'Verify screenshot — approval records full outstanding rent',
    canPartialApprove: false,
    canReject: true,
  };
}

async function buildElectricityReviewItem(
  pg: { id: string; name: string },
  e: Awaited<ReturnType<typeof listPendingElectricityProofsForPg>>[number],
): Promise<PendingPaymentReviewItem | null> {
  const [invoice] = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, e.invoiceId))
    .limit(1);
  if (!invoice) return null;

  const projected = projectElectricityInvoice(invoice);
  const [customer] = await db
    .select({
      name: customers.fullName,
      phone: customers.phone,
      bookingCode: bookings.bookingCode,
    })
    .from(customers)
    .leftJoin(bookings, eq(bookings.id, invoice.bookingId))
    .where(eq(customers.id, invoice.customerId))
    .limit(1);

  const expectedTotalPaise = projected.outstandingPaise;
  const expectedLines: PaymentReviewExpectedLine[] = [
    { label: 'Electricity', amountPaise: expectedTotalPaise },
  ];

  return {
    key: `elec-${e.invoiceId}`,
    kind: 'electricity',
    pgId: pg.id,
    pgName: pg.name,
    residentName: customer?.name ?? 'Resident',
    phone: customer?.phone ?? null,
    bookingCode: customer?.bookingCode ?? null,
    roomNumber: e.roomNumber,
    bedCode: null,
    paymentTypeLabel: 'Electricity',
    title: `Electricity · ${e.invoiceNumber}`,
    subtitle: `Room ${e.roomNumber}`,
    amountPaise: expectedTotalPaise,
    screenshotUrl: e.paymentProofUrl!,
    entityId: e.invoiceId,
    customerId: invoice.customerId,
    bookingId: invoice.bookingId,
    expectedLines,
    expectedTotalPaise,
    receivedPaise: null,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary:
      'Verify screenshot — approval records full electricity due',
    canPartialApprove: false,
    canReject: true,
  };
}

async function buildExtensionReviewItem(
  pg: { id: string; name: string },
  x: Awaited<ReturnType<typeof listPendingExtensionProofsForPg>>[number],
): Promise<PendingPaymentReviewItem | null> {
  const [row] = await db
    .select({
      customerId: bookings.customerId,
      phone: customers.phone,
      bookingId: bookings.id,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.bookingCode, x.bookingCode))
    .limit(1);

  const bookingDetails = row?.bookingId
    ? await loadBookingReviewDetails(row.bookingId)
    : null;

  const expectedLines: PaymentReviewExpectedLine[] = [
    { label: 'Extension', amountPaise: x.amountPaise },
  ];

  return {
    key: `ext-${x.extensionId}`,
    kind: 'extension',
    pgId: pg.id,
    pgName: pg.name,
    residentName: x.customerName,
    phone: row?.phone ?? null,
    bookingCode: x.bookingCode,
    roomNumber: null,
    bedCode: bookingDetails?.bedCode ?? null,
    paymentTypeLabel: 'Stay extension',
    title: `${x.customerName} · Extension ${x.bookingCode}`,
    subtitle: 'Stay extension payment',
    amountPaise: x.amountPaise,
    screenshotUrl: x.paymentProofUrl!,
    entityId: x.extensionId,
    customerId: row?.customerId ?? null,
    bookingId: row?.bookingId ?? null,
    expectedLines,
    expectedTotalPaise: x.amountPaise,
    receivedPaise: null,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: 'Verify screenshot — approval confirms extension payment',
    canPartialApprove: false,
    canReject: true,
    bookingDetails: bookingDetails ?? undefined,
  };
}

async function buildDepositLinkReviewItem(
  pg: { id: string; name: string },
  d: Awaited<ReturnType<typeof listPendingDepositLinkProofsForPg>>[number],
): Promise<PendingPaymentReviewItem | null> {
  const [linkRow] = await db
    .select({
      residentId: paymentLinks.residentId,
    })
    .from(paymentLinks)
    .where(eq(paymentLinks.id, d.linkId))
    .limit(1);

  let customerPhone: string | null = null;
  let bookingCode: string | null = null;
  if (linkRow) {
    const [row] = await db
      .select({ phone: customers.phone })
      .from(customers)
      .where(eq(customers.id, linkRow.residentId))
      .limit(1);
    customerPhone = row?.phone ?? null;
  }
  if (d.bookingId) {
    const [booking] = await db
      .select({ bookingCode: bookings.bookingCode })
      .from(bookings)
      .where(eq(bookings.id, d.bookingId))
      .limit(1);
    bookingCode = booking?.bookingCode ?? null;
  }

  const expectedLines: PaymentReviewExpectedLine[] = [
    { label: d.title ?? 'Additional deposit', amountPaise: d.amountPaise },
  ];

  return {
    key: `deposit-link-${d.linkId}`,
    kind: 'deposit_link',
    pgId: pg.id,
    pgName: pg.name,
    residentName: d.customerName,
    phone: customerPhone,
    bookingCode,
    roomNumber: d.roomNumber ?? null,
    bedCode: null,
    paymentTypeLabel: 'Security deposit',
    title: `${d.customerName} · ${d.title ?? 'Additional deposit'}`,
    subtitle: 'Additional security deposit',
    amountPaise: d.amountPaise,
    screenshotUrl: d.paymentProofUrl!,
    entityId: d.linkId,
    customerId: linkRow?.residentId ?? null,
    bookingId: d.bookingId,
    expectedLines,
    expectedTotalPaise: d.amountPaise,
    receivedPaise: null,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary: 'Verify screenshot — approval records deposit collection',
    canPartialApprove: false,
    canReject: true,
  };
}

export async function listPendingPaymentReviews(
  session: AdminSession,
): Promise<PendingPaymentReviewItem[]> {
  const items: PendingPaymentReviewItem[] = [];

  const qrRows = await listOwnerPayments(session, { status: 'pending' });
  for (const p of qrRows) {
    const isBookingCheckout = Boolean(p.bookingCode);
    const bookingPaymentReview =
      isBookingCheckout && p.bookingId ? await getQrBookingPaymentReview(p.id) : null;
    const bookingDetails =
      p.bookingId ? await loadBookingReviewDetails(p.bookingId) : null;
    items.push(buildQrReviewItem(p, bookingPaymentReview, bookingDetails));
  }

  const pgRows = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(isNull(pgs.archivedAt));

  for (const pg of pgRows) {
    if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pg.id)) {
      continue;
    }

    const [rentProofs, elecProofs, extProofs, depositLinks] = await Promise.all([
      listPendingRentProofsForPg(pg.id),
      listPendingElectricityProofsForPg(pg.id),
      listPendingExtensionProofsForPg(pg.id),
      listPendingDepositLinkProofsForPg(pg.id),
    ]);

    for (const r of rentProofs) {
      if (!r.paymentProofUrl) continue;
      const item = await buildRentReviewItem(pg, r);
      if (item) items.push(item);
    }

    for (const e of elecProofs) {
      if (!e.paymentProofUrl) continue;
      const item = await buildElectricityReviewItem(pg, e);
      if (item) items.push(item);
    }

    for (const x of extProofs) {
      if (!x.paymentProofUrl) continue;
      const item = await buildExtensionReviewItem(pg, x);
      if (item) items.push(item);
    }

    for (const d of depositLinks) {
      if (!d.paymentProofUrl) continue;
      const item = await buildDepositLinkReviewItem(pg, d);
      if (item) items.push(item);
    }
  }

  return items;
}

export async function countPendingPaymentReviews(session: AdminSession): Promise<number> {
  const items = await listPendingPaymentReviews(session);
  return items.length;
}
