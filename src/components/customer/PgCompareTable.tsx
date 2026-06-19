'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { ApgCard } from '@/src/components/customer/design-system';
import { CountUpNumber } from '@/src/components/customer/design-system';
import { paiseToInr } from '@/src/lib/format';

export type ComparePgRow = {
  slug: string;
  name: string;
  city: string;
  availableBeds: number;
  totalBeds: number;
  startingMonthlyPaise: number | null;
  genderPolicy: string;
};

type Props = {
  pgs: ComparePgRow[];
};

export function PgCompareTable({ pgs }: Props) {
  const searchParams = useSearchParams();
  const selected = useMemo(() => {
    const raw = searchParams.getAll('pg').slice(0, 3);
    return raw.length > 0 ? raw : pgs.slice(0, 3).map((p) => p.slug);
  }, [searchParams, pgs]);

  const rows = selected
    .map((slug) => pgs.find((p) => p.slug === slug))
    .filter((p): p is ComparePgRow => p != null);

  return (
    <div className="space-y-6">
      <p className="text-sm text-apg-silver">
        Select up to 3 PGs to compare. Add <code className="text-apg-cyan">?pg=slug&amp;pg=slug</code>{' '}
        to the URL.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {rows.map((pg) => (
          <ApgCard key={pg.slug} tier="card" className="p-5">
            <h2 className="text-lg font-semibold text-white">{pg.name}</h2>
            <p className="mt-1 text-xs text-apg-silver">{pg.city}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-apg-silver">Available beds</dt>
                <dd className="font-semibold tabular-nums text-white">
                  <CountUpNumber value={pg.availableBeds} /> / {pg.totalBeds}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-apg-silver">From</dt>
                <dd className="font-semibold tabular-nums text-white">
                  {pg.startingMonthlyPaise != null
                    ? paiseToInr(pg.startingMonthlyPaise)
                    : '—'}
                  /mo
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-apg-silver">Policy</dt>
                <dd className="font-medium text-white">{pg.genderPolicy}</dd>
              </div>
            </dl>
            <Link
              href={`/pgs/${pg.slug}`}
              className="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-apg-cyan hover:text-apg-orange"
            >
              View property →
            </Link>
          </ApgCard>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {pgs.map((pg) => {
          const next = selected.includes(pg.slug)
            ? selected
            : [...selected, pg.slug].slice(-3);
          const params = new URLSearchParams();
          for (const slug of next) params.append('pg', slug);
          return (
            <Link
              key={pg.slug}
              href={`/pgs/compare?${params.toString()}`}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-apg-silver hover:border-apg-orange/40 hover:text-white"
            >
              {pg.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
