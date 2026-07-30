import { SettingsNav } from '@/src/hair/components/settings/SettingsNav';
import { requireHairAuthPage } from '@/src/hair/lib/auth/guards';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireHairAuthPage();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">Configure</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Salon configuration across billing, communication, inventory, and more.
        </p>
      </div>
      <SettingsNav showPermissions={admin.role === 'super_admin'} />
      {children}
    </div>
  );
}
