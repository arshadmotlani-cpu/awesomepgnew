'use client';

import { TOUR_EXAMPLE_DATES } from '@/src/lib/cockroach/onboardingSteps';

type Props = {
  showNotice: boolean;
  showCapped: boolean;
  theme?: 'dark' | 'light';
};

/**
 * Fallback tour anchors when the live room has no notice-period or capped beds.
 * Visually compact; highlighted only during the Roachie tour.
 */
export function RoachieTourDemoBeds({ showNotice, showCapped, theme = 'dark' }: Props) {
  if (!showNotice && !showCapped) return null;

  const dark = theme === 'dark';
  const tile = dark
    ? 'rounded-xl border border-dashed border-white/15 apg-glass-light p-3'
    : 'rounded-lg border border-dashed border-zinc-300 bg-white p-3';

  return (
    <div
      className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
      aria-label="Example bed states for tour"
    >
      {showNotice ? (
        <div
          data-roachie-tour="bed-notice"
          className={tile}
        >
          <span className={`text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
            Bed B2 <span className="text-[10px] font-normal text-apg-muted">(example)</span>
          </span>
          <span className="mt-2 inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-400/30">
            Leaving Soon · {TOUR_EXAMPLE_DATES.leavingSoon}
          </span>
          <p className={`mt-2 text-[11px] ${dark ? 'text-apg-silver' : 'text-zinc-600'}`}>
            Guest gave notice — you can book for after they move out.
          </p>
        </div>
      ) : null}
      {showCapped ? (
        <div
          data-roachie-tour="bed-capped"
          className={tile}
        >
          <span className={`text-sm font-semibold ${dark ? 'text-white' : 'text-zinc-900'}`}>
            Bed B3 <span className="text-[10px] font-normal text-apg-muted">(example)</span>
          </span>
          <span className="mt-2 inline-flex rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-200 ring-1 ring-rose-400/25">
            Available until: {TOUR_EXAMPLE_DATES.availableUntil}
          </span>
          <p className={`mt-2 text-[11px] ${dark ? 'text-apg-silver' : 'text-zinc-600'}`}>
            Another guest reserved this bed after that date.
          </p>
        </div>
      ) : null}
    </div>
  );
}
