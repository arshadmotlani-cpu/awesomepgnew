'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BOOKING_GUIDE } from '@/src/lib/guides/bookingGuide';
import { RESIDENT_GUIDE } from '@/src/lib/guides/residentGuide';
import { GuideCatalogPanel } from '@/src/components/guides/GuideCatalogPanel';

export function CustomerGuideTabs() {
  const searchParams = useSearchParams();
  const type = searchParams.get('type') === 'resident' ? 'resident' : 'booking';
  const catalog = type === 'resident' ? RESIDENT_GUIDE : BOOKING_GUIDE;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <Link
          href="/guide?type=booking"
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            type === 'booking'
              ? 'bg-apg-orange text-white'
              : 'border border-white/15 text-apg-silver hover:border-apg-orange/40 hover:text-white'
          }`}
        >
          New to booking
        </Link>
        <Link
          href="/guide?type=resident"
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            type === 'resident'
              ? 'bg-apg-cyan text-apg-charcoal'
              : 'border border-white/15 text-apg-silver hover:border-apg-cyan/40 hover:text-white'
          }`}
        >
          Already living here
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{catalog.title}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-apg-silver">{catalog.subtitle}</p>
      </header>

      <GuideCatalogPanel catalog={catalog} tone="customer" />
    </div>
  );
}
