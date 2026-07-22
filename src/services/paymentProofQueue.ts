import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { parseDaterange } from '@/src/services/availability';
import { listPendingExtensionProofsForPg } from '@/src/services/extension';
import { listPendingElectricityProofsForPg } from '@/src/services/meterElectricity';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { fetchElectricityInvoiceById } from '@/src/lib/db/electricityInvoiceSelect';
import { listPendingRentProofsForPg, projectInvoice } from '@/src/services/rentInvoices';
import { listPendingDepositLinkProofsForPg } from '@/src/services/residentCharges';
import { listOwnerPayments, getQrBookingPaymentReview } from '@/src/services/qrPayments';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  paymentLinks,
  pgs,
  rentInvoices,
  rooms,
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import type {
  PaymentReviewBookingDetails,
  PaymentReviewExpectedLine,
  PendingPaymentReviewItem,
} from '@/src/lib/operations/paymentReviewTypes';
import { resolveBookingDepositCreditAppliedPaise } from '@/src/lib/billing/bookingCheckoutTotals';
import { resolveFinancialInvoiceIdForSource } from '@/src/services/adminCashSettlement';
import {
  buildBookingPaymentExplanation,
  buildSimplePaymentExplanation,
} from '@/src/lib/operations/paymentExplanationView';
import {
  buildPaymentBookingContext,
  type BookingDetailsInput,
} from '@/src/lib/operations/paymentBookingContextView';
import { paymentCategoryBusinessLabel, stayTypeBusinessLabel } from '@/src/lib/stayType';
import { titleCase } from '@/src/lib/format';
import { formatDate as formatIsoDate } from '@/src/lib/dates';
import { dedupePendingPaymentReviews } from '@/src/lib/operations/dedupePendingPaymentReviews';
import { isBookingCheckoutEligibleForPaymentReview } from '@/src/lib/operations/paymentReviewSsot';
import { reconcileBookingPaymentReviewQueue } from '@/src/services/paymentReviewReconciliation';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { cache } from 'react';
import { adminRequestScopeKey } from '@/src/lib/admin/adminRequestCache';

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
      customerId: bookings.customerId,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      durationMode: bookings.durationMode,
      stayType: bookings.stayType,
      status: bookings.status,
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      depositPaise: bookings.depositPaise,
      pricingSnapshot: bookings.pricingSnapshot,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
      stayRange: bedReservations.stayRange,
    })
    .from(bookings)
    .leftJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .leftJoin(beds, eq(beds.id, bedReservations.bedId))
    .leftJoin(rooms, eq(rooms.id, beds.roomId))
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

  const snapshot = row.pricingSnapshot as PricingSnapshot | null;
  const depositCredit = snapshot?.depositCredit;
  const subtotalPaise = row.subtotalPaise ?? null;
  const discountPaise = row.discountPaise ?? null;
  const rentDuePaise =
    subtotalPaise != null
      ? Math.max(0, subtotalPaise - (discountPaise ?? 0))
      : null;

  const { resolveLivePriorOutstandingForCheckout } = await import(
    '@/src/services/bookingPriorOutstanding'
  );
  const priorOutstanding = await resolveLivePriorOutstandingForCheckout(row.customerId, bookingId);

  return {
    moveInDate,
    moveOutDate,
    durationLabel,
    roomType: row.stayType ? titleCase(String(row.stayType).replace(/_/g, ' ')) : null,
    bedCode: row.bedCode ?? null,
    roomNumber: row.roomNumber ?? null,
    monthlyRentPaise: monthlyRentFromSnapshot(snapshot),
    depositRequiredPaise: row.depositPaise ?? null,
    durationMode: row.durationMode ? String(row.durationMode) : null,
    stayType: row.stayType ? String(row.stayType) : null,
    bookingStatus: row.status ? String(row.status) : null,
    subtotalPaise,
    discountPaise,
    rentDuePaise,
    rentLineItems: snapshot?.rentLineItems,
    snapshotPerBedDurationMode: snapshot?.perBed?.[0]?.durationMode ?? null,
    snapshotPerBedUnits: snapshot?.perBed?.[0]?.units ?? null,
    depositCreditAppliedPaise: resolveBookingDepositCreditAppliedPaise(depositCredit),
    depositCreditSourceBookingId: depositCredit?.sourceBookingId ?? null,
    depositCreditSourceBookingCode: depositCredit?.sourceBookingCode ?? null,
    priorOutstandingItems: priorOutstanding.items,
  };
}

