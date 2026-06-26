import Link from 'next/link';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { listPgSettings } from '@/src/db/queries/admin';
import { requireAdminSession } from '@/src/lib/auth/guards';

export const dynamic = 'force-dynamic';

export default async function SettingsBusinessPage() {
  await requireAdminSession('/admin/settings/business');
  const res = await listPgSettings();

  return (
    <>
      <ModuleBreadcrumbs items={[{ label: 'Settings', href: '/admin/settings' }, { label: 'Business' }]} />
      <PageHeader title="Business settings" description="PG-level configuration (read-only mirror)." />
      <Link href="/admin/pgs" className="text-sm font-medium text-[#FF5A1F] hover:underline">
        Manage PG listings →
      </Link>
      {res.ok ? (
        <ul className="mt-6 space-y-2">
          {res.data.map((pg) => (
            <li key={pg.id} className="rounded-lg border border-white/10 bg-[#1A1F27] px-4 py-3 text-sm text-white">
              {pg.name} · {pg.city}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
