import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { BookingInvoiceHistorySection } from '@/src/components/admin/bookings/BookingInvoiceHistorySection';
import { CheckoutSettlementWizard } from '@/src/components/admin/checkout/CheckoutSettlementWizard';
import { CheckoutRefundReceiptFromDetail } from '@/src/components/admin/checkout/CheckoutRefundReceipt';
import { DepositActivitySection } from '@/src/components/admin/deposits/DepositActivitySection';
import { DepositSummaryCard } from '@/src/components/admin/deposits/DepositSummaryCard';
import { VacatingRowActions } from '@/src/components/admin/vacating/VacatingRowActions';
import { NoticeDeductionBreakdown } from '@/src/components/shared/NoticeDeductionBreakdown';
import { bookingFinancialWorkspaceSectionHref } from '@/src/lib/bookings/bookingFinancialLinks';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
import type { BookingFinancialWorkspaceData } from '@/src/services/bookingFinancialWorkspace';
import type { BookingMoneyBalances } from '@/src/lib/billing/bookingMoneyBalances';

const NAV_SECTIONS = [
  { id: 'summary', label: 'Summary' },
  { id: 'deposit', label: 'Deposit' },
  { id: 'move-out', label: 'Move-out' },
  { id: 'checkout', label: 'Checkout' },
  { id: 'refund', label: 'Refund' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'activity', label: 'Activity' },
] as const;

