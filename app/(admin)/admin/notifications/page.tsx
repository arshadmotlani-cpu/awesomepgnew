import Link from 'next/link';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { NotificationCenterList } from '@/src/components/admin/NotificationCenterList';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  NOTIFICATION_CATEGORY_LABELS,
  type NotificationCategory,
} from '@/src/lib/notifications/notificationTypes';
import { listUserNotifications } from '@/src/services/notificationEngine';

export const dynamic = 'force-dynamic';

const CATEGORIES: NotificationCategory[] = [
  'bookings',
  'payments',
  'refunds',
  'checkout',
  'kyc',
  'residents',
  'complaints',
  'maintenance',
];

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireAdminSession('/admin/notifications');

  const tab =
    sp.tab === 'archived' ? 'archived' : sp.tab === 'read' ? 'read' : 'unread';
  const category =
    sp.category && CATEGORIES.includes(sp.category as NotificationCategory)
      ? (sp.category as NotificationCategory)
      : null;

  const items = await listUserNotifications('admin', session.adminId, tab, {
    category,
    limit: 100,
  });

  return (
    <>
      <PageHeader
        title="Notification center"
        description="Unread count drives your home-screen badge. Tap a notification to open the related page."
      />

      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {(
          [
            ['unread', 'Unread'],
            ['read', 'Read'],
            ['archived', 'Archive'],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={
              key === 'unread'
                ? `/admin/notifications${category ? `?category=${category}` : ''}`
                : `/admin/notifications?tab=${key}${category ? `&category=${category}` : ''}`
            }
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

      <nav className="mb-6 flex flex-wrap gap-2 text-xs">
        <Link
          href={`/admin/notifications${tab !== 'unread' ? `?tab=${tab}` : ''}`}
          className={
            'rounded-full px-3 py-1 ' +
            (!category ? 'bg-white/10 text-white' : 'text-apg-silver hover:text-white')
          }
        >
          All
        </Link>
        {CATEGORIES.map((cat) => (
          <Link
            key={cat}
            href={`/admin/notifications?${tab !== 'unread' ? `tab=${tab}&` : ''}category=${cat}`}
            className={
              'rounded-full px-3 py-1 ' +
              (category === cat
                ? 'bg-white/10 text-white'
                : 'text-apg-silver hover:text-white')
            }
          >
            {NOTIFICATION_CATEGORY_LABELS[cat]}
          </Link>
        ))}
      </nav>

      <NotificationCenterList items={items} />
    </>
  );
}
