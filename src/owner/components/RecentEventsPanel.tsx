'use client';

import type { OwnerRecentEvent } from '@/src/owner/lib/events/recentEvents';

export function RecentEventsPanel({ events }: { events: OwnerRecentEvent[] }) {
  return (
    <section className="rounded-xl border border-white/10 bg-[color:var(--oo-surface,#1A1F27)] p-4">
      <h2 className="text-sm font-semibold text-white">Recent Events</h2>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-[color:var(--oo-muted,#9CA3AF)]">
          No events yet — emitters wire in as Engines publish.
        </p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex justify-between gap-2 border-b border-white/5 pb-2">
              <span className="text-white">{e.eventType}</span>
              <span className="text-[10px] text-[color:var(--oo-muted,#9CA3AF)]">
                {e.sourceEngine} · {new Date(e.createdAt).toLocaleString('en-IN')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
