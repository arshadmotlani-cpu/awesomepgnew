'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { searchCustomersForBookingAction } from '@/src/hair/actions/booking';
import { Input } from '@/src/hair/components/ui/input';
import { inferQuickSaleCustomerPrefill } from '@/src/hair/lib/quickSaleCustomerPrefill';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';
import {
  FyhCustomerCreateButton,
  FyhCustomerCreateModal,
  type FyhCustomerCreatePrefill,
} from '@/src/hair/components/customers/FyhCustomerCreateModal';
import type { SalonCustomerCreateContext } from '@/src/hair/actions/quickSaleCustomer';
import { cn } from '@/src/hair/lib/utils';

type Props = {
  onSelect: (customer: PosCustomerHit) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  createContext?: SalonCustomerCreateContext;
  showCreateButton?: boolean;
};

export function FyhCustomerSearch({
  onSelect,
  placeholder = 'Search by name or mobile number',
  autoFocus = false,
  className,
  inputClassName,
  createContext = 'appointment_booking',
  showCreateButton = true,
}: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PosCustomerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<FyhCustomerCreatePrefill>({
    fullName: '',
    phone: '',
  });

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

  const trimmed = query.trim();
  const showResults = trimmed.length >= 1;
  const digitsOnly = trimmed.replace(/\D/g, '');
  const looksLikePhone = digitsOnly.length >= 6;

  function openCreate(prefill?: FyhCustomerCreatePrefill) {
    setCreatePrefill(prefill ?? inferQuickSaleCustomerPrefill(trimmed));
    setCreateOpen(true);
  }

  function handleCreated(customer: PosCustomerHit) {
    onSelect(customer);
    setQuery('');
    setHits([]);
    setCreateOpen(false);
  }

  return (
    <div className={className}>
      <div className="flex gap-2">
        <Input
          autoFocus={autoFocus}
          aria-label="Search customer"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className={cn('flex-1', inputClassName)}
        />
        {showCreateButton ? (
          <FyhCustomerCreateButton onClick={() => openCreate()} />
        ) : null}
      </div>

      {showResults ? (
        <ul
          className="fyh-picker-dropdown divide-y divide-[color:var(--fyh-border-panel)] !p-0"
          role="listbox"
          aria-label="Customer search results"
        >
          {searching ? (
            <li className="px-3 py-3 text-center text-sm text-fyh-on-panel-muted">Searching…</li>
          ) : hits.length > 0 ? (
            hits.map((hit) => (
              <li key={hit.id} className="bg-[color:var(--fyh-bg-panel)]">
                <button
                  type="button"
                  role="option"
                  className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-[color-mix(in_srgb,var(--fyh-accent)_10%,var(--fyh-bg-panel))]"
                  onClick={() => {
                    onSelect(hit);
                    setQuery('');
                    setHits([]);
                  }}
                >
                  <span className="font-semibold text-fyh-on-panel">{hit.fullName}</span>
                  <span className="text-xs text-fyh-on-panel-muted">
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
            <li className="px-3 py-3 text-center">
              <p className="text-sm text-fyh-on-panel-muted">
                {looksLikePhone ? 'No customer found' : 'No customers found'}
              </p>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-fyh-accent hover:text-fyh-accent-soft"
                onClick={() => openCreate()}
              >
                <Plus className="h-4 w-4" />
                Add customer
              </button>
            </li>
          )}
        </ul>
      ) : null}

      <FyhCustomerCreateModal
        open={createOpen}
        prefill={createPrefill}
        context={createContext}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
