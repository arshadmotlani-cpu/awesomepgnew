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
    <div className="relative w-full max-w-md lg:max-w-lg">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fyh-text-muted"
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
        className="fyh-input h-9 w-full pl-9 text-[0.8125rem]"
        aria-label="Search customers and appointments"
      />
      {hits.length > 0 ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-[200] max-h-64 overflow-auto rounded-xl border border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-elevated)] p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.4)]">
          {hits.map((h) => (
            <Link
              key={`${h.type}-${h.id}`}
              href={h.href}
              className="block rounded-lg px-2.5 py-2 transition hover:bg-white/8"
              onClick={() => {
                setHits([]);
                setQ('');
              }}
            >
              <p className="text-[0.8125rem] font-medium text-fyh-text">{h.title}</p>
              <p className="text-[11px] text-fyh-text-secondary">
                {h.type} · {h.subtitle}
              </p>
            </Link>
          ))}
          {pending ? <p className="px-2.5 py-1.5 text-[11px] text-fyh-text-muted">Searching…</p> : null}
        </div>
      ) : null}
    </div>
  );
}
