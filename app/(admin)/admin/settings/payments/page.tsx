import Link from 'next/link';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';

export default async function SettingsPaymentsPage() {
  await requireAdminSession('/admin/settings/payments');
  return (
    <>
      <ModuleBreadcrumbs items={[{ label: 'Settings', href: '/admin/settings' }, { label: 'Payments' }]} />
      <PageHeader title="Payment settings" description="UPI and payment collection configuration." />
      <Link href="/admin/billing" className="text-sm font-medium text-[#FF5A1F] hover:underline">
        Open Billing Center →
      </Link>
    </>
  );
}
