'use client';

import type { AttendanceDayClassification } from '@/src/workforce/lib/attendanceSalaryMath';

const BOX_LABELS: Record<AttendanceDayClassification, string> = {
  present: 'P',
  absent: 'A',
  paid_leave: 'PL',
  weekly_off: 'WO',
  holiday: 'H',
  future: '·',
  not_marked: '—',
};

const BOX_CLASSES: Record<AttendanceDayClassification, string> = {
  present: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  absent: 'bg-red-500/20 text-red-300 border-red-500/40',
  paid_leave: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  weekly_off: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  holiday: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  future: 'bg-transparent text-zinc-600 border-zinc-700/30',
  not_marked: 'bg-zinc-500/10 text-zinc-500 border-zinc-600/30',
};

export function attendanceBoxLabel(classification: AttendanceDayClassification): string {
  return BOX_LABELS[classification];
}

type DayCell = {
  workDate: string;
  classification: AttendanceDayClassification;
};

type Props = {
  days: DayCell[];
  selectedDate?: string | null;
  onSelectDate?: (workDate: string) => void;
  inspectBaseHref?: string;
  employeeId?: string;
  compact?: boolean;
};

export function AttendanceMonthCalendar({
  days,
  selectedDate,
  onSelectDate,
  inspectBaseHref,
  employeeId,
  compact,
}: Props) {
  const cellClass = compact ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-xs';

  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((day) => {
        const dayNum = Number(day.workDate.slice(8, 10));
        const label = attendanceBoxLabel(day.classification);
        const selected = selectedDate === day.workDate;
        const clickable =
          Boolean(onSelectDate || (inspectBaseHref && employeeId)) && day.classification !== 'future';

        const handleSelect = () => {
          if (onSelectDate) {
            onSelectDate(day.workDate);
            return;
          }
          if (inspectBaseHref && employeeId) {
            const join = inspectBaseHref.includes('?') ? '&' : '?';
            window.location.href = `${inspectBaseHref}${join}employeeId=${employeeId}&inspectDate=${day.workDate}`;
          }
        };

        const inner = (
          <span
            className={`flex ${cellClass} flex-col items-center justify-center rounded border font-medium ${BOX_CLASSES[day.classification]} ${selected ? 'ring-2 ring-fyh-accent' : ''}`}
            title={`${day.workDate}: ${day.classification}`}
          >
            <span className="text-[9px] leading-none opacity-70">{dayNum}</span>
            <span className="leading-none">{label}</span>
          </span>
        );

        if (clickable) {
          return (
            <button
              key={day.workDate}
              type="button"
              onClick={handleSelect}
              className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-fyh-accent"
            >
              {inner}
            </button>
          );
        }

        return <div key={day.workDate}>{inner}</div>;
      })}
    </div>
  );
}
