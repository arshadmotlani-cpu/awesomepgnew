'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { markPgFullyOccupiedAction } from '@/app/(admin)/admin/pgs/inventory-actions';

export function MarkPgFullyOccupiedButton({ pgId, pgName }: { pgId: string; pgName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    const confirmed = window.confirm(
      `Mark every vacant bed at ${pgName} as occupied? Public site will show no availability until beds are freed or real bookings replace placeholders.`,
    );
    if (!confirmed) return;
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await markPgFullyOccupiedAction(pgId);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed');
      return;
    }
    setMessage(result.message ?? 'Updated.');
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending ? 'Updating…' : 'Mark all beds occupied'}
      </button>
      {message ? <span className="text-xs text-emerald-400">{message}</span> : null}
      {error ? <span className="text-xs text-rose-400">{error}</span> : null}
    </div>
  );
}
