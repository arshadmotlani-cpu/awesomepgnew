import {
  getVacatingForBooking,
  listElectricityInvoicesForBooking,
  listPaymentsForBooking,
  listRentInvoicesForBooking,
  listResidentBookingsForCustomer,
  customerHasConfirmedBooking,
  type ResidentBookingRow,
} from '@/src/db/queries/customer';
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
import { ensureDepositDuePaymentLink } from '@/src/services/depositCollection';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import { getLatestPaymentLinkForResident } from '@/src/services/paymentLinks';
import { listOpenRequestsForCustomer } from '@/src/services/residentRequests';
import { MyRoomPanel } from '@/src/components/customer/account/MyRoomPanel';
import { NotificationCenterPanel } from '@/src/components/customer/account/NotificationCenterPanel';
import { ReferralsPanel } from '@/src/components/customer/account/ReferralsPanel';
import { ResidentSectionErrorBoundary } from '@/src/components/customer/account/resident/ResidentSectionErrorBoundary';
import { RequestsHome } from '@/src/components/customer/account/resident/requests/RequestsHome';
import { VacatingHome } from '@/src/components/customer/account/resident/vacating/VacatingHome';
import { requestTypeLabel, type ActiveRequestItem } from '@/src/lib/residents/requestCenter';
import { ResidentConciergeChat } from '@/src/components/customer/account/ResidentConciergeChat';
import { ResidentHubShell } from '@/src/components/customer/account/ResidentHubShell';
import type { ConciergeContext } from '@/src/lib/concierge/answers';
import type { ResidentTab } from '@/src/lib/accountNavigation';
import { listCustomerEmailNotifications } from '@/src/db/queries/customerNotifications';
import { getCheckoutSettlementForCustomer, getLatestCheckoutSettlementStatusForCustomer } from '@/src/services/checkoutSettlement';
import { getLatestKycSubmission } from '@/src/services/kyc';
import { buildWalletLedger } from '@/src/lib/residents/walletLedger';
import { DepositDueSection } from '@/src/components/customer/account/DepositDueSection';
import { DepositWalletSection } from '@/src/components/customer/account/DepositWalletSection';
import { DepositRefundNotice } from '@/src/components/customer/DepositRefundNotice';
import { ResidentRequestForms } from '@/src/components/customer/account/ResidentRequestForms';
import { ResidentDepositLedger } from '@/src/components/customer/account/resident/ResidentDepositLedger';
import { ResidentDepositBreakdown } from '@/src/components/customer/account/resident/ResidentDepositBreakdown';
import { ResidentWalletRequestStatus } from '@/src/components/customer/account/resident/ResidentWalletRequestStatus';
import { ResidentWalletView } from '@/src/components/customer/account/resident/ResidentWalletView';
import { ResidentPaymentsHub } from '@/src/components/customer/account/resident/ResidentPaymentsHub';
import type { ResidentElectricityHistoryItem } from '@/src/components/customer/account/resident/ResidentElectricityHistory';
import type { PaidHistoryRow } from '@/src/components/customer/account/resident/ResidentPaymentsHub';
import {
  type PaymentDueRow,
} from '@/src/components/customer/account/resident/ResidentPaymentsPanel';
import { ResidentHomePanel } from '@/src/components/customer/account/resident/ResidentHomePanel';
import { ResidentIncompleteStayPanel } from '@/src/components/customer/account/resident/ResidentIncompleteStayPanel';
import type { UpcomingPaymentRow } from '@/src/components/customer/account/resident/ResidentUpcomingPayments';

function labelResidentStatus(value: string | null | undefined): string {
  return titleCase((value ?? 'pending').replace(/_/g, ' '));
}

/**
 * Resident billing dashboard — rent, electricity, deposit, vacating.
 * Rendered inside the unified account profile (`/account/profile?section=resident`).
 */
