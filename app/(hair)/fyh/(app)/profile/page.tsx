import { requireHairAuthPage } from '@/src/hair/lib/auth/guards';

export default async function ProfilePage() {
  const admin = await requireHairAuthPage();

  return (
    <div className="space-y-6">
      <div>
        <p className="fyh-section-eyebrow">Account</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">Signed-in salon admin.</p>
      </div>

      <div className="fyh-glass max-w-lg space-y-4 p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-fyh-text-muted">Display name</p>
          <p className="mt-1 text-lg font-medium text-fyh-text">
            {admin.displayName?.trim() || '—'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-fyh-text-muted">Email</p>
          <p className="mt-1 text-lg text-fyh-text">{admin.email}</p>
        </div>
      </div>
    </div>
  );
}
