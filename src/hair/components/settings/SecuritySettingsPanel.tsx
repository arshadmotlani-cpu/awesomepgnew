import { SettingsPageHeader } from '@/src/hair/components/settings/SettingsNav';

export function SecuritySettingsPanel() {
  return (
    <div className="space-y-6">
      <SettingsPageHeader
        eyebrow="Security"
        title="Access control"
        description="Admin user management and role-based permissions."
      />

      <div className="fyh-glass space-y-3 p-4 text-sm text-fyh-text-secondary">
        <p>
          Salon staff accounts are managed separately from Awesome PG admin users. Full admin CRUD
          (create, edit, deactivate staff logins, assign <code className="text-fyh-accent">super_admin</code>{' '}
          roles) is planned for <strong className="font-medium text-fyh-text">Phase I</strong>.
        </p>
        <p>
          Until then, contact your platform administrator to provision or revoke FYH login access.
          The <code className="text-fyh-accent">super_admin</code> role grants unrestricted access to
          all salon modules including billing, inventory, and settings.
        </p>
      </div>
    </div>
  );
}