export async function ResidentAreaSection({
  customerId,
  activeTab = 'home',
  requestsQuery = {},
}: {
  customerId: string;
  activeTab?: ResidentTab;
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
  const confirmedBooking = await customerHasConfirmedBooking(session.customerId);
  const hasConfirmedBookingWithoutDetail = confirmedBooking.ok && confirmedBooking.data;
  const customer = await getCustomerById(session.customerId);
  const depositWallet = await getCustomerDepositCredit(session.customerId);
  const openRequests = await listOpenRequestsForCustomer(session.customerId);
  const emailNotifications = await listCustomerEmailNotifications(session.customerId);
  const notifications = emailNotifications.ok ? emailNotifications.data : [];
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
      if (depositDuePaise > 0) {
        const existing = await getLatestPaymentLinkForResident(session.customerId, 'deposit');
        paymentLinkUrl =
          existing?.status === 'active'
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
      };
    }),
  );

  const primaryBooking = detail[0];
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
    { status: string; rejectionReason?: string | null }
  >();
  for (const d of detail) {
    const openSettlement = await getCheckoutSettlementForCustomer(
      session.customerId,
      d.bookingId,
    );
    if (openSettlement) {
      checkoutByBooking.set(d.bookingId, openSettlement.status);
      checkoutSettlementByBooking.set(d.bookingId, {
        status: openSettlement.status,
        rejectionReason: openSettlement.refundNotes,
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

  const homeUpcoming: UpcomingPaymentRow[] = [];
  const dueBillRows: PaymentDueRow[] = [];
  const pendingApprovalRows: PaymentDueRow[] = [];
  const paidBillRows: PaidHistoryRow[] = [];
  let firstUnpaidRentId: string | null = null;
  let firstUnpaidElectricityId: string | null = null;

  if (primaryBooking && financialAccount) {
    const rentRows = primaryBooking.rent.ok ? primaryBooking.rent.data : [];
    const electricityRows = primaryBooking.electricity.ok ? primaryBooking.electricity.data : [];

    for (const r of rentRows) {
      if (r.status === 'paid' && isWithinLastDays(r.paidAt, 30)) {
        paidBillRows.push({
          id: r.id,
          label: `Rent · ${formatDate(r.billingMonth)}`,
          amountPaise: r.paidPrincipalPaise + r.paidLateFeePaise,
          paidAt: r.paidAt ? formatDate(r.paidAt) : null,
          status: 'paid',
          invoiceNumber: r.invoiceNumber,
        });
      }
    }
    for (const e of electricityRows) {
      if (e.status === 'paid' && isWithinLastDays(e.paidAt, 30)) {
        paidBillRows.push({
          id: e.id,
          label: `Electricity · ${formatDate(e.billingMonth)}`,
          amountPaise: e.paidPaise + (e.lateFeeLockedPaise ?? 0),
          paidAt: e.paidAt ? formatDate(e.paidAt) : null,
          status: 'paid',
          invoiceNumber: e.invoiceNumber,
        });
      }
    }

    const openLineItems = [
      ...financialAccount.rent.items,
      ...financialAccount.electricity.items,
      ...financialAccount.other.items,
    ];
    for (const item of openLineItems) {
      const href =
        item.kind === 'rent' && item.sourceId
          ? `/account/resident/pay-rent/${item.sourceId}`
          : item.kind === 'electricity' && item.sourceId
            ? `/account/resident/pay-electricity/${item.sourceId}`
            : null;

      if (item.status === 'payment_in_progress') {
        pendingApprovalRows.push({
          key: `${item.kind}-${item.id}`,
          label: item.label,
          amountPaise: item.outstandingPaise,
          dueDate: item.dueDate ?? null,
          href,
          status: 'Waiting for admin approval',
          invoiceNumber: item.invoiceNumber ?? undefined,
        });
        continue;
      }

      if (
        item.outstandingPaise > 0 &&
        (item.status === 'pending' ||
          item.status === 'overdue' ||
          item.status === 'due_at_checkout')
      ) {
        if (item.kind === 'rent' && !firstUnpaidRentId && item.sourceId) {
          firstUnpaidRentId = item.sourceId;
        }
        if (item.kind === 'electricity' && !firstUnpaidElectricityId && item.sourceId) {
          firstUnpaidElectricityId = item.sourceId;
        }
        const row: PaymentDueRow = {
          key: `${item.kind}-${item.id}`,
          label: item.label,
          amountPaise: item.outstandingPaise,
          dueDate: item.dueDate ?? null,
          href,
          status: labelResidentStatus(item.status),
          invoiceNumber: item.invoiceNumber ?? undefined,
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
    if (primaryDepositCard && primaryDepositCard.depositDuePaise > 0) {
      homeUpcoming.unshift({
        key: 'deposit-due',
        label: 'Security deposit',
        amountPaise: primaryDepositCard.depositDuePaise,
        dueDate: primaryDepositCard.depositDueDate,
        href: primaryDepositCard.paymentLinkUrl,
        status: labelResidentStatus(primaryDepositCard.depositCollectionStatus),
      });
    }
  }

  const paymentBillRows: PaymentDueRow[] = dueBillRows;
  const firstPayHref = paymentBillRows.find((r) => r.href)?.href ?? null;
  const nextDueDate = paymentBillRows[0]?.dueDate ?? null;

  const paymentHistoryRes = primaryBooking
    ? await listPaymentsForBooking(primaryBooking.bookingId)
    : null;
  const walletLedgerEntries = buildWalletLedger({
    depositEntries: primaryBooking?.deposit?.entries ?? [],
    payments: paymentHistoryRes?.ok ? paymentHistoryRes.data : [],
  });
  const historyHref = primaryBooking
    ? `/account/resident/history/${primaryBooking.bookingId}`
    : null;

  const paidHistory: PaidHistoryRow[] = paidBillRows.sort((a, b) =>
    (b.paidAt ?? '').localeCompare(a.paidAt ?? ''),
  );

  const electricityHistory: ResidentElectricityHistoryItem[] =
    primaryBooking?.electricity.ok && primaryBooking.electricity.data.length > 0
      ? primaryBooking.electricity.data.map((e) => ({
          id: e.id,
          invoiceNumber: e.invoiceNumber,
          billingMonth: String(e.billingMonth),
          amountPaise: e.amountPaise,
          paidPaise: e.paidPaise,
          status: e.status,
          dueDate: String(e.dueDate),
          roomNumber: e.roomNumber,
          isCheckoutSettled:
            e.status === 'paid' && e.paidPaise > 0 && e.amountPaise <= e.paidPaise,
        }))
      : [];

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
  const walletDepositHeldPaise =
    depositWallet.totalHeldPaise > 0
      ? depositWallet.totalHeldPaise
      : (primaryBooking?.deposit?.refundableBalancePaise ?? 0);
  const walletAvailableRefundPaise =
    primaryBooking?.deposit?.refundableBalancePaise ?? depositWallet.availableCreditPaise;

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
      {activeTab === 'notifications' ? (
        <NotificationCenterPanel email={customer?.email} notifications={notifications} />
      ) : null}
      {activeTab === 'referrals' ? (
        <ReferralsPanel
          customerId={session.customerId}
          customerName={session.fullName || customer?.fullName || 'Resident'}
        />
      ) : null}
      {activeTab === 'concierge' && conciergeContext ? (
        <ResidentConciergeChat context={conciergeContext} />
      ) : null}
      {activeTab === 'room' && primaryBooking ? (
        <MyRoomPanel
          pgName={primaryBooking.booking.pgName}
          roomNumber={primaryBooking.booking.roomNumber}
          bedCode={primaryBooking.booking.bedCode}
          monthlyRentPaise={primaryBooking.booking.monthlyRentPaise}
          checkInDate={primaryBooking.booking.checkInDate}
          expectedCheckoutDate={primaryBooking.booking.expectedCheckoutDate}
          capacity={4}
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
            roomLabel={roomLabel}
            refundableBalancePaise={primaryBooking.deposit?.refundableBalancePaise ?? 0}
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
          monthlyRentPaise={primaryBooking.booking.monthlyRentPaise}
          developerTestEmail={developerTestMode ? session.email : null}
        />
        </ResidentSectionErrorBoundary>
      ) : null}

      {activeTab === 'vacating' && primaryBooking ? (
        <ResidentSectionErrorBoundary
          page="vacating_home"
          bookingId={primaryBooking.bookingId}
          customerId={session.customerId}
          title="Move-out page could not load"
        >
        <VacatingHome
          bookingId={primaryBooking.bookingId}
          bookingCode={primaryBooking.bookingCode}
          roomLabel={roomLabel}
          vacating={primaryVacating}
          checkoutStatus={checkoutByBooking.get(primaryBooking.bookingId) ?? null}
          checkoutSettlement={checkoutSettlementByBooking.get(primaryBooking.bookingId) ?? null}
          depositHeldPaise={walletDepositHeldPaise}
          durationMode={effectiveDurationMode ?? primaryBooking.booking.durationMode}
          expectedCheckoutDate={primaryBooking.booking.expectedCheckoutDate}
          bookingStatus={primaryBooking.booking.status}
          bookingCreatedAt={primaryBooking.booking.createdAt}
          monthlyRentPaise={primaryBooking.booking.monthlyRentPaise}
          developerTestEmail={developerTestMode ? session.email : null}
        />
        </ResidentSectionErrorBoundary>
      ) : null}

      {activeTab === 'home' && primaryBooking && customer ? (
        <ResidentHomePanel
          booking={primaryBooking.booking}
          financialSummary={
            financialAccount ?? {
              customerId: session.customerId,
              bookingId: primaryBooking.bookingId,
              bookingCode: primaryBooking.bookingCode,
              customerName: customer.fullName,
              customerPhone: customer.phone ?? '',
              pgId: primaryBooking.booking.pgId,
              pgName: primaryBooking.booking.pgName,
              roomNumber: primaryBooking.booking.roomNumber,
              asOf: new Date().toISOString(),
              rent: { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0, items: [] },
              deposit: {
                requiredPaise: primaryBooking.booking.depositPaise,
                paidPaise: primaryBooking.deposit?.collectedPaise ?? 0,
                outstandingPaise: primaryBooking.booking.depositDuePaise ?? 0,
                refundablePaise: primaryBooking.deposit?.refundableBalancePaise ?? 0,
                items: [],
              },
              electricity: { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0, items: [] },
              other: { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0, items: [] },
              totals: { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0 },
            }
          }
          kycStatus={customer.kycStatus}
          documentsSubmitted={documentsSubmitted}
          openRequests={openRequests}
          depositDuePaise={primaryDepositCard?.depositDuePaise ?? 0}
          depositPaymentLinkUrl={primaryDepositCard?.paymentLinkUrl ?? null}
          upcomingPayments={homeUpcoming}
          firstUnpaidRentId={firstUnpaidRentId}
          firstUnpaidElectricityId={firstUnpaidElectricityId}
          hasOpenVacating={hasOpenVacating}
          vacatingStatus={primaryVacating?.status ?? null}
          checkoutStatus={checkoutByBooking.get(primaryBooking.bookingId) ?? null}
          vacatingDate={primaryVacating?.vacatingDate ?? null}
          settlementLines={
            primaryVacating
              ? [
                  {
                    label: 'Notice period deduction',
                    amountPaise: primaryVacating.deductionPaise,
                    tone: 'deduction' as const,
                  },
                  {
                    label: 'Refund issued',
                    amountPaise: primaryVacating.depositRefundPaise,
                    tone: 'credit' as const,
                  },
                ]
              : []
          }
          residentBriefing={residentBriefing}
          ps4Membership={ps4Membership}
          tenantActive={tenantActive}
        />
      ) : null}

      {activeTab === 'wallet' && primaryBooking ? (
        <div className="space-y-4 pb-2">
          <DepositWalletSection
            wallet={depositWallet}
            availableRefundPaise={walletAvailableRefundPaise}
          />

          <ResidentWalletView
            amountDuePaise={financialAccount?.totalOutstandingPaise ?? 0}
            depositHeldPaise={walletDepositHeldPaise}
            availableCreditPaise={depositWallet.availableCreditPaise}
            ledgerEntries={walletLedgerEntries}
            firstUnpaidRentId={firstUnpaidRentId}
            firstUnpaidElectricityId={firstUnpaidElectricityId}
            historyHref={historyHref}
          />

          {depositDueCards.map((card) => (
            <DepositDueSection key={`deposit-due-${card.bookingId}`} {...card} />
          ))}

          <ResidentDepositBreakdown entries={primaryBooking.deposit?.entries ?? []} />

          <ResidentDepositLedger entries={primaryBooking.deposit?.entries ?? []} />

          <DepositRefundNotice />

          <ResidentWalletRequestStatus requests={activeRequests} />

          <ResidentRequestForms
            bookingId={primaryBooking.bookingId}
            customerId={session.customerId}
            refundableBalancePaise={walletAvailableRefundPaise}
            hasOpenVacating={hasOpenVacating}
          />
        </div>
      ) : null}

      {activeTab === 'payments' && primaryBooking && financialAccount ? (
        <ResidentPaymentsHub
          dueRows={dueBillRows}
          pendingApprovalRows={pendingApprovalRows}
          paidBills={paidHistory}
          historyHref={historyHref}
          electricityHistory={electricityHistory}
          bookingId={primaryBooking.bookingId}
        />
      ) : null}
    </ResidentHubShell>
  );
}
