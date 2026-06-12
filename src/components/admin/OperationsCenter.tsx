import Link from 'next/link';
import { formatDate, paiseToInr } from '@/src/lib/format';
import {
  OPERATIONS_CENTER_CARD_ROUTES,
  OPERATIONS_CENTER_EMPTY_MESSAGES,
} from '@/src/lib/operationsCenterAudit';
import type { OpsPriority } from '@/src/lib/operationsCenterRules';
import type { OperationsCenterData } from '@/src/services/operationsCenter';

const PRIORITY_STYLES: Record<
  OpsPriority,
  { ring: string; badge: string; dot: string; label: string }
> = {
  red: {
    ring: 'ring-rose-500/40',
    badge: 'bg-rose-500/15 text-rose-300',
    dot: 'bg-rose-500',
    label: 'Today',
  },
  orange: {
    ring: 'ring-amber-500/40',
    badge: 'bg-amber-500/15 text-amber-300',
    dot: 'bg-amber-500',
    label: 'This week',
  },
  green: {
    ring: 'ring-emerald-500/30',
    badge: 'bg-emerald-500/15 text-emerald-300',
    dot: 'bg-emerald-500',
    label: 'Info',
  },
};

function PriorityBadge({ priority }: { priority: OpsPriority }) {
  const s = PRIORITY_STYLES[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${s.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function OpsCard({
  title,
  count,
  href,
  buttonLabel,
  priority,
  emptyMessage,
  children,
}: {
  title: string;
  count: number;
  href: string;
  buttonLabel: string;
  priority?: OpsPriority;
  emptyMessage: string;
  children?: React.ReactNode;
}) {
  const ring = priority && count > 0 ? PRIORITY_STYLES[priority].ring : 'ring-white/10';
  return (
    <div
      className={`flex min-h-[220px] flex-col rounded-xl border border-white/10 bg-[#1A1F27] p-4 ring-1 ring-inset ${ring}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{title}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{count}</p>
        </div>
        {priority && count > 0 ? <PriorityBadge priority={priority} /> : null}
      </div>

      <div className="mt-3 flex-1 border-t border-white/5 pt-3">
        {count === 0 ? (
          <p className="text-xs text-apg-silver">{emptyMessage}</p>
        ) : (
          <div className="space-y-2">{children}</div>
        )}
      </div>

      <Link
        href={href}
        className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[#FF5A1F] px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-[#e54f1a]"
      >
        {buttonLabel}
      </Link>
    </div>
  );
}

function cardPriority(items: Array<{ priority?: OpsPriority }>): OpsPriority | undefined {
  if (items.length === 0) return undefined;
  const ranks: OpsPriority[] = ['red', 'orange', 'green'];
  for (const p of ranks) {
    if (items.some((i) => i.priority === p)) return p;
  }
  return 'green';
}

export function OperationsCenter({ data }: { data: OperationsCenterData }) {
  const paymentPriority: OpsPriority | undefined =
    data.pendingPayments.count > 0 ? 'red' : undefined;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">🚨 Requires Attention</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Auto-detected actions across payments, KYC, vacating, reservations, deposits, electricity,
          and PS4 — refreshed on every page load.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OpsCard
          title="Pending Payments"
          count={data.pendingPayments.count}
          href={OPERATIONS_CENTER_CARD_ROUTES.pendingPayments}
          buttonLabel="Review Payments"
          priority={paymentPriority}
          emptyMessage={OPERATIONS_CENTER_EMPTY_MESSAGES.pendingPayments}
        >
          {data.pendingPayments.items.slice(0, 3).map((p) => (
            <div key={p.key} className="text-xs">
              <p className="font-medium text-white">{p.title}</p>
              <p className="text-apg-silver">
                {p.pgName} · {paiseToInr(p.amountPaise)}
              </p>
            </div>
          ))}
        </OpsCard>

        <OpsCard
          title="Pending KYC"
          count={data.pendingKyc.count}
          href={OPERATIONS_CENTER_CARD_ROUTES.pendingKyc}
          buttonLabel="Review KYC"
          priority={cardPriority(data.pendingKyc.items)}
          emptyMessage={OPERATIONS_CENTER_EMPTY_MESSAGES.pendingKyc}
        >
          {data.pendingKyc.items.slice(0, 3).map((k) => (
            <div key={k.id} className="text-xs">
              <p className="font-medium text-white">{k.residentName}</p>
              <p className="text-apg-silver">{k.pgName}</p>
            </div>
          ))}
        </OpsCard>

        <OpsCard
          title="Leaving Soon"
          count={data.leavingSoon.count}
          href={OPERATIONS_CENTER_CARD_ROUTES.leavingSoon}
          buttonLabel="Manage Vacating"
          priority={cardPriority(data.leavingSoon.items)}
          emptyMessage={OPERATIONS_CENTER_EMPTY_MESSAGES.leavingSoon}
        >
          {data.leavingSoon.items.slice(0, 3).map((v) => (
            <div key={v.id} className="text-xs">
              <p className="font-medium text-white">
                {v.residentName} · {v.bedCode} · {v.roomNumber}
              </p>
              <p className="text-apg-silver">
                {v.pgName} · vacates {v.vacatingDate} ({v.daysRemaining}d left)
              </p>
            </div>
          ))}
        </OpsCard>

        <OpsCard
          title="Beds Releasing Soon"
          count={data.bedsReleasingSoon.count}
          href={OPERATIONS_CENTER_CARD_ROUTES.bedsReleasingSoon}
          buttonLabel="View Vacating"
          priority={cardPriority(data.bedsReleasingSoon.items)}
          emptyMessage={OPERATIONS_CENTER_EMPTY_MESSAGES.bedsReleasingSoon}
        >
          {data.bedsReleasingSoon.items.slice(0, 3).map((b) => (
            <div key={b.id} className="text-xs">
              <p className="font-medium text-white">
                {b.bedCode} · {b.roomNumber}
              </p>
              <p className="text-apg-silver">
                {b.pgName} · {b.vacatingDate}
              </p>
            </div>
          ))}
        </OpsCard>

        <OpsCard
          title="Upcoming Reservations"
          count={data.upcomingReservations.count}
          href={OPERATIONS_CENTER_CARD_ROUTES.upcomingReservations}
          buttonLabel="Manage Reservations"
          priority={cardPriority(data.upcomingReservations.items)}
          emptyMessage={OPERATIONS_CENTER_EMPTY_MESSAGES.upcomingReservations}
        >
          {data.upcomingReservations.items.slice(0, 3).map((r) => (
            <div key={r.id} className="text-xs">
              <p className="font-medium text-white">
                {r.residentName} · {r.bedCode}
              </p>
              <p className="text-apg-silver">
                {r.pgName} · check-in {r.checkInDate}
              </p>
            </div>
          ))}
        </OpsCard>

        <OpsCard
          title="Refunds Pending"
          count={data.refundsPending.count}
          href={OPERATIONS_CENTER_CARD_ROUTES.refundsPending}
          buttonLabel="Process Refunds"
          priority={cardPriority(data.refundsPending.items)}
          emptyMessage={OPERATIONS_CENTER_EMPTY_MESSAGES.refundsPending}
        >
          {data.refundsPending.items.slice(0, 3).map((r) => (
            <div key={r.bookingId} className="text-xs">
              <p className="font-medium text-white">{r.residentName}</p>
              <p className="text-apg-silver">
                {r.pgName} · {paiseToInr(r.depositPaise)} · {r.daysWaiting}d waiting
              </p>
            </div>
          ))}
        </OpsCard>

        <OpsCard
          title="Electricity Pending"
          count={data.electricityPending.count}
          href={OPERATIONS_CENTER_CARD_ROUTES.electricityPending}
          buttonLabel="Review Electricity"
          priority={cardPriority(data.electricityPending.items)}
          emptyMessage={OPERATIONS_CENTER_EMPTY_MESSAGES.electricityPending}
        >
          {data.electricityPending.items.slice(0, 3).map((e) => (
            <div key={e.invoiceId} className="text-xs">
              <p className="font-medium text-white">{e.residentName}</p>
              <p className="text-apg-silver">
                {e.pgName} · {paiseToInr(e.amountDuePaise)} due
              </p>
            </div>
          ))}
        </OpsCard>

        <OpsCard
          title="PS4 Renewals Needed"
          count={data.ps4Renewals.count}
          href={OPERATIONS_CENTER_CARD_ROUTES.ps4Renewals}
          buttonLabel="Manage PS4"
          priority={cardPriority(data.ps4Renewals.items)}
          emptyMessage={OPERATIONS_CENTER_EMPTY_MESSAGES.ps4Renewals}
        >
          {data.ps4Renewals.items.slice(0, 3).map((p) => (
            <div key={p.membershipId} className="text-xs">
              <p className="font-medium text-white">{p.residentName}</p>
              <p className="text-apg-silver">
                {p.pgName} · expires {formatDate(p.expiresAt)}
              </p>
            </div>
          ))}
        </OpsCard>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">Today&apos;s Tasks</h3>
          <p className="text-xs text-apg-silver">
            {data.tasks.length} auto-generated action{data.tasks.length === 1 ? '' : 's'}
          </p>
        </div>
        {data.tasks.length === 0 ? (
          <p className="text-sm text-apg-silver">All clear — nothing requires attention right now.</p>
        ) : (
          <ul className="space-y-2">
            {data.tasks.slice(0, 20).map((task) => (
              <li key={task.id}>
                <Link
                  href={task.href}
                  className={`flex min-h-[44px] flex-col gap-1 rounded-lg border border-white/5 px-3 py-2.5 transition hover:border-[#FF5A1F]/30 hover:bg-white/[0.02] ring-1 ring-inset sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 ${PRIORITY_STYLES[task.priority].ring}`}
                >
                  <PriorityBadge priority={task.priority} />
                  <span className="text-sm text-white">{task.label}</span>
                  <span className="text-xs text-apg-silver sm:ml-auto">{task.pgName}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
