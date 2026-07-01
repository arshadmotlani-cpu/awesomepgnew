'use client';

import { useAdminResidentSearch } from '@/src/hooks/useAdminResidentSearch';
import type { AdminResidentSearchResult } from '@/src/lib/admin/residentSearchTypes';
import { posGlassCard, posInputClass } from '@/src/components/admin/expressBooking/expressBookingStyles';

function SearchResultRow({
  row,
  onSelect,
}: {
  row: AdminResidentSearchResult;
  onSelect: (row: AdminResidentSearchResult) => void;
}) {
  const location =
    row.pgName && row.roomNumber
      ? `${row.pgName} · ${row.roomNumber} · ${row.bedCode ?? '—'}`
      : 'No bed assigned';

  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      className="flex w-full flex-col gap-1 border-b border-white/5 px-4 py-4 text-left transition hover:bg-white/5 last:border-0"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-base font-semibold text-white">{row.fullName}</span>
        <span className="shrink-0 rounded bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-apg-silver">
          {row.tenancyStatus}
        </span>
      </div>
      <span className="text-sm text-apg-silver">{row.phone}</span>
      <span className="text-xs text-apg-muted">{location}</span>
      {row.bookingCode ? (
        <span className="text-[10px] text-apg-muted">Booking {row.bookingCode}</span>
      ) : null}
    </button>
  );
}

export function ExpressBookingSearchPanel({
  onSelect,
  onCreateNew,
}: {
  onSelect: (row: AdminResidentSearchResult) => void;
  onCreateNew?: (query: string) => void;
}) {
  const { query, setQuery, results, loading, showEmpty, emptyMessage } = useAdminResidentSearch({
    minLength: 1,
    debounceMs: 250,
  });

  return (
    <div className={posGlassCard}>
      <label className="block text-xs font-semibold uppercase tracking-wide text-apg-muted">
        Find resident
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or phone — filters as you type"
          className={posInputClass}
          autoFocus
        />
      </label>
      {loading ? <p className="mt-3 text-sm text-apg-silver">Searching…</p> : null}
      {results.length > 0 ? (
        <ul className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-white/10">
          {results.map((row) => (
            <li key={row.id}>
              <SearchResultRow row={row} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      ) : null}
      {showEmpty ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-apg-silver">{emptyMessage}</p>
          {onCreateNew && query.trim().length >= 2 ? (
            <button
              type="button"
              onClick={() => onCreateNew(query.trim())}
              className="w-full rounded-xl border border-dashed border-white/15 px-4 py-3 text-left text-sm text-apg-silver hover:border-white/25 hover:text-white"
            >
              Create new resident with “{query.trim()}”
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
