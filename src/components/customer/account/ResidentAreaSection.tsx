import {
  getVacatingForBooking,
  listElectricityInvoicesForBooking,
  listPaymentsForBooking,
  listRentInvoicesForBooking,
  listResidentBookingsForCustomer,
  type ResidentBookingRow,
} from '@/src/db/queries/customer';
import { customerHasResidentPortalAccess } from '@/src/lib/residents/residentPortalAccess';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import {
  getBookingFinancialAccount,
  getResidentFinancialAccount,
} from '@/src/services/residentFinancialEngine';
import { isWithinLastDays } from '@/src/services/billingRevenueMetrics';
import { getCustomerSession } from '@/src/lib/auth/session';
import {
  DEV_RESIDENT_DURATION_COOKIE,
  isDeveloperTestResidentEmail,
  mapDevDurationToBookingMode,
  parseDevResidentDurationMode,
} from '@/src/lib/auth/developerTestResident.server';
import { logger } from '@/src/lib/logger';
import { cookies } from 'next/headers';
import { getCustomerById } from '@/src/services/profile';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { getRoomElectricityForCustomer } from '@/src/services/meterElectricity';
import {
  getMembershipForDashboard,
  isActiveTenant,
} from '@/src/services/playstationMembership';
import { buildBriefingInputForBooking } from '@/src/lib/cockroach/briefingFromBooking';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { getCustomerDepositCredit } from '@/src/services/depositCredit';
import { isElectricityAwaitingAdminApproval } from '@/src/lib/billing/electricityCollectibility';
import type { PaymentProofRejection } from '@/src/db/schema/paymentProofRejections';
import { ensureDepositDuePaymentLink } from '@/src/services/depositCollection';
import { listActiveRejectionsForCustomer } from '@/src/services/paymentProofRejectionService';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import { getLatestPaymentLinkForResident } from '@/src/services/paymentLinks';
import { listOpenRequestsForCustomer } from '@/src/services/residentRequests';
import { ReferralsPanel } from '@/src/components/customer/account/ReferralsPanel';
import { ResidentSectionErrorBoundary } from '@/src/components/customer/account/resident/ResidentSectionErrorBoundary';
import { RequestsHome } from '@/src/components/customer/account/resident/requests/RequestsHome';
import { requestTypeLabel, type ActiveRequestItem } from '@/src/lib/residents/requestCenter';
import { ResidentConciergeChat } from '@/src/components/customer/account/ResidentConciergeChat';
import { ResidentHubShell } from '@/src/components/customer/account/ResidentHubShell';
import type { ConciergeContext } from '@/src/lib/concierge/answers';
import type { ResidentTab, ResidentProfileSub, ResidentPaymentsSub } from '@/src/lib/accountNavigation';
import { getCheckoutSettlementForCustomer, getLatestCheckoutSettlementStatusForCustomer, getRefundEligibilitySettlementForCustomer, getResidentMoveOutSettlementContext } from '@/src/services/checkoutSettlement';
import type { ResidentSettlementStatementContext } from '@/src/components/customer/account/resident/vacating/ResidentEstimatedSettlementBreakdown';
import {
  loadEstimatedSettlementForVacating,
  type EstimatedSettlementPreview,
} from '@/src/lib/vacating/estimatedSettlementPreview';
import { getPendingVacatingDateChangeForBooking } from '@/src/services/vacatingDateChange';
import { getLatestKycSubmission } from '@/src/services/kyc';
import type { PaidHistoryRow } from '@/src/components/customer/account/resident/ResidentPaymentsV2Hub';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';
import { ResidentIncompleteStayPanel } from '@/src/components/customer/account/resident/ResidentIncompleteStayPanel';
import type { UpcomingPaymentRow } from '@/src/components/customer/account/resident/ResidentUpcomingPayments';
import { getDepositRefundSettlementPreview } from '@/src/lib/deposits/depositRefundSettlementPreview';
import { getDepositRefundEligibility } from '@/src/lib/vacating/depositRefundEligibility';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { projectInvoice } from '@/src/services/rentInvoices';
import { billingCycleLabel, enrichBillDueRow, moveOutStatusLabel } from '@/src/lib/residents/residentPortalPresentation';
import { getReferralSummaryForCustomer } from '@/src/services/referrals';
import { indianLocalFromE164, formatIndianPhoneDisplay } from '@/src/lib/phone';
import { ResidentProfileHub } from '@/src/components/customer/account/resident/ResidentProfileHub';
import { ResidentPaymentsV2Hub } from '@/src/components/customer/account/resident/ResidentPaymentsV2Hub';

