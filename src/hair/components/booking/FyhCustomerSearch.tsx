'use client';

import { useEffect, useState } from 'react';
import { searchCustomersForBookingAction } from '@/src/hair/actions/booking';
import { Input } from '@/src/hair/components/ui/input';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';

type Props = {
  onSelect: (customer: PosCustomerHit) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  tone?: 'default' | 'booking';
};

export function FyhCustomerSearch({
  onSelect,
  placeholder = 'Search by name or mobile number',
  autoFocus = false,
  className,
  inputClassName,
  tone = 'default',
}: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PosCustomerHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        setHits(await searchCustomersForBookingAction(q));
      } finally {
        setSearching(false);
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [query]);

  const listTone =
    tone === 'booking'
      ? 'divide-white/10 border-white/15 bg-black/40'
      : 'divide-[color:var(--fyh-border)] border-[color:var(--fyh-border)] bg-black/10';
  const nameTone = tone === 'booking' ? 'text-white' : 'text-fyh-text';
  const metaTone = tone === 'booking' ? 'text-white/75' : 'text-fyh-text-muted';
  const emptyTone = tone === 'booking' ? 'text-white/70' : 'text-fyh-text-muted';
  const hoverTone = tone === 'booking' ? 'hover:bg-white/10' : 'hover:bg-white/5';

  return (
    <div className={className}>
      <Input
        autoFocus={autoFocus}
        aria-label="Search customer"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className={
          inputClassName ??
          (tone === 'booking'
            ? 'h-12 text-base text-white placeholder:text-white/50'
            : 'h-12 text-base')
        }
      />
      {query.trim().length >= 1 ? (
        <ul
          className={`mt-2 divide-y overflow-hidden rounded-xl border ${listTone}`}
          role="listbox"
        >
          {searching ? (
            <li className={`px-4 py-5 text-center text-sm ${emptyTone}`}>Searching…</li>
          ) : hits.length > 0 ? (
            hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  role="option"
                  className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left ${hoverTone}`}
                  onClick={() => {
                    onSelect(hit);
                    setQuery('');
                    setHits([]);
                  }}
                >
                  <span className={`font-semibold ${nameTone}`}>{hit.fullName}</span>
                  <span className={`text-sm ${metaTone}`}>
                    {hit.phone}
                    {hit.customerCode ? ` · ${hit.customerCode}` : ''}
                    {hit.walletBalancePaise > 0
                      ? ` · Credit ${formatInrFromPaise(hit.walletBalancePaise)}`
                      : ''}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className={`px-4 py-5 text-center text-sm ${emptyTone}`}>No customers found</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
