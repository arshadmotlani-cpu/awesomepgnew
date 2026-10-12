'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useActionState } from 'react';
import { archiveCustomerAction, type CustomerActionState } from '@/src/hair/actions/customers';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import {
  CLIENT_LIST_COLUMNS,
  formatClientDate,
  formatClientGender,
  visibleClientActions,
  whatsAppHref,
} from '@/src/hair/lib/clientList';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { ClientListRow } from '@/src/hair/services/customerDirectory';

const SEARCH_DEBOUNCE_MS = 250;
const initialArchive: CustomerActionState = {};

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

function money(paise: number | null): string {
  if (paise == null) return '—';
  return formatInrFromPaise(paise);
}

function CustomerActions({
  customer,
  canEdit,
  canArchive,
}: {
  customer: ClientListRow;
  canEdit: boolean;
  canArchive: boolean;
}) {
  const wa = whatsAppHref(customer.whatsapp || customer.phone);
  const actions = visibleClientActions({ canEdit, canArchive, whatsAppHref: wa });
  const [archiveState, archiveAction, archivePending] = useActionState(archiveCustomerAction, initialArchive);

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-[color:var(--fyh-border)] px-2 py-1 text-xs font-medium text-fyh-text-secondary">
        Actions
      </summary>
      <div className="absolute left-0 z-20 mt-1 w-44 rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg-surface)] p-1 shadow-lg">
        {actions.includes('view') ? (
          <Link href={`/customers/${customer.id}`} className="block rounded px-2 py-1.5 text-sm hover:bg-white/5">
            View Customer
          </Link>
        ) : null}
        {actions.includes('edit') ? (
          <Link
            href={`/customers/${customer.id}?tab=details`}
            className="block rounded px-2 py-1.5 text-sm hover:bg-white/5"
          >
            Edit Customer
          </Link>
        ) : null}
        {actions.includes('whatsapp') && wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="block rounded px-2 py-1.5 text-sm hover:bg-white/5"
          >
            WhatsApp
          </a>
        ) : null}
        {actions.includes('archive') ? (
          <form action={archiveAction}>
            <input type="hidden" name="id" value={customer.id} />
            <button
              type="submit"
              disabled={archivePending}
              className="block w-full rounded px-2 py-1.5 text-left text-sm text-fyh-danger hover:bg-white/5"
            >
              {archivePending ? 'Archiving…' : 'Archive'}
            </button>
            {archiveState.error ? <p className="px-2 text-xs text-fyh-danger">{archiveState.error}</p> : null}
          </form>
        ) : null}
      </div>
    </details>
  );
}

