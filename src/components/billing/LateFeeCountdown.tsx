import { buildLateFeeCountdown } from '@/src/lib/billing/lateFeeCountdown';
import type { DateLike } from '@/src/lib/dates';

type Props = {
  issueDate: DateLike;
  today?: DateLike;
  className?: string;
};

export function LateFeeCountdown({ issueDate, today, className }: Props) {
  const state = buildLateFeeCountdown(issueDate, today);
  const baseClass = className ?? 'text-xs text-zinc-500';

  if (state.phase === 'grace') {
    return (
      <p className={baseClass}>
        <span aria-hidden="true">⏳ </span>
        {state.message}
      </p>
    );
  }

  return (
    <div className={`space-y-0.5 ${baseClass}`}>
      <p className="text-amber-800">
        <span aria-hidden="true">⚠ </span>
        {state.message}
      </p>
      <p className="text-zinc-500">Tomorrow: {state.percentTomorrow}%</p>
    </div>
  );
}
