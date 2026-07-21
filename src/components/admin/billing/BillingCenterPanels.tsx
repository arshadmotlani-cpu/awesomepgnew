'use client';

import { useFormState } from 'react-dom';
import { paiseToInr, formatDate } from '@/src/lib/format';
import {
  retryBillingFailureAction,
  retryBillingRunAction,
  type BillingActionState,
} from '@/app/(admin)/admin/billing/actions';

const INITIAL: BillingActionState = { ok: false };

export function BillingFailuresPanel({
  failures,
  runId,
}: {
  failures: Array<{
    id: string;
    bookingId: string;
    billingMonth: string | null;
    errorMessage: string;
    errorCode: string | null;
    createdAt: string;
  }>;
  runId?: string | null;
}) {
  const [retryState, retryAction] = useFormState(retryBillingFailureAction, INITIAL);
  const [runState, runAction] = useFormState(retryBillingRunAction, INITIAL);

  if (failures.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-[#1A1F27] p-5 text-sm text-apg-silver">
        No unresolved generation failures.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {runId ? (
        <form action={runAction}>
          <input type="hidden" name="runId" value={runId} />
          <button
            type="submit"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
          >
            Retry all for this run
          </button>
          {runState.ok && runState.resolved != null ? (
            <p className="mt-2 text-xs text-emerald-300">Resolved {runState.resolved} failure(s).</p>
          ) : null}
        </form>
      ) : null}
      {retryState.error ? <p className="text-xs text-rose-300">{retryState.error}</p> : null}
      <ul className="space-y-2">
        {failures.map((f) => (
          <li
            key={f.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4"
          >
            <div>
              <p className="text-sm font-medium text-white">Failed</p>
              <p className="mt-1 text-xs text-apg-silver">
                Booking {f.bookingId.slice(0, 8)}…
                {f.billingMonth ? ` · ${formatDate(f.billingMonth)}` : ''}
              </p>
              <p className="mt-1 text-xs text-rose-200">{f.errorMessage}</p>
            </div>
            <form action={retryAction}>
              <input type="hidden" name="failureId" value={f.id} />
              <button
                type="submit"
                className="rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Retry
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BillingGeneratedTodayPanel({
  rows,
  run,
}: {
  rows: Array<{
    invoiceId: string;
    invoiceNumber: string;
    customerName: string;
    pgName: string;
    rentPaise: number;
    billingMonth: string;
  }>;
  run: {
    status: string;
    createdCount: number;
    failedCount: number;
    startedAt: string;
  } | null;
}) {
  return (
    <div className="space-y-4">
      {run ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-sm font-semibold text-emerald-200">
            {run.status === 'success' ? 'Generated successfully' : `Run: ${run.status}`}
          </p>
          <p className="mt-1 text-xs text-apg-silver">
            {run.createdCount} created · {run.failedCount} failed · started{' '}
            {new Date(run.startedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
          </p>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-apg-silver">No auto-generated invoices today yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.invoiceId}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-[#1A1F27] px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-white">✓ {r.customerName}</p>
                <p className="text-xs text-apg-silver">
                  {r.invoiceNumber} · {r.pgName} · {formatDate(r.billingMonth)}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-white">{paiseToInr(r.rentPaise)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BillingHealthCardPanel({
  health,
}: {
  health: {
    nextSchedulerRunUtc: string;
    todayIst: string;
    invoicesGeneratedToday: number;
    unresolvedFailures: number;
    pendingApprovals: number;
    overdueRentInvoices: number;
    dueInSevenDays?: number;
    healthScore?: number;
    healthGrade?: string;
    lastElectricityBatchAt: string | null;
    lastRun: { status: string; createdCount: number } | null;
  };
}) {
  const rows = [
    { label: 'Health score', value: health.healthScore != null ? `${health.healthScore} (${health.healthGrade ?? '—'})` : '—' },
    { label: 'Today (IST)', value: health.todayIst },
    {
      label: 'Next scheduler run',
      value: new Date(health.nextSchedulerRunUtc).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
      }),
    },
    {
      label: 'Last run',
      value: health.lastRun
        ? `${health.lastRun.status} · ${health.lastRun.createdCount} invoices`
        : '—',
    },
    { label: 'Invoices generated today', value: String(health.invoicesGeneratedToday) },
    { label: 'Failed jobs (unresolved)', value: String(health.unresolvedFailures) },
    { label: 'Pending approvals', value: String(health.pendingApprovals) },
    { label: 'Overdue rent bills', value: String(health.overdueRentInvoices) },
    {
      label: 'Last electricity batch',
      value: health.lastElectricityBatchAt
        ? new Date(health.lastElectricityBatchAt).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
          })
        : '—',
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => (
        <div key={r.label} className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
          <p className="text-xs text-apg-silver">{r.label}</p>
          <p className="mt-1 text-sm font-semibold text-white">{r.value}</p>
        </div>
      ))}
    </div>
  );
}
