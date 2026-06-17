'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { recordAdvanceDepositAction } from '@/app/(admin)/admin/deposits/advance/actions';

type SearchResult = {
  id: string;
  fullName: string;
  phone: string;
  tenancyStatus: 'unassigned' | 'active' | 'vacating' | 'vacated' | 'blocked';
  bookingId: string | null;
  bookingCode?: string | null;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
};

function TenancyBadge({ status }: { status: SearchResult['tenancyStatus'] }) {
  if (status === 'active' || status === 'vacating') {
    return (
      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
        {status === 'vacating' ? 'Vacating' : 'Occupied'}
      </span>
    );
  }
  if (status === 'unassigned') {
    return (
      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
        Unassigned
      </span>
    );
  }
  return (
    <span className="rounded bg-zinc-500/20 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
      {status}
    </span>
  );
}

export function AdvanceDepositPanel() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [amountInr, setAmountInr] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function search(q: string) {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/residents/search?q=${encodeURIComponent(q.trim())}`,
        { cache: 'no-store' },
      );
      const json = (await res.json()) as { ok: boolean; data?: SearchResult[] };
      setResults(json.ok ? (json.data ?? []) : []);
    } finally {
      setLoading(false);
    }
  }

  function onSelect(row: SearchResult) {
    setSelected(row);
    setError(null);
    setSuccess(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const amount = Number.parseFloat(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await recordAdvanceDepositAction({
        bookingId: selected.bookingId,
        customerId: selected.id,
        amountInr: amount,
        note,
      });
      if (!result.ok) {
        setError(result.error ?? 'Could not record deposit.');
        return;
      }
      setSuccess(`Recorded ₹${amount.toLocaleString('en-IN')} advance deposit for ${selected.fullName}.`);
      setAmountInr('');
      setNote('');
      router.refresh();
    });
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <h2 className="text-sm font-semibold text-white">Find tenant</h2>
        <p className="mt-1 text-xs text-apg-silver">
          Search by name, phone, booking ID, or booking code. Assigned and unassigned residents
          both appear. Only records deposit — does not affect rent, invoices, or bed assignment.
        </p>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            void search(v);
          }}
          placeholder="Name, phone, or booking code…"
          className="apg-admin-field mt-3 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
        />
        {loading ? <p className="mt-2 text-xs text-apg-silver">Searching…</p> : null}
        {results.length > 0 ? (
          <ul className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-white/10">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r)}
                  className={
                    'flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-white/5 ' +
                    (selected?.id === r.id ? 'bg-[#FF5A1F]/10' : '')
                  }
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white">{r.fullName}</span>
                    <TenancyBadge status={r.tenancyStatus} />
                  </span>
                  <span className="text-xs text-apg-silver">
                    {r.phone}
                    {r.bookingCode ? ` · ${r.bookingCode}` : ''}
                    {r.pgName && r.roomNumber
                      ? ` · ${r.pgName} · R${r.roomNumber}`
                      : r.tenancyStatus === 'unassigned'
                        ? ' · No bed assigned'
                        : r.pgName
                          ? ` · ${r.pgName}`
                          : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : query.trim().length >= 2 && !loading ? (
          <p className="mt-2 text-xs text-apg-silver">
            No residents match — try another spelling or phone number.
          </p>
        ) : null}
      </div>

      {selected ? (
        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-white/10 bg-[#1A1F27] p-5 space-y-4"
        >
          <div>
            <p className="text-xs text-apg-silver">Recording for</p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold text-white">{selected.fullName}</p>
              <TenancyBadge status={selected.tenancyStatus} />
            </div>
            <p className="text-xs text-apg-silver">
              {selected.bookingCode ?? selected.bookingId ?? 'No booking yet'}
              {selected.pgName ? ` · ${selected.pgName}` : ''}
              {selected.roomNumber ? ` · R${selected.roomNumber}` : ''}
            </p>
            {selected.tenancyStatus === 'unassigned' && !selected.bookingId ? (
              <p className="mt-1 text-xs text-amber-200">
                No booking on file — create a booking first to record deposit to ledger.
              </p>
            ) : null}
          </div>
          <label className="block text-sm">
            <span className="font-medium text-apg-silver">Amount (₹) *</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amountInr}
              onChange={(e) => setAmountInr(e.target.value)}
              className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-apg-silver">Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Cash, UPI reference…"
              className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
            />
          </label>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-300">{success}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
          >
            {pending ? 'Recording…' : 'Record advance deposit'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
