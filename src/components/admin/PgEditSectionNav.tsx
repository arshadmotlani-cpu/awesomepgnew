'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS = [
  {
    slug: 'map',
    label: 'Bed map',
    desc: 'Occupancy & tenants',
  },
  {
    slug: 'listing',
    label: '1. Listing',
    desc: 'Public /pgs page',
  },
  {
    slug: 'rooms',
    label: '2. Rooms & electricity',
    desc: 'Beds, rent, meter',
  },
  {
    slug: 'collections',
    label: '3. Collections',
    desc: 'QR payments',
  },
] as const;

export function PgEditSectionNav({
  pgId,
  bedCount,
}: {
  pgId: string;
  bedCount: number;
}) {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-30 -mx-3 mb-6 border-b border-white/10 bg-[#0B0F14] px-3 py-3 shadow-[0_8px_24px_-8px_rgba(11,15,20,0.95)] sm:-mx-4 sm:px-4 lg:-mx-8 lg:px-8">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-apg-silver">
        PG operations & setup
      </p>
      <nav className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" aria-label="PG sections">
        {SECTIONS.map((s) => {
          const href = `/admin/pgs/${pgId}/${s.slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={s.slug}
              href={href}
              className={`flex min-w-[140px] flex-1 flex-col rounded-lg border px-4 py-3 transition ${
                active
                  ? 'border-[#FF5A1F] bg-[#FF5A1F]/10'
                  : 'border-zinc-700 bg-zinc-900/80 hover:border-[#FF5A1F]/50 hover:bg-zinc-800'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="text-sm font-semibold text-white">
                {s.label}
                {s.slug === 'rooms' && bedCount === 0 ? (
                  <span className="ml-1 text-amber-400">· start here</span>
                ) : null}
              </span>
              <span className="text-xs text-zinc-500">{s.desc}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
