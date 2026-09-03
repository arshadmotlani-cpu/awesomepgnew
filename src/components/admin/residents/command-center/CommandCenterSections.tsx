import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { formatDate, formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import { isMonthlyStayType } from '@/src/lib/stayType';
import { diffDays, parseDate } from '@/src/lib/dates';
import type {
  CommandCenterBookingDepositRow,
  ResidentCommandCenterData,
} from '@/src/lib/residents/commandCenterTypes';
import { bedMapHref, bookingWorkflowHref } from '@/src/lib/residents/commandCenterLinks';
import {
  CommandCenterSection,
  EmptyState,
  WorkflowButton,
} from '@/src/components/admin/residents/command-center/CommandCenterSection';

export function CommandCenterCurrentStay({ data }: { data: ResidentCommandCenterData }) {
  const t = data.activeTenancy;
  if (!t || data.isVacated) return null;

  const monthly = isMonthlyStayType(t.stayType);

  return (
    <CommandCenterSection
      id="current-stay"
      title="Current stay"
      description="Live bed assignment and stay context from occupancy SSOT."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="PG" value={t.pgName} />
        <Fact
          label="Room · Bed"
          value={`Floor ${t.floorNumber ?? '—'} · Room ${t.roomNumber} · ${t.bedCode}`}
        />
        <Fact
          label="Occupancy"
          value={data.occupancy?.adminViewLabel ?? data.occupancy?.label ?? '—'}
        />
        <Fact label="Check-in" value={formatDate(t.moveInDate)} />
        {monthly ? (
          <>
            <Fact label="Monthly rent" value={paiseToInr(t.monthlyRentPaise)} />
            <Fact
              label="Billing anchor"
              value={
                data.billingSnapshot?.checkInDate
                  ? formatDate(data.billingSnapshot.checkInDate)
                  : t.billingAnchorDate
                    ? formatDate(t.billingAnchorDate)
                    : formatDate(t.moveInDate)
              }
            />
            <Fact
              label="Billing cycle"
              value={data.billingSnapshot?.billingCycleLabel ?? '—'}
            />
            <Fact
              label="Next rent due"
              value={
                data.billingSnapshot?.nextRentDueDate
                  ? formatDate(data.billingSnapshot.nextRentDueDate)
                  : '—'
              }
            />
            <Fact
              label="Paid until"
              value={
                data.billingSnapshot?.paidUntilDate
                  ? formatDate(data.billingSnapshot.paidUntilDate)
                  : '—'
              }
            />
          </>
        ) : (
          <>
            <Fact
              label="Check-out"
              value={t.expectedCheckoutDate ? formatDate(t.expectedCheckoutDate) : '—'}
            />
            <Fact
              label="Duration"
              value={
                t.expectedCheckoutDate
                  ? `${diffDays(parseDate(t.moveInDate), parseDate(t.expectedCheckoutDate))} nights`
                  : 'Fixed stay'
              }
            />
          </>
        )}
        <Fact label="Stay type" value={titleCase(t.stayType.replace(/_/g, ' '))} />
        {t.isVacating ? (
          <Fact
            label="Move-out"
            value={`${t.vacatingStatus ?? 'pending'} · ${t.vacatingDate ? formatDate(t.vacatingDate) : '—'}`}
          />
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 border-t border-white/5 pt-4">
        <Link
          href={bookingWorkflowHref(t.bookingId)}
          className="text-xs font-semibold text-[#FF5A1F] hover:underline"
        >
          Booking {t.bookingCode} →
        </Link>
        <Link
          href={bedMapHref(t.pgId)}
          className="text-xs font-semibold text-[#FF5A1F] hover:underline"
        >
          PG bed map →
        </Link>
      </div>
    </CommandCenterSection>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

export function CommandCenterFinancialSummary({
  data,
  bookingDepositsSlot,
}: {
  data: ResidentCommandCenterData;
  bookingDepositsSlot?: ReactNode;
}) {
  const fin = data.financialAccount;
  const walletPaise = data.depositSummary?.refundableBalancePaise ?? fin?.depositHeldPaise ?? 0;

  if (!fin && data.bookingDeposits.length === 0 && !bookingDepositsSlot) {
    return (
      <CommandCenterSection
        id="financial"
        title="Financial summary"
        description="Single source of truth — wallet, dues, and lifetime paid."
      >
        <EmptyState>No financial account for this resident yet.</EmptyState>
      </CommandCenterSection>
    );
  }

  return (
    <CommandCenterSection
      id="financial"
      title="Financial summary"
      description="Single source of truth — same figures as Billing Center and Collections."
    >
      {fin ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MoneyStat label="Wallet balance" value={walletPaise} accent />
          <MoneyStat label="Current deposit held" value={fin.depositHeldPaise} />
          <MoneyStat label="Refund balance" value={fin.refundBalancePaise} />
          <MoneyStat label="Total outstanding" value={fin.totalOutstandingPaise} warn />
          <MoneyStat label="Rent due" value={fin.rentOutstandingPaise} warn />
          <MoneyStat label="Electricity due" value={fin.electricityOutstandingPaise} warn />
          <MoneyStat label="Lifetime rent paid" value={fin.rent.paidPaise} positive />
          <MoneyStat label="Lifetime electricity paid" value={fin.electricity.paidPaise} positive />
          <MoneyStat label="Lifetime deposit paid" value={fin.deposit.paidPaise} positive />
        </dl>
      ) : null}

      {data.billingSnapshot && data.activeTenancy && isMonthlyStayType(data.activeTenancy.stayType) ? (
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-white/5 pt-5 sm:grid-cols-3 lg:grid-cols-4">
          <MoneyStat
            label="Daily rent"
            value={data.billingSnapshot.dailyRentPaise}
            positive
          />
          <FactBlock
            label="Billing period"
            value={data.billingSnapshot.billingPeriodLabel}
          />
          <FactBlock
            label="Period start"
            value={formatDate(data.billingSnapshot.billingPeriodStart)}
          />
          <FactBlock
            label="Period end"
            value={formatDate(data.billingSnapshot.billingPeriodEnd)}
          />
        </dl>
      ) : null}

      {data.bookingDeposits.length > 0 ? (
        <CommandCenterBookingDepositsList rows={data.bookingDeposits} withTopBorder={Boolean(fin)} />
      ) : (
        bookingDepositsSlot
      )}
    </CommandCenterSection>
  );
}

export function CommandCenterBookingDepositsList({
  rows,
  withTopBorder = false,
}: {
  rows: CommandCenterBookingDepositRow[];
  withTopBorder?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <div className={withTopBorder ? 'mt-5 space-y-3 border-t border-white/5 pt-5' : 'space-y-3'}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
        Deposits by booking
      </p>
      {rows.map((row) => (
        <div
          key={row.bookingId}
          className="rounded-xl border border-white/5 bg-[#12161C] px-3 py-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={bookingWorkflowHref(row.bookingId)}
              className="text-sm font-semibold text-[#FF5A1F] hover:underline"
            >
              {row.bookingCode}
            </Link>
            <Badge tone={toneForStatus(row.bookingStatus)}>{titleCase(row.bookingStatus)}</Badge>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <DepositFact label="Deposit paid" value={row.depositPaidPaise} />
            {row.transferFromPriorPaise > 0 ? (
              <DepositFact label="Transfer from prior" value={row.transferFromPriorPaise} />
            ) : null}
            {row.additionalDepositPaidPaise > 0 ? (
              <DepositFact label="Additional paid" value={row.additionalDepositPaidPaise} />
            ) : null}
            <DepositFact label="Deposit used" value={row.depositUsedPaise} />
            <DepositFact label="Deposit refunded" value={row.depositRefundedPaise} />
            <DepositFact label="Deposit remaining" value={row.depositRemainingPaise} accent />
          </dl>
          {row.dispositionLabel ? (
            <p className="mt-2 text-xs text-apg-silver">Disposition: {row.dispositionLabel}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DepositFact({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium ${accent ? 'text-sky-300' : 'text-white'}`}>
        {paiseToInr(value)}
      </dd>
    </div>
  );
}

function FactBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#12161C] px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}

function MoneyStat({
  label,
  value,
  accent,
  warn,
  positive,
}: {
  label: string;
  value: number;
  accent?: boolean;
  warn?: boolean;
  positive?: boolean;
}) {
  const color = warn && value > 0
    ? 'text-[#FF5A1F]'
    : positive
      ? 'text-emerald-300'
      : accent
        ? 'text-sky-300'
        : 'text-white';
  return (
    <div className="rounded-xl border border-white/5 bg-[#12161C] px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className={`mt-1 text-sm font-semibold ${color}`}>{paiseToInr(value)}</dd>
    </div>
  );
}

export function CommandCenterInvoices({ data }: { data: ResidentCommandCenterData }) {
  const bills = data.invoiceHistory;
  return (
    <CommandCenterSection
      id="invoices"
      title="Invoices"
      description="All invoices across every stay and PG for this resident."
      badge={
        bills.length > 0 ? (
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-apg-silver">
            {bills.length}
          </span>
        ) : undefined
      }
    >
      {bills.length === 0 ? (
        <EmptyState>No invoices on record.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-apg-silver">
                <th className="py-2 pr-3 font-medium">Invoice</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">PG / Booking</th>
                <th className="py-2 pr-3 font-medium">Period</th>
                <th className="py-2 pr-3 font-medium">Total</th>
                <th className="py-2 pr-3 font-medium">Paid</th>
                <th className="py-2 pr-3 font-medium">Outstanding</th>
                <th className="py-2 pr-3 font-medium">Late fee</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Issued</th>
                <th className="py-2 font-medium">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {bills.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-2.5 pr-3">
                    <Link
                      href={`/admin/invoices/${inv.id}`}
                      className="font-medium text-[#FF5A1F] hover:underline"
                    >
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-apg-silver">{titleCase(inv.invoiceType)}</td>
                  <td className="py-2.5 pr-3 text-apg-silver">
                    {inv.pgName}
                    {inv.bookingCode ? ` · ${inv.bookingCode}` : inv.roomNumber ? ` · R${inv.roomNumber}` : ''}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-apg-silver">
                    {inv.billingPeriod ?? '—'}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-white">{paiseToInr(inv.amountPaise)}</td>
                  <td className="py-2.5 pr-3 tabular-nums text-emerald-200/90">
                    {inv.paidPaise != null ? paiseToInr(inv.paidPaise) : '—'}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-amber-200/90">
                    {inv.outstandingPaise != null && inv.outstandingPaise > 0
                      ? paiseToInr(inv.outstandingPaise)
                      : '—'}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-apg-silver">
                    {inv.lateFeePaise != null && inv.lateFeePaise > 0
                      ? paiseToInr(inv.lateFeePaise)
                      : '—'}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={toneForStatus(inv.status)}>{titleCase(inv.status)}</Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-apg-silver">{formatDateTime(inv.createdAt)}</td>
                  <td className="py-2.5 text-apg-silver">
                    {inv.dueDate ? formatDate(inv.dueDate) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CommandCenterSection>
  );
}

export function CommandCenterBills({ data }: { data: ResidentCommandCenterData }) {
  const bills = data.invoiceHistory;
  return (
    <CommandCenterSection
      id="bills"
      title="Bills"
      description="All generated invoices for this resident."
    >
      {bills.length === 0 ? (
        <EmptyState>No invoices generated yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-white/5">
          {bills.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{inv.invoiceNumber}</p>
                <p className="text-xs text-apg-silver">
                  {titleCase(inv.invoiceType)} · {paiseToInr(inv.amountPaise)} ·{' '}
                  {formatDateTime(inv.createdAt)}
                </p>
              </div>
              <Badge tone={toneForStatus(inv.status)}>{titleCase(inv.status)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </CommandCenterSection>
  );
}

export function CommandCenterPendingReviews({ data }: { data: ResidentCommandCenterData }) {
  const items = data.pendingReviews;
  if (items.length === 0) return null;

  return (
    <CommandCenterSection
      id="pending-reviews"
      title="Pending reviews"
      description="Items requiring an admin decision right now."
      badge={
        <span className="rounded-full bg-[#FF5A1F]/20 px-2.5 py-0.5 text-xs font-semibold text-[#FF5A1F]">
          {items.length} open
        </span>
      }
    >
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#12161C] px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
                {item.category}
              </p>
              <p className="text-sm font-medium text-white">{item.label}</p>
              {item.detail ? (
                <p className="mt-0.5 text-xs text-apg-silver">{item.detail}</p>
              ) : null}
            </div>
            <WorkflowButton href={item.href} />
          </li>
        ))}
      </ul>
    </CommandCenterSection>
  );
}

export function CommandCenterRequests({ data }: { data: ResidentCommandCenterData }) {
  const rows = data.openRequests.filter(
    (r) => r.type !== 'deposit_refund' && ['submitted', 'under_review'].includes(r.status),
  );
  const roomChanges = data.roomChanges.filter(
    (r) => !['COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED'].includes(r.workflowState),
  );

  if (rows.length === 0 && roomChanges.length === 0) return null;

  return (
    <CommandCenterSection id="requests" title="Requests" description="Extensions, complaints, and room changes.">
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#12161C] px-3 py-2.5"
          >
            <div>
              <p className="text-sm font-medium text-white">{titleCase(r.type.replace(/_/g, ' '))}</p>
              <p className="text-xs text-apg-silver">{titleCase(r.status)}</p>
            </div>
            <WorkflowButton href={`/admin/requests?read=${r.id}`} />
          </li>
        ))}
        {roomChanges.map((rc) => (
            <li
              key={rc.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#12161C] px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-white">Room change</p>
                <p className="text-xs text-apg-silver">
                  {rc.workflowState === 'COMPLETED'
                    ? 'Room change completed'
                    : titleCase(rc.workflowState.replace(/_/g, ' '))}{' '}
                  · shift {formatDate(rc.requestedShiftDate)}
                  {rc.workflowState === 'COMPLETED'
                    ? ' · outstanding charges remain payable'
                    : ''}
                </p>
              </div>
              <WorkflowButton href={bookingWorkflowHref(rc.bookingId)} label="Open booking" />
            </li>
          ))}
      </ul>
    </CommandCenterSection>
  );
}

export function CommandCenterBookingHistory({ data }: { data: ResidentCommandCenterData }) {
  return (
    <CommandCenterSection
      id="booking-history"
      title="Booking history"
      description="All bookings for this resident, newest first."
    >
      {data.bookingHistory.length === 0 ? (
        <EmptyState>No bookings yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-white/5">
          {data.bookingHistory.map((b) => (
            <li
              key={b.bookingId}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <Link
                  href={bookingWorkflowHref(b.bookingId)}
                  className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                >
                  {b.bookingCode}
                </Link>
                <p className="text-xs text-apg-silver">
                  {b.pgName ?? '—'}
                  {b.roomNumber ? ` · Room ${b.roomNumber}` : ''}
                  {b.bedCode ? ` · ${b.bedCode}` : ''}
                </p>
                <p className="text-xs text-apg-silver">
                  {titleCase(b.status)}
                  {b.moveInDate ? ` · in ${formatDate(b.moveInDate)}` : ''}
                </p>
              </div>
              <Badge tone={toneForStatus(b.status)}>{titleCase(b.status)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </CommandCenterSection>
  );
}
