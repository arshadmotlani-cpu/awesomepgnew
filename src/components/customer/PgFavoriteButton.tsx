'use client';

import { useCallback, useEffect, useState } from 'react';

const FAVORITES_KEY = 'apg-favorite-pgs';

export function readFavoritePgSlugs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function writeFavoritePgSlugs(slugs: string[]) {
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(slugs));
}

export function PgFavoriteButton({ pgSlug, pgName }: { pgSlug: string; pgName: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(readFavoritePgSlugs().includes(pgSlug));
  }, [pgSlug]);

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const current = readFavoritePgSlugs();
      const next = saved ? current.filter((s) => s !== pgSlug) : [...current, pgSlug];
      writeFavoritePgSlugs(next);
      setSaved(!saved);
    },
    [pgSlug, saved],
  );

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={saved ? `Remove ${pgName} from favorites` : `Save ${pgName} to favorites`}
      aria-pressed={saved}
      className="absolute right-3 bottom-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/50 text-lg backdrop-blur transition hover:scale-105"
    >
      {saved ? '❤️' : '🤍'}
    </button>
  );
}

export function FavoritesList({
  pgs,
}: {
  pgs: { slug: string; name: string; city: string; availableBeds: number }[];
}) {
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    setSlugs(readFavoritePgSlugs());
  }, []);

  const saved = pgs.filter((p) => slugs.includes(p.slug));

  if (slugs.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-white/15 apg-glass-light p-8 text-center text-sm text-apg-silver">
        No saved PGs yet. Tap the heart on any property while browsing.
      </p>
    );
  }

  if (saved.length === 0) {
    return (
      <p className="text-sm text-apg-silver">
        Saved slugs no longer match live properties. Browse PGs and save again.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {saved.map((pg) => (
        <li key={pg.slug}>
          <a
            href={`/pgs/${pg.slug}`}
            className="apg-glass block rounded-xl p-4 transition hover:border-apg-orange/40"
          >
            <p className="font-semibold text-white">{pg.name}</p>
            <p className="mt-1 text-xs text-apg-silver">
              {pg.city} · {pg.availableBeds} beds free today
            </p>
          </a>
        </li>
      ))}
    </ul>
  );
}
