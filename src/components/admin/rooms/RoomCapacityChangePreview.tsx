'use client';

import { paiseToInr } from '@/src/lib/format';
import {
  buildRoomCapacityChangePreview,
  type RoomCapacityPreviewBed,
} from '@/src/lib/roomCapacityChangePreview';

type Props = {
  currentBeds: RoomCapacityPreviewBed[];
  archivedBedCodes: string[];
  targetBedCount: number;
  targetLabel: string;
  monthlyRatePaise: number;
};

function lineTone(kind: 'existing' | 'reactivate' | 'create' | 'archive'): string {
  if (kind === 'create' || kind === 'reactivate') return 'border-emerald-500/40 bg-emerald-950/20 text-emerald-100';
  if (kind === 'archive') return 'border-rose-500/40 bg-rose-950/20 text-rose-100';
  return 'border-zinc-700 bg-zinc-900/80 text-white';
}

export function RoomCapacityChangePreview({
  currentBeds,
  archivedBedCodes,
  targetBedCount,
  targetLabel,
  monthlyRatePaise,
}: Props) {
  const preview = buildRoomCapacityChangePreview({
    currentBeds,
    archivedBedCodes,
    targetBedCount,
    targetLabel,
    monthlyRatePaise,
  });

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Preview</p>
        <p className="mt-1 text-sm text-white">
          {targetLabel} · {preview.targetBedCount} bed{preview.targetBedCount === 1 ? '' : 's'} required
        </p>
      </div>

      <ul className="space-y-2">
        {preview.lines.map((line) => (
          <li
            key={`${line.kind}-${line.bedCode}`}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${lineTone(line.kind)}`}
          >
            <span className="font-semibold">{line.bedCode}</span>
            <span className="text-xs opacity-90">{line.statusLabel}</span>
          </li>
        ))}
      </ul>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm">
        <p className="text-zinc-400">Rent</p>
        <p className="font-medium text-white">
          {paiseToInr(preview.monthlyRatePaise)} / bed / month
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">Existing rent retained — capacity change does not alter configured pricing.</p>
      </div>

      {preview.blocked && preview.blockMessage ? (
        <p className="text-sm text-rose-400">{preview.blockMessage}</p>
      ) : null}
    </div>
  );
}
