import { PermissionManagementPanel } from '@/src/workforce/components/PermissionManagementPanel';
import { loadPermissionManagementData } from '@/src/workforce/actions/permissions';
import { requireWorkforcePermissionPage } from '@/src/workforce/permissions/guards';

export default async function PermissionsSettingsPage() {
  await requireWorkforcePermissionPage('permissions.manage');
  const { templates, employees } = await loadPermissionManagementData();
  return (
    <PermissionManagementPanel
      templates={templates.map((t) => ({
        accessRole: t.accessRole,
        permissions: (t.permissions ?? []) as import('@/src/workforce/types').WorkforcePermissionKey[],
        maxBackdateDays: t.maxBackdateDays,
      }))}
      employees={employees}
    />
  );
}
