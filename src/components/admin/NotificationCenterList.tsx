'use client';

import Link from 'next/link';
import type { UserNotificationRow } from '@/src/services/notificationEngine';
import { NOTIFICATION_CATEGORY_LABELS } from '@/src/lib/notifications/notificationTypes';

function relativeTime(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function NotificationCenterList({ items }: { items: UserNotificationRow[] }) {
  async function onOpen(item: UserNotificationRow) {
    await fetch('/api/admin/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userNotificationId: item.id }),
    }).catch(() => undefined);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('admin-badges-updated', {
          detail: { unreadCount: undefined },
        }),
      );
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-apg-silver">No notifications in this view.</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.deepLink}
            onClick={() => void onOpen(item)}
            className="block rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-3 hover:border-[#FF5A1F]/30"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#FF5A1F]">
                  {item.category
                    ? NOTIFICATION_CATEGORY_LABELS[item.category]
                    : item.type.replace(/_/g, ' ')}
                  {item.priority === 'critical' ? (
                    <span className="ml-2 text-rose-300">Critical</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-white">{item.title}</p>
                <p className="mt-1 text-xs text-apg-silver">{item.body}</p>
              </div>
              <span className="shrink-0 text-xs text-apg-muted">
                {relativeTime(item.createdAt)}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
