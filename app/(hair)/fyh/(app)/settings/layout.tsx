import { SettingsNav } from '@/src/hair/components/settings/SettingsNav';
import { requireHairAuthPage } from '@/src/hair/lib/auth/guards';
import { hasPermission } from '@/src/hair/lib/auth/permissionTypes';
import { sessionHasPermission } from '@/src/workforce/permissions/guards';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireHairAuthPage();
  const showPermissions =
    (await sessionHasPermission('permissions.manage')) ||
    hasPermission(admin, 'page:settings') && admin.role === 'super_admin';

  return (
    <div className="space-y-6">
      <div>
        <p className="fyh-section-eyebrow">Configure</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Salon configuration across billing, communication, inventory, and more.
        </p>
      </div>
      <SettingsNav showPermissions={showPermissions} />
      {children}
    </div>
  );
}
