'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { searchHairAction } from '@/src/hair/actions/search';
import type { HairSearchHit } from '@/src/hair/services/search';

export function HairGlobalSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<HairSearchHit[]>([]);
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative w-full max-w-xl lg:max-w-2xl">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fyh-text-muted"
        aria-hidden
      />
      <input
        value={q}
        onChange={(e) => {
          const value = e.target.value;
          setQ(value);
          startTransition(async () => {
            if (value.trim().length < 2) {
              setHits([]);
              return;
            }
            try {
              setHits(await searchHairAction(value));
            } catch {
              setHits([]);
            }
          });
        }}
        placeholder="Search customers, appointments…"
        className="fyh-input h-11 w-full pl-10 text-[0.9375rem]"
        aria-label="Search customers and appointments"
      />
      {hits.length > 0 ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[200] max-h-72 overflow-auto rounded-2xl border border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-elevated)] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          {hits.map((h) => (
            <Link
              key={`${h.type}-${h.id}`}
              href={h.href}
              className="block rounded-xl px-3 py-2.5 transition hover:bg-white/8"
              onClick={() => {
                setHits([]);
                setQ('');
              }}
            >
              <p className="text-sm font-medium text-fyh-text">{h.title}</p>
              <p className="text-xs text-fyh-text-secondary">
                {h.type} · {h.subtitle}
              </p>
            </Link>
          ))}
          {pending ? <p className="px-3 py-2 text-xs text-fyh-text-muted">Searching…</p> : null}
        </div>
      ) : null}
    </div>
  );
}
