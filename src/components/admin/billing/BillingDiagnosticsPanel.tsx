import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import type { BillingHealthSnapshot } from '@/src/services/billingHealth';
import type { BillingCycleReconciliation } from '@/src/services/billingCycleReconciliation';
import {
  describeMeterBaselineSource,
  listRoomMeterTimelineEvents,
  resolveOfficialPreviousReading,
} from '@/src/services/meterTimelineService';
import { db } from '@/src/db/client';
import { floors, pgs, rooms } from '@/src/db/schema';
import { eq } from 'drizzle-orm';

export async function BillingDiagnosticsPanel({
  health,
  reconciliation,
  reconciliationError,
  isSuperAdmin,
}: {
  health: BillingHealthSnapshot;
  reconciliation: BillingCycleReconciliation | null;
  reconciliationError: string | null;
  isSuperAdmin: boolean;
}) {
  const sampleRooms = await db
    .select({
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      pgName: pgs.name,
    })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .limit(5);

  const meterSamples = await Promise.all(
    sampleRooms.map(async (room) => {
      const baseline = await resolveOfficialPreviousReading(room.roomId).catch(() => null);
      const events = await listRoomMeterTimelineEvents(room.roomId, 5).catch(() => []);
      return { room, baseline, events };
    }),
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <h3 className="text-base font-semibold text-white">Billing health score</h3>
        <p className="mt-2 text-3xl font-bold tabular-nums text-white">
          {health.healthScore}
          <span className="ml-2 text-base font-normal capitalize text-apg-silver">
            ({health.healthGrade})
          </span>
        </p>
        {health.healthIssues.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-apg-silver">
            {health.healthIssues.map((i) => (
              <li key={i}>• {i}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-emerald-300">No active billing exceptions detected.</p>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <h3 className="text-base font-semibold text-white">Certification report</h3>
        {reconciliationError ? (
          <p className="mt-2 text-sm text-amber-200">{reconciliationError}</p>
        ) : reconciliation ? (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <DiagMetric label="Month" value={reconciliation.monthLabel} />
            <DiagMetric label="Status" value={reconciliation.status} />
            <DiagMetric label="Rent residents billed" value={String(reconciliation.metrics.rentResidentsBilled)} />
            <DiagMetric
              label="Electricity residents billed"
              value={String(reconciliation.metrics.electricityResidentsBilled)}
            />
            <DiagMetric label="Total billed" value={paiseToInr(reconciliation.metrics.totalBilledPaise)} />
            <DiagMetric label="Outstanding" value={paiseToInr(reconciliation.metrics.totalOutstandingPaise)} />
            <DiagMetric label="Collection %" value={`${reconciliation.metrics.collectionPct}%`} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-apg-silver">No certification data for this month.</p>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <h3 className="text-base font-semibold text-white">Meter timeline samples</h3>
        <p className="mt-1 text-xs text-apg-silver">
          Official baseline advances only on monthly bill finalize. Checkout events do not move baseline.
        </p>
        <ul className="mt-4 space-y-4">
          {meterSamples.map(({ room, baseline, events }) => (
            <li key={room.roomId} className="rounded-lg border border-white/10 bg-[#12161C] p-4">
              <p className="text-sm font-medium text-white">
                {room.pgName} · Room {room.roomNumber}
              </p>
              {baseline ? (
                <p className="mt-1 text-xs text-apg-silver">
                  Baseline: {baseline.previousReadingUnits} units (
                  {describeMeterBaselineSource(baseline.source)})
                </p>
              ) : (
                <p className="mt-1 text-xs text-rose-300">Could not load baseline</p>
              )}
              {events.length > 0 ? (
                <ul className="mt-2 space-y-1 text-[11px] text-zinc-400">
                  {events.map((e) => (
                    <li key={e.id}>
                      {e.readingType}: {e.units} units · {e.recordedAt}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
        <Link
          href="/admin/electricity/dashboard"
          className="mt-4 inline-block text-xs font-semibold text-[#FF5A1F] hover:underline"
        >
          Full electricity dashboard →
        </Link>
      </section>

      {isSuperAdmin ? (
        <section className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-5">
          <h3 className="text-base font-semibold text-violet-100">Super-admin repair</h3>
          <p className="mt-1 text-sm text-violet-200/90">
            Force-issue rent, reconcile meter gaps, and run production repairs from the repair panel
            above or the{' '}
            <Link href="/admin/billing?tab=failures" className="underline">
              failed jobs
            </Link>{' '}
            tab.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function DiagMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-apg-silver">{label}</dt>
      <dd className="mt-0.5 font-medium text-white">{value}</dd>
    </div>
  );
}
