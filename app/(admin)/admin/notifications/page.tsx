import Link from 'next/link';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  formatNotificationAge,
  listAdminNotifications,
  NOTIFICATION_TAB_LABELS,
} from '@/src/services/adminNotifications';
import { syncActionItems } from '@/src/services/actionItems';

export const dynamic = 'force-dynamic';

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireAdminSession('/admin/notifications');
  await syncActionItems(session).catch(() => undefined);

  const tab =
    sp.tab === 'archived' ? 'archived' : sp.tab === 'read' ? 'read' : 'unread';
  const items = await listAdminNotifications(session, tab, 100);

  return (
    <>
      <PageHeader
        title="Notification center"
        description="New items show badge counts. Opening the relevant page marks them Seen. Resolved when the task is completed."
      />

      <nav className="mb-6 flex flex-wrap gap-2 text-sm">
        {(
          [
            ['unread', NOTIFICATION_TAB_LABELS.unread],
            ['read', NOTIFICATION_TAB_LABELS.read],
            ['archived', NOTIFICATION_TAB_LABELS.archived],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={key === 'unread' ? '/admin/notifications' : `/admin/notifications?tab=${key}`}
            className={
              'rounded-lg px-3 py-1.5 ' +
              (tab === key
                ? 'bg-[#FF5A1F]/15 font-medium text-[#FF5A1F]'
                : 'text-apg-silver hover:bg-white/5 hover:text-white')
            }
          >
            {label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="text-sm text-apg-silver">No {NOTIFICATION_TAB_LABELS[tab].toLowerCase()} notifications.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="block rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-3 hover:border-[#FF5A1F]/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#FF5A1F]">
                      {item.typeLabel}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-white">
                      {item.residentName ?? item.title}
                    </p>
                    {item.pgName ? (
                      <p className="text-xs uppercase text-apg-silver">{item.pgName}</p>
                    ) : null}
                    {item.detail ? (
                      <p className="mt-1 text-xs text-sky-200">{item.detail}</p>
                    ) : null}
                    {item.readAt ? (
                      <p className="mt-1 text-[10px] text-apg-silver">
                        Seen {formatNotificationAge(item.readAt)}
                      </p>
                    ) : null}
                    {item.resolvedAt ? (
                      <p className="text-[10px] text-emerald-300/80">
                        Resolved {formatNotificationAge(item.resolvedAt)}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-apg-silver">
                    {formatNotificationAge(item.createdAt)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
