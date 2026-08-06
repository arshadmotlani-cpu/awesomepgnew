/**
 * Customer resident portal — tab-scoped data loaders.
 * Uses preloaded ResidentAccountContext to avoid duplicate SSOT fetches.
 */
import {
  getVacatingForBooking,
  listElectricityInvoicesForBooking,
  listPaymentsForBooking,
  listRentInvoicesForBooking,
  listResidentBookingsForCustomer,
  type ResidentBookingRow,
} from '@/src/db/queries/customer';
import type { CustomerSession } from '@/src/lib/auth/session';
import {
  mapDevDurationToBookingMode,
  type DevResidentDurationMode,
} from '@/src/lib/auth/developerTestResident.server';
import { titleCase } from '@/src/lib/format';
import { buildFallbackPgLetterhead } from '@/src/lib/billing/pgLetterheadFallback';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import { getDepositRefundSettlementPreview } from '@/src/lib/deposits/depositRefundSettlementPreview';
import type { ConciergeContext } from '@/src/lib/concierge/answers';
import { loadResidentBrainSnapshot } from '@/src/lib/residents/loadResidentBrainSnapshot';
import { buildResidentBillRowsFromDetail } from '@/src/lib/residents/residentPortalBillRows';
import { buildResidentElectricityHistoryItems } from '@/src/lib/residents/residentElectricityHistoryPresentation';
import { loadResidentElectricityBillExplanations } from '@/src/lib/residents/residentElectricityBillExplanation';
import { billingCycleLabel, enrichBillDueRow, moveOutStatusLabel } from '@/src/lib/residents/residentPortalPresentation';
import {
  loadPendingRentGenerationNotice,
  loadResidentMonthlyRentDisplay,
  resolveResidentMonthlyRentPaise,
} from '@/src/lib/residents/residentPortalFinancials';
import { loadResidentElectricityBillingState } from '@/src/lib/residents/residentElectricityBillingState';
import { requestTypeLabel, type ActiveRequestItem } from '@/src/lib/residents/requestCenter';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import { getDepositRefundEligibility } from '@/src/lib/vacating/depositRefundEligibility';
import {
  buildSettlementStatementModel,
  type SettlementStatementDocumentModel,
} from '@/src/lib/vacating/settlementStatementModel';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import type { ResidentSettlementStatementContext } from '@/src/components/customer/account/resident/vacating/ResidentEstimatedSettlementBreakdown';
import type { PaidHistoryRow } from '@/src/components/customer/account/resident/ResidentPaymentsV2Hub';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';
import type { ResidentElectricityHistoryItem } from '@/src/components/customer/account/resident/ResidentElectricityHistory';
import { getCustomerDepositCredit } from '@/src/services/depositCredit';
import { ensureDepositDuePaymentLink } from '@/src/services/depositCollection';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import {
  getCheckoutSettlementForCustomer,
  getLatestCheckoutSettlementStatusForCustomer,
  getRefundEligibilitySettlementForCustomer,
  getResidentMoveOutSettlementContext,
} from '@/src/services/checkoutSettlement';
import { getBookingFinancialAccount } from '@/src/services/residentFinancialEngine';
import { getRoomElectricityForCustomer } from '@/src/services/meterElectricity';
import { listActiveRejectionsForCustomer } from '@/src/services/paymentProofRejectionService';
import { getLatestPaymentLinkForResident } from '@/src/services/paymentLinks';
import { listResidentDocumentInvoicesForCustomer } from '@/src/services/residentDocumentInvoices';
import { listOpenRequestsForCustomer } from '@/src/services/residentRequests';
import { getMembershipForDashboard, isActiveTenant } from '@/src/services/playstationMembership';
import { getReferralSummaryForCustomer } from '@/src/services/referrals';
import type { ResidentAccountContext } from '@/src/services/residentAccountContext';
import { getPendingVacatingDateChangeForBooking } from '@/src/services/vacatingDateChange';

