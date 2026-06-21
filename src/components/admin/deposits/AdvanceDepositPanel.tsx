'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { recordAdvanceDepositAction } from '@/app/(admin)/admin/deposits/advance/actions';
import { useAdminResidentSearch } from '@/src/hooks/useAdminResidentSearch';
import type { AdminResidentSearchResult } from '@/src/lib/admin/residentSearchTypes';
import {
  isResidentBedAssignable,
  isResidentBedAssigned,
} from '@/src/lib/residentBedAssignment';

function TenancyBadge({ row }: { row: AdminResidentSearchResult }) {
  if (isResidentBedAssigned(row)) {
    return (
      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
        {row.tenancyStatus === 'vacating' ? 'Vacating' : 'Assigned'}
      </span>
    );
  }
  if (row.tenancyStatus === 'unassigned') {
    return (
      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
        Unassigned
      </span>
    );
  }
  return (
    <span className="rounded bg-zinc-500/20 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
      {row.tenancyStatus}
    </span>
  );
}

export function AdvanceDepositPanel() {
  const router = useRouter();
  const { query, setQuery, results, loading, error, showEmpty, emptyMessage } =
    useAdminResidentSearch({ debounceMs: 250 });
  const [selected, setSelected] = useState<AdminResidentSearchResult | null>(null);
  const [amountInr, setAmountInr] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSelect(row: AdminResidentSearchResult) {
    setSelected(row);
    setFormError(null);
    setSuccess(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const amount = Number.parseFloat(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Enter a valid amount greater than zero.');
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const result = await recordAdvanceDepositAction({
        bookingId: selected.bookingId,
        customerId: selected.id,
        amountInr: amount,
        note,
      });
      if (!result.ok) {
        setFormError(result.error ?? 'Could not record deposit.');
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
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, phone, or booking code…"
          className="apg-admin-field mt-3 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
        />
        {loading ? <p className="mt-2 text-xs text-apg-silver">Searching…</p> : null}
        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
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
                    <TenancyBadge row={r} />
                  </span>
                  <span className="text-xs text-apg-silver">
                    {r.phone}
                    {r.bookingCode ? ` · ${r.bookingCode}` : ''}
                    {r.pgName && r.roomNumber
                      ? ` · ${r.pgName} · R${r.roomNumber}`
                      : isResidentBedAssignable(r)
                        ? ' · No bed assigned'
                        : r.pgName
                          ? ` · ${r.pgName}`
                          : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : showEmpty ? (
          <p className="mt-2 text-xs text-apg-silver">{emptyMessage}</p>
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
              <TenancyBadge row={selected} />
            </div>
            <p className="text-xs text-apg-silver">
              {selected.bookingCode ?? selected.bookingId ?? 'No booking yet'}
              {selected.pgName ? ` · ${selected.pgName}` : ''}
              {selected.roomNumber ? ` · R${selected.roomNumber}` : ''}
            </p>
            {isResidentBedAssignable(selected) && !selected.bookingId ? (
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
          {formError ? <p className="text-sm text-rose-300">{formError}</p> : null}
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
