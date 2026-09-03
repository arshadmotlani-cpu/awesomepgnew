'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  generateSelectedElectricityBillsAction,
  type PgElectricityGenerateRoomResult,
} from '@/app/(admin)/admin/billing/electricity/generate/actions';
import type { PgElectricityBillingChecklist } from '@/src/lib/billing/pgElectricityBillingChecklist';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import { paiseToInr } from '@/src/lib/format';

type PgOption = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  already_billed: 'Already billed',
  reading_required: 'Reading required',
  previous_unavailable: 'Previous reading unavailable',
  maintenance_excluded: 'Maintenance — excluded',
  not_eligible: 'Not eligible',
  needs_attention: 'Needs attention',
};

function statusTone(status: string): string {
  if (status === 'already_billed') return 'text-emerald-200';
  if (status === 'reading_required') return 'text-amber-200';
  if (status === 'maintenance_excluded') return 'text-zinc-400';
  if (status === 'previous_unavailable' || status === 'needs_attention') return 'text-rose-200';
  return 'text-apg-silver';
}

export function PgElectricityBillingChecklistClient({
  billingMonth,
  pgs,
  selectedPgId,
  checklist,
}: {
  billingMonth: string;
  pgs: PgOption[];
  selectedPgId: string | null;
  checklist: PgElectricityBillingChecklist | null;
}) {
  const router = useRouter();
  const monthValue = billingMonth.slice(0, 7);
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<PgElectricityGenerateRoomResult[]>([]);

  const ratePaise = checklist?.ratePerUnitPaise ?? DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE;
  const rateLabel = paiseToInr(ratePaise);

  const readyRooms = useMemo(() => {
    if (!checklist) return [];
    return checklist.rooms.filter((r) => {
      if (r.status !== 'reading_required' || r.previousReadingUnits == null) return false;
      const raw = readings[r.roomId]?.trim();
      if (!raw) return false;
      const current = Number(raw);
      if (!Number.isFinite(current)) return false;
      if (current < r.previousReadingUnits) return false;
      return true;
    });
  }, [checklist, readings]);

  const roomsToGenerate = readyRooms.filter((r) => selected[r.roomId] !== false);

  const estimatedTotalPaise = roomsToGenerate.reduce((sum, r) => {
    const current = Number(readings[r.roomId]);
    const prev = r.previousReadingUnits ?? 0;
    const units = Math.max(0, current - prev);
    return sum + Math.round(units * r.ratePerUnitPaise);
  }, 0);

  function setMonth(next: string) {
    const params = new URLSearchParams();
    params.set('month', next);
    if (selectedPgId) params.set('pgId', selectedPgId);
    router.push(`/admin/billing/electricity/generate?${params.toString()}`);
  }

  function setPg(nextPgId: string) {
    const params = new URLSearchParams();
    params.set('month', monthValue);
    if (nextPgId) params.set('pgId', nextPgId);
    setReadings({});
    setSelected({});
    setSummary(null);
    setLastResults([]);
    setError(null);
    router.push(`/admin/billing/electricity/generate?${params.toString()}`);
  }

  function selectAllReady() {
    const next: Record<string, boolean> = { ...selected };
    for (const r of readyRooms) next[r.roomId] = true;
    setSelected(next);
  }

  function generate() {
    if (!selectedPgId || roomsToGenerate.length === 0) return;
    setError(null);
    setSummary(null);
    startTransition(async () => {
      const res = await generateSelectedElectricityBillsAction({
        pgId: selectedPgId,
        billingMonth,
        rooms: roomsToGenerate.map((r) => ({
          roomId: r.roomId,
          currentReadingUnits: Number(readings[r.roomId]),
        })),
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setLastResults(res.results);
      const stillNeed = checklist
        ? checklist.summary.readingRequired +
          checklist.summary.previousUnavailable -
          res.generated
        : 0;
      const maintenance = checklist?.summary.maintenanceExcluded ?? 0;
      setSummary(
        [
          `${res.generated} electricity bill${res.generated === 1 ? '' : 's'} generated.`,
          stillNeed > 0
            ? `${Math.max(0, stillNeed)} room${stillNeed === 1 ? '' : 's'} still need readings.`
            : null,
          maintenance > 0
            ? `${maintenance} room${maintenance === 1 ? '' : 's'} excluded — maintenance.`
            : null,
          res.failed > 0 ? `${res.failed} failed.` : null,
        ]
          .filter(Boolean)
          .join(' '),
      );
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-5">
      <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
        <h2 className="text-lg font-semibold text-white">Electricity billing</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Pick a month and one PG. Enter current meter readings — previous readings load
          automatically.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-apg-silver">
            Billing month
            <input
              type="month"
              value={monthValue}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-apg-silver">
            PG
            <select
              value={selectedPgId ?? ''}
              onChange={(e) => setPg(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
            >
              <option value="">— Select PG —</option>
              {pgs.map((pg) => (
                <option key={pg.id} value={pg.id}>
                  {pg.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-3 text-xs text-apg-silver">
          Rate <span className="font-medium text-white">{rateLabel}/unit</span> (from electricity
          configuration)
        </p>
      </section>

      {!selectedPgId ? (
        <div className="rounded-xl border border-white/10 bg-[#12161C] p-5 text-sm text-apg-silver">
          Select a PG to view its room checklist for {monthValue}.
        </div>
      ) : !checklist ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-5 text-sm text-rose-100">
          PG not found or unavailable.
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-white">
                  {checklist.pgName}
                </h3>
                <p className="mt-0.5 text-xs text-apg-silver">{checklist.monthLabel}</p>
              </div>
              {!checklist.summary.hasAnyBillActivity &&
              checklist.summary.readingRequired === 0 &&
              checklist.summary.previousUnavailable === 0 ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-apg-silver">
                  Not started
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-apg-silver">
              <span>{checklist.summary.totalRooms} rooms</span>
              <span className="text-emerald-200">
                ✓ {checklist.summary.alreadyBilled} already billed
              </span>
              <span className="text-amber-200">
                🟠 {checklist.summary.readingRequired} reading required
              </span>
              {checklist.summary.previousUnavailable > 0 ? (
                <span className="text-rose-200">
                  ⚠ {checklist.summary.previousUnavailable} previous unavailable
                </span>
              ) : null}
              {checklist.summary.maintenanceExcluded > 0 ? (
                <span className="text-zinc-400">
                  ⛔ {checklist.summary.maintenanceExcluded} maintenance
                </span>
              ) : null}
            </div>
            {!checklist.summary.hasAnyBillActivity &&
            checklist.summary.readingRequired === 0 &&
            checklist.summary.previousUnavailable === 0 ? (
              <p className="mt-3 text-xs text-apg-silver">
                No electricity bills generated for this PG/month yet. Eligible rooms appear below
                when monthly residents occupy AC rooms.
              </p>
            ) : null}
          </section>

          <div className="space-y-2">
            {checklist.rooms.map((room) => {
              const currentRaw = readings[room.roomId] ?? '';
              const current = Number(currentRaw);
              const prev = room.previousReadingUnits;
              const units =
                prev != null && currentRaw.trim() && Number.isFinite(current)
                  ? current - prev
                  : null;
              const invalidCurrent =
                prev != null && currentRaw.trim() && Number.isFinite(current) && current < prev;
              const estimated =
                units != null && units >= 0 ? Math.round(units * room.ratePerUnitPaise) : null;
              const canSelect = room.status === 'reading_required' && !invalidCurrent && units != null && units >= 0;
              const isChecked = canSelect && selected[room.roomId] !== false;
              const result = lastResults.find((r) => r.roomId === room.roomId);

              return (
                <article
                  key={room.roomId}
                  className="rounded-xl border border-white/10 bg-[#12161C] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {canSelect ? (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setSelected((s) => ({ ...s, [room.roomId]: e.target.checked }))
                          }
                          className="size-4 rounded border-white/20 bg-black/20"
                          aria-label={`Select room ${room.roomNumber}`}
                        />
                      ) : null}
                      <h4 className="text-sm font-semibold text-white">Room {room.roomNumber}</h4>
                    </div>
                    <span className={`text-[11px] font-medium ${statusTone(room.status)}`}>
                      {STATUS_LABEL[room.status] ?? room.status}
                    </span>
                  </div>

                  {room.status === 'already_billed' ? (
                    <p className="mt-2 text-xs text-emerald-200">
                      ✓ Billed
                      {room.billTotalPaise != null ? ` · ${paiseToInr(room.billTotalPaise)}` : ''}
                      {room.billId ? (
                        <>
                          {' · '}
                          <Link
                            href={`/admin/electricity/bills/${room.billId}`}
                            className="text-[#FF5A1F] hover:underline"
                          >
                            View bill
                          </Link>
                        </>
                      ) : null}
                    </p>
                  ) : null}

                  {room.status === 'maintenance_excluded' ? (
                    <p className="mt-2 text-xs text-apg-silver">
                      Entire room is under maintenance — excluded from electricity billing.
                    </p>
                  ) : null}

                  {room.status === 'not_eligible' ? (
                    <p className="mt-2 text-xs text-apg-silver">
                      No monthly residents on available beds for this month.
                    </p>
                  ) : null}

                  {room.status === 'previous_unavailable' ? (
                    <p className="mt-2 text-xs text-rose-200">
                      Previous reading unavailable. Record an opening meter reading before billing
                      this room. Do not assume 0.
                    </p>
                  ) : null}

                  {room.status === 'reading_required' && prev != null ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-apg-silver">
                          Previous reading
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-white">
                          {prev.toLocaleString('en-IN')} units
                        </p>
                        {room.previousBillingMonthLabel ? (
                          <p className="text-[11px] text-apg-silver">
                            Saved from {room.previousBillingMonthLabel}
                          </p>
                        ) : (
                          <p className="text-[11px] text-apg-silver">From meter history</p>
                        )}
                      </div>
                      <label className="block">
                        <span className="text-[10px] uppercase tracking-wide text-apg-silver">
                          Current reading
                        </span>
                        <input
                          type="number"
                          min={prev}
                          step="0.01"
                          value={currentRaw}
                          onChange={(e) =>
                            setReadings((r) => ({ ...r, [room.roomId]: e.target.value }))
                          }
                          className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                          placeholder="Enter reading"
                        />
                        {invalidCurrent ? (
                          <p className="mt-1 text-[11px] text-rose-300">
                            Current must be ≥ previous ({prev}).
                          </p>
                        ) : null}
                      </label>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-apg-silver">
                          Units consumed
                        </p>
                        <p className="mt-1 text-sm text-white">
                          {units == null || invalidCurrent ? '—' : units.toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-apg-silver">
                          Estimated bill
                        </p>
                        <p className="mt-1 text-sm text-white">
                          {estimated == null || invalidCurrent ? '—' : paiseToInr(estimated)}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {result && !result.ok ? (
                    <p className="mt-2 text-xs text-rose-300">{result.message}</p>
                  ) : null}
                  {result?.ok && result.duplicate ? (
                    <p className="mt-2 text-xs text-apg-silver">Already existed — skipped.</p>
                  ) : null}
                </article>
              );
            })}
          </div>

          <section className="sticky bottom-3 rounded-xl border border-white/10 bg-[#1A1F27]/95 p-4 shadow-lg backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-apg-silver">
                <p className="font-medium text-white">{checklist.pgName}</p>
                <p>
                  Selected: {roomsToGenerate.length} room
                  {roomsToGenerate.length === 1 ? '' : 's'}
                  {roomsToGenerate.length > 0
                    ? ` · Estimated ${paiseToInr(estimatedTotalPaise)}`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectAllReady}
                  disabled={readyRooms.length === 0 || pending}
                  className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5 disabled:opacity-50"
                >
                  Select all ready rooms
                </button>
                <button
                  type="button"
                  onClick={generate}
                  disabled={roomsToGenerate.length === 0 || pending}
                  className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                >
                  {pending ? 'Generating…' : 'Generate Electricity Bills'}
                </button>
              </div>
            </div>
            {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
            {summary ? <p className="mt-2 text-xs text-emerald-200">{summary}</p> : null}
          </section>
        </>
      )}
    </div>
  );
}