async function loadBookingReviewDetailsMap(
  bookingIds: string[],
): Promise<Map<string, PaymentReviewBookingDetails>> {
  const unique = [...new Set(bookingIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const rows = await db
    .select({
      bookingId: bookings.id,
      customerId: bookings.customerId,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      durationMode: bookings.durationMode,
      stayType: bookings.stayType,
      status: bookings.status,
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      depositPaise: bookings.depositPaise,
      pricingSnapshot: bookings.pricingSnapshot,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
      stayRange: bedReservations.stayRange,
    })
    .from(bookings)
    .leftJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .leftJoin(beds, eq(beds.id, bedReservations.bedId))
    .leftJoin(rooms, eq(rooms.id, beds.roomId))
    .where(inArray(bookings.id, unique));

  const { resolveLivePriorOutstandingForCheckout } = await import(
    '@/src/services/bookingPriorOutstanding'
  );

  const out = new Map<string, PaymentReviewBookingDetails>();
  for (const row of rows) {
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

    const snapshot = row.pricingSnapshot as PricingSnapshot | null;
    const depositCredit = snapshot?.depositCredit;
    const subtotalPaise = row.subtotalPaise ?? null;
    const discountPaise = row.discountPaise ?? null;
    const rentDuePaise =
      subtotalPaise != null
        ? Math.max(0, subtotalPaise - (discountPaise ?? 0))
        : null;

    const priorOutstanding = await resolveLivePriorOutstandingForCheckout(
      row.customerId,
      row.bookingId,
    );

    out.set(row.bookingId, {
      moveInDate,
      moveOutDate,
      durationLabel,
      roomType: row.stayType ? titleCase(String(row.stayType).replace(/_/g, ' ')) : null,
      bedCode: row.bedCode ?? null,
      roomNumber: row.roomNumber ?? null,
      monthlyRentPaise: monthlyRentFromSnapshot(snapshot),
      depositRequiredPaise: row.depositPaise ?? null,
      durationMode: row.durationMode ? String(row.durationMode) : null,
      stayType: row.stayType ? String(row.stayType) : null,
      bookingStatus: row.status ? String(row.status) : null,
      subtotalPaise,
      discountPaise,
      rentDuePaise,
      rentLineItems: snapshot?.rentLineItems,
      snapshotPerBedDurationMode: snapshot?.perBed?.[0]?.durationMode ?? null,
      snapshotPerBedUnits: snapshot?.perBed?.[0]?.units ?? null,
      depositCreditAppliedPaise: resolveBookingDepositCreditAppliedPaise(depositCredit),
      depositCreditSourceBookingId: depositCredit?.sourceBookingId ?? null,
      depositCreditSourceBookingCode: depositCredit?.sourceBookingCode ?? null,
      priorOutstandingItems: priorOutstanding.items,
    });
  }
  return out;
}

function bookingDetailsForContext(
  details: PaymentReviewBookingDetails | null,
): BookingDetailsInput | null {
  if (!details) return null;
  const pricingSnapshot: PricingSnapshot | null =
    details.snapshotPerBedDurationMode
      ? {
          perBed: [
            {
              bedId: '',
              dailyRatePaise: 0,
              weeklyRatePaise: 0,
              monthlyRatePaise: 0,
              securityDepositPaise: 0,
              durationMode: details.snapshotPerBedDurationMode as PricingSnapshot['perBed'][0]['durationMode'],
              units: details.snapshotPerBedUnits ?? 0,
              lineTotalPaise: 0,
            },
          ],
          computedAt: '',
        }
      : null;

  return {
    moveInDate: details.moveInDate,
    moveOutDate: details.moveOutDate,
    durationMode: details.durationMode,
    stayType: details.stayType,
    bookingStatus: details.bookingStatus,
    subtotalPaise: details.subtotalPaise,
    discountPaise: details.discountPaise,
    depositRequiredPaise: details.depositRequiredPaise,
    rentDuePaise: details.rentDuePaise,
    pricingSnapshot,
    rentLineItems: details.rentLineItems,
  };
}

function contextFromItem(
  item: Pick<
    PendingPaymentReviewItem,
    | 'kind'
    | 'pgName'
    | 'bookingCode'
    | 'roomNumber'
    | 'bedCode'
    | 'paymentTypeLabel'
    | 'subtitle'
    | 'amountPaise'
    | 'bookingPaymentReview'
  >,
  details: PaymentReviewBookingDetails | null,
) {
  return buildPaymentBookingContext(item, bookingDetailsForContext(details));
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
  priorBookingDepositsInput: import('@/src/services/depositCredit').PriorBookingDepositInfo[] | null | undefined = [],
): PendingPaymentReviewItem {
  const priorBookingDeposits = priorBookingDepositsInput ?? [];
  const isBookingCheckout = Boolean(p.bookingCode);
  const stayLabel =
    bookingDetails?.stayType || bookingDetails?.durationMode
      ? stayTypeBusinessLabel(
          {
            stayType: bookingDetails?.stayType,
            durationMode: bookingDetails?.durationMode,
          },
          'ops',
        )
      : null;
  const paymentTypeLabel = isBookingCheckout
    ? bookingPaymentReview?.canPartialApprove
      ? `${stayLabel ?? 'New stay'} · Partial payment`
      : (stayLabel ?? paymentCategoryBusinessLabel('qr'))
    : paymentCategoryBusinessLabel(
        p.categoryName?.toLowerCase().includes('electric')
          ? 'electricity'
          : p.categoryName?.toLowerCase().includes('deposit')
            ? 'deposit_link'
            : 'rent',
      );

  let expectedLines: PaymentReviewExpectedLine[] = [];
  let expectedTotalPaise = p.amountPaise;
  let receivedPaise: number | null = p.amountPaise;
  let outstandingAfterApprovalPaise = 0;
  let overpaidPaise = 0;
  let canPartialApprove = false;
  let outstandingSummary: string | null = null;
  const verifiedProofAmountPaise = bookingPaymentReview
    ? (bookingPaymentReview.verifiedProofAmountPaise ??
      bookingPaymentReview.amountSubmittedPaise ??
      p.amountPaise)
    : p.amountPaise;

  if (bookingPaymentReview) {
    expectedLines = [
      { label: 'Rent', amountPaise: bookingPaymentReview.rentDuePaise },
      { label: 'Deposit', amountPaise: bookingPaymentReview.depositCashDuePaise },
    ];
    if ((bookingPaymentReview.priorOutstandingDuePaise ?? 0) > 0) {
      expectedLines.push({
        label: 'Prior outstanding',
        amountPaise: bookingPaymentReview.priorOutstandingDuePaise ?? 0,
      });
    }
    expectedTotalPaise = bookingPaymentReview.bookingTotalDuePaise;
    receivedPaise = verifiedProofAmountPaise;
    outstandingAfterApprovalPaise = bookingPaymentReview.depositDuePaise;
    overpaidPaise = Math.max(0, verifiedProofAmountPaise - expectedTotalPaise);
    canPartialApprove = bookingPaymentReview.canPartialApprove;
    outstandingSummary = buildOutstandingSummary({
      outstandingAfterApprovalPaise,
      overpaidPaise,
    });
  } else {
    expectedLines = [{ label: paymentTypeLabel, amountPaise: p.amountPaise }];
    expectedTotalPaise = p.amountPaise;
    receivedPaise = p.amountPaise;
    outstandingAfterApprovalPaise = 0;
    overpaidPaise = 0;
    outstandingSummary = 'Approval records this collection';
  }

  const paymentExplanation = bookingPaymentReview
    ? buildBookingPaymentExplanation({
        review: bookingPaymentReview,
        depositRequiredPaise: bookingDetails?.depositRequiredPaise ?? null,
        depositCreditAppliedPaise: bookingDetails?.depositCreditAppliedPaise ?? 0,
        depositCreditSourceBookingId: bookingDetails?.depositCreditSourceBookingId,
        depositCreditSourceBookingCode: bookingDetails?.depositCreditSourceBookingCode,
        priorOutstandingItems: bookingDetails?.priorOutstandingItems ?? [],
        priorBookingDeposits,
      })
    : buildSimplePaymentExplanation({
        lines: expectedLines,
        totalExpectedPaise: expectedTotalPaise,
        receivedPaise,
        resultLabel: outstandingSummary,
      });

  const roomNumber = bookingDetails?.roomNumber ?? null;
  const bedCode = bookingDetails?.bedCode ?? null;
  const bookingContext = contextFromItem(
    {
      kind: 'qr',
      pgName: p.pgName,
      bookingCode: p.bookingCode ?? null,
      roomNumber,
      bedCode,
      paymentTypeLabel,
      subtitle: isBookingCheckout
        ? 'New stay checkout — rent, deposit & prior balance'
        : p.month
          ? `Month ${p.month}`
          : 'QR payment',
      amountPaise: verifiedProofAmountPaise,
      bookingPaymentReview: bookingPaymentReview ?? undefined,
    },
    bookingDetails,
  );

  return {
    key: `qr-${p.id}`,
    kind: 'qr',
    pgId: p.pgId,
    pgName: p.pgName,
    residentName: p.customerName,
    phone: p.customerPhone ?? null,
    bookingCode: p.bookingCode ?? null,
    roomNumber,
    bedCode,
    paymentTypeLabel,
    title: isBookingCheckout
      ? `${p.customerName} · ${stayLabel ?? paymentCategoryBusinessLabel('qr')} ${p.bookingCode ?? ''}`.trim()
      : `${p.customerName} · ${p.categoryName}`,
    subtitle: isBookingCheckout
      ? 'New stay checkout — rent, deposit & prior balance'
      : p.month
        ? `Month ${p.month}`
        : 'QR payment',
    amountPaise: verifiedProofAmountPaise,
    verifiedProofAmountPaise,
    screenshotUrl: p.paymentScreenshotUrl ?? '',
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
    priorBookingDeposits:
      priorBookingDeposits.length > 0 ? priorBookingDeposits : undefined,
    paymentExplanation,
    bookingContext,
    lifecycleState: isBookingCheckout ? 'reservation_request' : 'payment_collection',
    submittedAmountPaise: receivedPaise,
    referenceNumber: p.transactionRef ?? null,
    proofSubmittedAt: p.createdAt?.toISOString?.() ?? null,
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
  const frozenOutstanding =
    invoice.proofSnapshotOutstandingPaise ?? projected.outstandingPaise;
  const expectedLines: PaymentReviewExpectedLine[] = [
    { label: 'Amount due', amountPaise: frozenOutstanding },
  ];

  const [customer] = await db
    .select({ phone: customers.phone, bookingCode: bookings.bookingCode })
    .from(customers)
    .leftJoin(bookings, eq(bookings.id, invoice.bookingId))
    .where(eq(customers.id, invoice.customerId))
    .limit(1);

  const financialInvoiceId = await resolveFinancialInvoiceIdForSource({
    sourceTable: 'rent_invoices',
    sourceId: r.invoiceId,
  });

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
    amountPaise: frozenOutstanding,
    screenshotUrl: r.paymentProofUrl!,
    entityId: r.invoiceId,
    customerId: invoice.customerId,
    bookingId: invoice.bookingId,
    expectedLines,
    expectedTotalPaise: frozenOutstanding,
    receivedPaise: null,
    outstandingAfterApprovalPaise: 0,
    overpaidPaise: 0,
    outstandingSummary:
      'Verify screenshot — approval records amount frozen at proof submission',
    canPartialApprove: false,
    canReject: true,
    invoiceNumber: r.invoiceNumber,
    invoiceAmountPaise: frozenOutstanding,
    submittedAmountPaise: frozenOutstanding,
    proofSubmittedAt: (invoice.proofSubmittedAt ?? invoice.updatedAt).toISOString(),
    billingMonth: r.billingMonth,
    isPipelineTest: false,
    financialInvoiceId,
    paymentExplanation: buildSimplePaymentExplanation({
      lines: expectedLines,
      totalExpectedPaise: frozenOutstanding,
      receivedPaise: null,
      resultLabel: 'Verify screenshot — approval records amount frozen at proof submission',
    }),
    bookingContext: contextFromItem(
      {
        kind: 'rent',
        pgName: pg.name,
        bookingCode: customer?.bookingCode ?? null,
        roomNumber: r.roomNumber,
        bedCode: r.bedCode,
        paymentTypeLabel: 'Monthly rent',
        subtitle: `Room ${r.roomNumber} · ${r.bedCode} · ${r.billingMonth.slice(0, 7)}`,
        amountPaise: frozenOutstanding,
      },
      null,
    ),
  };
}

async function buildElectricityReviewItem(
  pg: { id: string; name: string },
  e: Awaited<ReturnType<typeof listPendingElectricityProofsForPg>>[number],
): Promise<PendingPaymentReviewItem | null> {
  const invoice = await fetchElectricityInvoiceById(e.invoiceId);
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

  const financialInvoiceId = await resolveFinancialInvoiceIdForSource({
    sourceTable: 'electricity_invoices',
    sourceId: e.invoiceId,
  });

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
    invoiceNumber: e.invoiceNumber,
    invoiceAmountPaise: expectedTotalPaise,
    submittedAmountPaise: expectedTotalPaise,
    proofSubmittedAt: invoice.updatedAt.toISOString(),
    billingMonth: invoice.billingMonth,
    isPipelineTest: invoice.isPipelineTest ?? false,
    financialInvoiceId,
    paymentExplanation: buildSimplePaymentExplanation({
      lines: expectedLines,
      totalExpectedPaise: expectedTotalPaise,
      receivedPaise: null,
      resultLabel: 'Verify screenshot — approval records full electricity due',
    }),
    bookingContext: contextFromItem(
      {
        kind: 'electricity',
        pgName: pg.name,
        bookingCode: customer?.bookingCode ?? null,
        roomNumber: e.roomNumber,
        bedCode: null,
        paymentTypeLabel: 'Electricity',
        subtitle: `Room ${e.roomNumber}`,
        amountPaise: expectedTotalPaise,
      },
      null,
    ),
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
    paymentExplanation: buildSimplePaymentExplanation({
      lines: expectedLines,
      totalExpectedPaise: x.amountPaise,
      receivedPaise: null,
      resultLabel: 'Verify screenshot — approval confirms extension payment',
    }),
    bookingContext: contextFromItem(
      {
        kind: 'extension',
        pgName: pg.name,
        bookingCode: x.bookingCode,
        roomNumber: null,
        bedCode: bookingDetails?.bedCode ?? null,
        paymentTypeLabel: 'Stay extension',
        subtitle: 'Stay extension payment',
        amountPaise: x.amountPaise,
      },
      bookingDetails,
    ),
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
    paymentExplanation: buildSimplePaymentExplanation({
      lines: expectedLines,
      totalExpectedPaise: d.amountPaise,
      receivedPaise: null,
      resultLabel: 'Verify screenshot — approval records deposit collection',
    }),
    bookingContext: contextFromItem(
      {
        kind: 'deposit_link',
        pgName: pg.name,
        bookingCode,
        roomNumber: d.roomNumber ?? null,
        bedCode: null,
        paymentTypeLabel: 'Security deposit',
        subtitle: 'Additional security deposit',
        amountPaise: d.amountPaise,
      },
      null,
    ),
  };
}

async function fetchPendingPaymentReviews(
  session: AdminSession,
): Promise<PendingPaymentReviewItem[]> {
  paymentReviewFetchCount += 1;

  await reconcileBookingPaymentReviewQueue();

  const items: PendingPaymentReviewItem[] = [];

  const qrRows = await listOwnerPayments(session, { status: 'pending' });
  const { listPriorBookingDepositsForReview } = await import('@/src/services/depositCredit');
  const qrBookingIds = qrRows.map((p) => p.bookingId).filter((id): id is string => Boolean(id));
  const bookingDetailsById = await loadBookingReviewDetailsMap(qrBookingIds);
  const qrItems = (
    await Promise.all(
      qrRows
        .filter((p) => p.paymentScreenshotUrl?.trim())
        .map(async (p) => {
          const isBookingCheckout = Boolean(p.bookingCode || p.bookingId);
          const bookingDetails = p.bookingId ? bookingDetailsById.get(p.bookingId) ?? null : null;
          if (isBookingCheckout && p.bookingId) {
            if (
              !bookingDetails?.bookingStatus ||
              !isBookingCheckoutEligibleForPaymentReview(bookingDetails.bookingStatus)
            ) {
              return null;
            }
          }
          const bookingPaymentReview =
            isBookingCheckout && p.bookingId ? await getQrBookingPaymentReview(p.id) : null;
          const priorBookingDeposits =
            isBookingCheckout && p.customerId
              ? await listPriorBookingDepositsForReview(p.customerId, p.bookingId)
              : [];
          return buildQrReviewItem(p, bookingPaymentReview, bookingDetails, priorBookingDeposits);
        }),
    )
  ).filter((item): item is PendingPaymentReviewItem => item !== null);
  items.push(...qrItems);

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

    const pgItems = await Promise.all([
      ...(rentProofs ?? [])
        .filter((r) => r.paymentProofUrl)
        .map((r) => buildRentReviewItem(pg, r)),
      ...(elecProofs ?? [])
        .filter((e) => e.paymentProofUrl)
        .map((e) => buildElectricityReviewItem(pg, e)),
      ...(extProofs ?? [])
        .filter((x) => x.paymentProofUrl)
        .map((x) => buildExtensionReviewItem(pg, x)),
      ...(depositLinks ?? [])
        .filter((d) => d.paymentProofUrl)
        .map((d) => buildDepositLinkReviewItem(pg, d)),
    ]);
    for (const item of pgItems) {
      if (item) items.push(item);
    }
  }

  return dedupePendingPaymentReviews(items);
}