export function BookingFinancialWorkspace({ data }: { data: BookingFinancialWorkspaceData }) {
  const activeCheckout =
    data.checkoutDetail &&
    !['completed', 'refund_paid', 'archived'].includes(data.checkoutDetail.status);

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-20 -mx-1 mb-6 border-b border-white/10 bg-[#0F1218]/95 px-1 py-4 backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">
              Checkout &amp; Financial Workspace
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white">
              {data.customerName} · {data.bookingCode}
            </h1>
            <p className="mt-1 text-sm text-apg-silver">
              {data.pgName} · Room {data.roomNumber} · {data.bedCode}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={toneForStatus(data.bookingStatus)}>
              {titleCase(data.bookingStatus.replace(/_/g, ' '))}
            </Badge>
            {data.depositCollectionStatus === 'closed_uncollected' ? (
              <Badge tone="zinc">Deposit closed · uncollected</Badge>
            ) : null}
            <Link
              href={`/admin/bookings/${data.bookingId}`}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/5"
            >
              Booking detail
            </Link>
            <Link
              href={`/admin/residents/${data.customerId}`}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/5"
            >
              Resident profile
            </Link>
          </div>
        </div>
        <nav className="mt-4 flex flex-wrap gap-2">
          {NAV_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={bookingFinancialWorkspaceSectionHref(data.bookingId, section.id)}
              className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-apg-silver hover:border-[#FF5A1F]/40 hover:text-white"
            >
              {section.label}
            </a>
          ))}
        </nav>
      </header>

      <section id="summary" className="scroll-mt-28 space-y-4">
        <SectionHeading title="Required / Received / Outstanding" />
        <MoneyBalancesGrid balances={data.moneyBalances} />
      </section>

      <section id="deposit" className="scroll-mt-28 mt-10 space-y-4">
        <SectionHeading title="Deposit wallet" />
        {data.depositPage.walletProps ? (
          <DepositSummaryCard
            view={data.depositPage.walletProps.view}
            invoiceStatus={
              data.depositCollectionStatus === 'closed_uncollected'
                ? 'Closed · uncollected'
                : data.depositPage.invoice?.displayStatus ??
                  data.depositPage.invoice?.invoiceStatus ??
                  null
            }
            isFrozen={data.depositPage.isFrozen}
          />
        ) : null}
        <p className="text-sm text-apg-silver">
          <Link
            href={`/admin/deposits/${data.bookingId}`}
            className="font-medium text-[#FF5A1F] hover:underline"
          >
            Open deposit detail →
          </Link>
        </p>
      </section>

      <section id="move-out" className="scroll-mt-28 mt-10 space-y-4">
        <SectionHeading title="Move-out" />
        {data.vacating ? (
          <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-apg-silver">
                  Notice from {formatDate(data.vacating.noticeGivenDate)} · leaves{' '}
                  {formatDate(data.vacating.vacatingDate)}
                </p>
                <p className="mt-1 text-sm text-white">
                  Status:{' '}
                  <span className="font-medium">{titleCase(data.vacating.status)}</span>
                  {data.vacating.noticeCompliant ? ' · notice compliant' : ' · notice shortfall'}
                </p>
                {data.vacating.approvalPreview?.noticeBreakdown ? (
                  <div className="mt-4 max-w-md">
                    <NoticeDeductionBreakdown
                      breakdown={data.vacating.approvalPreview.noticeBreakdown}
                      variant="admin"
                      compact
                    />
                  </div>
                ) : null}
                {data.vacating.approvalPreview ? (
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <MiniStat
                      label="Deposit held"
                      value={paiseToInr(data.vacating.approvalPreview.depositHeldPaise)}
                    />
                    <MiniStat
                      label="Est. notice fee"
                      value={paiseToInr(data.vacating.approvalPreview.estimatedDeductionPaise)}
                    />
                    <MiniStat
                      label="Est. refund"
                      value={paiseToInr(data.vacating.approvalPreview.estimatedRefundPaise)}
                    />
                    <MiniStat label="Bed" value={data.vacating.approvalPreview.bedStatus} />
                  </dl>
                ) : null}
              </div>
              <VacatingRowActions
                requestId={data.vacating.id}
                status={data.vacating.status}
                settlementHref={data.settlementHref}
                depositHeldPaise={data.moneyBalances.deposit.receivedPaise}
                approvalPreview={data.vacating.approvalPreview ?? undefined}
              />
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-3 text-sm text-apg-silver">
            No move-out notice on this booking.
          </p>
        )}
      </section>

      <section id="checkout" className="scroll-mt-28 mt-10 space-y-4">
        <SectionHeading title="Checkout settlement" />
        {activeCheckout && data.checkoutDetail ? (
          <CheckoutSettlementWizard detail={data.checkoutDetail} />
        ) : data.checkoutDetail ? (
          <div className="space-y-4">
            <p className="text-sm text-apg-silver">
              Settlement {titleCase(data.checkoutDetail.status.replace(/_/g, ' '))} · final refund{' '}
              {paiseToInr(data.checkoutDetail.preview.finalRefundPaise)}
            </p>
            <CheckoutRefundReceiptFromDetail detail={data.checkoutDetail} />
          </div>
        ) : (
          <p className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-3 text-sm text-apg-silver">
            Checkout settlement opens after move-out is approved and the resident submits refund
            details.
          </p>
        )}
      </section>

      <section id="refund" className="scroll-mt-28 mt-10 space-y-4">
        <SectionHeading title="Refund" />
        <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <MiniStat
              label="Refundable (ledger)"
              value={paiseToInr(data.moneyBalances.deposit.refundablePaise ?? 0)}
            />
            <MiniStat
              label="Received deposit"
              value={paiseToInr(data.moneyBalances.deposit.receivedPaise)}
            />
            <MiniStat
              label="Required deposit"
              value={paiseToInr(data.moneyBalances.deposit.requiredPaise)}
            />
          </dl>
          <Link
            href={refundConsoleHref(data.bookingId)}
            className="mt-4 inline-flex text-sm font-semibold text-[#FF5A1F] hover:underline"
          >
            Open Refund Console →
          </Link>
        </div>
      </section>

      <section id="invoices" className="scroll-mt-28 mt-10 space-y-4">
        <SectionHeading title="Rent & electricity invoices" />
        {data.rentInvoices.ok && data.electricityInvoices.ok ? (
          <BookingInvoiceHistorySection
            residentId={data.customerId}
            residentName={data.customerName}
            rentInvoices={data.rentInvoices.data}
            electricityInvoices={data.electricityInvoices.data}
            rentInvoiceHrefMap={data.rentInvoiceHrefMap}
          />
        ) : (
          <p className="text-sm text-apg-silver">Could not load invoice history.</p>
        )}
      </section>

      <section id="activity" className="scroll-mt-28 mt-10 space-y-4">
        <SectionHeading title="Deposit activity" />
        {data.depositPage.summary ? (
          <DepositActivitySection bookingId={data.bookingId} />
        ) : (
          <p className="text-sm text-apg-silver">No deposit ledger entries yet.</p>
        )}
      </section>
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return <h2 className="text-lg font-semibold text-white">{title}</h2>;
}

function MoneyBalancesGrid({ balances }: { balances: BookingMoneyBalances }) {
  const rows = [
    { label: 'Rent', slice: balances.rent },
    { label: 'Deposit', slice: balances.deposit },
    { label: 'Electricity', slice: balances.electricity },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#1A1F27]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/10 bg-white/[0.03]">
          <tr>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
              Category
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
              Required
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
              Received
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
              Outstanding
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-white/5 last:border-0">
              <td className="px-4 py-3 font-medium text-white">{row.label}</td>
              <td className="px-4 py-3 text-right text-white">{paiseToInr(row.slice.requiredPaise)}</td>
              <td className="px-4 py-3 text-right text-emerald-300">
                {paiseToInr(row.slice.receivedPaise)}
              </td>
              <td className="px-4 py-3 text-right text-amber-200">
                {paiseToInr(row.slice.outstandingPaise)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#12161C] p-3">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}
