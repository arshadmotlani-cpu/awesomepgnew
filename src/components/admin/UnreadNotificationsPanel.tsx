import Link from 'next/link';
import type { AdminNotificationRow } from '@/src/services/adminNotifications';
import { formatNotificationAge } from '@/src/services/adminNotifications';

export function UnreadNotificationsPanel({
  items,
}: {
  items: AdminNotificationRow[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/5 p-5">
      <h2 className="text-sm font-semibold text-white">
        Action required ({items.length})
      </h2>
      <p className="mt-1 text-xs text-apg-silver">
        New items you haven&apos;t opened yet. Active tasks stay in Operations after you review.
      </p>
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-3 transition-colors hover:border-[#FF5A1F]/40 hover:bg-[#1A1F27]/80"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#FF5A1F]">
                  {item.typeLabel}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-white">
                  {item.residentName ?? 'Resident'}
                </p>
                {item.pgName ? (
                  <p className="text-xs uppercase tracking-wide text-apg-silver">{item.pgName}</p>
                ) : null}
                {item.detail ? (
                  <p className="mt-1 text-xs text-sky-200">{item.detail}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-[10px] text-apg-silver">
                {formatNotificationAge(item.createdAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