export type ResidentPortalBookingDetail = {
  booking: ResidentBookingRow;
  bookingId: string;
  bookingCode: string;
  rent: Awaited<ReturnType<typeof listRentInvoicesForBooking>>;
  electricity: Awaited<ReturnType<typeof listElectricityInvoicesForBooking>>;
  deposit: Awaited<ReturnType<typeof getDepositSummaryForBooking>>;
  vacating: Awaited<ReturnType<typeof getVacatingForBooking>>;
  roomElectricity: Awaited<ReturnType<typeof getRoomElectricityForCustomer>>;
};

export type CheckoutSettlementMapValue = {
  status: string;
  rejectionReason?: string | null;
  checkoutSource?: string | null;
  waterfall?: import('@/src/lib/checkout/checkoutSettlementEngineV2').CheckoutSettlementWaterfall | null;
  totalRefundPaise?: number | null;
  payoutUpiId?: string | null;
  refundPaidAt?: Date | null;
};

function labelResidentStatus(value: string | null | undefined): string {
  return titleCase((value ?? 'pending').replace(/_/g, ' '));
}

export async function loadResidentPortalBookingDetail(
  customerId: string,
): Promise<ResidentPortalBookingDetail[]> {
  const bookings = await listResidentBookingsForCustomer(customerId);
  const uniqueBookings: ResidentBookingRow[] =
    bookings.ok && bookings.data.length > 0
      ? Array.from(new Map(bookings.data.map((item) => [item.bookingId, item])).values())
      : [];

  const detail: ResidentPortalBookingDetail[] = [];
  for (const b of uniqueBookings) {
    const [rent, electricity, deposit, vacating, roomElectricity] = await Promise.all([
      listRentInvoicesForBooking(b.bookingId),
      listElectricityInvoicesForBooking(b.bookingId),
      getDepositSummaryForBooking(b.bookingId),
      getVacatingForBooking(b.bookingId),
      getRoomElectricityForCustomer(customerId, b.roomId),
    ]);
    detail.push({
      booking: b,
      bookingId: b.bookingId,
      bookingCode: b.bookingCode,
      rent,
      electricity,
      deposit,
      vacating,
      roomElectricity,
    });
  }
  return detail;
}

export async function loadCheckoutSettlementMaps(
  customerId: string,
  detail: ResidentPortalBookingDetail[],
): Promise<{
  checkoutByBooking: Map<string, string>;
  checkoutSettlementByBooking: Map<string, CheckoutSettlementMapValue>;
}> {
  const checkoutByBooking = new Map<string, string>();
  const checkoutSettlementByBooking = new Map<string, CheckoutSettlementMapValue>();

  for (const d of detail) {
    const moveOutCtx = await getResidentMoveOutSettlementContext(customerId, d.bookingId);
    if (moveOutCtx) {
      checkoutByBooking.set(d.bookingId, moveOutCtx.status);
      checkoutSettlementByBooking.set(d.bookingId, moveOutCtx);
      continue;
    }
    const eligibilitySettlement = await getRefundEligibilitySettlementForCustomer(
      customerId,
      d.bookingId,
    );
    if (eligibilitySettlement) {
      checkoutSettlementByBooking.set(d.bookingId, eligibilitySettlement);
      checkoutByBooking.set(d.bookingId, eligibilitySettlement.status);
      continue;
    }
    const openSettlement = await getCheckoutSettlementForCustomer(customerId, d.bookingId);
    if (openSettlement) {
      checkoutByBooking.set(d.bookingId, openSettlement.status);
      checkoutSettlementByBooking.set(d.bookingId, {
        status: openSettlement.status,
        rejectionReason: openSettlement.refundNotes,
        checkoutSource: openSettlement.checkoutSource,
      });
      continue;
    }
    const status = await getLatestCheckoutSettlementStatusForCustomer(customerId, d.bookingId);
    if (status) checkoutByBooking.set(d.bookingId, status);
  }

  return { checkoutByBooking, checkoutSettlementByBooking };
}