const listPendingPaymentReviewsCached = cache(
  async (scopeKey: string, session: AdminSession): Promise<PendingPaymentReviewItem[]> => {
    void scopeKey;
    return fetchPendingPaymentReviews(session);
  },
);

/** Deduped within a single admin RSC request (layout + page). */
export function getPendingPaymentReviewsForRequest(
  session: AdminSession,
): Promise<PendingPaymentReviewItem[]> {
  return listPendingPaymentReviewsCached(adminRequestScopeKey(session), session);
}

export async function listPendingPaymentReviews(
  session: AdminSession,
): Promise<PendingPaymentReviewItem[]> {
  return getPendingPaymentReviewsForRequest(session);
}

export async function getPendingPaymentReviewByKey(
  session: AdminSession,
  reviewKey: string,
): Promise<PendingPaymentReviewItem | null> {
  const items = await listPendingPaymentReviews(session);
  return items.find((i) => i.key === reviewKey) ?? null;
}

/** Next item in FIFO review queue after the current key (excludes current). */
export async function getNextPendingPaymentReviewKey(
  session: AdminSession,
  afterKey?: string,
): Promise<string | null> {
  const items = await listPendingPaymentReviews(session);
  if (items.length === 0) return null;
  if (!afterKey) return items[0]?.key ?? null;
  const idx = items.findIndex((i) => i.key === afterKey);
  if (idx < 0) return items[0]?.key ?? null;
  return items[idx + 1]?.key ?? null;
}

export async function countPendingPaymentReviews(session: AdminSession): Promise<number> {
  const items = await getPendingPaymentReviewsForRequest(session);
  return items.length;
}

let paymentReviewFetchCount = 0;

/** Test/profiling only — count uncached payment review fetches in this process. */
export function resetPaymentReviewFetchCount(): void {
  paymentReviewFetchCount = 0;
}

export function getPaymentReviewFetchCount(): number {
  return paymentReviewFetchCount;
}
