'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ResidentTimelineSearch({
  initialQuery = '',
  initialCustomerId,
  initialBookingId,
}: {
  initialQuery?: string;
  initialCustomerId?: string;
  initialBookingId?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    const q = query.trim();
    if (q) params.set('q', q);
    router.push(`/admin/residents/timeline?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} className="mb-6 flex flex-wrap gap-2">
      <input
        type="search"
        name="q"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name, phone, booking code, or room/bed (e.g. 204 B2)"
        className="min-w-[16rem] flex-1 rounded-lg border border-white/15 bg-[#0f1318] px-3 py-2 text-sm text-white placeholder:text-zinc-500"
        autoFocus
      />
      <button
        type="submit"
        className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
      >
        Search timeline
      </button>
    </form>
  );
}