function labelResidentStatus(value: string | null | undefined): string {
  return titleCase((value ?? 'pending').replace(/_/g, ' '));
}

function rejectionFor(
  rejections: Map<string, PaymentProofRejection>,
  entityType: string,
  entityId: string,
): PaymentProofRejection | undefined {
  return rejections.get(`${entityType}:${entityId}`);
}

function buildBillRowsFromDetail(
  detail: Array<{
    bookingId: string;
    rent: Awaited<ReturnType<typeof listRentInvoicesForBooking>>;
    electricity: Awaited<ReturnType<typeof listElectricityInvoicesForBooking>>;
  }>,
  options: {
    paidWindowDays?: number;
    activeRejections?: Map<string, PaymentProofRejection>;
  } = {},
): {
  dueBillRows: PaymentDueRow[];
  pendingApprovalRows: PaymentDueRow[];
  rejectedBillRows: PaymentDueRow[];
  paidBillRows: PaidHistoryRow[];
  homeUpcoming: UpcomingPaymentRow[];
  firstUnpaidRentId: string | null;
  firstUnpaidElectricityId: string | null;
} {
  const activeRejections = options.activeRejections ?? new Map();
  const dueBillRows: PaymentDueRow[] = [];
  const pendingApprovalRows: PaymentDueRow[] = [];
  const rejectedBillRows: PaymentDueRow[] = [];
  const paidBillRows: PaidHistoryRow[] = [];
  const homeUpcoming: UpcomingPaymentRow[] = [];
  let firstUnpaidRentId: string | null = null;
  let firstUnpaidElectricityId: string | null = null;

  for (const d of detail) {
    const rentRows = d.rent.ok ? d.rent.data : [];
    const electricityRows = d.electricity.ok ? d.electricity.data : [];

    for (const r of rentRows) {
      if (r.status === 'cancelled') {
        paidBillRows.push({
          id: r.id,
          label: `Rent · ${formatDate(r.billingMonth)} (cancelled)`,
          amountPaise: r.rentPaise,
          paidAt: null,
          status: 'cancelled',
          invoiceNumber: r.invoiceNumber,
        });
        continue;
      }
      if (r.status === 'paid') {
        if (options.paidWindowDays == null || isWithinLastDays(r.paidAt, options.paidWindowDays)) {
          paidBillRows.push({
            id: r.id,
            label: `Rent · ${formatDate(r.billingMonth)}`,
            amountPaise: r.paidPrincipalPaise + r.paidLateFeePaise,
            paidAt: r.paidAt ? formatDate(r.paidAt) : null,
            status: 'paid',
            invoiceNumber: r.invoiceNumber,
          });
        }
        continue;
      }
      const projected = projectInvoice({
        ...r,
        cancelledAt: null,
        cancellationReason: null,
        customerId: '',
        bedId: '',
        pgId: '',
        paymentId: null,
        isAdhoc: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const outstanding = projected.outstandingPaise;
      if (outstanding <= 0) continue;

      const rentRejection = rejectionFor(activeRejections, 'rent_invoice', r.id);
      if (rentRejection && !r.paymentProofUrl) {
        rejectedBillRows.push({
          key: `rent-${r.id}`,
          label: `Rent · ${formatDate(r.billingMonth)}`,
          amountPaise: outstanding,
          dueDate: r.dueDate,
          href: `/account/resident/pay-rent/${r.id}`,
          status: 'Rejected',
          invoiceNumber: r.invoiceNumber,
          rejectionReason: rentRejection.reasonLabel,
          rejectionMessage: rentRejection.residentMessage,
        });
        continue;
      }

      if (projected.effectiveStatus === 'payment_in_progress') {
        pendingApprovalRows.push({
          key: `rent-${r.id}`,
          label: `Rent · ${formatDate(r.billingMonth)}`,
          amountPaise: outstanding,
          dueDate: r.dueDate,
          href: `/account/resident/pay-rent/${r.id}`,
          status: 'Waiting for admin approval',
          invoiceNumber: r.invoiceNumber,
        });
        continue;
      }
      if (!firstUnpaidRentId) firstUnpaidRentId = r.id;
      const row: PaymentDueRow = {
        key: `rent-${r.id}`,
        label: `Rent · ${formatDate(r.billingMonth)}`,
        amountPaise: outstanding,
        dueDate: r.dueDate,
        href: `/account/resident/pay-rent/${r.id}`,
        status: labelResidentStatus(projected.effectiveStatus),
        invoiceNumber: r.invoiceNumber,
      };
      dueBillRows.push(row);
      homeUpcoming.push({
        key: row.key,
        label: row.label,
        amountPaise: row.amountPaise,
        dueDate: row.dueDate,
        href: row.href,
        status: row.status,
      });
    }

    for (const e of electricityRows) {
      if (e.status === 'cancelled') {
        paidBillRows.push({
          id: e.id,
          label: `Electricity · ${formatDate(e.billingMonth)} (cancelled)`,
          amountPaise: e.amountPaise,
          paidAt: null,
          status: 'cancelled',
          invoiceNumber: e.invoiceNumber,
        });
        continue;
      }
      if (e.status === 'paid') {
        if (options.paidWindowDays == null || isWithinLastDays(e.paidAt, options.paidWindowDays)) {
          paidBillRows.push({
            id: e.id,
            label: `Electricity · ${formatDate(e.billingMonth)}`,
            amountPaise: e.paidPaise + (e.lateFeeLockedPaise ?? 0),
            paidAt: e.paidAt ? formatDate(e.paidAt) : null,
            status: 'paid',
            invoiceNumber: e.invoiceNumber,
          });
        }
        continue;
      }
      const projected = projectElectricityInvoice({
        id: e.id,
        invoiceNumber: e.invoiceNumber,
        electricityBillId: e.electricityBillId,
        roomId: e.roomId,
        bookingId: e.bookingId,
        customerId: '',
        bedId: '',
        billingMonth: e.billingMonth,
        dueDate: e.dueDate,
        amountPaise: e.amountPaise,
        paidPaise: e.paidPaise,
        lateFeeLockedPaise: e.lateFeeLockedPaise,
        status: e.status,
        paymentId: null,
        paidAt: e.paidAt,
        paymentProofUrl: null,
        unitsShare: null,
        activeDays: null,
        cancelledAt: null,
        supersededByInvoiceId: null,
        duplicateDetectedAt: null,
        isPipelineTest: false,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      });
      const outstanding = projected.outstandingPaise;
      if (outstanding <= 0) continue;

      const elecRejection = rejectionFor(activeRejections, 'electricity_invoice', e.id);
      if (elecRejection && !e.paymentProofUrl) {
        rejectedBillRows.push({
          key: `elec-${e.id}`,
          label: `Electricity · ${formatDate(e.billingMonth)}`,
          amountPaise: outstanding,
          dueDate: e.dueDate,
          href: `/account/resident/pay-electricity/${e.id}`,
          status: 'Rejected',
          invoiceNumber: e.invoiceNumber,
          rejectionReason: elecRejection.reasonLabel,
          rejectionMessage: elecRejection.residentMessage,
        });
        continue;
      }

      if (
        isElectricityAwaitingAdminApproval({
          status: e.status,
          paymentProofUrl: e.paymentProofUrl,
        })
      ) {
        pendingApprovalRows.push({
          key: `elec-${e.id}`,
          label: `Electricity · ${formatDate(e.billingMonth)}`,
          amountPaise: outstanding,
          dueDate: e.dueDate,
          href: `/account/resident/pay-electricity/${e.id}`,
          status: 'Waiting for admin approval',
          invoiceNumber: e.invoiceNumber,
        });
        continue;
      }

      if (!firstUnpaidElectricityId) firstUnpaidElectricityId = e.id;
      const row: PaymentDueRow = {
        key: `elec-${e.id}`,
        label: `Electricity · ${formatDate(e.billingMonth)}`,
        amountPaise: outstanding,
        dueDate: e.dueDate,
        href: `/account/resident/pay-electricity/${e.id}`,
        status: labelResidentStatus(projected.effectiveStatus),
        invoiceNumber: e.invoiceNumber,
      };
      dueBillRows.push(row);
      homeUpcoming.push({
        key: row.key,
        label: row.label,
        amountPaise: row.amountPaise,
        dueDate: row.dueDate,
        href: row.href,
        status: row.status,
      });
    }
  }

  return {
    dueBillRows,
    pendingApprovalRows,
    rejectedBillRows,
    paidBillRows,
    homeUpcoming,
    firstUnpaidRentId,
    firstUnpaidElectricityId,
  };
}

/**
 * Resident billing dashboard — rent, electricity, deposit, vacating.
 * Rendered inside the unified account profile (`/account/profile?section=resident`).
 */
export async function ResidentAreaSection({
  customerId,
  activeTab = 'profile',
  profileSub = 'overview',
  paymentsSub = 'due',
  editExpanded = false,
  requestsQuery = {},
}: {
  customerId: string;
  activeTab?: ResidentTab;
  profileSub?: ResidentProfileSub;
  paymentsSub?: ResidentPaymentsSub;
  editExpanded?: boolean;
  requestsQuery?: {
    requestId?: string;
    make?: boolean;
    category?: import('@/src/lib/residents/requestCenter').RequestCategoryId;
  };
}) {
  const session = await getCustomerSession();
  if (!session || session.customerId !== customerId) {
    return null;
  }
  const developerTestMode = isDeveloperTestResidentEmail(session.email);
  const cookieStore = await cookies();
  const simulatedDurationMode = developerTestMode
    ? parseDevResidentDurationMode(cookieStore.get(DEV_RESIDENT_DURATION_COOKIE)?.value)
    : null;
  const confirmedBooking = await customerHasResidentPortalAccess(session.customerId);
  const hasConfirmedBookingWithoutDetail = confirmedBooking;
  const customer = await getCustomerById(session.customerId);
  const depositWallet = await getCustomerDepositCredit(session.customerId);
  const openRequests = await listOpenRequestsForCustomer(session.customerId);
  const bookings = await listResidentBookingsForCustomer(session.customerId);
  const tenantActive = await isActiveTenant(session.customerId);
  const ps4Membership = tenantActive ? await getMembershipForDashboard(session.customerId) : null;
  const financialAccount = await getResidentFinancialAccount(session.customerId);
  const uniqueBookings: ResidentBookingRow[] =
    bookings.ok && bookings.data.length > 0
      ? Array.from(new Map(bookings.data.map((item) => [item.bookingId, item])).values())
      : [];

  // Per-booking detail fetches — sequential is fine here; one resident
  // typically has 1-2 bookings.
  const detail: Array<{
    booking: ResidentBookingRow;
    bookingId: string;
    bookingCode: string;
    rent: Awaited<ReturnType<typeof listRentInvoicesForBooking>>;
    electricity: Awaited<ReturnType<typeof listElectricityInvoicesForBooking>>;
    deposit: Awaited<ReturnType<typeof getDepositSummaryForBooking>>;
    vacating: Awaited<ReturnType<typeof getVacatingForBooking>>;
    roomElectricity: Awaited<ReturnType<typeof getRoomElectricityForCustomer>>;
  }> = [];
  if (uniqueBookings.length > 0) {
    for (const b of uniqueBookings) {
      const [rent, electricity, deposit, vacating, roomElectricity] = await Promise.all([
        listRentInvoicesForBooking(b.bookingId),
        listElectricityInvoicesForBooking(b.bookingId),
        getDepositSummaryForBooking(b.bookingId),
        getVacatingForBooking(b.bookingId),
        getRoomElectricityForCustomer(session.customerId, b.roomId),
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
  }

  const depositDueCards = await Promise.all(
    detail.map(async (d) => {
      const account = await getBookingFinancialAccount({
        bookingId: d.bookingId,
        customerId: session.customerId,
        customerName: session.fullName || customer?.fullName || 'Resident',
        customerPhone: customer?.phone ?? '',
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
        bookingCode: d.bookingCode,
        pgName: d.booking.pgName,
        depositPaise: account.deposit.requiredPaise,
        collectedPaise: collected,
        depositDuePaise,
        depositDueDate: d.booking.depositDueDate,
        depositCollectionStatus: d.booking.depositCollectionStatus,
        paymentLinkUrl,
        paymentProofPending: Boolean(
          existing?.status === 'active' &&
            existing.bookingId === d.bookingId &&
            existing.paymentProofUrl,
        ),
      };
    }),
  );

  const activeTenancy = await getActiveTenancyForCustomer(session.customerId);
  const primaryBooking =
    (activeTenancy ? detail.find((d) => d.bookingId === activeTenancy.bookingId) : null) ??
    detail[0] ??
    undefined;
  const effectiveDurationMode =
    primaryBooking && developerTestMode && simulatedDurationMode
      ? mapDevDurationToBookingMode(simulatedDurationMode)
      : primaryBooking?.booking.durationMode;

  let residentBriefing = null;
  if (primaryBooking != null) {
    try {
      residentBriefing = await buildBriefingInputForBooking({
        customerId: session.customerId,
        residentName: session.fullName || customer?.fullName || 'Resident',
        kycLabel: customer?.kycStatus === 'approved' ? 'Verified' : 'Pending',
        booking: {
          bookingId: primaryBooking.bookingId,
          bookingCode: primaryBooking.bookingCode,
          pgName: primaryBooking.booking.pgName,
          durationMode: effectiveDurationMode ?? primaryBooking.booking.durationMode,
          status: 'confirmed',
          expectedCheckoutDate: primaryBooking.booking.expectedCheckoutDate,
          pricingSnapshot: {
            perBed: [{ monthlyRatePaise: primaryBooking.booking.monthlyRentPaise }],
          } as PricingSnapshot,
          reservations: [
            {
              roomNumber: primaryBooking.booking.roomNumber,
              bedCode: primaryBooking.booking.bedCode,
              stayRange: primaryBooking.booking.checkInDate
                ? `[${primaryBooking.booking.checkInDate},)`
                : 'empty',
              checkInDate: primaryBooking.booking.checkInDate,
            },
          ],
          customerFullName: session.fullName,
        },
      });
    } catch (error) {
      logger.warn('resident briefing build failed', {
        customerId: session.customerId,
        email: session.email,
        bookingId: primaryBooking.bookingId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const checkoutByBooking = new Map<string, string>();
  const checkoutSettlementByBooking = new Map<
    string,
    {
      status: string;
      rejectionReason?: string | null;
      checkoutSource?: string | null;
      waterfall?: import('@/src/lib/checkout/checkoutSettlementEngineV2').CheckoutSettlementWaterfall | null;
      totalRefundPaise?: number | null;
      payoutUpiId?: string | null;
      refundPaidAt?: Date | null;
    }
  >();
  for (const d of detail) {
    const moveOutCtx = await getResidentMoveOutSettlementContext(
      session.customerId,
      d.bookingId,
    );
    if (moveOutCtx) {
      checkoutByBooking.set(d.bookingId, moveOutCtx.status);
      checkoutSettlementByBooking.set(d.bookingId, moveOutCtx);
      continue;
    }
    const eligibilitySettlement = await getRefundEligibilitySettlementForCustomer(
      session.customerId,
      d.bookingId,
    );
    if (eligibilitySettlement) {
      checkoutSettlementByBooking.set(d.bookingId, eligibilitySettlement);
      checkoutByBooking.set(d.bookingId, eligibilitySettlement.status);
      continue;
    }
    const openSettlement = await getCheckoutSettlementForCustomer(
      session.customerId,
      d.bookingId,
    );
    if (openSettlement) {
      checkoutByBooking.set(d.bookingId, openSettlement.status);
      checkoutSettlementByBooking.set(d.bookingId, {
        status: openSettlement.status,
        rejectionReason: openSettlement.refundNotes,
        checkoutSource: openSettlement.checkoutSource,
      });
      continue;
    }
    const status = await getLatestCheckoutSettlementStatusForCustomer(
      session.customerId,
      d.bookingId,
    );
    if (status) checkoutByBooking.set(d.bookingId, status);
  }

  const conciergeContext: ConciergeContext | null =
    primaryBooking && financialAccount
      ? {
          residentName: session.fullName || customer?.fullName || 'Resident',
          pgName: primaryBooking.booking.pgName,
          roomNumber: primaryBooking.booking.roomNumber,
          bedCode: primaryBooking.booking.bedCode,
          rentDuePaise: financialAccount.rentOutstandingPaise,
          electricityDuePaise: financialAccount.electricityOutstandingPaise,
          depositBalancePaise: financialAccount.depositHeldPaise,
          depositDuePaise: financialAccount.deposit.outstandingPaise,
          vacatingStatus:
            primaryBooking.vacating.ok && primaryBooking.vacating.data
              ? primaryBooking.vacating.data.status
              : null,
        }
      : null;

  const latestKyc = await getLatestKycSubmission(session.customerId);
  const documentsSubmitted =
    customer?.kycStatus === 'pending' &&
    latestKyc != null &&
    latestKyc.status === 'pending';

  const primaryDepositCard = depositDueCards[0];
  const primaryVacating =
    primaryBooking?.vacating.ok ? primaryBooking.vacating.data : null;
  const hasOpenVacating = Boolean(
    primaryVacating && ['pending', 'approved'].includes(primaryVacating.status),
  );

  let primaryEstimatedSettlement: EstimatedSettlementPreview | null = null;
  let primaryPendingDateChangeRequestId: string | null = null;
  let primarySettlementContext: ResidentSettlementStatementContext | null = null;
  if (
    primaryBooking &&
    primaryVacating &&
    ['pending', 'approved'].includes(primaryVacating.status)
  ) {
    const [estimatedSettlement, pendingDateChange] = await Promise.all([
      loadEstimatedSettlementForVacating({
        bookingId: primaryBooking.bookingId,
        noticeGivenDate: primaryVacating.noticeGivenDate,
        vacatingDate: primaryVacating.vacatingDate,
        monthlyRentPaiseSnapshot: primaryVacating.monthlyRentPaiseSnapshot,
        noticeRentCoveredDays: primaryVacating.noticeRentCoveredDays,
        noticeChargeableDays: primaryVacating.noticeChargeableDays,
        deductionPaise: primaryVacating.deductionPaise,
        noticeBreakdownJson: primaryVacating.noticeBreakdownJson,
        durationMode: effectiveDurationMode ?? primaryBooking.booking.durationMode,
      }),
      getPendingVacatingDateChangeForBooking(primaryBooking.bookingId),
    ]);
    primaryEstimatedSettlement = estimatedSettlement;
    primaryPendingDateChangeRequestId = pendingDateChange?.id ?? null;
    primarySettlementContext = {
      vacatingRequestId: primaryVacating.id,
      bookingId: primaryBooking.bookingId,
      customerName: session.fullName || customer?.fullName || 'Resident',
      customerPhone: customer?.phone ?? undefined,
      bookingCode: primaryBooking.bookingCode,
      pgName: primaryBooking.booking.pgName,
      roomNumber: primaryBooking.booking.roomNumber,
      bedCode: primaryBooking.booking.bedCode,
      noticeGivenDate: String(primaryVacating.noticeGivenDate),
      vacatingDate: String(primaryVacating.vacatingDate),
    };
  }

  const activeRejectionsRaw = await listActiveRejectionsForCustomer(session.customerId);
  const activeRejections = new Map(
    activeRejectionsRaw.map((r) => [`${r.entityType}:${r.entityId}`, r] as const),
  );

  const homeUpcoming: UpcomingPaymentRow[] = [];
  const dueBillRows: PaymentDueRow[] = [];
  const pendingApprovalRows: PaymentDueRow[] = [];
  const rejectedBillRows: PaymentDueRow[] = [];
  const paidBillRows: PaidHistoryRow[] = [];
  let firstUnpaidRentId: string | null = null;
  let firstUnpaidElectricityId: string | null = null;

  if (detail.length > 0) {
    const rejectionOpts = { activeRejections };
    const homeBills = buildBillRowsFromDetail(detail, { paidWindowDays: 30, ...rejectionOpts });
    const allBills = buildBillRowsFromDetail(detail, rejectionOpts);
    dueBillRows.push(...homeBills.dueBillRows);
    pendingApprovalRows.push(...homeBills.pendingApprovalRows);
    rejectedBillRows.push(...homeBills.rejectedBillRows);
    paidBillRows.push(...allBills.paidBillRows);
    homeUpcoming.push(...homeBills.homeUpcoming);
    firstUnpaidRentId = homeBills.firstUnpaidRentId;
    firstUnpaidElectricityId = homeBills.firstUnpaidElectricityId;

    if (primaryDepositCard && primaryDepositCard.depositDuePaise > 0) {
      const depositHref =
        primaryDepositCard.paymentLinkUrl != null
          ? `/pay/${primaryDepositCard.paymentLinkUrl.split('/').pop()}`
          : null;
      const depositRow: PaymentDueRow = {
        key: 'deposit-due',
        label: 'Security deposit',
        amountPaise: primaryDepositCard.depositDuePaise,
        dueDate: primaryDepositCard.depositDueDate,
        href: depositHref,
        status: primaryDepositCard.paymentProofPending
          ? 'Waiting for admin approval'
          : labelResidentStatus(primaryDepositCard.depositCollectionStatus),
        invoiceNumber: `DEP-${primaryDepositCard.bookingCode}`,
      };
      if (primaryDepositCard.paymentProofPending) {
        pendingApprovalRows.push(depositRow);
      } else {
        const depositLinkId = primaryDepositCard.paymentLinkUrl?.split('/').pop();
        const depositRejection =
          depositLinkId != null
            ? activeRejections.get(`payment_link:${depositLinkId}`)
            : undefined;
        if (depositRejection) {
          rejectedBillRows.push({
            ...depositRow,
            status: 'Rejected',
            rejectionReason: depositRejection.reasonLabel,
            rejectionMessage: depositRejection.residentMessage,
          });
        } else {
          dueBillRows.push(depositRow);
        }
      }
      homeUpcoming.unshift({
        key: depositRow.key,
        label: depositRow.label,
        amountPaise: depositRow.amountPaise,
        dueDate: depositRow.dueDate,
        href: depositRow.href,
        status: depositRow.status,
      });
    }
  }

  const paymentBillRows: PaymentDueRow[] = dueBillRows;
  const firstPayHref = paymentBillRows.find((r) => r.href)?.href ?? null;
  const nextDueDate = paymentBillRows[0]?.dueDate ?? null;

  const walletBooking =
    detail.reduce(
      (best, d) => {
        const bal = d.deposit?.refundableBalancePaise ?? 0;
        const bestBal = best?.deposit?.refundableBalancePaise ?? 0;
        return bal >= bestBal ? d : best;
      },
      detail[0] ?? null,
    ) ?? primaryBooking;

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
        settlement: checkoutSettlementByBooking.get(walletBooking.bookingId) ?? null,
        monthlyRentPaise: walletBooking.booking.monthlyRentPaise,
        hasActiveBedToday: Boolean(activeTenancy?.bookingId === walletBooking.bookingId),
      })
    : { canRequestRefund: false, lockReason: 'No active booking found.' };

  const walletDepositHeldPaise =
    depositWallet.totalHeldPaise > 0
      ? depositWallet.totalHeldPaise
      : (walletBooking?.deposit?.refundableBalancePaise ?? primaryBooking?.deposit?.refundableBalancePaise ?? 0);
  const walletAvailableRefundPaise =
    walletBooking?.deposit?.refundableBalancePaise ??
    primaryBooking?.deposit?.refundableBalancePaise ??
    depositWallet.availableCreditPaise;
  const historyHref = walletBooking
    ? `/account/resident/history/${walletBooking.bookingId}`
    : null;

  const paidHistory: PaidHistoryRow[] = paidBillRows.sort((a, b) =>
    (b.paidAt ?? '').localeCompare(a.paidAt ?? ''),
  );

  const enrichedDueRows = dueBillRows.map(enrichBillDueRow);

  const referralSummary = await getReferralSummaryForCustomer(session.customerId);

  const lifetimeTotals = {
    rentPaidPaise: financialAccount?.rent.paidPaise ?? 0,
    depositPaidPaise: financialAccount?.deposit.paidPaise ?? 0,
    electricityPaidPaise: financialAccount?.electricity.paidPaise ?? 0,
    otherPaidPaise: financialAccount?.other.paidPaise ?? 0,
  };

  const moveOutStatus = moveOutStatusLabel({
    vacatingStatus: primaryVacating?.status ?? null,
    checkoutStatus: checkoutByBooking.get(primaryBooking?.bookingId ?? '') ?? null,
  });

  const primaryCheckoutSettlement = primaryBooking
    ? checkoutSettlementByBooking.get(primaryBooking.bookingId) ?? null
    : null;

  const depositEntries =
    walletBooking?.deposit?.entries ?? primaryBooking?.deposit?.entries ?? [];

  const fromBedId = activeTenancy?.bedId ?? '';

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

  const hasDepositDue = depositDueCards.some((c) => c.depositDuePaise > 0);
  const roomLabel = primaryBooking
    ? `${primaryBooking.booking.pgName} · R${primaryBooking.booking.roomNumber}`
    : '';

  return (
    <ResidentHubShell
      activeTab={activeTab}
      developerTestMode={developerTestMode}
      customerId={session.customerId}
      customerEmail={session.email}
      bookingId={primaryBooking?.bookingId ?? null}
      actualDurationMode={primaryBooking?.booking.durationMode ?? null}
      simulatedDurationMode={simulatedDurationMode}
    >
      {!primaryBooking && hasConfirmedBookingWithoutDetail ? (
        <ResidentIncompleteStayPanel
          customerEmail={session.email}
          developerTestMode={developerTestMode}
        />
      ) : null}
      {activeTab === 'referrals' ? (
        <ReferralsPanel
          customerId={session.customerId}
          customerName={session.fullName || customer?.fullName || 'Resident'}
          referralSummary={referralSummary}
        />
      ) : null}
      {activeTab === 'concierge' && conciergeContext ? (
        <ResidentConciergeChat context={conciergeContext} />
      ) : null}
      {activeTab === 'profile' && primaryBooking && customer ? (
        <ResidentProfileHub
          sub={profileSub}
          booking={primaryBooking.booking}
          billingCycleLabel={billingCycleLabel(primaryBooking.booking.checkInDate)}
          depositRequiredPaise={primaryDepositCard?.depositPaise ?? primaryBooking.booking.depositPaise}
          depositPaidPaise={primaryDepositCard?.collectedPaise ?? primaryBooking.deposit?.collectedPaise ?? 0}
          depositBalancePaise={walletDepositHeldPaise}
          depositDuePaise={primaryDepositCard?.depositDuePaise ?? 0}
          moveOutStatus={moveOutStatus}
          roommatesCount={Math.max(0, 4 - 1)}
          roomCapacity={4}
          ps4Active={Boolean(ps4Membership)}
          fullName={customer.fullName}
          email={customer.email}
          phoneLocal={indianLocalFromE164(customer.phone) ?? ''}
          phoneDisplay={formatIndianPhoneDisplay(session.phone)}
          editExpanded={editExpanded}
          bookingId={primaryBooking.bookingId}
          customerId={session.customerId}
          availableRefundPaise={walletAvailableRefundPaise}
          entries={depositEntries}
          hasOpenVacating={hasOpenVacating}
          refundEligibility={refundEligibility}
          settlementPreview={refundSettlementPreview}
          referralSummary={{
            lockedPaise: referralSummary.lockedPaise,
            availablePaise: referralSummary.availablePaise,
            withdrawnPaise: referralSummary.withdrawnPaise,
          }}
          vacatingStatus={primaryVacating?.status ?? null}
          checkoutStatus={checkoutByBooking.get(primaryBooking.bookingId) ?? null}
          vacatingDate={primaryVacating?.vacatingDate ?? null}
          settlementWaterfall={primaryCheckoutSettlement?.waterfall ?? null}
        />
      ) : null}
      {activeTab === 'requests' && primaryBooking ? (
        <ResidentSectionErrorBoundary
          page="requests_home"
          bookingId={primaryBooking.bookingId}
          customerId={session.customerId}
          title="Requests could not load"
        >
          <RequestsHome
            customerId={session.customerId}
            bookingId={primaryBooking.bookingId}
            bookingCode={primaryBooking.bookingCode}
            pgId={primaryBooking.booking.pgId}
            fromBedId={fromBedId}
            roomLabel={roomLabel}
            refundableBalancePaise={walletAvailableRefundPaise}
            hasDepositDue={hasDepositDue}
            activeRequests={activeRequests}
            selectedRequestId={requestsQuery.requestId ?? null}
            startMake={requestsQuery.make ?? false}
            initialCategory={requestsQuery.category ?? null}
            vacating={primaryVacating}
            bookingStatus={primaryBooking.booking.status}
            durationMode={effectiveDurationMode ?? primaryBooking.booking.durationMode}
            expectedCheckoutDate={primaryBooking.booking.expectedCheckoutDate}
            bookingCreatedAt={primaryBooking.booking.createdAt}
            checkoutSettlementStatus={checkoutByBooking.get(primaryBooking.bookingId) ?? null}
            checkoutSettlement={checkoutSettlementByBooking.get(primaryBooking.bookingId) ?? null}
            checkoutSettlementSuppressed={
              primaryVacating?.checkoutSettlementSuppressed === true
            }
            monthlyRentPaise={primaryBooking.booking.monthlyRentPaise}
            depositHeldPaise={walletDepositHeldPaise}
            moveInDate={primaryBooking.booking.checkInDate}
            developerTestEmail={developerTestMode ? session.email : null}
            estimatedSettlement={primaryEstimatedSettlement}
            pendingDateChangeRequestId={primaryPendingDateChangeRequestId}
            settlementContext={primarySettlementContext}
          />
        </ResidentSectionErrorBoundary>
      ) : null}

      {activeTab === 'payments' && primaryBooking ? (
        <ResidentPaymentsV2Hub
          sub={paymentsSub}
          dueRows={enrichedDueRows}
          pendingApprovalRows={pendingApprovalRows}
          rejectedBillRows={rejectedBillRows}
          paidBills={paidHistory}
          historyHref={historyHref}
          lifetimeTotals={lifetimeTotals}
        />
      ) : null}
    </ResidentHubShell>
  );
}
