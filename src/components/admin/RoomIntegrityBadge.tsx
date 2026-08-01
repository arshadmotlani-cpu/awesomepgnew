'use client';

import type { RoomIntegrityResult } from '@/src/lib/roomIntegrity/types';

export function RoomIntegrityBadge({
  integrity,
  compact,
}: {
  integrity: RoomIntegrityResult | undefined;
  compact?: boolean;
}) {
  if (!integrity?.hasMismatch) return null;

  if (compact) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-950/40 px-2 py-0.5 text-[11px] font-medium text-amber-200">
        <span aria-hidden>⚠ </span>
        Room configuration mismatch
      </span>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2">
      <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-amber-200">
        <span aria-hidden>⚠</span>
        Room configuration mismatch
      </p>
      <ul className="mt-1.5 space-y-0.5 text-[11px] text-amber-100/90">
        {integrity.issues.map((issue) => (
          <li key={issue.code}>• {issue.message}</li>
        ))}
      </ul>
      <p className="mt-1.5 text-[10px] text-amber-200/70">
        Capacity {integrity.storedCapacity} · Physical {integrity.physicalBeds} · Bookable{' '}
        {integrity.bookableBeds} · Occupied {integrity.occupiedBeds}
        {integrity.blockedBeds + integrity.maintenanceBeds > 0
          ? ` · Blocked ${integrity.blockedBeds} · Maintenance ${integrity.maintenanceBeds}`
          : ''}
      </p>
    </div>
  );
}