async function resolvePrimaryBooking(
  customerId: string,
  detail: ResidentPortalBookingDetail[],
): Promise<ResidentPortalBookingDetail | undefined> {
  const activeTenancy = await getActiveTenancyForCustomer(customerId);
  return (
    (activeTenancy ? detail.find((d) => d.bookingId === activeTenancy.bookingId) : null) ??
    detail[0] ??
    undefined
  );
}

export async function loadResidentConciergeTabData(input: {
  preloaded: ResidentAccountContext;
  session: CustomerSession;
}): Promise<ConciergeContext | null> {
  const primaryBooking = input.preloaded.primaryBooking;
  const financialAccount = input.preloaded.financialSummary;
  if (!primaryBooking || !financialAccount) return null;

  const vacating = await getVacatingForBooking(primaryBooking.bookingId);
  return {
    residentName: input.session.fullName || input.preloaded.customer.fullName || 'Resident',
    pgName: primaryBooking.pgName,
    roomNumber: primaryBooking.roomNumber,
    bedCode: primaryBooking.bedCode,
    rentDuePaise: financialAccount.rentOutstandingPaise,
    electricityDuePaise: financialAccount.electricityOutstandingPaise,
    depositBalancePaise: financialAccount.depositHeldPaise,
    depositDuePaise: financialAccount.deposit.outstandingPaise,
    vacatingStatus: vacating.ok && vacating.data ? vacating.data.status : null,
  };
}

export async function loadResidentReferralsTabData(customerId: string) {
  return getReferralSummaryForCustomer(customerId);
}

