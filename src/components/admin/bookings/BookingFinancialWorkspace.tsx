import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { BookingInvoiceHistorySection } from '@/src/components/admin/bookings/BookingInvoiceHistorySection';
import { CheckoutSettlementWizard } from '@/src/components/admin/checkout/CheckoutSettlementWizard';
import { CheckoutRefundReceiptFromDetail } from '@/src/components/admin/checkout/CheckoutRefundReceipt';
import { DepositActivitySection } from '@/src/components/admin/deposits/DepositActivitySection';
import { DepositSummaryCard } from '@/src/components/admin/deposits/DepositSummaryCard';
import { SettlementStatementDocument } from '@/src/components/billing/SettlementStatementDocument';
import { VacatingDateChangeApprovalPanel } from '@/src/components/admin/vacating/VacatingDateChangeApprovalPanel';
import { bookingFinancialWorkspaceSectionHref } from '@/src/lib/bookings/bookingFinancialLinks';
import { settlementStatementPageHref } from '@/src/lib/billing/settlementStatementPdfLinks';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { moveOutWorkflowWaitingOnLabel } from '@/src/lib/moveOut/moveOutWorkflowStages';
import { vacatingWorkflowHref } from '@/src/lib/residents/commandCenterLinks';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
import type { BookingFinancialWorkspaceData } from '@/src/services/bookingFinancialWorkspace';
import type { BookingMoneyBalances } from '@/src/lib/billing/bookingMoneyBalances';

