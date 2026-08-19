import Link from 'next/link';
import { PlatformAdminShell } from '@/src/platform/components/PlatformAdminShell';
import { listOrganizationsForPlatformAdmin } from '@/src/platform/services/organizations';

export default async function PlatformOrganizationsPage() {
  const organizations = await listOrganizationsForPlatformAdmin();

  return (
    <PlatformAdminShell
      title="Organizations"
      subtitle="Create and manage salon organizations, owners, locations, and SaaS lifecycle."
    >
      <div className="mb-4 flex justify-end">
        <Link
          href="/platform/admin/organizations/new"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Create organization
        </Link>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Organization</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Locations</th>
              <th className="px-4 py-3 font-medium">Members</th>
              <th className="px-4 py-3 font-medium">Plan</th>
            </tr>
          </thead>
          <tbody>
            {organizations.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No organizations yet. Create the first salon from Platform Admin.
                </td>
              </tr>
            ) : (
              organizations.map((org) => (
                <tr key={org.id} className="border-t border-slate-800 bg-slate-950/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/admin/organizations/${org.id}`}
                      className="font-medium text-white hover:underline"
                    >
                      {org.name}
                    </Link>
                    <p className="text-xs text-slate-500">{org.slug}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-300">{org.status}</td>
                  <td className="px-4 py-3 text-slate-300">{org.locationCount}</td>
                  <td className="px-4 py-3 text-slate-300">{org.memberCount}</td>
                  <td className="px-4 py-3 text-slate-300">{org.planName ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PlatformAdminShell>
  );
}