export async function loadResidentProfileTabData(input: {
  preloaded: ResidentAccountContext;
  session: CustomerSession;
  simulatedDurationMode: DevResidentDurationMode | null;
  developerTestMode: boolean;
}) {
  const { preloaded, session } = input;
  const customer = preloaded.customer;
  const detail = await loadResidentPortalBookingDetail(session.customerId);
  const primaryBooking = await resolvePrimaryBooking(session.customerId, detail);
  const effectiveDurationMode =
    primaryBooking && input.developerTestMode && input.simulatedDurationMode
      ? mapDevDurationToBookingMode(input.simulatedDurationMode)
      : primaryBooking?.booking.durationMode;

  const [depositWallet, tenantActive, checkoutMaps] = await Promise.all([
    getCustomerDepositCredit(session.customerId),
    isActiveTenant(session.customerId),
    loadCheckoutSettlementMaps(session.customerId, detail),
  ]);
  const ps4Membership = tenantActive ? await getMembershipForDashboard(session.customerId) : null;

  const depositDueCards = await Promise.all(
    detail.map(async (d) => {
      const account = await getBookingFinancialAccount({
        bookingId: d.bookingId,
        customerId: session.customerId,
        customerName: session.fullName || customer.fullName || 'Resident',
        customerPhone: customer.phone ?? '',
        bookingCode: d.bookingCode,
        pgId: d.booking.pgId,
        pgName: d.booking.pgName,
        roomNumber: d.booking.roomNumber,
        depositPaise: d.booking.depositPaise,
        depositDuePaise: d.booking.depositDuePaise,
      });
      const depositDuePaise = account.deposit.outstandingPaise;
      const collected = account.deposit.paidPaise;
      let paymentLinkUrl: string | null = null;
      const existing = await getLatestPaymentLinkForResident(session.customerId, 'deposit');
      if (depositDuePaise > 0) {
        paymentLinkUrl =
          existing?.status === 'active' && existing.bookingId === d.bookingId
            ? paymentLinkPublicUrl(existing.id)
            : await ensureDepositDuePaymentLink(d.bookingId);
      }
      return {
        bookingId: d.bookingId,
        depositPaise: account.deposit.requiredPaise,
        collectedPaise: collected,
        depositDuePaise,
      };
    }),
  );

  const primaryDepositCard = depositDueCards[0];
  const primaryVacating = primaryBooking?.vacating.ok ? primaryBooking.vacating.data : null;
  const hasOpenVacating = Boolean(
    primaryVacating && ['pending', 'approved'].includes(primaryVacating.status),
  );

  const walletBooking =
    detail.reduce(
      (best, d) => {
        const bal = d.deposit?.refundableBalancePaise ?? 0;
        const bestBal = best?.deposit?.refundableBalancePaise ?? 0;
        return bal >= bestBal ? d : best;
      },
      detail[0] ?? null,
    ) ?? primaryBooking;

  const activeTenancy = await getActiveTenancyForCustomer(session.customerId);
  const refundSettlementPreview = walletBooking
    ? await getDepositRefundSettlementPreview(walletBooking.bookingId)
    : null;

  const refundEligibility = walletBooking
    ? getDepositRefundEligibility({
        vacating: walletBooking.vacating.ok ? walletBooking.vacating.data : null,
        booking: {
          status: walletBooking.booking.status,
          durationMode: walletBooking.booking.durationMode,
          expectedCheckoutDate: walletBooking.booking.expectedCheckoutDate,
          createdAt: walletBooking.booking.createdAt,
        },
        settlement: checkoutMaps.checkoutSettlementByBooking.get(walletBooking.bookingId) ?? null,
        monthlyRentPaise: walletBooking.booking.monthlyRentPaise,
        hasActiveBedToday: Boolean(activeTenancy?.bookingId === walletBooking.bookingId),
      })
    : { canRequestRefund: false, lockReason: 'No active booking found.' };

  const walletDepositHeldPaise =
    depositWallet.totalHeldPaise > 0
      ? depositWallet.totalHeldPaise
      : (walletBooking?.deposit?.refundableBalancePaise ??
        primaryBooking?.deposit?.refundableBalancePaise ??
        0);
  const walletAvailableRefundPaise =
    walletBooking?.deposit?.refundableBalancePaise ??
    primaryBooking?.deposit?.refundableBalancePaise ??
    depositWallet.availableCreditPaise;

  const referralSummary = await getReferralSummaryForCustomer(session.customerId);
  const monthlyRentDisplay =
    primaryBooking != null
      ? await loadResidentMonthlyRentDisplay({
          bookingId: primaryBooking.bookingId,
          customerId: session.customerId,
        })
      : null;
  const monthlyRentPaise =
    monthlyRentDisplay?.monthlyRentPaise ??
    (primaryBooking != null
      ? await resolveResidentMonthlyRentPaise(primaryBooking.bookingId)
      : 0);

  const moveOutStatus = moveOutStatusLabel({
    vacatingStatus: primaryVacating?.status ?? null,
    checkoutStatus: checkoutMaps.checkoutByBooking.get(primaryBooking?.bookingId ?? '') ?? null,
  });

  const primaryCheckoutSettlement = primaryBooking
    ? checkoutMaps.checkoutSettlementByBooking.get(primaryBooking.bookingId) ?? null
    : null;

  const depositEntries =
    walletBooking?.deposit?.entries ?? primaryBooking?.deposit?.entries ?? [];

  return {
    primaryBooking,
    customer,
    primaryDepositCard,
    primaryVacating,
    hasOpenVacating,
    monthlyRentDisplay,
    monthlyRentPaise,
    moveOutStatus,
    walletDepositHeldPaise,
    walletAvailableRefundPaise,
    depositEntries,
    refundEligibility,
    refundSettlementPreview,
    referralSummary,
    ps4Membership,
    primaryCheckoutSettlement,
    checkoutByBooking: checkoutMaps.checkoutByBooking,
    effectiveDurationMode,
  };
}

