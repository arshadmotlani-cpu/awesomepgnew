'use client';

import type { RoomIntegrityIssue } from '@/src/lib/roomIntegrity/types';

export function RoomIntegrityPreview({
  capacity,
  physicalBeds,
  bookableBeds,
  occupiedBeds,
  blockedBeds,
  maintenanceBeds,
  issues,
}: {
  capacity: number;
  physicalBeds: number;
  bookableBeds: number;
  occupiedBeds: number;
  blockedBeds: number;
  maintenanceBeds: number;
  issues: RoomIntegrityIssue[];
}) {
  const ok = issues.length === 0;

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        ok
          ? 'border-emerald-500/40 bg-emerald-950/20'
          : 'border-rose-500/40 bg-rose-950/20'
      }`}
    >
      <p
        className={`text-sm font-medium ${ok ? 'text-emerald-200' : 'text-rose-200'}`}
      >
        {ok ? '✓ Everything consistent' : '⚠ Configuration invalid'}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <Metric label="Capacity" value={capacity} />
        <Metric label="Physical beds" value={physicalBeds} />
        <Metric label="Bookable beds" value={bookableBeds} />
        <Metric label="Occupied" value={occupiedBeds} />
        <Metric label="Blocked" value={blockedBeds} />
        <Metric label="Disabled" value={maintenanceBeds} />
      </dl>
      {!ok ? (
        <ul className="mt-2 space-y-0.5 text-[11px] text-rose-100/90">
          {issues.map((issue) => (
            <li key={issue.code}>• {issue.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2 sm:block">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-200">{value}</dd>
    </div>
  );
}
