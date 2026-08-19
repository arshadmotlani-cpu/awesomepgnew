import Link from 'next/link';
import { AdminCard, PlatformAdminShell } from '@/src/platform/components/PlatformAdminShell';
import { getPlatformDashboardStats } from '@/src/platform/services/admin';

export default async function PlatformAdminHomePage() {
  const stats = await getPlatformDashboardStats();

  return (
    <PlatformAdminShell
      title="Platform Admin"
      subtitle="Software-owner console for organizations, subscriptions, and platform users."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminCard title="Total organizations" value={stats.totalOrganizations} />
        <AdminCard title="Active organizations" value={stats.activeOrganizations} />
        <AdminCard title="Trial organizations" value={stats.trialOrganizations} />
        <AdminCard title="Suspended organizations" value={stats.suspendedOrganizations} />
        <AdminCard title="Plans" value={stats.totalPlans} />
        <AdminCard title="Users" value={stats.totalUsers} />
        <AdminCard title="Locations" value={stats.totalLocations} />
        <AdminCard
          title="Past due subscriptions"
          value={stats.subscriptionsByStatus.past_due ?? 0}
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Recent organizations</h2>
              <p className="mt-1 text-sm text-slate-400">
                Newly created salons and their current SaaS status.
              </p>
            </div>
            <Link
              href="/platform/admin/organizations/new"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Create organization
            </Link>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-950/70 text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrganizations.map((org) => (
                  <tr key={org.id} className="border-t border-slate-800">
                    <td className="px-4 py-3">
                      <Link
                        href={`/platform/admin/organizations/${org.id}`}
                        className="font-medium text-white hover:underline"
                      >
                        {org.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{org.slug}</td>
                    <td className="px-4 py-3 capitalize text-slate-300">{org.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-base font-semibold">Recent subscription activity</h2>
          <div className="mt-4 space-y-3">
            {stats.recentSubscriptionActivity.length === 0 ? (
              <p className="text-sm text-slate-500">No subscription activity yet.</p>
            ) : (
              stats.recentSubscriptionActivity.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3"
                >
                  <p className="font-medium text-white">{event.organizationName}</p>
                  <p className="mt-1 text-sm capitalize text-slate-300">
                    {event.eventType.replace(/_/g, ' ')}
                  </p>
                  {event.detail ? (
                    <p className="mt-1 text-xs text-slate-500">{event.detail}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </PlatformAdminShell>
  );
}
