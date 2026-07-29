'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { searchHairAction } from '@/src/hair/actions/search';
import type { HairSearchHit } from '@/src/hair/services/search';

export function HairGlobalSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<HairSearchHit[]>([]);
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative max-w-xs flex-1">
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
        className="fyh-input h-9"
      />
      {hits.length > 0 ? (
        <div className="absolute left-0 right-0 top-10 z-50 max-h-72 overflow-auto rounded-xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-2 shadow-xl">
          {hits.map((h) => (
            <Link
              key={`${h.type}-${h.id}`}
              href={h.href}
              className="block rounded-lg px-2 py-1.5 hover:bg-white/5"
              onClick={() => {
                setHits([]);
                setQ('');
              }}
            >
              <p className="text-sm text-fyh-text">{h.title}</p>
              <p className="text-[11px] text-fyh-text-muted">
                {h.type} · {h.subtitle}
              </p>
            </Link>
          ))}
          {pending ? <p className="px-2 text-[11px] text-fyh-text-muted">Searching…</p> : null}
        </div>
      ) : null}
    </div>
  );
}
