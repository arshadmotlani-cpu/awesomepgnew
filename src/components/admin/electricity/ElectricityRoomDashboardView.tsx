import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import type { ElectricityRoomDashboardSummary } from '@/src/services/electricityRoomDashboard';

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'green' | 'amber' | 'rose';
}) {
  const toneClass =
    tone === 'green'
      ? 'text-emerald-400'
      : tone === 'amber'
        ? 'text-amber-300'
        : tone === 'rose'
          ? 'text-rose-300'
          : 'text-white';
  return (
    <div className="rounded-2xl bg-white/[0.04] px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

export function ElectricityRoomDashboardView({
  data,
  billingMonth,
}: {
  data: ElectricityRoomDashboardSummary;
  billingMonth: string;
}) {
  const collectionPct =
    data.totalBillPaise > 0
      ? Math.round((data.totalCollectedPaise / data.totalBillPaise) * 100)
      : 0;

  return (
    <div className="space-y-8">
      <div className="sticky top-0 z-10 -mx-1 rounded-2xl border border-white/[0.06] bg-[#12161C]/95 px-5 py-4 backdrop-blur-md">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total room bills" value={paiseToInr(data.totalBillPaise)} />
          <StatCard label="Collected" value={paiseToInr(data.totalCollectedPaise)} tone="green" />
          <StatCard label="Still to recover" value={paiseToInr(data.totalOutstandingPaise)} tone="amber" />
          <StatCard label="Collection rate" value={`${collectionPct}%`} />
          <StatCard
            label="Rooms need attention"
            value={String(data.roomsWithWarnings)}
            tone={data.roomsWithWarnings > 0 ? 'rose' : 'green'}
          />
        </div>
      </div>

      {data.roomsWithWarnings > 0 ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {data.roomsWithWarnings} room{data.roomsWithWarnings === 1 ? '' : 's'} have a reconciliation
          issue. Open the room to fix before closing the month.
        </div>
      ) : null}

      <div className="space-y-4">
        {data.rows.length === 0 ? (
          <p className="text-sm text-apg-silver">No electricity bills for {billingMonth.slice(0, 7)} yet.</p>
        ) : (
          data.rows.map((room) => (
            <article
              key={room.roomId}
              className={
                'rounded-3xl p-6 ring-1 ' +
                (room.hasWarning
                  ? 'bg-rose-500/[0.06] ring-rose-500/20'
                  : 'bg-[#1A1F27]/90 ring-white/[0.06]')
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {room.pgName} · Room {room.roomNumber}
                  </h2>
                  <p className="mt-1 text-xs text-apg-silver">
                    {room.unitsConsumed != null ? `${room.unitsConsumed} units · ` : ''}
                    {room.checkoutDeductionCount} checkout · {room.manualAdjustmentCount} manual ·{' '}
                    {room.pendingInvoiceCount} pending · {room.paidInvoiceCount} paid
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold tabular-nums text-white">
                    {paiseToInr(room.totalBillPaise)}
                  </p>
                  <p className="text-xs text-apg-silver">Room bill</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <MiniStat label="Collected" value={paiseToInr(room.collectedPaise)} />
                <MiniStat label="Outstanding" value={paiseToInr(room.outstandingPaise)} />
                <MiniStat label="Collection" value={`${room.collectionPct}%`} />
                <MiniStat
                  label="Status"
                  value={
                    room.isFullyCollected
                      ? 'Fully collected'
                      : room.hasWarning
                        ? 'Needs review'
                        : 'In progress'
                  }
                />
              </div>

              {room.overCollectionPaise > 0 ? (
                <p className="mt-3 text-xs text-rose-300">
                  Over-collected by {paiseToInr(room.overCollectionPaise)} — reduce manual credits or
                  adjust invoices.
                </p>
              ) : null}

              {!room.isBalanced ? (
                <p className="mt-2 text-xs text-amber-200">
                  Bill does not match resident shares — open ledger to reconcile.
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-3">
                {room.electricityBillId ? (
                  <Link
                    href={`/admin/electricity/bills/${room.electricityBillId}`}
                    className="rounded-xl bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                  >
                    Open bill
                  </Link>
                ) : null}
                <Link
                  href={`/admin/electricity/ledger?roomId=${room.roomId}&month=${billingMonth}`}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
                >
                  Room ledger
                </Link>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-apg-silver">{label}</p>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  );
}
