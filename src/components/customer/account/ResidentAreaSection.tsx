import Link from 'next/link';
import {
  getVacatingForBooking,
  listElectricityInvoicesForBooking,
  listRentInvoicesForBooking,
  listResidentBookingsForCustomer,
  type ResidentBookingRow,
} from '@/src/db/queries/customer';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { projectInvoice } from '@/src/services/rentInvoices';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { getCustomerSession } from '@/src/lib/auth/session';
import { getCustomerById } from '@/src/services/profile';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { DepositRefundNotice } from '@/src/components/customer/DepositRefundNotice';
import { CancelVacatingForm } from '@/src/components/customer/CancelVacatingForm';
import { MyServicesPanel } from '@/src/components/customer/MyServicesPanel';
import {
  ACCOUNT_LINK_IN_SURFACE,
  ACCOUNT_LINK_ON_DARK,
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
import {
  labelAdminDepositRefundStatus,
  labelAdminDuesStatus,
} from '@/src/lib/bookingAdminOpsLabels';
import { RoachieResidentBriefing } from '@/src/components/cockroach/RoachieResidentBriefing';
import { buildBriefingInputForBooking } from '@/src/lib/cockroach/briefingFromBooking';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { accountProfileHref } from '@/src/lib/accountNavigation';
import { DepositWalletSection } from '@/src/components/customer/account/DepositWalletSection';
import { ResidentRequestForms } from '@/src/components/customer/account/ResidentRequestForms';
import { getCustomerDepositCredit } from '@/src/services/depositCredit';
import { listOpenRequestsForCustomer } from '@/src/services/residentRequests';

const RENT_STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  overdue: 'bg-rose-50 text-rose-700 ring-rose-200',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

const VACATING_TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
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
export async function ResidentAreaSection({ customerId }: { customerId: string }) {
  const session = await getCustomerSession();
  if (!session || session.customerId !== customerId) {
    return null;
  }
  const customer = await getCustomerById(session.customerId);
  const depositWallet = await getCustomerDepositCredit(session.customerId);
  const openRequests = await listOpenRequestsForCustomer(session.customerId);
  const bookings = await listResidentBookingsForCustomer(session.customerId);
  const tenantActive = await isActiveTenant(session.customerId);
  const ps4Membership = tenantActive ? await getMembershipForDashboard(session.customerId) : null;
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

  return (
    <section className="mt-6 space-y-6">
      {residentBriefing ? (
        <RoachieResidentBriefing
          sessionKey="resident-dashboard-briefing-v1"
          {...residentBriefing}
        />
      ) : null}

      <p className="text-sm text-apg-silver">
        Monthly and open-ended stays — rent, electricity, deposit, and vacating. Short stays stay
        under{' '}
        <Link className={ACCOUNT_LINK_ON_DARK} href="/account/bookings">
          My bookings
        </Link>
        . Complete identity verification under{' '}
        <Link className={ACCOUNT_LINK_ON_DARK} href={accountProfileHref('identity')}>
          Identity (KYC)
        </Link>
        .
      </p>

      <DepositRefundNotice />

      {depositWallet.totalCollectedPaise > 0 ? (
        <DepositWalletSection wallet={depositWallet} />
      ) : null}

      <MyServicesPanel membership={ps4Membership} isActiveTenant={tenantActive} />

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
                createdAt: new Date(),
                updatedAt: new Date(),
              }),
            );
            const totalRentOutstanding = projectedRent.reduce(
              (acc, r) => acc + r.outstandingPaise,
              0,
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
            const totalElectricityOutstanding = projectedElectricity.reduce(
              (acc, p) => acc + p.outstandingPaise,
              0,
            );
            const lateFees =
              projectedRent.reduce((acc, r) => acc + r.accruedLateFeePaise, 0) +
              projectedElectricity.reduce(
                (acc, p) => acc + p.accruedLateFeePaise,
                0,
              );
            const deposit = d.deposit;
            const vacating = d.vacating.ok ? d.vacating.data : null;
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

                {/* Top-line summary */}
                <div className="grid gap-3 sm:grid-cols-4">
                  <Card label="Rent due" value={paiseToInr(totalRentOutstanding)} />
                  <Card label="Electricity due" value={paiseToInr(totalElectricityOutstanding)} />
                  <Card label="Late fees" value={paiseToInr(lateFees)} />
                  <Card
                    label="Deposit balance"
                    value={paiseToInr(deposit?.refundableBalancePaise ?? 0)}
                  />
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700 ring-1 ring-zinc-200">
                    {labelAdminDuesStatus(booking.adminDuesStatus)}
                  </span>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-800 ring-1 ring-indigo-200">
                    {labelAdminDepositRefundStatus(booking.adminDepositRefundStatus)}
                  </span>
                  {totalRentOutstanding + totalElectricityOutstanding + lateFees === 0 &&
                  booking.adminDuesStatus === 'unknown' ? (
                    <span className="text-zinc-600">No open invoices in the system.</span>
                  ) : null}
                </div>

                <ResidentRequestForms
                  bookingId={d.bookingId}
                  refundableBalancePaise={deposit?.refundableBalancePaise ?? 0}
                  hasOpenVacating={Boolean(vacating && ['pending', 'approved'].includes(vacating.status))}
                />

                {openRequests.filter((r) => r.bookingId === d.bookingId).length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <p className="font-semibold">Open requests</p>
                    <ul className="mt-1 list-inside list-disc">
                      {openRequests
                        .filter((r) => r.bookingId === d.bookingId)
                        .map((r) => (
                          <li key={r.id}>
                            {r.type === 'deposit_refund' ? 'Deposit refund' : 'Stay extension'} —{' '}
                            {r.status.replace('_', ' ')}
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2 text-xs">
                  <Link
                    href={`/account/resident/history/${d.bookingId}`}
                    className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-2.5 py-1 font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Payment history →
                  </Link>
                </div>

                {d.roomElectricity?.latestBill ? (
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm">
                    <h3 className="font-medium text-indigo-900">Room electricity (Room {booking.roomNumber})</h3>
                    {d.roomElectricity.latestBill.isEstimated ? (
                      <p className="mt-1 text-xs text-amber-800">
                        Estimated bill (pending meter update)
                      </p>
                    ) : null}
                    <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-indigo-700">Room consumption</dt>
                        <dd className="font-semibold text-zinc-900">
                          {d.roomElectricity.latestBill.unitsConsumed} units ·{' '}
                          {paiseToInr(d.roomElectricity.latestBill.totalPaise)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-indigo-700">Meter readings</dt>
                        <dd className="font-semibold text-zinc-900">
                          {d.roomElectricity.latestBill.previousReadingUnits} →{' '}
                          {d.roomElectricity.latestBill.currentReadingUnits}
                        </dd>
                      </div>
                    </dl>
                    {d.roomElectricity.invoices.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs text-indigo-800">
                        {d.roomElectricity.invoices.map((inv) => (
                          <li key={inv.id}>
                            Share {inv.unitsShare ?? '—'} units · {paiseToInr(inv.amountPaise)} ·{' '}
                            {inv.status}
                            {inv.paymentProofUrl && inv.status === 'pending'
                              ? ' · proof submitted'
                              : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {/* Rent invoices */}
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

                {/* Electricity invoices */}
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

                {/* Deposit ledger */}
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-zinc-900">
                    Deposit ledger ({deposit?.entries.length ?? 0} entries)
                  </summary>
                  <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200">
                    <table className="min-w-full divide-y divide-zinc-200 text-sm">
                      <thead className={ACCOUNT_TABLE_HEAD}>
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Reason</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 bg-white">
                        {(deposit?.entries.length ?? 0) === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-4 text-center text-zinc-500">
                              No deposit entries yet.
                            </td>
                          </tr>
                        ) : (
                          deposit?.entries.map((entry) => (
                            <tr key={entry.id}>
                              <td className="px-3 py-2 text-xs">
                                {formatDate(entry.createdAt)}
                              </td>
                              <td className="px-3 py-2">{titleCase(entry.entryKind)}</td>
                              <td className="px-3 py-2 text-xs text-zinc-600">
                                {entry.reason}
                              </td>
                              <td className="px-3 py-2 text-right font-medium">
                                {paiseToInr(entry.amountPaise)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>

                {/* Vacating */}
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-medium text-zinc-900">Vacating</h3>
                    {vacating ? (
                      <StatusPill status={vacating.status} tones={VACATING_TONE} />
                    ) : (
                      <span className="text-xs font-medium text-zinc-600">No request on file</span>
                    )}
                  </div>
                  {vacating ? (
                    <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-zinc-600">Notice given</dt>
                        <dd className="font-semibold text-zinc-900">
                          {formatDate(vacating.noticeGivenDate)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-600">Vacating date</dt>
                        <dd className="font-semibold text-zinc-900">{formatDate(vacating.vacatingDate)}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-600">Notice ≥ 14 days?</dt>
                        <dd className="font-semibold text-zinc-900">
                          {vacating.noticeCompliant ? 'Yes — no deduction' : 'No — 5-day penalty applies'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-600">Deposit deduction</dt>
                        <dd className="font-semibold text-zinc-900">
                          {paiseToInr(vacating.deductionPaise)}
                        </dd>
                      </div>
                      {vacating.status === 'completed' ? (
                        <div>
                          <dt className="text-zinc-600">Refund issued</dt>
                          <dd className="font-semibold text-zinc-900">
                            {paiseToInr(vacating.depositRefundPaise)}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                  {vacating?.status === 'pending' ? (
                    <CancelVacatingForm
                      requestId={vacating.id}
                      bookingId={d.bookingId}
                    />
                  ) : null}
                  {!vacating ? (
                    <Link
                      href={`/account/resident/request-vacating/${d.bookingId}`}
                      className={`mt-3 ${ACCOUNT_SURFACE_PRIMARY_BTN} px-3 py-1.5 text-xs`}
                    >
                      Submit vacating request →
                    </Link>
                  ) : null}
                </div>
              </section>
            );
          })
        : null}
    </section>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
