'use client';

import { useMemo, useState } from 'react';
import { SpatialPgGrid } from '@/src/components/world/SpatialPgExplorer';
import type { PgCardData } from '@/src/components/customer/PgCard';

export function PgBrowseList({
  pgs,
  uploadScreenshot,
}: {
  pgs: PgCardData[];
  uploadScreenshot?: (formData: FormData) => Promise<string>;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pgs;
    return pgs.filter((pg) => {
      const haystack =
        `${pg.name} ${pg.city} ${pg.state} ${pg.pincode} ${pg.description ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [pgs, query]);

  return (
    <div className="space-y-6">
      <label className="block max-w-xl">
        <span className="text-xs font-semibold uppercase tracking-wider text-apg-orange">
          Search
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="PG name, city, or area…"
          className="apg-input-dark mt-2 w-full rounded-xl px-4 py-3 text-sm"
        />
      </label>

      {query && filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 apg-glass-light px-6 py-10 text-center text-sm text-apg-silver">
          No PGs match &ldquo;{query}&rdquo;. Try a different city or name.
        </p>
      ) : (
        <SpatialPgGrid pgs={filtered} uploadScreenshot={uploadScreenshot} />
      )}
    </div>
  );
}