export async function loadResidentPaymentsTabData(input: {
  preloaded: ResidentAccountContext;
  session: CustomerSession;
}) {
  const { preloaded, session } = input;
  const detail = await loadResidentPortalBookingDetail(session.customerId);
  const primaryBooking = await resolvePrimaryBooking(session.customerId, detail);

  const brain = await loadResidentBrainSnapshot({
    customerId: session.customerId,
    bookingIds: detail.map((d) => d.bookingId),
    financialAccount: preloaded.financialSummary,
  });

  const [activeRejectionsRaw, documentInvoices] = await Promise.all([
    listActiveRejectionsForCustomer(session.customerId),
    listResidentDocumentInvoicesForCustomer(session.customerId),
  ]);
  const activeRejections = new Map(
    activeRejectionsRaw.map((r) => [`${r.entityType}:${r.entityId}`, r] as const),
  );

  const dueBillRows: PaymentDueRow[] = [];
  const pendingApprovalRows: PaymentDueRow[] = [];
  const rejectedBillRows: PaymentDueRow[] = [];
  const paidBillRows: PaidHistoryRow[] = [];
  const cancelledBillRows: PaidHistoryRow[] = [];

  if (detail.length > 0) {
    const paymentProviders = new Map<string, string | null>();
    for (const d of detail) {
      const payments = await listPaymentsForBooking(d.bookingId);
      if (payments.ok) {
        for (const p of payments.data) {
          paymentProviders.set(p.id, p.provider);
        }
      }
    }

    const rejectionOpts = { activeRejections, paymentProviders };
    const allBills = buildResidentBillRowsFromDetail(detail, rejectionOpts);
    dueBillRows.push(...allBills.dueBillRows);
    pendingApprovalRows.push(...allBills.pendingApprovalRows);
    rejectedBillRows.push(...allBills.rejectedBillRows);
    paidBillRows.push(...allBills.paidBillRows);
    cancelledBillRows.push(...allBills.cancelledBillRows);

    const primaryDepositCard = detail[0]
      ? await getBookingFinancialAccount({
          bookingId: detail[0].bookingId,
          customerId: session.customerId,
          customerName: session.fullName || preloaded.customer.fullName || 'Resident',
          customerPhone: preloaded.customer.phone ?? '',
          bookingCode: detail[0].bookingCode,
          pgId: detail[0].booking.pgId,
          pgName: detail[0].booking.pgName,
          roomNumber: detail[0].booking.roomNumber,
          depositPaise: detail[0].booking.depositPaise,
          depositDuePaise: detail[0].booking.depositDuePaise,
        }).then((account) => ({
          depositDuePaise: account.deposit.outstandingPaise,
          bookingCode: detail[0]!.bookingCode,
          depositDueDate: detail[0]!.booking.depositDueDate,
          depositCollectionStatus: detail[0]!.booking.depositCollectionStatus,
        }))
      : null;

    if (primaryDepositCard && primaryDepositCard.depositDuePaise > 0) {
      const existing = await getLatestPaymentLinkForResident(session.customerId, 'deposit');
      const paymentLinkUrl =
        existing?.status === 'active' && existing.bookingId === detail[0]!.bookingId
          ? paymentLinkPublicUrl(existing.id)
          : null;
      const depositHref = paymentLinkUrl != null ? `/pay/${paymentLinkUrl.split('/').pop()}` : null;
      const paymentProofPending = Boolean(
        existing?.status === 'active' &&
          existing.bookingId === detail[0]!.bookingId &&
          existing.paymentProofUrl,
      );
      const depositRow: PaymentDueRow = {
        key: 'deposit-due',
        label: 'Security deposit',
        amountPaise: primaryDepositCard.depositDuePaise,
        dueDate: primaryDepositCard.depositDueDate,
        href: depositHref,
        status: paymentProofPending
          ? 'Waiting for admin approval'
          : labelResidentStatus(primaryDepositCard.depositCollectionStatus),
        invoiceNumber: `DEP-${primaryDepositCard.bookingCode}`,
      };
      if (paymentProofPending) {
        pendingApprovalRows.push(depositRow);
      } else {
        dueBillRows.push(depositRow);
      }
    }
  }

  for (const inv of documentInvoices) {
    paidBillRows.push({
      id: inv.id,
      label: inv.label,
      amountPaise: inv.amountPaise,
      paidAt: inv.issuedAt,
      status: inv.status,
      invoiceNumber: inv.invoiceNumber,
      detailHref: inv.detailHref,
      subtitle: inv.stayLabel ? `Stay ${inv.stayLabel}` : null,
    });
  }

  const walletBooking =
    detail.reduce(
      (best, d) => {
        const bal = d.deposit?.refundableBalancePaise ?? 0;
        const bestBal = best?.deposit?.refundableBalancePaise ?? 0;
        return bal >= bestBal ? d : best;
      },
      detail[0] ?? null,
    ) ?? primaryBooking;

  const electricityHistory: ResidentElectricityHistoryItem[] = detail.flatMap((d) => {
    const rows = d.electricity.ok ? d.electricity.data : [];
    return buildResidentElectricityHistoryItems(rows);
  });

  const electricityInvoiceIds = [
    ...dueBillRows,
    ...pendingApprovalRows,
    ...rejectedBillRows,
  ]
    .map((row) => row.electricityInvoiceId)
    .filter((id): id is string => Boolean(id))
    .concat(electricityHistory.map((item) => item.id));
  const electricityExplanations = await loadResidentElectricityBillExplanations(
    electricityInvoiceIds,
    session.customerId,
  );

  const enrichedDueRows = dueBillRows.map((row) => {
    const enriched = enrichBillDueRow(row);
    if (row.electricityInvoiceId) {
      return {
        ...enriched,
        electricityExplanation: electricityExplanations.get(row.electricityInvoiceId) ?? null,
        calc: undefined,
      };
    }
    return enriched;
  });

  const electricityHistoryWithExplanations = electricityHistory.map((item) => ({
    ...item,
    explanation: electricityExplanations.get(item.id) ?? null,
  }));

  const electricityBillingPending =
    primaryBooking != null
      ? await loadResidentElectricityBillingState({
          roomId: primaryBooking.booking.roomId,
          bookingId: primaryBooking.bookingId,
        })
      : null;

  const pendingRentNotice =
    primaryBooking != null
      ? await loadPendingRentGenerationNotice({
          bookingId: primaryBooking.bookingId,
          customerId: session.customerId,
        })
      : null;

  const financialAccount = brain?.financialAccount ?? preloaded.financialSummary;
  const lifetimeTotals = {
    rentPaidPaise: financialAccount?.rent.paidPaise ?? 0,
    depositPaidPaise: financialAccount?.deposit.paidPaise ?? 0,
    electricityPaidPaise: financialAccount?.electricity.paidPaise ?? 0,
    otherPaidPaise: financialAccount?.other.paidPaise ?? 0,
  };

  return {
    primaryBooking,
    enrichedDueRows,
    pendingApprovalRows,
    rejectedBillRows,
    paidHistory: paidBillRows.sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? '')),
    cancelledBillRows,
    pendingRentNotice,
    electricityBillingPending,
    electricityHistory: electricityHistoryWithExplanations,
    historyHref: walletBooking ? `/account/resident/history/${walletBooking.bookingId}` : null,
    lifetimeTotals,
  };
}

