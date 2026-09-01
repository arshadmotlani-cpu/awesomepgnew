'use client';

import { buildElectricityDueCountdown } from '@/src/lib/billing/electricityDueCountdown';
import type { DateLike } from '@/src/lib/dates';

type Props = {
  dueDate: DateLike;
  today?: DateLike;
  className?: string;
};

export function ElectricityDueCountdown({ dueDate, today, className }: Props) {
  const state = buildElectricityDueCountdown(dueDate, today);
  const baseClass = className ?? 'text-xs text-zinc-500';
  const tone = state.isOverdue ? 'text-amber-800' : baseClass;

  return (
    <p className={tone}>
      {state.isOverdue ? <span aria-hidden="true">⚠ </span> : <span aria-hidden="true">⏳ </span>}
      {state.message}
    </p>
  );
}
