import { createLocationAction, updateLocationAction } from '@/src/platform/actions/admin';
import { PageHeader } from '@/src/platform/components/ui/PageHeader';
import { OrgTabNav } from '@/src/platform/components/ui/OrgTabNav';
import { EmptyState } from '@/src/platform/components/ui/EmptyState';
import { listOrganizationDetailsForAdmin } from '@/src/platform/services/admin';

type Props = { params: Promise<{ id: string }> };

export default async function PlatformOrganizationLocationsPage({ params }: Props) {
  const { id } = await params;
  const organization = await listOrganizationDetailsForAdmin(id);
  if (!organization) {
    return (
      <>
        <PageHeader title="Organization not found" />
        <p className="text-sm text-[var(--plt-text-muted)]">The requested organization does not exist.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={organization.name}
        subtitle="Locations"
        breadcrumbs={[
          { label: 'Organizations', href: '/platform/admin/organizations' },
          { label: organization.name, href: `/platform/admin/organizations/${organization.id}` },
          { label: 'Locations' },
        ]}
      />
      <OrgTabNav
        organizationId={organization.id}
        organizationName={organization.name}
        activeTab="locations"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        <form
          action={createLocationAction}
          className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] p-5"
        >
          <input type="hidden" name="organizationId" value={organization.id} />
          <h2 className="text-sm font-semibold">Add location</h2>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Name</span>
              <input name="name" required className="plt-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Address</span>
              <textarea name="address" rows={3} className="plt-input" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="isPrimary" type="checkbox" />
              Primary location
            </label>
            <button type="submit" className="plt-btn-primary w-fit">Create location</button>
          </div>
        </form>

        <div className="space-y-3">
          {organization.locations.length === 0 ? (
            <EmptyState title="No locations" description="Add the first location for this organization." />
          ) : (
            organization.locations.map((location) => (
              <form
                key={location.id}
                action={updateLocationAction}
                className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] p-4"
              >
                <input type="hidden" name="organizationId" value={organization.id} />
                <input type="hidden" name="locationId" value={location.id} />
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-sm font-medium">{location.name}</p>
                  {location.isPrimary ? (
                    <span className="text-[10px] uppercase tracking-wide text-[var(--plt-accent)]">Primary</span>
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="text-[var(--plt-text-muted)]">Name</span>
                    <input name="name" defaultValue={location.name} className="plt-input" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-[var(--plt-text-muted)]">Status</span>
                    <select name="status" defaultValue={location.status} className="plt-input">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                </div>
                <label className="mt-3 grid gap-1 text-sm">
                  <span className="text-[var(--plt-text-muted)]">Address</span>
                  <textarea name="address" defaultValue={location.address ?? ''} rows={2} className="plt-input" />
                </label>
                <button type="submit" className="plt-btn-secondary mt-3">Save location</button>
              </form>
            ))
          )}
        </div>
      </div>
    </>
  );
}
