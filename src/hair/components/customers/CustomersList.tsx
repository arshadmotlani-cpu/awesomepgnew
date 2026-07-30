'use client';

import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { listCustomersAction } from '@/src/hair/actions/customers';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhCustomer } from '@/src/hair/db/schema';
import { formatInrFromPaise } from '@/src/hair/lib/money';

const SEARCH_DEBOUNCE_MS = 250;

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q || !text) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let start = 0;
  let i = lowerText.indexOf(lowerQ, start);
  if (i === -1) return <>{text}</>;
  while (i !== -1) {
    if (i > start) parts.push(text.slice(start, i));
    parts.push(
      <mark key={i} className="rounded bg-fyh-accent/25 text-inherit">
        {text.slice(i, i + q.length)}
      </mark>,
    );
    start = i + q.length;
    i = lowerText.indexOf(lowerQ, start);
  }
  if (start < text.length) parts.push(text.slice(start));
  return <>{parts}</>;
}

function CustomerTableBody({
  customers,
  query,
}: {
  customers: FyhCustomer[];
  query: string;
}) {
  return (
    <>
      <div className="grid gap-3 md:hidden">
        {customers.map((c) => (
          <Link
            key={c.id}
            href={`/customers/${c.id}`}
            className="fyh-glass block space-y-2 p-4 transition hover:bg-white/[0.03]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  <HighlightMatch text={c.fullName} query={query} />
                </p>
                <p className="mt-0.5 text-xs text-fyh-text-muted tabular-nums">
                  <HighlightMatch text={c.phone} query={query} />
                </p>
              </div>
              <span className="tabular-nums text-fyh-accent">
                {formatInrFromPaise(c.lifetimeSpendPaise ?? 0)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-fyh-text-muted">
              <span>{c.totalVisits ?? 0} visits</span>
              {c.email ? (
                <>
                  <span>·</span>
                  <span className="max-w-[12rem] truncate">
                    <HighlightMatch text={c.email} query={query} />
                  </span>
                </>
              ) : null}
              {(c.tags ?? []).length ? (
                <>
                  <span>·</span>
                  <span>{(c.tags ?? []).slice(0, 2).join(', ')}</span>
                </>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
      <div className="fyh-glass hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>WhatsApp</th>
                <th>Email</th>
                <th>Visits</th>
                <th>Lifetime</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--fyh-border)]">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link
                      href={`/customers/${c.id}`}
                      className="font-medium text-fyh-text hover:text-fyh-accent"
                    >
                      <HighlightMatch text={c.fullName} query={query} />
                    </Link>
                    {c.importantAlerts ? (
                      <p className="mt-0.5 text-xs text-fyh-danger">Alert on file</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-fyh-text-secondary">
                    <HighlightMatch text={c.phone} query={query} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-fyh-text-muted">
                    {c.whatsapp ? (
                      <HighlightMatch text={c.whatsapp} query={query} />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-fyh-text-muted">
                    {c.email ? <HighlightMatch text={c.email} query={query} /> : '—'}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.totalVisits ?? 0}</td>
                  <td className="px-4 py-3 tabular-nums text-fyh-accent">
                    {formatInrFromPaise(c.lifetimeSpendPaise ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-fyh-text-muted">
                    {(c.tags ?? []).slice(0, 3).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function CustomersList({ initialCustomers }: { initialCustomers: FyhCustomer[] }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState(initialCustomers);
  const [searching, setSearching] = useState(false);
  const requestIdRef = useRef(0);

  const trimmedQuery = query.trim();
  const isActiveSearch = trimmedQuery.length > 0;

  useEffect(() => {
    setRows(initialCustomers);
  }, [initialCustomers]);

  useEffect(() => {
    if (!isActiveSearch) {
      setRows(initialCustomers);
      setSearching(false);
      return;
    }

    const timer = window.setTimeout(() => {
      const requestId = ++requestIdRef.current;
      setSearching(true);
      void listCustomersAction(trimmedQuery)
        .then((matches) => {
          if (requestId !== requestIdRef.current) return;
          setRows(matches);
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          setRows([]);
        })
        .finally(() => {
          if (requestId !== requestIdRef.current) return;
          setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [trimmedQuery, isActiveSearch, initialCustomers]);

  const showEmptyCatalog = !isActiveSearch && rows.length === 0;
  const showNoMatches = isActiveSearch && !searching && rows.length === 0;

  const highlightQuery = useMemo(() => trimmedQuery, [trimmedQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">CRM</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Search by name, phone, WhatsApp, or email
          </p>
        </div>
        <Link href="/customers/new">
          <Button type="button">
            <Plus className="mr-2 h-4 w-4" />
            Add customer
          </Button>
        </Link>
      </div>

      <div className="fyh-glass flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fyh-text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, phone, WhatsApp, or email"
            className="pl-9 pr-9"
            autoComplete="off"
            aria-busy={searching}
          />
          {searching ? (
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
              aria-hidden
            >
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-fyh-text-muted border-t-transparent" />
            </span>
          ) : null}
        </div>
      </div>

      <div className="fyh-glass overflow-hidden">
        {showEmptyCatalog ? (
          <div className="px-6 py-16 text-center">
            <p className="fyh-display text-xl font-semibold">No customers yet</p>
            <p className="mt-2 text-sm text-fyh-text-muted">
              Add your first guest to unlock appointments and billing.
            </p>
            <Link href="/customers/new" className="mt-6 inline-block">
              <Button type="button">Add customer</Button>
            </Link>
          </div>
        ) : showNoMatches ? (
          <div className="px-6 py-16 text-center">
            <p className="fyh-display text-xl font-semibold">No customer found</p>
            <p className="mt-2 text-sm text-fyh-text-muted">
              No customer matches &ldquo;{trimmedQuery}&rdquo;
            </p>
            <Link href="/customers/new" className="mt-6 inline-block">
              <Button type="button">
                <Plus className="mr-2 h-4 w-4" />
                Add Customer
              </Button>
            </Link>
          </div>
        ) : (
          <CustomerTableBody customers={rows} query={highlightQuery} />
        )}
      </div>
    </div>
  );
}
