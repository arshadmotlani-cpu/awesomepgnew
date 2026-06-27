import Link from 'next/link';
import { SettingsNotificationPush } from '@/src/components/admin/AdminPushRegistration';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';

export default async function SettingsNotificationsPage() {
  await requireAdminSession('/admin/settings/notifications');
  return (
    <>
      <ModuleBreadcrumbs items={[{ label: 'Settings', href: '/admin/settings' }, { label: 'Notifications' }]} />
      <PageHeader title="Notification settings" description="Admin bell and resident messaging." />
      <SettingsNotificationPush />
      <Link href="/admin/notifications" className="mt-6 inline-block text-sm font-medium text-[#FF5A1F] hover:underline">
        Open notification inbox →
      </Link>
    </>
  );
}
