import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { formatDate, formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import { isMonthlyStayType } from '@/src/lib/stayType';
import { diffDays, parseDate } from '@/src/lib/dates';
import type { ResidentCommandCenterData } from '@/src/lib/residents/commandCenterTypes';
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
              value={t.billingAnchorDate ? formatDate(t.billingAnchorDate) : '—'}
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

export function CommandCenterFinancialSummary({ data }: { data: ResidentCommandCenterData }) {
  const fin = data.financialAccount;
  if (!fin) {
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

  const walletPaise = data.depositSummary?.refundableBalancePaise ?? fin.depositHeldPaise ?? 0;

  return (
    <CommandCenterSection
      id="financial"
      title="Financial summary"
      description="Single source of truth — same figures as Billing Center and Collections."
    >
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <MoneyStat label="Wallet" value={walletPaise} accent />
        <MoneyStat label="Deposit held" value={fin.depositHeldPaise} />
        <MoneyStat label="Refund balance" value={fin.refundBalancePaise} />
        <MoneyStat label="Total outstanding" value={fin.totalOutstandingPaise} warn />
        <MoneyStat label="Rent due" value={fin.rentOutstandingPaise} warn />
        <MoneyStat label="Electricity due" value={fin.electricityOutstandingPaise} warn />
        <MoneyStat label="Lifetime rent paid" value={fin.rent.paidPaise} positive />
        <MoneyStat label="Lifetime electricity paid" value={fin.electricity.paidPaise} positive />
        <MoneyStat label="Lifetime deposit paid" value={fin.deposit.paidPaise} positive />
      </dl>
    </CommandCenterSection>
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
  return (
    <CommandCenterSection
      id="pending-reviews"
      title="Pending reviews"
      description="Every open item awaiting admin action — tap through to the existing workflow."
      badge={
        items.length > 0 ? (
          <span className="rounded-full bg-[#FF5A1F]/20 px-2.5 py-0.5 text-xs font-semibold text-[#FF5A1F]">
            {items.length} open
          </span>
        ) : null
      }
    >
      {items.length === 0 ? (
        <EmptyState>Nothing awaiting review — you are caught up.</EmptyState>
      ) : (
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
      )}
    </CommandCenterSection>
  );
}

export function CommandCenterRefunds({ data }: { data: ResidentCommandCenterData }) {
  const refundRequests = data.openRequests.filter((r) => r.type === 'deposit_refund');
  const pendingSettlements = data.vacatingRows.filter(
    (v) => v.settlementId && v.settlementStatus && !['completed', 'cancelled'].includes(v.settlementStatus),
  );

  if (refundRequests.length === 0 && pendingSettlements.length === 0) {
    return (
      <CommandCenterSection id="refunds" title="Refunds" description="Deposit refund and settlement status.">
        <EmptyState>No open refund workflows.</EmptyState>
      </CommandCenterSection>
    );
  }

  return (
    <CommandCenterSection id="refunds" title="Refunds" description="Deposit refund and settlement status.">
      <ul className="space-y-2">
        {refundRequests.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#12161C] px-3 py-2.5"
          >
            <div>
              <p className="text-sm font-medium text-white">Deposit refund request</p>
              <p className="text-xs text-apg-silver">
                {titleCase(r.status)} · {formatDateTime(r.createdAt)}
              </p>
            </div>
            <WorkflowButton href={`/admin/requests?read=${r.id}`} />
          </li>
        ))}
        {pendingSettlements.map((v) => (
          <li
            key={v.settlementId!}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#12161C] px-3 py-2.5"
          >
            <div>
              <p className="text-sm font-medium text-white">Checkout settlement</p>
              <p className="text-xs text-apg-silver">
                {titleCase(v.settlementStatus ?? 'pending')} · vacating {formatDate(v.vacatingDate)}
              </p>
            </div>
            <WorkflowButton href={`/admin/checkout-settlements/${v.settlementId}`} />
          </li>
        ))}
      </ul>
    </CommandCenterSection>
  );
}

export function CommandCenterVacating({ data }: { data: ResidentCommandCenterData }) {
  if (data.isVacated) return null;
  const rows = data.vacatingRows.filter((v) => v.status !== 'completed' && v.status !== 'cancelled');
  return (
    <CommandCenterSection id="vacating" title="Vacating" description="Move-out notices and checkout pipeline.">
      {rows.length === 0 ? (
        <EmptyState>No active move-out workflow.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#12161C] px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-white">
                  {titleCase(v.status)} · {formatDate(v.vacatingDate)}
                </p>
                <p className="text-xs text-apg-silver">
                  Booking {v.bookingCode ?? v.bookingId.slice(0, 8)}
                </p>
              </div>
              <WorkflowButton
                href={
                  v.settlementId
                    ? `/admin/checkout-settlements/${v.settlementId}`
                    : `/admin/vacating?read=${encodeURIComponent(`vacating:${v.id}`)}`
                }
              />
            </li>
          ))}
        </ul>
      )}
    </CommandCenterSection>
  );
}

export function CommandCenterRequests({ data }: { data: ResidentCommandCenterData }) {
  const rows = data.openRequests.filter((r) => r.type !== 'deposit_refund');
  const roomChanges = data.roomChanges.filter((r) =>
    ['submitted', 'draft', 'approved'].includes(r.status),
  );

  if (rows.length === 0 && roomChanges.length === 0) {
    return (
      <CommandCenterSection id="requests" title="Requests" description="Extensions, complaints, and room changes.">
        <EmptyState>No open resident requests.</EmptyState>
      </CommandCenterSection>
    );
  }

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
                {titleCase(rc.status)} · shift {formatDate(rc.requestedShiftDate)}
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
