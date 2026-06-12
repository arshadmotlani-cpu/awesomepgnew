'use client';

import Image from 'next/image';
import { COCKROACH_AI_NAME } from '@/src/lib/cockroach/branding';
import { MASCOT_IMAGES } from '@/src/lib/cockroach/mascotAssets';
import { formatDate } from '@/src/lib/format';

export function RoachieBedSheetTip({
  opensDate,
}: {
  /** When the bed opens (notice / vacating date), if known. */
  opensDate?: string | null;
}) {
  const opensLabel = opensDate ? formatDate(opensDate) : 'when it opens';

  return (
    <aside
      className="mt-4 flex gap-3 rounded-xl border border-[#ffcc00]/25 bg-[#ffcc00]/[0.06] p-3"
      data-roachie-tour="bed-booking-tip"
    >
      <Image
        src={MASCOT_IMAGES.welcome}
        alt=""
        width={44}
        height={44}
        className="h-11 w-11 shrink-0 object-contain"
        aria-hidden
      />
      <div className="min-w-0 text-xs leading-relaxed text-[#f4f6f8]">
        <p className="font-semibold text-[#ffcc00]">{COCKROACH_AI_NAME} says</p>
        <p className="mt-1">
          <strong className="text-white">Pre-book</strong> — you plan to{' '}
          <strong className="text-white">check in on {opensLabel}</strong> when this bed opens
          (current guest leaves).
        </p>
        <p className="mt-2">
          <strong className="text-white">Reserve early (50% rent)</strong> — you are{' '}
          <strong className="text-white">not</strong> moving in on {opensLabel}. You hold the bed
          for yourself and pay half rent now; when you reach Nagpur you pick your actual check-in
          day and move in then.
        </p>
      </div>
    </aside>
  );
}
