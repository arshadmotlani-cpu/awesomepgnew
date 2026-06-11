'use client';

const SECTIONS = [
  {
    id: 'listing',
    label: '1. Listing',
    desc: 'Public /pgs page',
  },
  {
    id: 'rooms',
    label: '2. Rooms & electricity',
    desc: 'Beds, rent, meter',
  },
  {
    id: 'collections',
    label: '3. Collections',
    desc: 'QR payments',
  },
] as const;

export function PgEditSectionNav({ bedCount }: { bedCount: number }) {
  return (
    <div className="sticky top-14 z-20 -mx-4 mb-6 border-b border-white/10 bg-[#0B0F14]/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-apg-silver">
        PG setup — three sections
      </p>
      <nav className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" aria-label="PG setup sections">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#pg-section-${s.id}`}
            className="flex flex-1 min-w-[140px] flex-col rounded-lg border border-zinc-700 bg-zinc-900/80 px-4 py-3 transition hover:border-[#FF5A1F]/50 hover:bg-zinc-800"
          >
            <span className="text-sm font-semibold text-white">
              {s.label}
              {s.id === 'rooms' && bedCount === 0 ? (
                <span className="ml-1 text-amber-400">· start here</span>
              ) : null}
            </span>
            <span className="text-xs text-zinc-500">{s.desc}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
