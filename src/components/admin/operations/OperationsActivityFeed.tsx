'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { OperationsActivityItem } from '@/src/lib/operations/loadOperationsActivityFeed';
import { formatDateTime } from '@/src/lib/format';

export function OperationsActivityFeed({
  groups,
}: {
  groups: Array<{ dayLabel: string; items: OperationsActivityItem[] }>;
}) {
  const [open, setOpen] = useState(true);
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#141820]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-6"
      >
        <div>
          <h2 className="text-base font-semibold text-white">Today / Recent activity</h2>
          <p className="mt-0.5 text-sm text-apg-silver">
            {total > 0
              ? `${total} event${total === 1 ? '' : 's'} in the last 7 days`
              : 'No recent operational events'}
          </p>
        </div>
        <span className="text-sm text-apg-silver">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && total > 0 ? (
        <div className="divide-y divide-white/5 border-t border-white/10">
          {groups.map((group) => (
            <div key={group.dayLabel} className="px-4 py-3 sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
                {group.dayLabel}
              </p>
              <ul className="mt-2 space-y-3">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-[#1A1F27]/60 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="text-sm font-medium text-white hover:text-[#FF5A1F]"
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <p className="text-sm font-medium text-white">{item.label}</p>
                      )}
                      {item.detail ? (
                        <p className="mt-0.5 text-xs text-apg-silver line-clamp-2">{item.detail}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {item.statusBadge ? (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-apg-silver">
                          {item.statusBadge}
                        </span>
                      ) : null}
                      <time className="text-xs tabular-nums text-apg-silver">
                        {formatDateTime(item.occurredAt)}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
