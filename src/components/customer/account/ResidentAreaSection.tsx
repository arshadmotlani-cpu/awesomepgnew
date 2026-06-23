import Link from 'next/link';
import {
  getVacatingForBooking,
  listElectricityInvoicesForBooking,
  listPaymentsForBooking,
  listRentInvoicesForBooking,
  listResidentBookingsForCustomer,
  type ResidentBookingRow,
} from '@/src/db/queries/customer';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getResidentFinancialSummary } from '@/src/services/residentFinancialEngine';
import { projectInvoice } from '@/src/services/rentInvoices';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { getCustomerSession } from '@/src/lib/auth/session';
import { getCustomerById } from '@/src/services/profile';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import {
  ACCOUNT_LINK_IN_SURFACE,
  ACCOUNT_SURFACE,
  ACCOUNT_SURFACE_PADDED,
  ACCOUNT_SURFACE_PRIMARY_BTN,
  ACCOUNT_TABLE_HEAD,
} from '@/src/components/customer/accountStyles';
import { getRoomElectricityForCustomer } from '@/src/services/meterElectricity';
import {
  getMembershipForDashboard,
  isActiveTenant,
} from '@/src/services/playstationMembership';
import { buildBriefingInputForBooking } from '@/src/lib/cockroach/briefingFromBooking';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { DepositDueSection } from '@/src/components/customer/account/DepositDueSection';
import { getCustomerDepositCredit } from '@/src/services/depositCredit';
import { ensureDepositDuePaymentLink } from '@/src/services/depositCollection';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import { getLatestPaymentLinkForResident } from '@/src/services/paymentLinks';
import { listOpenRequestsForCustomer } from '@/src/services/residentRequests';
import { MyRoomPanel } from '@/src/components/customer/account/MyRoomPanel';
import { NotificationCenterPanel } from '@/src/components/customer/account/NotificationCenterPanel';
import { ReferralsPanel } from '@/src/components/customer/account/ReferralsPanel';
import { RequestsHome } from '@/src/components/customer/account/resident/requests/RequestsHome';
import { VacatingHome } from '@/src/components/customer/account/resident/vacating/VacatingHome';
import { requestTypeLabel, type ActiveRequestItem } from '@/src/lib/residents/requestCenter';
import { ResidentConciergeChat } from '@/src/components/customer/account/ResidentConciergeChat';
import { ResidentHubShell } from '@/src/components/customer/account/ResidentHubShell';
import type { ConciergeContext } from '@/src/lib/concierge/answers';
import type { ResidentTab } from '@/src/lib/accountNavigation';
import { listCustomerEmailNotifications } from '@/src/db/queries/customerNotifications';
import { getLatestCheckoutSettlementStatusForCustomer } from '@/src/services/checkoutSettlement';
import { getLatestKycSubmission } from '@/src/services/kyc';
import { buildWalletLedger } from '@/src/lib/residents/walletLedger';
import { ResidentWalletView } from '@/src/components/customer/account/resident/ResidentWalletView';
import { ResidentPaymentsHub } from '@/src/components/customer/account/resident/ResidentPaymentsHub';
import type { PaidHistoryRow } from '@/src/components/customer/account/resident/ResidentPaymentsHub';
import {
  type PaymentDueRow,
} from '@/src/components/customer/account/resident/ResidentPaymentsPanel';
import { ResidentHomePanel } from '@/src/components/customer/account/resident/ResidentHomePanel';
import { ResidentMoreSection } from '@/src/components/customer/account/resident/ResidentMoreSection';
import type { UpcomingPaymentRow } from '@/src/components/customer/account/resident/ResidentUpcomingPayments';

const RENT_STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  overdue: 'bg-rose-50 text-rose-700 ring-rose-200',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