const NAV_SECTIONS = [
  { id: 'accounting', label: 'Accounting' },
  { id: 'move-out', label: 'Move-out settlement' },
  { id: 'deposit', label: 'Deposit' },
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
            {data.vacating?.status === 'approved' ? (
              <Badge tone="emerald">Move-out approved</Badge>
            ) : data.vacating?.status === 'pending' ? (
              <Badge tone="amber">Move-out pending approval</Badge>
            ) : null}
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
            {data.vacating ? (
              <Link
                href={vacatingWorkflowHref(data.vacating.id)}
                className="rounded-lg border border-[#FF5A1F]/40 px-3 py-1.5 text-xs font-medium text-[#FF5A1F] hover:bg-[#FF5A1F]/10"
              >
                Move-out pipeline
              </Link>
            ) : null}
          </div>
        </div>
        <nav className="mt-4 flex flex-wrap gap-2">
          {NAV_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={bookingFinancialWorkspaceSectionHref(data.bookingId, section.id)}
              className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-apg-silver hover:border-apg-orange/40 hover:text-white"
            >
              {section.label}
            </a>
          ))}
        </nav>
      </header>

      {data.pendingPaymentReviewHref ? (
        <div className="mb-6 rounded-2xl border border-apg-orange/30 bg-apg-orange/10 px-5 py-4">
          <p className="text-sm font-medium text-white">Payment awaiting admin review</p>
          <p className="mt-1 text-sm text-apg-silver">
            Approve or reject in the Payment Review Workspace — not from this financial summary.
          </p>
          <Link
            href={data.pendingPaymentReviewHref}
            className="mt-3 inline-flex rounded-lg bg-apg-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Open payment review →
          </Link>
        </div>
      ) : null}

      <FinancialSectionCard
        id="accounting"
        title="Accounting"
        subtitle="Required · Received · Outstanding — ongoing rent, deposit, and electricity balances."
      >
        <MoneyBalancesGrid balances={data.moneyBalances} />
        {data.monthlyBillingSnapshot ? (
          <dl className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="Billing cycle" value={data.monthlyBillingSnapshot.billingCycleLabel} />
            <MiniStat
              label="Paid until"
              value={
                data.monthlyBillingSnapshot.paidUntilDate
                  ? formatDate(data.monthlyBillingSnapshot.paidUntilDate)
                  : '—'
              }
            />
            <MiniStat
              label="Next rent due"
              value={formatDate(data.monthlyBillingSnapshot.nextRentDueDate)}
            />
            <MiniStat
              label="Daily rent"
              value={paiseToInr(data.monthlyBillingSnapshot.dailyRentPaise)}
            />
            <MiniStat label="Billing period" value={data.monthlyBillingSnapshot.billingPeriodLabel} />
          </dl>
        ) : null}
      </FinancialSectionCard>

      <FinancialSectionCard
        id="move-out"
        title="Move-out settlement"
        subtitle="Notice coverage, deductions, and refund — separate from accounting balances above."
        className="mt-10"
        accent
      >
        {data.vacating ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-apg-silver">
                  Notice from {formatDate(data.vacating.noticeGivenDate)} · leaves{' '}
                  {formatDate(data.vacating.vacatingDate)}
                </p>
                <p className="mt-1 text-sm text-white">
                  Status:{' '}
                  <span className="font-medium">{titleCase(data.vacating.status)}</span>
                  {data.vacating.noticeCompliant ? ' · notice compliant' : ' · notice shortfall'}
                </p>
                {data.moveOutWorkflow ? (
                  <div className="mt-3 space-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                    <p className="text-white">
                      Workflow stage:{' '}
                      <span className="font-medium">{data.moveOutWorkflow.label}</span>
                    </p>
                    <p className="text-apg-silver">{data.moveOutWorkflow.nextAction}</p>
                    <p className="text-xs text-apg-silver">
                      {moveOutWorkflowWaitingOnLabel(data.moveOutWorkflow.waitingOn)}
                      {data.moveOutWorkflow.expectedDate
                        ? ` · Expected vacate ${formatDate(data.moveOutWorkflow.expectedDate)}`
                        : ''}
                    </p>
                    <p className="text-xs text-apg-silver">{data.moveOutWorkflow.checkoutReadiness}</p>
                    <p className="pt-1 text-xs">
                      <Link
                        href={vacatingWorkflowHref(data.vacating.id)}
                        className="font-medium text-[#FF5A1F] hover:underline"
                      >
                        Open move-out tracker →
                      </Link>
                    </p>
                  </div>
                ) : null}
              </div>
              <Link
                href={vacatingWorkflowHref(data.vacating.id)}
                className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5"
              >
                Move-out pipeline
              </Link>
            </div>
            {data.pendingDateChange ? (
              <VacatingDateChangeApprovalPanel
                request={data.pendingDateChange}
                bookingContext={{
                  vacatingRequestId: data.vacating.id,
                  bookingId: data.bookingId,
                  customerName: data.customerName,
                  customerPhone: data.customerPhone,
                  bookingCode: data.bookingCode,
                  pgName: data.pgName,
                  roomNumber: data.roomNumber,
                  bedCode: data.bedCode,
                  noticeGivenDate: String(data.vacating.noticeGivenDate),
                  vacatingDate: String(data.pendingDateChange.requestedVacatingDate),
                }}
                statementDocument={data.pendingDateChange.statementDocument}
              />
            ) : null}
            {data.vacating.settlementStatement ? (
              <div className="space-y-2">
                <details open className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-white">
                    Settlement statement (accounting) ·{' '}
                    {paiseToInr(data.vacating.settlementStatement.estimatedRefundPaise)} estimated refund
                  </summary>
                  <div className="mt-4">
                    <SettlementStatementDocument
                      document={data.vacating.settlementStatement}
                      surface="adminPage"
                      audience="accountant"
                      embed="page"
                    />
                  </div>
                </details>
                <p className="text-xs text-apg-silver">
                  <Link
                    href={settlementStatementPageHref(data.vacating.id)}
                    className="font-medium text-apg-orange hover:underline"
                  >
                    Open full statement
                  </Link>
                  {' · '}
                  Print or download PDF from the statement page.
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-apg-silver">No move-out notice on this booking.</p>
        )}
      </FinancialSectionCard>

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
            className="font-medium text-apg-orange hover:underline"
          >
            Open deposit detail →
          </Link>
        </p>
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
            className="mt-4 inline-flex text-sm font-semibold text-apg-orange hover:underline"
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

function FinancialSectionCard({
  id,
  title,
  subtitle,
  children,
  className = '',
  accent = false,
}: {
  id: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <section id={id} className={`scroll-mt-28 space-y-4 ${className}`}>
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm text-apg-silver">{subtitle}</p>
      </div>
      <div
        className={`rounded-2xl border p-5 ${
          accent
            ? 'border-apg-orange/25 bg-gradient-to-br from-[#1A1F27] to-[#141820]'
            : 'border-white/10 bg-[#1A1F27]'
        }`}
      >
        {children}
      </div>
    </section>
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
    <div className="overflow-hidden rounded-xl border border-white/10">
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
