'use client';

import Link from 'next/link';
import { appendNotifReadParam } from '@/src/components/admin/NotificationReadOnArrival';
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

function splitBodyAndScreenshot(body: string): { text: string; screenshotUrl: string | null } {
  const lines = body.split('\n');
  let screenshotUrl: string | null = null;
  const textLines: string[] = [];
  for (const line of lines) {
    const match = line.match(/^Screenshot:\s*(https?:\/\/\S+)/i);
    if (match?.[1]) {
      screenshotUrl = match[1];
      continue;
    }
    textLines.push(line);
  }
  return { text: textLines.join('\n').trim(), screenshotUrl };
}

export function NotificationCenterList({ items }: { items: UserNotificationRow[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-apg-silver">No notifications in this view.</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const { text, screenshotUrl } = splitBodyAndScreenshot(item.body);
        return (
          <li key={item.id}>
            <Link
              href={appendNotifReadParam(item.deepLink, item.id)}
              className="block rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-3 hover:border-[#FF5A1F]/30"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#FF5A1F]">
                    {item.category
                      ? NOTIFICATION_CATEGORY_LABELS[item.category]
                      : item.type.replace(/_/g, ' ')}
                    {item.priority === 'critical' ? (
                      <span className="ml-2 text-rose-300">Critical</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 whitespace-pre-line text-xs text-apg-silver">{text}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-xs text-apg-muted">{relativeTime(item.createdAt)}</span>
                  {screenshotUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={screenshotUrl}
                      alt="Payment screenshot"
                      className="h-14 w-14 rounded-lg object-cover ring-1 ring-white/15"
                    />
                  ) : null}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
