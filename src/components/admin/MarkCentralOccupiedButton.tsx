'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { markCentralPgsFullyOccupiedAction } from '@/app/(admin)/admin/pgs/inventory-actions';

export function MarkCentralOccupiedButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    const confirmed = window.confirm(
      'Mark Central PG and Central PG (Female) as fully occupied? Public site will show no beds available.',
    );
    if (!confirmed) return;
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await markCentralPgsFullyOccupiedAction();
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed');
      return;
    }
    const lines = (result.results ?? []).map((r) =>
      r.bedsMarked > 0
        ? `${r.pgName}: ${r.bedsMarked} bed(s) marked`
        : `${r.pgName}: already full`,
    );
    setMessage(lines.join(' · ') || 'Done.');
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
      <p className="text-sm font-medium text-amber-100">Central PG occupancy</p>
      <p className="mt-1 text-xs text-amber-100/80">
        Mark both Central PG listings as fully occupied (no beds available on /pgs).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Updating…' : 'Mark both Central PGs fully occupied'}
        </button>
        {message ? <span className="text-sm text-emerald-400">{message}</span> : null}
        {error ? <span className="text-sm text-rose-400">{error}</span> : null}
      </div>
    </div>
  );
}
