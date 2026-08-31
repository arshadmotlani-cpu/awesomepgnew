/**
 * Resident charge generator — structured deposit / rent / custom charges with payment links.
 */

import { and, eq, isNotNull, or } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  financialInvoices,
  floors,
  paymentLinks,
  pgs,
  rooms,
} from '@/src/db/schema';
import { buildChargeRequestWhatsAppUrl } from '@/src/lib/billing/adminWhatsApp';
import { expressSaleIdempotencyKey } from '@/src/lib/billing/invoiceStateMachine';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import { formatDate } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { createCustomCharge, type CustomChargeKind } from '@/src/services/customCharges';
import { recordDepositPaymentFromLink } from '@/src/services/invoicePayment';
import { createPaymentLink } from '@/src/services/paymentLinks';
import { ensureMonthlyRentInvoice } from '@/src/services/rentInvoices';
import { getResidentFinancialSummary } from '@/src/services/residentFinancialEngine';
import { createPaymentLinkForInvoice } from '@/src/services/unifiedInvoices';
import type { ResidentChargeType } from '@/src/lib/billing/chargeGeneratorConstants';

export type { ResidentChargeType } from '@/src/lib/billing/chargeGeneratorConstants';
export { CHARGE_DEFAULTS } from '@/src/lib/billing/chargeGeneratorConstants';

export type CreateResidentChargeInput = {
  customerId: string;
  bookingId?: string | null;
  chargeType: ResidentChargeType;
  title: string;
  description?: string;
  amountPaise: number;
  dueDate?: string;
  /** Custom charge kind when chargeType is custom_charge */
  customKind?: CustomChargeKind;
  actorId: string;
};

export type CreateResidentChargeResult =
  | {
      ok: true;
      chargeType: ResidentChargeType;
      title: string;
      amountPaise: number;
      paymentLinkUrl: string;
      whatsappShareUrl: string | null;
      linkId: string;
      qrUrl: string;
      invoiceId?: string;
      invoiceNumber?: string;
      rentInvoiceId?: string;
    }
  | { ok: false; error: string };

async function loadResidentChargeContext(customerId: string, bookingId?: string | null) {
  const summary = await getResidentFinancialSummary(customerId);
  if (!summary?.pgId) {
    return null;
  }

  const resolvedBookingId = bookingId ?? summary.bookingId ?? null;
  if (!resolvedBookingId) return null;

  const [ctx] = await db
    .select({
      customerId: customers.id,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      pgId: pgs.id,
      pgName: pgs.name,
      bedId: beds.id,
      roomNumber: rooms.roomNumber,
    })
    .from(customers)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, resolvedBookingId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(customers.id, customerId),
        eq(bedReservations.kind, 'primary'),
      ),
    )
    .limit(1);

  if (!ctx) return null;

  return {
    ...ctx,
    bookingId: resolvedBookingId,
    roomNumber: ctx.roomNumber ?? summary.roomNumber ?? '',
  };
}

async function applyChargeWhatsAppTemplate(linkId: string, input: {
  customerName: string;
  customerPhone: string;
  title: string;
  amountPaise: number;
  publicUrl: string;
}): Promise<string | null> {
  const whatsappShareUrl = buildChargeRequestWhatsAppUrl({
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    title: input.title,
    amountPaise: input.amountPaise,
    paymentLinkUrl: input.publicUrl,
  });
  if (whatsappShareUrl) {
    await db
      .update(paymentLinks)
      .set({ whatsappShareUrl })
      .where(eq(paymentLinks.id, linkId));
  }
  return whatsappShareUrl;
}