function StatusPill({
  status,
  tones,
}: {
  status: string;
  tones: Record<string, string>;
}) {
  const tone = tones[status] ?? 'bg-zinc-100 text-zinc-700 ring-zinc-200';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {titleCase(status)}
    </span>
  );
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
  const customer = await getCustomerById(session.customerId);
  const depositWallet = await getCustomerDepositCredit(session.customerId);
  const openRequests = await listOpenRequestsForCustomer(session.customerId);
  const emailNotifications = await listCustomerEmailNotifications(session.customerId);
  const notifications = emailNotifications.ok ? emailNotifications.data : [];
  const bookings = await listResidentBookingsForCustomer(session.customerId);
  const tenantActive = await isActiveTenant(session.customerId);
  const ps4Membership = tenantActive ? await getMembershipForDashboard(session.customerId) : null;
  const financialSummary = await getResidentFinancialSummary(session.customerId);
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
      const { getBookingFinancialSummary } = await import('@/src/services/residentFinancialEngine');
      const fin = await getBookingFinancialSummary({
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
      const depositDuePaise = fin.deposit.outstandingPaise;
      const collected = fin.deposit.paidPaise;
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
        depositPaise: fin.deposit.requiredPaise,
        collectedPaise: collected,
        depositDuePaise,
        depositDueDate: d.booking.depositDueDate,
        depositCollectionStatus: d.booking.depositCollectionStatus,
        paymentLinkUrl,
      };
    }),
  );

  const primaryBooking = detail[0];
  const residentBriefing =
    primaryBooking != null
      ? await buildBriefingInputForBooking({
          customerId: session.customerId,
          residentName: session.fullName || customer?.fullName || 'Resident',
          kycLabel: customer?.kycStatus === 'approved' ? 'Verified' : 'Pending',
          booking: {
            bookingId: primaryBooking.bookingId,
            bookingCode: primaryBooking.bookingCode,
            pgName: primaryBooking.booking.pgName,
            durationMode: primaryBooking.booking.durationMode,
            status: 'confirmed',
            expectedCheckoutDate: primaryBooking.booking.expectedCheckoutDate,
            pricingSnapshot: {
              perBed: [{ monthlyRatePaise: primaryBooking.booking.monthlyRentPaise }],
            } as PricingSnapshot,
            reservations: [
              {
                roomNumber: primaryBooking.booking.roomNumber,
                bedCode: primaryBooking.booking.bedCode,
                stayRange: `[${primaryBooking.booking.checkInDate},)`,
              },
            ],
            customerFullName: session.fullName,
          },
        })
      : null;

  const checkoutByBooking = new Map<string, string>();
  for (const d of detail) {
    const status = await getLatestCheckoutSettlementStatusForCustomer(
      session.customerId,
      d.bookingId,
    );
    if (status) checkoutByBooking.set(d.bookingId, status);
  }

  const conciergeContext: ConciergeContext | null =
    primaryBooking && financialSummary
      ? {
          residentName: session.fullName || customer?.fullName || 'Resident',
          pgName: primaryBooking.booking.pgName,
          roomNumber: primaryBooking.booking.roomNumber,
          bedCode: primaryBooking.booking.bedCode,
          rentDuePaise: financialSummary.rent.outstandingPaise,
          electricityDuePaise: financialSummary.electricity.outstandingPaise,
          depositBalancePaise: financialSummary.deposit.refundablePaise,
          depositDuePaise: financialSummary.deposit.outstandingPaise,
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

  let homeUpcoming: UpcomingPaymentRow[] = [];
  let firstUnpaidRentId: string | null = null;
  let firstUnpaidElectricityId: string | null = null;

  if (primaryBooking) {
    const rentRows = primaryBooking.rent.ok ? primaryBooking.rent.data : [];
    const electricityRows = primaryBooking.electricity.ok ? primaryBooking.electricity.data : [];
    const projectedRent = rentRows.map((r) =>
      projectInvoice({
        ...r,
        cancelledAt: null,
        cancellationReason: null,
        customerId: primaryBooking.booking.customerId,
        bedId: '',
        pgId: primaryBooking.booking.pgId,
        paymentId: null,
        paymentProofUrl: null,
        isAdhoc: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const projectedElectricity = electricityRows.map((e) =>
      projectElectricityInvoice({
        id: e.id,
        invoiceNumber: e.invoiceNumber,
        electricityBillId: e.electricityBillId,
        bookingId: e.bookingId,
        customerId: primaryBooking.booking.customerId,
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
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }),
    );

    for (const r of projectedRent) {
      if (r.effectiveStatus === 'pending' || r.effectiveStatus === 'overdue') {
        if (!firstUnpaidRentId) firstUnpaidRentId = r.id;
        homeUpcoming.push({
          key: `rent-${r.id}`,
          label: `Rent · ${formatDate(r.billingMonth)}`,
          amountPaise: r.outstandingPaise,
          dueDate: r.dueDate,
          href: `/account/resident/pay-rent/${r.id}`,
          status: titleCase(r.effectiveStatus),
        });
      }
    }
    projectedElectricity.forEach((p, i) => {
      const e = electricityRows[i];
      if (p.effectiveStatus === 'pending' || p.effectiveStatus === 'overdue') {
        if (!firstUnpaidElectricityId) firstUnpaidElectricityId = e.id;
        homeUpcoming.push({
          key: `elec-${e.id}`,
          label: `Electricity · ${formatDate(e.billingMonth)}`,
          amountPaise: p.outstandingPaise,
          dueDate: e.dueDate,
          href: `/account/resident/pay-electricity/${e.id}`,
          status: titleCase(p.effectiveStatus),
        });
      }
    });
    if (primaryDepositCard && primaryDepositCard.depositDuePaise > 0) {
      homeUpcoming.unshift({
        key: 'deposit-due',
        label: 'Security deposit',
        amountPaise: primaryDepositCard.depositDuePaise,
        dueDate: primaryDepositCard.depositDueDate,
        href: primaryDepositCard.paymentLinkUrl,
        status: titleCase(primaryDepositCard.depositCollectionStatus.replace(/_/g, ' ')),
      });
    }
  }

  const paymentBillRows: PaymentDueRow[] = homeUpcoming.map((r) => ({
    key: r.key,
    label: r.label,
    amountPaise: r.amountPaise,
    dueDate: r.dueDate,
    href: r.href,
    status: r.status,
  }));
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

  const PAID_PURPOSE_LABEL: Record<string, string> = {
    rent: 'Rent payment',
    electricity: 'Electricity payment',
    deposit: 'Security deposit',
    refund: 'Refund received',
    booking: 'Booking payment',
    extension: 'Stay extension',
  };
  const paidHistory: PaidHistoryRow[] =
    paymentHistoryRes?.ok
      ? paymentHistoryRes.data
          .filter((p) => p.status === 'succeeded')
          .slice(0, 8)
          .map((p) => ({
            id: p.id,
            label: PAID_PURPOSE_LABEL[p.purpose] ?? titleCase(p.purpose),
            amountPaise: p.amountPaise,
            paidAt: p.paidAt
              ? formatDate(
                  typeof p.paidAt === 'string' ? p.paidAt : p.paidAt.toISOString().slice(0, 10),
                )
              : null,
            status: 'paid',
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

  return (
    <ResidentHubShell activeTab={activeTab}>
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
        <RequestsHome
          bookingId={primaryBooking.bookingId}
          roomLabel={roomLabel}
          refundableBalancePaise={primaryBooking.deposit?.refundableBalancePaise ?? 0}
          hasDepositDue={hasDepositDue}
          activeRequests={activeRequests}
          selectedRequestId={requestsQuery.requestId ?? null}
          startMake={requestsQuery.make ?? false}
          initialCategory={requestsQuery.category ?? null}
          vacating={primaryVacating}
          bookingStatus={primaryBooking.booking.status}
          durationMode={primaryBooking.booking.durationMode}
          expectedCheckoutDate={primaryBooking.booking.expectedCheckoutDate}
          bookingCreatedAt={primaryBooking.booking.createdAt}
          checkoutSettlementStatus={checkoutByBooking.get(primaryBooking.bookingId) ?? null}
          monthlyRentPaise={primaryBooking.booking.monthlyRentPaise}
        />
      ) : null}

      {activeTab === 'vacating' && primaryBooking ? (
        <VacatingHome
          bookingId={primaryBooking.bookingId}
          bookingCode={primaryBooking.bookingCode}
          roomLabel={roomLabel}
          vacating={primaryVacating}
          checkoutStatus={checkoutByBooking.get(primaryBooking.bookingId) ?? null}
          depositHeldPaise={financialSummary?.deposit.refundablePaise ?? 0}
        />
      ) : null}

      {activeTab === 'home' && primaryBooking && financialSummary && customer ? (
        <ResidentHomePanel
          booking={primaryBooking.booking}
          financialSummary={financialSummary}
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

      {activeTab === 'wallet' && financialSummary && primaryBooking ? (
        <ResidentWalletView
          amountDuePaise={financialSummary.totals.outstandingPaise}
          depositHeldPaise={depositWallet.totalHeldPaise}
          ledgerEntries={walletLedgerEntries}
          firstUnpaidRentId={firstUnpaidRentId}
          firstUnpaidElectricityId={firstUnpaidElectricityId}
          historyHref={historyHref}
        />
      ) : null}

      {activeTab === 'payments' && financialSummary && primaryBooking ? (
        <ResidentPaymentsHub
          billRows={paymentBillRows}
          paidHistory={paidHistory}
          historyHref={historyHref}
        />
      ) : null}

      {activeTab === 'payments' && (
    <section className="space-y-6">

      {activeTab === 'payments' &&
        depositDueCards.map((card) => (
          <DepositDueSection key={`deposit-due-${card.bookingId}`} {...card} />
        ))}

      {bookings.ok === false ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          Couldn&apos;t reach the database.
        </p>
      ) : null}

      {bookings.ok && uniqueBookings.length === 0 ? (
        <div className={`${ACCOUNT_SURFACE} p-8 text-center text-sm text-zinc-600`}>
          <p className="font-medium text-zinc-700">No monthly bookings found.</p>
          <p className="mt-1">
            The resident dashboard only lists monthly + open-ended stays.
          </p>
        </div>
      ) : null}

      {bookings.ok && detail.length > 0
        ? detail.map((d) => {
            const booking = d.booking;
            const rentRows = d.rent.ok ? d.rent.data : [];
            const electricityRows = d.electricity.ok ? d.electricity.data : [];
            const projectedRent = rentRows.map((r) =>
              projectInvoice({
                ...r,
                cancelledAt: null,
                cancellationReason: null,
                customerId: booking.customerId,
                bedId: '',
                pgId: booking.pgId,
                paymentId: null,
                paymentProofUrl: null,
                isAdhoc: false,
                createdAt: new Date(),
                updatedAt: new Date(),
              }),
            );
            const projectedElectricity = electricityRows.map((e) =>
              projectElectricityInvoice({
                id: e.id,
                invoiceNumber: e.invoiceNumber,
                electricityBillId: e.electricityBillId,
                bookingId: e.bookingId,
                customerId: booking.customerId,
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
                createdAt: e.createdAt,
                updatedAt: e.updatedAt,
              }),
            );
            const deposit = d.deposit;
            return (
              <section
                key={d.bookingId}
                className={`${ACCOUNT_SURFACE_PADDED} space-y-4`}
              >
                <header className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900">
                      {booking.pgName} · Room {booking.roomNumber} · Bed{' '}
                      {booking.bedCode}
                    </h2>
                    <p className="text-xs text-zinc-600">
                      Booking{' '}
                      <Link
                        href={`/booking/${booking.bookingCode}`}
                        className={`font-mono font-medium ${ACCOUNT_LINK_IN_SURFACE}`}
                      >
                        {booking.bookingCode}
                      </Link>
                      {' · '}Check-in {formatDate(booking.checkInDate)}
                      {booking.expectedCheckoutDate
                        ? ` · Expected ${formatDate(booking.expectedCheckoutDate)}`
                        : ' · open-ended'}
                      {' · '}Monthly rent {paiseToInr(booking.monthlyRentPaise)}
                    </p>
                  </div>
                </header>

                {(activeTab === 'payments') ? (
                <ResidentMoreSection title="Full bill tables" description="Detailed rent and electricity invoices.">
                <details open={projectedRent.some((r) => r.effectiveStatus !== 'paid')}>
                  <summary className="cursor-pointer text-sm font-medium text-zinc-900">
                    Rent invoices ({projectedRent.length})
                  </summary>
                  <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200">
                    <table className="min-w-full divide-y divide-zinc-200 text-sm">
                      <thead className={ACCOUNT_TABLE_HEAD}>
                        <tr>
                          <th className="px-3 py-2">Invoice</th>
                          <th className="px-3 py-2">Month</th>
                          <th className="px-3 py-2">Due</th>
                          <th className="px-3 py-2">Rent</th>
                          <th className="px-3 py-2">Late fee</th>
                          <th className="px-3 py-2">Total due</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 bg-white">
                        {projectedRent.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="px-3 py-4 text-center text-zinc-500"
                            >
                              No rent invoices yet. They&apos;ll appear on the 1st of each month.
                            </td>
                          </tr>
                        ) : (
                          projectedRent.map((r) => (
                            <tr key={r.id}>
                              <td className="px-3 py-2 font-mono text-xs text-zinc-700">
                                {r.invoiceNumber}
                              </td>
                              <td className="px-3 py-2">
                                {formatDate(r.billingMonth)}
                              </td>
                              <td className="px-3 py-2">{formatDate(r.dueDate)}</td>
                              <td className="px-3 py-2">{paiseToInr(r.rentPaise)}</td>
                              <td className="px-3 py-2">
                                {paiseToInr(r.accruedLateFeePaise)}
                              </td>
                              <td className="px-3 py-2 font-medium">
                                {paiseToInr(r.outstandingPaise)}
                              </td>
                              <td className="px-3 py-2">
                                <StatusPill
                                  status={r.effectiveStatus}
                                  tones={RENT_STATUS_TONE}
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                {r.effectiveStatus === 'pending' ||
                                r.effectiveStatus === 'overdue' ? (
                                  <Link
                                    href={`/account/resident/pay-rent/${r.id}`}
                                    className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                                  >
                                    Pay →
                                  </Link>
                                ) : null}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>

                <details open={projectedElectricity.some((p) => p.effectiveStatus !== 'paid' && p.effectiveStatus !== 'cancelled')}>
                  <summary className="cursor-pointer text-sm font-medium text-zinc-900">
                    Electricity invoices ({electricityRows.length})
                  </summary>
                  <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200">
                    <table className="min-w-full divide-y divide-zinc-200 text-sm">
                      <thead className={ACCOUNT_TABLE_HEAD}>
                        <tr>
                          <th className="px-3 py-2">Invoice</th>
                          <th className="px-3 py-2">Month</th>
                          <th className="px-3 py-2">Due</th>
                          <th className="px-3 py-2">Units</th>
                          <th className="px-3 py-2">Bill total</th>
                          <th className="px-3 py-2">Split</th>
                          <th className="px-3 py-2">Principal</th>
                          <th className="px-3 py-2">Late fee</th>
                          <th className="px-3 py-2">Total due</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 bg-white">
                        {electricityRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={11}
                              className="px-3 py-4 text-center text-zinc-500"
                            >
                              No electricity invoices yet.
                            </td>
                          </tr>
                        ) : (
                          electricityRows.map((e, i) => {
                            const p = projectedElectricity[i];
                            return (
                            <tr key={e.id}>
                              <td className="px-3 py-2 font-mono text-xs text-zinc-700">
                                {e.invoiceNumber}
                              </td>
                              <td className="px-3 py-2">{formatDate(e.billingMonth)}</td>
                              <td className="px-3 py-2">{formatDate(e.dueDate)}</td>
                              <td className="px-3 py-2">{e.unitsConsumed}</td>
                              <td className="px-3 py-2">{paiseToInr(e.totalPaise)}</td>
                              <td className="px-3 py-2">{e.monthlyOccupantCount} ways</td>
                              <td className="px-3 py-2">{paiseToInr(e.amountPaise)}</td>
                              <td className="px-3 py-2">
                                {paiseToInr(p.accruedLateFeePaise)}
                              </td>
                              <td className="px-3 py-2 font-medium">
                                {e.status === 'paid'
                                  ? paiseToInr(e.paidPaise)
                                  : paiseToInr(p.outstandingPaise)}
                              </td>
                              <td className="px-3 py-2">
                                <StatusPill status={p.effectiveStatus} tones={RENT_STATUS_TONE} />
                              </td>
                              <td className="px-3 py-2 text-right">
                                {p.effectiveStatus === 'pending' ||
                                p.effectiveStatus === 'overdue' ? (
                                  <Link
                                    href={`/account/resident/pay-electricity/${e.id}`}
                                    className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                                  >
                                    Pay →
                                  </Link>
                                ) : null}
                              </td>
                            </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>
                </ResidentMoreSection>
                ) : null}
              </section>
            );
          })
        : null}
    </section>
      )}
    </ResidentHubShell>
  );
}
