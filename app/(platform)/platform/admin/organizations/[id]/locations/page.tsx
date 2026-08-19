import { createLocationAction, updateLocationAction } from '@/src/platform/actions/admin';
import { PlatformAdminShell } from '@/src/platform/components/PlatformAdminShell';
import { listOrganizationDetailsForAdmin } from '@/src/platform/services/admin';

type Props = { params: Promise<{ id: string }> };

export default async function PlatformOrganizationLocationsPage({ params }: Props) {
  const { id } = await params;
  const organization = await listOrganizationDetailsForAdmin(id);
  if (!organization) {
    return (
      <PlatformAdminShell title="Organization not found">
        <p className="text-sm text-slate-400">The requested organization does not exist.</p>
      </PlatformAdminShell>
    );
  }

  return (
    <PlatformAdminShell title={`${organization.name} locations`}>
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <form action={createLocationAction} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <input type="hidden" name="organizationId" value={organization.id} />
          <h2 className="text-base font-semibold">Add location</h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span>Name</span>
              <input name="name" required className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Address</span>
              <textarea name="address" rows={3} className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="isPrimary" type="checkbox" />
              Primary location
            </label>
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Create location
            </button>
          </div>
        </form>

        <div className="space-y-4">
          {organization.locations.map((location) => (
            <form
              key={location.id}
              action={updateLocationAction}
              className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6"
            >
              <input type="hidden" name="organizationId" value={organization.id} />
              <input type="hidden" name="locationId" value={location.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span>Name</span>
                  <input
                    name="name"
                    defaultValue={location.name}
                    className="rounded-lg bg-slate-950 px-3 py-2"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>Status</span>
                  <select
                    name="status"
                    defaultValue={location.status}
                    className="rounded-lg bg-slate-950 px-3 py-2"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>
              <label className="mt-4 grid gap-2 text-sm">
                <span>Address</span>
                <textarea
                  name="address"
                  defaultValue={location.address ?? ''}
                  rows={3}
                  className="rounded-lg bg-slate-950 px-3 py-2"
                />
              </label>
              <button
                type="submit"
                className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Save location
              </button>
            </form>
          ))}
        </div>
      </div>
    </PlatformAdminShell>
  );
}