function CustomerCards({
  customers,
  query,
  canEdit,
  canArchive,
}: {
  customers: ClientListRow[];
  query: string;
  canEdit: boolean;
  canArchive: boolean;
}) {
  return (
    <div className="grid gap-3 md:hidden">
      {customers.map((customer) => (
        <article key={customer.id} className="fyh-glass space-y-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">
                <HighlightMatch text={customer.fullName} query={query} />
              </p>
              <p className="mt-0.5 text-xs text-fyh-text-muted tabular-nums">
                {customer.customerCode ?? '—'} · <HighlightMatch text={customer.phone} query={query} />
              </p>
            </div>
            <CustomerActions customer={customer} canEdit={canEdit} canArchive={canArchive} />
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-fyh-text-muted">Membership</dt>
              <dd>{customer.membershipLabel ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-fyh-text-muted">Package</dt>
              <dd>{customer.packageLabel ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-fyh-text-muted">Advance</dt>
              <dd className="tabular-nums">{money(customer.walletPaise)}</dd>
            </div>
            <div>
              <dt className="text-fyh-text-muted">Dues</dt>
              <dd className="tabular-nums">{money(customer.outstandingPaise)}</dd>
            </div>
            <div>
              <dt className="text-fyh-text-muted">Last visit</dt>
              <dd>{formatClientDate(customer.lastVisitOn)}</dd>
            </div>
            <div>
              <dt className="text-fyh-text-muted">Points</dt>
              <dd className="tabular-nums">{customer.rewardPoints}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function CustomerTable({
  customers,
  query,
  canEdit,
  canArchive,
}: {
  customers: ClientListRow[];
  query: string;
  canEdit: boolean;
  canArchive: boolean;
}) {
  return (
    <div className="fyh-glass hidden overflow-hidden md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[72rem] text-left text-sm">
          <thead>
            <tr>
              {CLIENT_LIST_COLUMNS.map((column) => (
                <th key={column} className="whitespace-nowrap px-3 py-2 text-xs font-medium text-fyh-text-muted">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--fyh-border)]">
            {customers.map((customer) => (
              <tr key={customer.id} className="hover:bg-white/[0.03]">
                <td className="px-3 py-2">
                  <CustomerActions customer={customer} canEdit={canEdit} canArchive={canArchive} />
                </td>
                <td className="px-3 py-2 font-medium">
                  <HighlightMatch text={customer.fullName} query={query} />
                </td>
                <td className="px-3 py-2 tabular-nums text-fyh-text-secondary">
                  {customer.customerCode ? (
                    <HighlightMatch text={customer.customerCode} query={query} />
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  <HighlightMatch text={customer.phone} query={query} />
                </td>
                <td className="px-3 py-2">{customer.membershipLabel ?? '—'}</td>
                <td className="px-3 py-2">{customer.packageLabel ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums">{customer.rewardPoints}</td>
                <td className="px-3 py-2 tabular-nums">{money(customer.walletPaise)}</td>
                <td className="px-3 py-2 tabular-nums">{money(customer.outstandingPaise)}</td>
                <td className="px-3 py-2 text-fyh-text-muted">
                  {customer.email ? <HighlightMatch text={customer.email} query={query} /> : '—'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{formatClientDate(customer.firstVisitOn)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatClientDate(customer.lastVisitOn)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatClientDate(customer.dateOfBirth)}</td>
                <td className="px-3 py-2">{formatClientGender(customer.gender)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CustomersList({
  rows,
  total,
  page,
  pageSize,
  query: initialQuery,
  canEdit,
  canArchive,
}: {
  rows: ClientListRow[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  canEdit: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [syncedQuery, setSyncedQuery] = useState(initialQuery);
  if (initialQuery !== syncedQuery) {
    setSyncedQuery(initialQuery);
    setQuery(initialQuery);
  }
  const trimmedQuery = query.trim();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  useEffect(() => {
    if (trimmedQuery === initialQuery.trim()) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (trimmedQuery) params.set('q', trimmedQuery);
      const href = params.size ? `/customers?${params.toString()}` : '/customers';
      router.replace(href);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [trimmedQuery, initialQuery, router]);

  function pageHref(nextPage: number) {
    const params = new URLSearchParams();
    if (initialQuery.trim()) params.set('q', initialQuery.trim());
    if (nextPage > 1) params.set('page', String(nextPage));
    const qs = params.toString();
    return qs ? `/customers?${qs}` : '/customers';
  }

  const showEmptyCatalog = !initialQuery.trim() && total === 0;
  const showNoMatches = Boolean(initialQuery.trim()) && total === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">CRM</p>
          <h1 className="fyh-display mt-1 font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">Search by name, code, phone, or email</p>
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
            placeholder="Name, code, phone, or email"
            className="pl-9"
            autoComplete="off"
          />
        </div>
      </div>

      {showEmptyCatalog ? (
        <div className="fyh-glass px-6 py-16 text-center">
          <p className="fyh-display text-xl font-semibold">No customers yet</p>
          <p className="mt-2 text-sm text-fyh-text-muted">Add your first guest to unlock appointments and billing.</p>
          <Link href="/customers/new" className="mt-6 inline-block">
            <Button type="button">Add customer</Button>
          </Link>
        </div>
      ) : showNoMatches ? (
        <div className="fyh-glass px-6 py-16 text-center">
          <p className="fyh-display text-xl font-semibold">No customer found</p>
          <p className="mt-2 text-sm text-fyh-text-muted">No customer matches &ldquo;{initialQuery.trim()}&rdquo;</p>
          <Link href="/customers/new" className="mt-6 inline-block">
            <Button type="button">
              <Plus className="mr-2 h-4 w-4" />
              Add Customer
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <CustomerCards customers={rows} query={initialQuery} canEdit={canEdit} canArchive={canArchive} />
          <CustomerTable customers={rows} query={initialQuery} canEdit={canEdit} canArchive={canArchive} />
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fyh-text-muted">
            <p>
              Showing {from}–{to} of {total}
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="rounded-md border border-[color:var(--fyh-border)] px-3 py-1">
                  Previous
                </Link>
              ) : null}
              <span className="px-2 py-1 tabular-nums">
                {page} / {pageCount}
              </span>
              {page < pageCount ? (
                <Link href={pageHref(page + 1)} className="rounded-md border border-[color:var(--fyh-border)] px-3 py-1">
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