/** Create a structured resident charge with payment link, QR, and WhatsApp share. */
export async function createResidentCharge(
  input: CreateResidentChargeInput,
): Promise<CreateResidentChargeResult> {
  if (input.amountPaise <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }
  if (!input.title.trim()) {
    return { ok: false, error: 'Title is required.' };
  }
  if (input.chargeType === 'electricity_charge') {
    return { ok: false, error: 'Electricity charges are not available yet.' };
  }

  const ctx = await loadResidentChargeContext(input.customerId, input.bookingId);
  if (!ctx) {
    return { ok: false, error: 'Resident not found or has no active booking.' };
  }

  const title = input.title.trim();
  const description = input.description?.trim() || undefined;
  const dueDate = input.dueDate ?? formatDate(new Date());

  if (input.chargeType === 'additional_deposit') {
    const linkRes = await createPaymentLink({
      residentId: ctx.customerId,
      pgId: ctx.pgId,
      amountPaise: input.amountPaise,
      purpose: 'deposit',
      residentName: ctx.customerName,
      residentPhone: ctx.customerPhone,
      pgName: ctx.pgName,
      dueDate,
      roomNumber: ctx.roomNumber,
      title,
      description,
      bookingId: ctx.bookingId,
      createdByAdminId: input.actorId,
      chargeRequest: true,
    });
    if (!linkRes.ok) return { ok: false, error: linkRes.message };

    return {
      ok: true,
      chargeType: 'additional_deposit',
      title,
      amountPaise: input.amountPaise,
      paymentLinkUrl: linkRes.publicUrl,
      whatsappShareUrl: linkRes.link.whatsappShareUrl,
      linkId: linkRes.link.id,
      qrUrl: linkRes.link.upiQrUrl,
    };
  }

  if (input.chargeType === 'rent_charge') {
    const billingMonth = firstOfMonth(input.dueDate ?? formatDate(new Date()));
    const invoiceRes = await ensureMonthlyRentInvoice({
      bookingId: ctx.bookingId,
      billingMonth,
      amountPaise: input.amountPaise,
    });
    if (!invoiceRes.ok) return { ok: false, error: invoiceRes.error };

    if (invoiceRes.status === 'paid') {
      return { ok: false, error: 'Monthly rent invoice is already paid for this cycle.' };
    }
    if (invoiceRes.status === 'payment_in_progress') {
      return {
        ok: false,
        error: 'Rent payment is already in progress for this invoice.',
      };
    }

    const linkRes = await createPaymentLink({
      residentId: ctx.customerId,
      pgId: ctx.pgId,
      amountPaise: input.amountPaise,
      purpose: 'rent',
      residentName: ctx.customerName,
      residentPhone: ctx.customerPhone,
      pgName: ctx.pgName,
      dueDate,
      roomNumber: ctx.roomNumber,
      title,
      description,
      bookingId: ctx.bookingId,
      rentInvoiceId: invoiceRes.invoiceId,
      createdByAdminId: input.actorId,
      chargeRequest: true,
      idempotencyKey: expressSaleIdempotencyKey({
        rentInvoiceId: invoiceRes.invoiceId,
        linkId: invoiceRes.invoiceId,
      }),
    });
    if (!linkRes.ok) return { ok: false, error: linkRes.message };

    const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
    const unifiedId = await syncRentInvoiceToUnified(invoiceRes.invoiceId);
    if (unifiedId) {
      await db
        .update(financialInvoices)
        .set({ paymentLinkId: linkRes.link.id, updatedAt: new Date() })
        .where(eq(financialInvoices.id, unifiedId));
      await db
        .update(paymentLinks)
        .set({ invoiceId: unifiedId })
        .where(eq(paymentLinks.id, linkRes.link.id));
    }

    return {
      ok: true,
      chargeType: 'rent_charge',
      title,
      amountPaise: input.amountPaise,
      paymentLinkUrl: linkRes.publicUrl,
      whatsappShareUrl: linkRes.link.whatsappShareUrl,
      linkId: linkRes.link.id,
      qrUrl: linkRes.link.upiQrUrl,
      rentInvoiceId: invoiceRes.invoiceId,
      invoiceNumber: invoiceRes.invoiceNumber,
    };
  }

  const customRes = await createCustomCharge({
    customerId: input.customerId,
    bookingId: ctx.bookingId,
    kind: input.customKind ?? 'custom',
    title,
    description,
    amountPaise: input.amountPaise,
    dueDate,
    actorId: input.actorId,
  });
  if (!customRes.ok) return { ok: false, error: customRes.error };

  const [fi] = await db
    .select({ paymentLinkId: financialInvoices.paymentLinkId })
    .from(financialInvoices)
    .where(eq(financialInvoices.id, customRes.invoiceId))
    .limit(1);

  let linkId = fi?.paymentLinkId ?? null;
  let publicUrl: string;
  let qrUrl = '';

  if (!linkId) {
    const linkRes = await createPaymentLinkForInvoice(customRes.invoiceId);
    if (!linkRes.ok) {
      return { ok: false, error: linkRes.message ?? 'Payment link could not be created.' };
    }
    linkId = linkRes.linkId;
    publicUrl = linkRes.publicUrl;
  } else {
    publicUrl = paymentLinkPublicUrl(linkId);
  }

  const [linkRow] = await db
    .select({ upiQrUrl: paymentLinks.upiQrUrl })
    .from(paymentLinks)
    .where(eq(paymentLinks.id, linkId))
    .limit(1);
  qrUrl = linkRow?.upiQrUrl ?? '';

  const whatsappShareUrl = await applyChargeWhatsAppTemplate(linkId, {
    customerName: ctx.customerName,
    customerPhone: ctx.customerPhone,
    title,
    amountPaise: input.amountPaise,
    publicUrl,
  });

  revalidateFinancialViews();

  return {
    ok: true,
    chargeType: 'custom_charge',
    title,
    amountPaise: input.amountPaise,
    paymentLinkUrl: publicUrl,
    whatsappShareUrl,
    linkId,
    qrUrl,
    invoiceId: customRes.invoiceId,
    invoiceNumber: customRes.invoiceNumber,
  };
}