export async function loadResidentRequestsTabData(input: {
  preloaded: ResidentAccountContext;
  session: CustomerSession;
  simulatedDurationMode: DevResidentDurationMode | null;
  developerTestMode: boolean;
}) {
  const { preloaded, session } = input;
  const detail = await loadResidentPortalBookingDetail(session.customerId);
  const primaryBooking = await resolvePrimaryBooking(session.customerId, detail);
  if (!primaryBooking) return null;

  const effectiveDurationMode =
    input.developerTestMode && input.simulatedDurationMode
      ? mapDevDurationToBookingMode(input.simulatedDurationMode)
      : primaryBooking.booking.durationMode;

  const [openRequests, checkoutMaps, activeTenancy, depositWallet] = await Promise.all([
    listOpenRequestsForCustomer(session.customerId),
    loadCheckoutSettlementMaps(session.customerId, detail),
    getActiveTenancyForCustomer(session.customerId),
    getCustomerDepositCredit(session.customerId),
  ]);

  const primaryVacating = primaryBooking.vacating.ok ? primaryBooking.vacating.data : null;

  const depositDueCards = await Promise.all(
    detail.map(async (d) => {
      const account = await getBookingFinancialAccount({
        bookingId: d.bookingId,
        customerId: session.customerId,
        customerName: session.fullName || preloaded.customer.fullName || 'Resident',
        customerPhone: preloaded.customer.phone ?? '',
        bookingCode: d.bookingCode,
        pgId: d.booking.pgId,
        pgName: d.booking.pgName,
        roomNumber: d.booking.roomNumber,
        depositPaise: d.booking.depositPaise,
        depositDuePaise: d.booking.depositDuePaise,
      });
      return { depositDuePaise: account.deposit.outstandingPaise };
    }),
  );
  const hasDepositDueFlag = depositDueCards.some((c) => c.depositDuePaise > 0);

  const walletBooking =
    detail.reduce(
      (best, d) => {
        const bal = d.deposit?.refundableBalancePaise ?? 0;
        const bestBal = best?.deposit?.refundableBalancePaise ?? 0;
        return bal >= bestBal ? d : best;
      },
      detail[0] ?? null,
    ) ?? primaryBooking;

  const walletAvailableRefundPaise =
    walletBooking?.deposit?.refundableBalancePaise ?? depositWallet.availableCreditPaise;
  const walletDepositHeldPaise =
    depositWallet.totalHeldPaise > 0
      ? depositWallet.totalHeldPaise
      : (walletBooking?.deposit?.refundableBalancePaise ?? 0);

  const monthlyRentDisplay = await loadResidentMonthlyRentDisplay({
    bookingId: primaryBooking.bookingId,
    customerId: session.customerId,
  });
  const monthlyRentPaise =
    monthlyRentDisplay?.monthlyRentPaise ??
    (await resolveResidentMonthlyRentPaise(primaryBooking.bookingId));

  let primaryEstimatedSettlement: EstimatedSettlementPreview | null = null;
  let primaryNoticeDisplay: import('@/src/lib/vacating/noticeDeductionPresentation').NoticeSettlementDisplay | null =
    null;
  let primaryPendingDateChangeRequestId: string | null = null;
  let primarySettlementContext: ResidentSettlementStatementContext | null = null;
  let primarySettlementDocument: SettlementStatementDocumentModel | null = null;
  let primaryExitBrainSnapshot: import('@/src/lib/exit/exitBrainTypes').ResidentExitBrainSnapshot | null =
    null;

  if (primaryVacating) {
    const { loadResidentExitBrainSnapshot } = await import(
      '@/src/lib/exit/loadResidentExitBrainSnapshot'
    );
    primaryExitBrainSnapshot = await loadResidentExitBrainSnapshot(primaryBooking.bookingId);
  }

  if (primaryVacating && ['pending', 'approved'].includes(primaryVacating.status)) {
    const { loadVacatingBillingPresentationBundle } = await import(
      '@/src/lib/vacating/loadVacatingBillingPresentation'
    );
    const [bundle, pendingDateChange] = await Promise.all([
      loadVacatingBillingPresentationBundle({
        bookingId: primaryBooking.bookingId,
        noticeGivenDate: primaryVacating.noticeGivenDate,
        vacatingDate: primaryVacating.vacatingDate,
        monthlyRentPaiseSnapshot: primaryVacating.monthlyRentPaiseSnapshot,
        durationMode: effectiveDurationMode ?? primaryBooking.booking.durationMode,
        mode: 'estimate',
        treatAsApprovedForTail: true,
        explanationMeta: {
          bookingCode: primaryBooking.bookingCode,
          residentName: session.fullName || preloaded.customer.fullName || 'Resident',
          vacatingRequestId: primaryVacating.id,
        },
      }),
      getPendingVacatingDateChangeForBooking(primaryBooking.bookingId),
    ]);
    primaryEstimatedSettlement = bundle?.estimatedSettlement ?? null;
    primaryNoticeDisplay = bundle?.noticeDisplay ?? null;
    primaryPendingDateChangeRequestId = pendingDateChange?.id ?? null;
    primarySettlementContext = {
      vacatingRequestId: primaryVacating.id,
      bookingId: primaryBooking.bookingId,
      customerName: session.fullName || preloaded.customer.fullName || 'Resident',
      customerPhone: preloaded.customer.phone ?? undefined,
      bookingCode: primaryBooking.bookingCode,
      pgName: primaryBooking.booking.pgName,
      roomNumber: primaryBooking.booking.roomNumber,
      bedCode: primaryBooking.booking.bedCode,
      noticeGivenDate: String(primaryVacating.noticeGivenDate),
      vacatingDate: String(primaryVacating.vacatingDate),
    };
    if (primaryEstimatedSettlement && primarySettlementContext) {
      primarySettlementDocument = buildSettlementStatementModel({
        preview: primaryEstimatedSettlement,
        explanations: bundle?.settlementExplanations ?? null,
        vacatingRequestId: primaryVacating.id,
        bookingId: primaryBooking.bookingId,
        customerName: primarySettlementContext.customerName,
        customerPhone: primarySettlementContext.customerPhone ?? '—',
        bookingCode: primarySettlementContext.bookingCode,
        pgName: primarySettlementContext.pgName,
        roomNumber: primarySettlementContext.roomNumber,
        bedCode: primarySettlementContext.bedCode,
        noticeGivenDate: primarySettlementContext.noticeGivenDate,
        vacatingDate: primarySettlementContext.vacatingDate,
        letterhead: buildFallbackPgLetterhead(primarySettlementContext.pgName),
      });
    }
  }

  const activeRequests: ActiveRequestItem[] = [];
  for (const r of openRequests) {
    activeRequests.push({
      id: r.id,
      type: r.type,
      typeLabel: requestTypeLabel(r.type),
      status: r.status,
      createdAt: r.createdAt,
      adminNotes: r.adminNotes,
    });
  }
  if (primaryVacating && ['pending', 'approved'].includes(primaryVacating.status)) {
    activeRequests.unshift({
      id: `vacating-${primaryVacating.id}`,
      type: 'vacating',
      typeLabel: requestTypeLabel('vacating'),
      status: primaryVacating.status,
      createdAt: primaryVacating.createdAt,
      isVacating: true,
    });
  }

  return {
    primaryBooking,
    primaryVacating,
    fromBedId: activeTenancy?.bedId ?? '',
    roomLabel: `${primaryBooking.booking.pgName} · R${primaryBooking.booking.roomNumber}`,
    walletAvailableRefundPaise,
    walletDepositHeldPaise,
    hasDepositDue: hasDepositDueFlag,
    activeRequests,
    monthlyRentPaise,
    effectiveDurationMode,
    checkoutByBooking: checkoutMaps.checkoutByBooking,
    checkoutSettlementByBooking: checkoutMaps.checkoutSettlementByBooking,
    primaryEstimatedSettlement,
    primaryPendingDateChangeRequestId,
    primarySettlementContext,
    primarySettlementDocument,
    primaryNoticeDisplay,
    primaryExitBrainSnapshot,
  };
}
