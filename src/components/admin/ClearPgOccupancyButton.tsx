'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clearPgOccupancyPlaceholdersAction } from '@/app/(admin)/admin/pgs/inventory-actions';

export function ClearPgOccupancyButton({ pgId, pgName }: { pgId: string; pgName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    const confirmed = window.confirm(
      `Release all placeholder occupancy at ${pgName}?\n\nBeds will show as available on the website again. Real tenant bookings are not affected.`,
    );
    if (!confirmed) return;
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await clearPgOccupancyPlaceholdersAction(pgId);
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
        className="rounded-lg border border-emerald-700/60 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50"
      >
        {pending ? 'Releasing…' : 'Release beds for booking'}
      </button>
      {message ? <span className="text-xs text-emerald-400">{message}</span> : null}
      {error ? <span className="text-xs text-rose-400">{error}</span> : null}
    </div>
  );
}
