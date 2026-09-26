'use client';

import { cancelRoomConfigurationScheduleAction } from '@/app/(admin)/admin/pgs/room-configuration-actions';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { ScheduledRoomConfigurationSummary } from '@/src/services/roomConfigurationSchedule';

type Props = {
  pgId: string;
  roomNumber: string;
  currentBedCount: number;
  currentMonthlyRentPaise: number;
  currentMonthlyDepositPaise: number;
  scheduled: ScheduledRoomConfigurationSummary[];
  onToast: (message: string, tone: 'success' | 'error') => void;
};

export function RoomConfigurationSchedulePanel({
  pgId,
  roomNumber,
  currentBedCount,
  currentMonthlyRentPaise,
  currentMonthlyDepositPaise,
  scheduled,
  onToast,
}: Props) {
  if (scheduled.length === 0) return null;

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-sky-500/30 bg-sky-950/20 px-3 py-2 text-sm">
      <p className="font-medium text-sky-100">Room configuration — current vs scheduled</p>
      <p className="text-xs text-sky-100/80">
        Current: {currentBedCount} sharing · {paiseToInr(currentMonthlyRentPaise)} rent ·{' '}
        {paiseToInr(currentMonthlyDepositPaise)} deposit
      </p>
      <ul className="space-y-2 text-xs text-sky-50/90">
        {scheduled.map((row) => (
          <li
            key={row.scheduleId}
            className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-sky-500/20 bg-sky-950/30 px-2 py-1.5"
          >
            <div>
              <p className="font-semibold text-sky-100">
                Scheduled from {formatDate(row.effectiveFrom)}
              </p>
              <p>
                {row.targetBedCount} sharing · {row.roomTypeName} ·{' '}
                {paiseToInr(row.monthlyRatePaise)} rent ·{' '}
                {paiseToInr(row.monthlyDepositPaise)} deposit
              </p>
              <p className="mt-0.5 text-sky-200/70">
                No invoice or deposit charge until {formatDate(row.effectiveFrom)}. Next rent bill
                uses new pricing from that date.
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 text-[11px] font-semibold text-rose-300 hover:underline"
              onClick={() => {
                void (async () => {
                  const result = await cancelRoomConfigurationScheduleAction(pgId, row.scheduleId);
                  if (!result.ok) {
                    onToast(result.error ?? 'Could not cancel scheduled change.', 'error');
                    return;
                  }
                  onToast('Scheduled room change cancelled.', 'success');
                  window.location.reload();
                })();
              }}
            >
              Cancel schedule
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-sky-200/60">
        Room {roomNumber} — changing sharing/pricing does not rewrite past invoices.
      </p>
    </div>
  );
}
