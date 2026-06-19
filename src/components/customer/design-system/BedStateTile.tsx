'use client';

import { bedStateTone } from '@/src/lib/design-system/tokens';

export type BedVisualState = 'available' | 'occupied' | 'reserved' | 'selected' | 'notice';

const stateIcon: Record<BedVisualState, string> = {
  available: '○',
  occupied: '●',
  reserved: '◐',
  selected: '✓',
  notice: '◔',
};

type Props = {
  bedCode: string;
  label: string;
  sublabel?: string;
  state: BedVisualState;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
};

export function BedStateTile({
  bedCode,
  label,
  sublabel,
  state,
  selected,
  disabled,
  onSelect,
}: Props) {
  const visualState = selected ? 'selected' : state;
  const tone = bedStateTone[visualState];

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`relative flex min-h-[108px] w-full min-w-0 flex-col items-center justify-center rounded-xl border-2 px-2 py-3 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-apg-orange disabled:cursor-not-allowed disabled:opacity-60 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transform-none ${tone}`}
    >
      <span className="absolute left-2 top-2 text-[10px] opacity-70" aria-hidden>
        {stateIcon[visualState]}
      </span>
      <span className="text-sm font-bold uppercase tracking-wide">{bedCode}</span>
      <span className="mt-1.5 text-[11px] font-semibold leading-snug">{label}</span>
      {sublabel ? (
        <span className="mt-1 px-1 text-[10px] leading-snug opacity-90">{sublabel}</span>
      ) : null}
    </button>
  );
}
