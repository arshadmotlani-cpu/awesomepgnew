import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';

export default async function SettingsPoliciesPage() {
  await requireAdminSession('/admin/settings/policies');
  return (
    <>
      <ModuleBreadcrumbs items={[{ label: 'Settings', href: '/admin/settings' }, { label: 'Policies' }]} />
      <PageHeader
        title="Policies"
        description="Notice period (15 days), deposit rules, and house policies — configured per PG in listing setup."
      />
    </>
  );
}
