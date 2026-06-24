import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import {
  AdminCancelForm,
  RecordOfflinePaymentForm,
} from '@/src/components/admin/AdminBookingActions';
import { AdminBookingOpsPanel } from '@/src/components/admin/AdminBookingOpsPanel';
import {
  AdminCancelExtensionForm,
  AdminRecordOfflineExtensionPaymentForm,
  AdminRequestExtensionForm,
} from '@/src/components/admin/AdminExtensionActions';
import { getAdminBookingDetail } from '@/src/db/queries/admin';
import {
  listElectricityInvoicesForBooking,
  listRentInvoicesForBooking,
} from '@/src/db/queries/customer';
import { formatDate, formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import { adminStayTypeLabel, isMonthlyStayType } from '@/src/lib/stayType';
import { allocateBookingCheckoutPayment } from '@/src/lib/billing/bookingPaymentAllocation';
import { buildAdminInvoiceHrefMap } from '@/src/lib/billing/invoiceHrefMap';
import { diffDays, parseDate } from '@/src/lib/dates';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { parseDaterange } from '@/src/services/availability';
import { projectInvoice } from '@/src/services/rentInvoices';
import { formatDate as formatDateIso } from '@/src/lib/dates';
import { DepositRefundNotice } from '@/src/components/customer/DepositRefundNotice';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminBookingDetailPage(
  props: PageProps<'/admin/bookings/[bookingId]'>,
) {
  const { bookingId } = await props.params;
  if (!UUID_RE.test(bookingId)) notFound();

  const res = await getAdminBookingDetail(bookingId);
  if (!res.ok) {
    return (
      <>
        <PageHeader title="Booking" />
        <DbStatusBanner error={res.error} />
      </>
    );
  }
  if (!res.data) notFound();

  const b = res.data;
  const [rentInvoices, electricityInvoices, depositSummary] = await Promise.all([
    listRentInvoicesForBooking(bookingId),
    listElectricityInvoicesForBooking(bookingId),
    getDepositSummaryForBooking(bookingId),
  ]);
  const rentInvoiceHrefMap =
    rentInvoices.ok && rentInvoices.data.length > 0
      ? await buildAdminInvoiceHrefMap(
          rentInvoices.data.map((inv) => ({
            sourceTable: 'rent_invoices' as const,
            sourceId: inv.id,
          })),
        )
      : ({} as Record<string, string>);
  const bookingCheckout = {
    subtotalPaise: b.subtotalPaise,
    discountPaise: b.discountPaise,
    depositPaise: b.depositPaise,
    totalPaise: b.totalPaise,
    pricingSnapshot: b.pricingSnapshot,
  };
  const succeededBookingPayments = b.payments.filter(
    (p) => p.status === 'succeeded' && p.purpose === 'booking',
  );
  const computedRentDues =
    rentInvoices.ok === true
      ? rentInvoices.data.reduce((acc, inv) => {
          const p = projectInvoice({
            ...inv,
            customerId: b.customer.id,
            bedId: b.reservations[0]?.bedId ?? '',
            pgId: '',
            paymentId: null,
            paymentProofUrl: null,
            cancelledAt: null,
            cancellationReason: null,
            isAdhoc: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          return acc + p.outstandingPaise;
        }, 0)
      : 0;
  const computedElectricityDues =
    electricityInvoices.ok === true
      ? electricityInvoices.data.reduce((acc, inv) => {
          const p = projectElectricityInvoice({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            electricityBillId: inv.electricityBillId,
            bookingId: inv.bookingId,
            customerId: b.customer.id,
            bedId: '',
            billingMonth: inv.billingMonth,
            dueDate: inv.dueDate,
            amountPaise: inv.amountPaise,
            paidPaise: inv.paidPaise,
            lateFeeLockedPaise: inv.lateFeeLockedPaise,
            status: inv.status,
            paymentId: null,
            paidAt: inv.paidAt,
            paymentProofUrl: null,
            unitsShare: null,
            activeDays: null,
            cancelledAt: null,
            createdAt: inv.createdAt,
            updatedAt: inv.updatedAt,
          });
          return acc + p.outstandingPaise;
        }, 0)
      : 0;
  const computedDuesPaise = computedRentDues + computedElectricityDues;
  const depositBalancePaise = depositSummary?.refundableBalancePaise ?? 0;
  const uniqueBeds = Array.from(
    new Map(
      b.reservations.map((r) => [
        r.bedId,
        {
          bedId: r.bedId,
          bedCode: r.bedCode,
          reservationStatus: r.status,
          bedInventoryStatus: r.bedInventoryStatus,
        },
      ]),
    ).values(),
  );
  const totalCollected = b.payments
    .filter((p) => p.status === 'succeeded' && p.purpose === 'booking')
    .reduce((acc, p) => acc + p.amountPaise, 0);
  const totalRefunded = b.payments
    .filter((p) => p.purpose === 'refund')
    .reduce((acc, p) => acc + Math.abs(p.amountPaise), 0);
  const netCollected = totalCollected - totalRefunded;
  const stillDue = Math.max(0, b.totalPaise - netCollected);

  const canCancel =
    b.status === 'pending_payment' || b.status === 'confirmed';
  const canRecordPayment = b.status === 'pending_payment' || b.status === 'confirmed';
  // Phase 5 — extension CTA: only confirmed bookings with a finite checkout.
  const canExtend =
    b.status === 'confirmed' &&
    b.expectedCheckoutDate != null &&
    b.durationMode !== 'open_ended';

  return (
    <>
      <PageHeader
        title={`${b.customer.fullName} · ${b.bookingCode}`}
        description={
          <span>
            <Link href="/admin/bookings" className="text-indigo-600 hover:underline">
              ← All bookings
            </Link>
            <span className="mx-2 text-zinc-300">·</span>
            <Link
              href={`/admin/residents/${b.customer.id}`}
              className="text-indigo-600 hover:underline"
            >
              {b.customer.fullName}
            </Link>
            <span className="mx-2 text-zinc-300">·</span>
            Customer link:{' '}
            <Link
              href={`/booking/${b.bookingCode}`}
              className="text-indigo-600 hover:underline"
              target="_blank"
            >
              /booking/{b.bookingCode}
            </Link>
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-5">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Status</h2>
              <Badge tone={toneForStatus(b.status)}>{titleCase(b.status)}</Badge>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-zinc-500">Created</dt>
              <dd className="text-right text-zinc-900">{formatDateTime(b.createdAt)}</dd>
              <dt className="text-zinc-500">Channel</dt>
              <dd className="text-right text-zinc-900">{titleCase(b.createdVia)}</dd>
              <dt className="text-zinc-500">Stay type</dt>
              <dd className="text-right text-zinc-900">
                {adminStayTypeLabel({ stayType: b.stayType, durationMode: b.durationMode })}
              </dd>
              <dt className="text-zinc-500">Duration mode</dt>
              <dd className="text-right text-zinc-900">{titleCase(b.durationMode)}</dd>
              {isMonthlyStayType(b.stayType ?? b.durationMode) ? null : (
                <>
                  <dt className="text-zinc-500">Stay nights</dt>
                  <dd className="text-right text-zinc-900">
                    {b.expectedCheckoutDate && b.reservations[0]
                      ? (() => {
                          const range = parseDaterange(b.reservations[0]!.stayRange);
                          const checkIn = range.lower;
                          if (!checkIn || !b.expectedCheckoutDate) return '—';
                          const nights = diffDays(parseDate(checkIn), parseDate(b.expectedCheckoutDate));
                          return `${nights} night${nights === 1 ? '' : 's'}`;
                        })()
                      : '—'}
                  </dd>
                </>
              )}
              <dt className="text-zinc-500">Expected check-out</dt>
              <dd className="text-right text-zinc-900">{formatDate(b.expectedCheckoutDate)}</dd>
              {b.cancelledAt ? (
                <>
                  <dt className="text-zinc-500">Cancelled at</dt>
                  <dd className="text-right text-zinc-900">{formatDateTime(b.cancelledAt)}</dd>
                  <dt className="text-zinc-500">Reason</dt>
                  <dd className="text-right text-zinc-900">{b.cancellationReason ?? '—'}</dd>
                </>
              ) : null}
            </dl>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Reservations</h2>
            <Table>
              <THead>
                <TR>
                  <TH>PG</TH>
                  <TH>Bed</TH>
                  <TH>Kind</TH>
                  <TH>Stay</TH>
                  <TH>Status</TH>
                  <TH>Hold expires</TH>
                </TR>
              </THead>
              <TBody>
                {b.reservations.map((r) => {
                  const range = parseDaterange(r.stayRange);
                  return (
                    <TR key={r.id}>
                      <TD className="text-zinc-700">{r.pgName}</TD>
                      <TD className="font-mono">
                        {r.bedCode}{' '}
                        <span className="text-xs text-zinc-500">
                          (Room {r.roomNumber} · {r.floorLabel})
                        </span>
                      </TD>
                      <TD>
                        <Badge
                          tone={r.kind === 'extension' ? 'violet' : 'zinc'}
                        >
                          {titleCase(r.kind)}
                        </Badge>
                      </TD>
                      <TD className="text-xs">
                        {range.lower ? formatDateIso(range.lower) : '—'} →{' '}
                        {range.upper ? formatDateIso(range.upper) : '—'}
                      </TD>
                      <TD>
                        <Badge tone={toneForStatus(r.status)}>{titleCase(r.status)}</Badge>
                      </TD>
                      <TD className="text-xs text-zinc-500">
                        {r.holdExpiresAt ? formatDateTime(r.holdExpiresAt) : '—'}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>

          {/* Phase 5 — extensions card */}
          {b.extensions.length > 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">Stay extensions</h2>
              <Table>
                <THead>
                  <TR>
                    <TH>Requested</TH>
                    <TH>Until</TH>
                    <TH>Mode</TH>
                    <TH>Beds</TH>
                    <TH>By</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {b.extensions.map((e) => (
                    <TR key={e.id}>
                      <TD className="text-xs text-zinc-700">{formatDateTime(e.createdAt)}</TD>
                      <TD className="text-xs">{formatDate(e.requestedUntilDate)}</TD>
                      <TD>{titleCase(e.extensionDurationMode)}</TD>
                      <TD>{e.bedCount}</TD>
                      <TD className="text-xs text-zinc-600">{titleCase(e.requestedBy)}</TD>
                      <TD>
                        <Badge tone={toneForStatus(e.status)}>{titleCase(e.status)}</Badge>
                      </TD>
                      <TD className="text-right tabular-nums">
                        {paiseToInr(e.quotedTotalPaise)}
                      </TD>
                      <TD>
                        {e.status === 'pending' ? (
                          <div className="space-y-2">
                            <AdminRecordOfflineExtensionPaymentForm
                              extensionId={e.id}
                              amountPaise={e.quotedTotalPaise}
                            />
                            <AdminCancelExtensionForm extensionId={e.id} />
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          ) : null}

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Payments ledger</h2>
            {b.payments.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No payments recorded yet.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH>Purpose</TH>
                    <TH>Provider</TH>
                    <TH>Reference</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {b.payments.map((p) => (
                    <TR key={p.id}>
                      <TD className="text-xs text-zinc-700">
                        {formatDateTime(p.paidAt ?? p.createdAt)}
                      </TD>
                      <TD>{titleCase(p.purpose)}</TD>
                      <TD>{titleCase(p.provider)}</TD>
                      <TD className="font-mono text-[11px] text-zinc-500">
                        {p.providerPaymentId ?? '—'}
                      </TD>
                      <TD>
                        <Badge tone={toneForStatus(p.status)}>{titleCase(p.status)}</Badge>
                      </TD>
                      <TD
                        className={`text-right tabular-nums ${
                          p.amountPaise < 0 ? 'text-rose-700' : 'text-zinc-900'
                        }`}
                      >
                        {paiseToInr(p.amountPaise)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-zinc-500">Booking total</dt>
              <dd className="text-right text-zinc-900 tabular-nums">{paiseToInr(b.totalPaise)}</dd>
              <dt className="text-zinc-500">Collected (succeeded)</dt>
              <dd className="text-right text-zinc-900 tabular-nums">{paiseToInr(totalCollected)}</dd>
              <dt className="text-zinc-500">Refunded</dt>
              <dd className="text-right text-rose-700 tabular-nums">−{paiseToInr(totalRefunded)}</dd>
              <dt className="text-zinc-500">Net collected</dt>
              <dd className="text-right text-zinc-900 tabular-nums font-semibold">
                {paiseToInr(netCollected)}
              </dd>
              <dt className="text-zinc-500">Still due</dt>
              <dd className="text-right text-zinc-900 tabular-nums font-semibold">
                {paiseToInr(stillDue)}
              </dd>
            </dl>
          </div>

          {succeededBookingPayments.length > 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">Checkout payment allocation</h2>
              <p className="mt-1 text-xs text-zinc-500">
                How each succeeded booking payment is split into rent, deposit cash, and prior balances.
              </p>
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH className="text-right">Total</TH>
                    <TH className="text-right">Rent</TH>
                    <TH className="text-right">Deposit cash</TH>
                    <TH className="text-right">Prior deposit</TH>
                    <TH className="text-right">Transfer credit</TH>
                  </TR>
                </THead>
                <TBody>
                  {succeededBookingPayments.map((p) => {
                    const allocation = allocateBookingCheckoutPayment(
                      bookingCheckout,
                      p.amountPaise,
                    );
                    return (
                      <TR key={p.id}>
                        <TD className="text-xs text-zinc-700">
                          {formatDateTime(p.paidAt ?? p.createdAt)}
                        </TD>
                        <TD className="text-right tabular-nums">{paiseToInr(p.amountPaise)}</TD>
                        <TD className="text-right tabular-nums">{paiseToInr(allocation.rentPaise)}</TD>
                        <TD className="text-right tabular-nums">
                          {paiseToInr(allocation.depositCashPaise)}
                        </TD>
                        <TD className="text-right tabular-nums">
                          {paiseToInr(allocation.priorOutstandingPaise)}
                        </TD>
                        <TD className="text-right tabular-nums text-zinc-500">
                          {allocation.depositTransferCreditPaise > 0
                            ? paiseToInr(allocation.depositTransferCreditPaise)
                            : '—'}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          ) : null}

          {rentInvoices.ok && rentInvoices.data.length > 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">Rent invoices</h2>
              <Table>
                <THead>
                  <TR>
                    <TH>Invoice #</TH>
                    <TH>Period</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Rent</TH>
                    <TH className="text-right">Paid</TH>
                  </TR>
                </THead>
                <TBody>
                  {rentInvoices.data.map((inv) => {
                    const href = rentInvoiceHrefMap[inv.id];
                    return (
                      <TR key={inv.id}>
                        <TD className="font-mono text-sm">
                          {href ? (
                            <Link href={href} className="text-indigo-600 hover:underline">
                              {inv.invoiceNumber}
                            </Link>
                          ) : (
                            inv.invoiceNumber
                          )}
                        </TD>
                        <TD className="text-xs text-zinc-600">{inv.billingMonth.slice(0, 7)}</TD>
                        <TD>
                          <Badge tone={toneForStatus(inv.status)}>{titleCase(inv.status)}</Badge>
                        </TD>
                        <TD className="text-right tabular-nums">{paiseToInr(inv.rentPaise)}</TD>
                        <TD className="text-right tabular-nums">
                          {paiseToInr(inv.paidPrincipalPaise + inv.paidLateFeePaise)}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          ) : null}
        </section>

        <aside className="space-y-5">
          <AdminBookingOpsPanel
            bookingId={b.id}
            adminDuesStatus={b.adminDuesStatus}
            adminDepositRefundStatus={b.adminDepositRefundStatus}
            adminOpsNotes={b.adminOpsNotes}
            computedDuesPaise={computedDuesPaise}
            depositBalancePaise={depositBalancePaise}
            beds={uniqueBeds}
          />

          <DepositRefundNotice variant="compact" />

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Customer</h2>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Name</dt>
                <dd className="text-zinc-900">{b.customer.fullName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Email</dt>
                <dd className="text-zinc-900">{b.customer.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Phone</dt>
                <dd className="text-zinc-900">{b.customer.phone}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Gender</dt>
                <dd className="text-zinc-900">{titleCase(b.customer.gender)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-col gap-2 border-t border-zinc-100 pt-3">
              <Link
                href={`/admin/residents/${b.customer.id}`}
                className="text-sm font-semibold text-[#FF5A1F] hover:underline"
              >
                Open resident profile →
              </Link>
              <Link
                href={`/admin/deposits/${b.id}`}
                className="text-sm font-medium text-indigo-600 hover:underline"
              >
                Deposit ledger →
              </Link>
            </div>
          </div>

          {canRecordPayment ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">Record offline payment</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Cash / UPI / bank transfer. Writes a <code>payments</code> row
                and flips the booking to confirmed if it was still
                pending_payment.
              </p>
              <div className="mt-3">
                <RecordOfflinePaymentForm
                  bookingCode={b.bookingCode}
                  defaultAmountRupees={Math.max(1, Math.round(stillDue / 100) || Math.round(b.totalPaise / 100))}
                />
              </div>
            </div>
          ) : null}

          {canExtend && b.expectedCheckoutDate ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">Request extension</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Reserves additional beds for the same booking. Admins skip
                the phone-gate; the new extension lands in{' '}
                <Link href="/admin/extensions" className="text-indigo-600 hover:underline">
                  /admin/extensions
                </Link>{' '}
                as <code>pending</code> until payment is recorded.
              </p>
              <div className="mt-3">
                <AdminRequestExtensionForm
                  bookingCode={b.bookingCode}
                  currentCheckout={b.expectedCheckoutDate}
                />
              </div>
            </div>
          ) : null}

          {canCancel ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">Cancel booking</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Refund tier is computed from the cancellation policy
                snapshotted at booking time vs. the earliest check-in date.
              </p>
              <div className="mt-3">
                <AdminCancelForm bookingCode={b.bookingCode} />
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}
