import Link from 'next/link';
import { platformLogoutAction } from '@/src/platform/actions/auth';
import { requirePlatformAdminPage } from '@/src/platform/lib/auth/guards';
import { listOrganizationsForPlatformAdmin } from '@/src/platform/services/organizations';

export default async function PlatformOrganizationsPage() {
  await requirePlatformAdminPage();
  const organizations = await listOrganizationsForPlatformAdmin();

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <Link href="/platform/dashboard" className="text-sm text-slate-400 hover:text-white">
              ← Dashboard
            </Link>
            <h1 className="mt-1 text-lg font-semibold">Organizations</h1>
          </div>
          <form action={platformLogoutAction}>
            <button
              type="submit"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
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
                    No organizations yet. Run staging bootstrap after Platform DB migration.
                  </td>
                </tr>
              ) : (
                organizations.map((org) => (
                  <tr key={org.id} className="border-t border-slate-800 bg-slate-950/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{org.name}</p>
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
      </main>
    </div>
  );
}
