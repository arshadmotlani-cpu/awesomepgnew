'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { recordAdvanceDepositAction } from '@/app/(admin)/admin/deposits/advance/actions';

type SearchResult = {
  id: string;
  fullName: string;
  phone: string;
  bookingId: string | null;
  bookingCode?: string | null;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
};

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
        `/api/admin/residents/search?q=${encodeURIComponent(q.trim())}&withBooking=1`,
        { cache: 'no-store' },
      );
      const json = (await res.json()) as { ok: boolean; data?: SearchResult[] };
      setResults(json.ok ? (json.data ?? []) : []);
    } finally {
      setLoading(false);
    }
  }

  function onSelect(row: SearchResult) {
    if (!row.bookingId) {
      setError('This resident has no active booking. Assign a bed first.');
      return;
    }
    setSelected(row);
    setError(null);
    setSuccess(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected?.bookingId) return;
    const amount = Number.parseFloat(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await recordAdvanceDepositAction({
        bookingId: selected.bookingId!,
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
          Search by name, phone, booking ID, or booking code. Only records deposit — does not affect
          rent, invoices, or bed assignment.
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
                  <span className="font-medium text-white">{r.fullName}</span>
                  <span className="text-xs text-apg-silver">
                    {r.phone}
                    {r.bookingCode ? ` · ${r.bookingCode}` : ''}
                    {r.pgName ? ` · ${r.pgName}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {selected ? (
        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-white/10 bg-[#1A1F27] p-5 space-y-4"
        >
          <div>
            <p className="text-xs text-apg-silver">Recording for</p>
            <p className="text-lg font-semibold text-white">{selected.fullName}</p>
            <p className="text-xs text-apg-silver">
              {selected.bookingCode ?? selected.bookingId} · {selected.pgName ?? '—'}
              {selected.roomNumber ? ` · R${selected.roomNumber}` : ''}
            </p>
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