export async function submitDepositLinkPaymentProof(
  linkId: string,
  customerId: string,
  proof: { transactionRef: string; paymentProofUrl?: string | null },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!customerId?.trim()) {
    return { ok: false, message: 'Sign in required.' };
  }
  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.id, linkId))
    .limit(1);
  if (!link || link.status !== 'active') {
    return { ok: false, message: 'Payment link not found or no longer active.' };
  }
  if (link.residentId !== customerId) {
    return { ok: false, message: 'This payment link belongs to another resident.' };
  }
  if (link.purpose !== 'deposit' || !link.bookingId) {
    return { ok: false, message: 'This link is not a deposit collection request.' };
  }

  const proofUrl = proof.paymentProofUrl?.trim() || null;
  const rawTxn = proof.transactionRef.trim();

  let flags: {
    possibleDuplicate: boolean;
    duplicateOfIds: string[];
  };
  try {
    const { resolveDuplicateFlagsForSubmit } = await import('@/src/services/pgTransactionRefIndex');
    flags = await resolveDuplicateFlagsForSubmit({
      transactionRef: proof.transactionRef,
      exclude: { kind: 'payment_link', id: linkId },
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  const {
    evaluatePaymentReviewInvariants,
    paymentReviewInvariantErrorMessage,
  } = await import('@/src/lib/payments/paymentReviewInvariants');
  const { hasDuplicatePendingPaymentProofUrl } = await import(
    '@/src/lib/payments/duplicatePendingPaymentProof'
  );
  const duplicatePendingScreenshot = proofUrl
    ? await hasDuplicatePendingPaymentProofUrl({
        pgId: link.pgId,
        paymentProofUrl: proofUrl,
        exclude: { kind: 'deposit_link', id: linkId },
      })
    : false;
  const [bookingRow] = link.bookingId
    ? await db
        .select({ status: bookings.status })
        .from(bookings)
        .where(eq(bookings.id, link.bookingId))
        .limit(1)
    : [null];
  const invariant = evaluatePaymentReviewInvariants({
    kind: 'deposit_link',
    invoiceId: linkId,
    customerId: link.residentId,
    bookingId: link.bookingId,
    billingMonth: null,
    expectedAmountPaise: link.amount,
    proofAmountPaise: link.amount,
    paymentProofUrl: proofUrl,
    transactionRef: rawTxn,
    status: link.status,
    bookingStatus: bookingRow?.status ?? null,
    duplicatePendingScreenshot,
  });
  if (!invariant.ok) {
    const { alertHealthBrainPaymentReviewInvariant } = await import(
      '@/src/lib/health/healthBrainIncidents'
    );
    await alertHealthBrainPaymentReviewInvariant({
      kind: 'deposit_link',
      invoiceId: linkId,
      customerId: link.residentId,
      paymentProofUrl: proofUrl,
      source: 'proof_submit',
      violations: invariant.violations,
    });
    return { ok: false, message: paymentReviewInvariantErrorMessage(invariant) };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(paymentLinks)
      .set({
        paymentProofUrl: proofUrl,
        paymentProofTransactionRef: rawTxn,
        possibleDuplicate: flags.possibleDuplicate,
        duplicateOfIds: flags.duplicateOfIds,
      })
      .where(eq(paymentLinks.id, linkId));

    const { supersedeActiveRejection } = await import('@/src/services/paymentProofRejectionService');
    await supersedeActiveRejection('payment_link', linkId, tx);
  });

  if (proofUrl) {
    const { linkResidentUpload } = await import('@/src/services/residentUploadEvents');
    await linkResidentUpload({
      storagePath: proofUrl,
      adminQueue: 'operations',
      linkedEntity: 'payment_link',
      linkedEntityId: linkId,
      bookingId: link.bookingId,
      pgId: link.pgId,
    }).catch(() => undefined);
  }

  const { scheduleAdminNotificationSync } = await import('@/src/services/adminLiveSync');
  scheduleAdminNotificationSync();

  return { ok: true };
}

export async function submitInvoiceLinkPaymentProof(
  linkId: string,
  customerId: string,
  proof: { transactionRef: string; paymentProofUrl?: string | null },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!customerId?.trim()) {
    return { ok: false, message: 'Sign in required.' };
  }
  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.id, linkId))
    .limit(1);
  if (!link || link.status !== 'active') {
    return { ok: false, message: 'Payment link not found or no longer active.' };
  }
  if (link.residentId !== customerId) {
    return { ok: false, message: 'This payment link belongs to another resident.' };
  }
  if (!link.invoiceId) {
    return { ok: false, message: 'This link is not tied to an invoice.' };
  }

  const proofUrl = proof.paymentProofUrl?.trim() || null;
  const rawTxn = proof.transactionRef.trim();

  let flags: {
    possibleDuplicate: boolean;
    duplicateOfIds: string[];
  };
  try {
    const { resolveDuplicateFlagsForSubmit } = await import('@/src/services/pgTransactionRefIndex');
    flags = await resolveDuplicateFlagsForSubmit({
      transactionRef: proof.transactionRef,
      exclude: { kind: 'payment_link', id: linkId },
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  const {
    evaluatePaymentReviewInvariants,
    paymentReviewInvariantErrorMessage,
  } = await import('@/src/lib/payments/paymentReviewInvariants');
  const { hasDuplicatePendingPaymentProofUrl } = await import(
    '@/src/lib/payments/duplicatePendingPaymentProof'
  );
  const duplicatePendingScreenshot = proofUrl
    ? await hasDuplicatePendingPaymentProofUrl({
        pgId: link.pgId,
        paymentProofUrl: proofUrl,
        exclude: { kind: 'deposit_link', id: linkId },
      })
    : false;
  const [bookingRow] = link.bookingId
    ? await db
        .select({ status: bookings.status })
        .from(bookings)
        .where(eq(bookings.id, link.bookingId))
        .limit(1)
    : [null];
  const invariant = evaluatePaymentReviewInvariants({
    kind: 'deposit_link',
    invoiceId: linkId,
    customerId: link.residentId,
    bookingId: link.bookingId,
    billingMonth: null,
    expectedAmountPaise: link.amount,
    proofAmountPaise: link.amount,
    paymentProofUrl: proofUrl,
    transactionRef: rawTxn,
    status: link.status,
    bookingStatus: bookingRow?.status ?? null,
    duplicatePendingScreenshot,
  });
  if (!invariant.ok) {
    const { alertHealthBrainPaymentReviewInvariant } = await import(
      '@/src/lib/health/healthBrainIncidents'
    );
    await alertHealthBrainPaymentReviewInvariant({
      kind: 'deposit_link',
      invoiceId: linkId,
      customerId: link.residentId,
      paymentProofUrl: proofUrl,
      source: 'proof_submit',
      violations: invariant.violations,
    });
    return { ok: false, message: paymentReviewInvariantErrorMessage(invariant) };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(paymentLinks)
      .set({
        paymentProofUrl: proofUrl,
        paymentProofTransactionRef: rawTxn,
        possibleDuplicate: flags.possibleDuplicate,
        duplicateOfIds: flags.duplicateOfIds,
      })
      .where(eq(paymentLinks.id, linkId));

    const { supersedeActiveRejection } = await import('@/src/services/paymentProofRejectionService');
    await supersedeActiveRejection('payment_link', linkId, tx);
  });

  if (proofUrl) {
    const { linkResidentUpload } = await import('@/src/services/residentUploadEvents');
    await linkResidentUpload({
      storagePath: proofUrl,
      adminQueue: 'operations',
      linkedEntity: 'payment_link',
      linkedEntityId: linkId,
      bookingId: link.bookingId,
      pgId: link.pgId,
    }).catch(() => undefined);
  }

  const { scheduleAdminNotificationSync } = await import('@/src/services/adminLiveSync');
  scheduleAdminNotificationSync();

  return { ok: true };
}

export async function listPendingDepositLinkProofsForPg(pgId: string) {
  return db
    .select({
      linkId: paymentLinks.id,
      customerName: customers.fullName,
      roomNumber: paymentLinks.title,
      amountPaise: paymentLinks.amount,
      paymentProofUrl: paymentLinks.paymentProofUrl,
      paymentProofTransactionRef: paymentLinks.paymentProofTransactionRef,
      possibleDuplicate: paymentLinks.possibleDuplicate,
      duplicateOfIds: paymentLinks.duplicateOfIds,
      title: paymentLinks.title,
      bookingId: paymentLinks.bookingId,
      purpose: paymentLinks.purpose,
      invoiceId: paymentLinks.invoiceId,
    })
    .from(paymentLinks)
    .innerJoin(customers, eq(customers.id, paymentLinks.residentId))
    .where(
      and(
        eq(paymentLinks.pgId, pgId),
        eq(paymentLinks.status, 'active'),
        or(
          isNotNull(paymentLinks.paymentProofUrl),
          isNotNull(paymentLinks.paymentProofTransactionRef),
        ),
        or(
          and(eq(paymentLinks.purpose, 'deposit'), isNotNull(paymentLinks.bookingId)),
          and(eq(paymentLinks.purpose, 'combined'), isNotNull(paymentLinks.invoiceId)),
        ),
      ),
    );
}

export async function approveDepositLinkPaymentProof(
  session: AdminSession,
  linkId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.id, linkId))
    .limit(1);
  if (!link) return { ok: false, message: 'Payment link not found.' };
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, link.pgId)) {
    return { ok: false, message: 'Access denied.' };
  }
  if (link.status === 'paid') {
    return { ok: true };
  }
  {
    const { hasTxnOrScreenshotProof } = await import('@/src/services/pgTransactionRefIndex');
    if (
      !hasTxnOrScreenshotProof({
        paymentProofUrl: link.paymentProofUrl,
        transactionRef: link.paymentProofTransactionRef,
      })
    ) {
      return { ok: false, message: 'No payment proof uploaded.' };
    }
  }
  if (link.status !== 'active') {
    return { ok: false, message: 'This payment link is not awaiting approval.' };
  }

  if (link.purpose === 'combined' && link.invoiceId) {
    const {
      evaluatePaymentReviewInvariants,
      paymentReviewInvariantErrorMessage,
    } = await import('@/src/lib/payments/paymentReviewInvariants');
    const { hasDuplicatePendingPaymentProofUrl } = await import(
      '@/src/lib/payments/duplicatePendingPaymentProof'
    );
    const duplicatePendingScreenshot = link.paymentProofUrl?.trim()
      ? await hasDuplicatePendingPaymentProofUrl({
          pgId: link.pgId,
          paymentProofUrl: link.paymentProofUrl,
          exclude: { kind: 'deposit_link', id: linkId },
        })
      : false;
    const [bookingRow] = link.bookingId
      ? await db
          .select({ status: bookings.status })
          .from(bookings)
          .where(eq(bookings.id, link.bookingId))
          .limit(1)
      : [null];
    const invariant = evaluatePaymentReviewInvariants({
      kind: 'deposit_link',
      invoiceId: linkId,
      customerId: link.residentId,
      bookingId: link.bookingId,
      billingMonth: null,
      expectedAmountPaise: link.amount,
      proofAmountPaise: link.amount,
      paymentProofUrl: link.paymentProofUrl,
      transactionRef: link.paymentProofTransactionRef,
      status: link.status,
      bookingStatus: bookingRow?.status ?? null,
      duplicatePendingScreenshot,
    });
    if (!invariant.ok) {
      return { ok: false, message: paymentReviewInvariantErrorMessage(invariant) };
    }

    try {
      const { insertApprovedTransactionRefOrThrow } = await import(
        '@/src/services/pgTransactionRefIndex'
      );
      await insertApprovedTransactionRefOrThrow({
        transactionRef: link.paymentProofTransactionRef,
        sourceKind: 'payment_link',
        sourceId: link.id,
        approvedByAdminId: session.adminId,
      });
    } catch (err) {
      const { approvedTransactionRefConflictMessage } = await import(
        '@/src/lib/payments/transactionRefDuplicate'
      );
      if (err instanceof Error && err.message === approvedTransactionRefConflictMessage()) {
        return { ok: false, message: err.message };
      }
      throw err;
    }

    const { allocateInvoicePayment } = await import('@/src/services/invoicePayment');
    const paymentResult = await allocateInvoicePayment({
      invoiceId: link.invoiceId,
      amountPaise: link.amount,
      providerPaymentId: `invoice-link-proof-${linkId}`,
      offlineProvider: 'upi_manual',
    });
    if (!paymentResult.ok) {
      return { ok: false, message: paymentResult.error };
    }

    await db.update(paymentLinks).set({ status: 'paid' }).where(eq(paymentLinks.id, linkId));
    revalidateFinancialViews();
    return { ok: true };
  }

  if (link.purpose !== 'deposit' || !link.bookingId) {
    return { ok: false, message: 'This deposit link is not awaiting approval.' };
  }

  const {
    evaluatePaymentReviewInvariants,
    paymentReviewInvariantErrorMessage,
  } = await import('@/src/lib/payments/paymentReviewInvariants');
  const { hasDuplicatePendingPaymentProofUrl } = await import(
    '@/src/lib/payments/duplicatePendingPaymentProof'
  );
  const duplicatePendingScreenshot = link.paymentProofUrl?.trim()
    ? await hasDuplicatePendingPaymentProofUrl({
        pgId: link.pgId,
        paymentProofUrl: link.paymentProofUrl,
        exclude: { kind: 'deposit_link', id: linkId },
      })
    : false;
  const [bookingRow] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, link.bookingId))
    .limit(1);
  const invariant = evaluatePaymentReviewInvariants({
    kind: 'deposit_link',
    invoiceId: linkId,
    customerId: link.residentId,
    bookingId: link.bookingId,
    billingMonth: null,
    expectedAmountPaise: link.amount,
    proofAmountPaise: link.amount,
    paymentProofUrl: link.paymentProofUrl,
    transactionRef: link.paymentProofTransactionRef,
    status: link.status,
    bookingStatus: bookingRow?.status ?? null,
    duplicatePendingScreenshot,
  });
  if (!invariant.ok) {
    const { alertHealthBrainPaymentReviewInvariant } = await import(
      '@/src/lib/health/healthBrainIncidents'
    );
    await alertHealthBrainPaymentReviewInvariant({
      kind: 'deposit_link',
      invoiceId: linkId,
      customerId: link.residentId,
      paymentProofUrl: link.paymentProofUrl,
      source: 'approve',
      violations: invariant.violations,
    });
    return { ok: false, message: paymentReviewInvariantErrorMessage(invariant) };
  }


  try {
    const { insertApprovedTransactionRefOrThrow } = await import(
      '@/src/services/pgTransactionRefIndex'
    );
    const { approvedTransactionRefConflictMessage } = await import(
      '@/src/lib/payments/transactionRefDuplicate'
    );
    await insertApprovedTransactionRefOrThrow({
      transactionRef: link.paymentProofTransactionRef,
      sourceKind: 'payment_link',
      sourceId: link.id,
      approvedByAdminId: session.adminId,
    });
  } catch (err) {
    const { approvedTransactionRefConflictMessage } = await import(
      '@/src/lib/payments/transactionRefDuplicate'
    );
    if (err instanceof Error && err.message === approvedTransactionRefConflictMessage()) {
      return { ok: false, message: err.message };
    }
    throw err;
  }

  const providerPaymentId = `deposit-link-proof-${linkId}`;

  try {
    if (link.invoiceId) {
      const { allocateInvoicePayment } = await import('@/src/services/invoicePayment');
      const paymentResult = await allocateInvoicePayment({
        invoiceId: link.invoiceId,
        amountPaise: link.amount,
        providerPaymentId,
        offlineProvider: 'upi_manual',
      });
      if (
        !paymentResult.ok &&
        paymentResult.error !== 'Invoice is already paid.' &&
        paymentResult.error !== 'Nothing due on this invoice.'
      ) {
        return { ok: false, message: paymentResult.error };
      }
    } else {
      const depositResult = await recordDepositPaymentFromLink({
        linkId,
        bookingId: link.bookingId,
        customerId: link.residentId,
        amountPaise: link.amount,
        providerPaymentId,
      });
      if (!depositResult.ok) {
        return { ok: false, message: depositResult.error };
      }
    }

    const { syncDepositCollectionFromLedger } = await import('./depositCollection');
    await syncDepositCollectionFromLedger(link.bookingId);

    const [freshLink] = await db
      .select({ status: paymentLinks.status })
      .from(paymentLinks)
      .where(eq(paymentLinks.id, linkId))
      .limit(1);
    if (freshLink?.status !== 'paid') {
      await db
        .update(paymentLinks)
        .set({ status: 'paid' })
        .where(eq(paymentLinks.id, linkId));
    }
  } catch (err) {
    const { approvedTransactionRefConflictMessage } = await import(
      '@/src/lib/payments/transactionRefDuplicate'
    );
    if (err instanceof Error && err.message === approvedTransactionRefConflictMessage()) {
      return { ok: false, message: err.message };
    }
    throw err;
  }

  revalidateFinancialViews();
  return { ok: true };
}

export async function rejectDepositLinkPaymentProof(
  session: AdminSession,
  linkId: string,
  rejection: {
    reviewKey: string;
    reasonCode: import('@/src/lib/approvals/paymentProofRejectionReasons').PaymentProofRejectionReasonCode;
    reasonDetail?: string;
    adminNote?: string;
    residentMessage: string;
    sendWhatsApp: boolean;
  },
): Promise<{ ok: true; whatsappUrl?: string } | { ok: false; message: string }> {
  const { rejectPaymentProof } = await import('@/src/services/paymentProofRejectionService');
  return rejectPaymentProof(session, {
    reviewKey: rejection.reviewKey,
    entityType: 'payment_link',
    entityId: linkId,
    reasonCode: rejection.reasonCode,
    reasonDetail: rejection.reasonDetail,
    adminNote: rejection.adminNote,
    residentMessage: rejection.residentMessage,
    sendWhatsApp: rejection.sendWhatsApp,
  });
}

export function chargePaymentLinkPublicUrl(linkId: string): string {
  return paymentLinkPublicUrl(linkId);
}
