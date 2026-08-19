import Link from 'next/link';
import {
  updateOrganizationAction,
  updateOrganizationStatusAction,
  updateSubscriptionAction,
} from '@/src/platform/actions/admin';
import { PlatformAdminShell } from '@/src/platform/components/PlatformAdminShell';
import { listOrganizationDetailsForAdmin, listPlatformPlans } from '@/src/platform/services/admin';

type Props = { params: Promise<{ id: string }> };

export default async function PlatformOrganizationDetailPage({ params }: Props) {
  const { id } = await params;
  const [organization, plans] = await Promise.all([
    listOrganizationDetailsForAdmin(id),
    listPlatformPlans(),
  ]);
  if (!organization) {
    return (
      <PlatformAdminShell title="Organization not found">
        <p className="text-sm text-slate-400">The requested organization does not exist.</p>
      </PlatformAdminShell>
    );
  }

  return (
    <PlatformAdminShell
      title={organization.name}
      subtitle={`Manage ${organization.slug}, members, locations, and subscription state.`}
    >
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Link
              href={`/platform/admin/organizations/${organization.id}/locations`}
              className="rounded-md border border-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              Manage locations
            </Link>
            <Link
              href={`/platform/admin/organizations/${organization.id}/members`}
              className="rounded-md border border-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              Manage members
            </Link>
          </div>

          <form action={updateOrganizationAction} className="grid gap-4">
            <input type="hidden" name="organizationId" value={organization.id} />
            <label className="grid gap-2 text-sm">
              <span>Name</span>
              <input name="name" defaultValue={organization.name} className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Slug</span>
              <input name="slug" defaultValue={organization.slug} className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Timezone</span>
              <input
                name="defaultTimezone"
                defaultValue={organization.defaultTimezone}
                className="rounded-lg bg-slate-950 px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>GSTIN</span>
              <input name="gstin" defaultValue={organization.gstin ?? ''} className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <button
              type="submit"
              className="w-fit rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Save organization
            </button>
          </form>

          <form action={updateOrganizationStatusAction} className="mt-6 flex flex-wrap items-end gap-3">
            <input type="hidden" name="organizationId" value={organization.id} />
            <label className="grid gap-2 text-sm">
              <span>Organization status</span>
              <select
                name="status"
                defaultValue={organization.status}
                className="rounded-lg bg-slate-950 px-3 py-2"
              >
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Update status
            </button>
          </form>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <h2 className="text-base font-semibold">Subscription</h2>
            <form action={updateSubscriptionAction} className="mt-4 grid gap-4">
              <input type="hidden" name="organizationId" value={organization.id} />
              <label className="grid gap-2 text-sm">
                <span>Plan</span>
                <select
                  name="planId"
                  defaultValue={organization.subscription?.planId ?? ''}
                  className="rounded-lg bg-slate-950 px-3 py-2"
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                <span>Status</span>
                <select
                  name="status"
                  defaultValue={organization.subscription?.status ?? 'trial'}
                  className="rounded-lg bg-slate-950 px-3 py-2"
                >
                  <option value="trial">Trial</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past due</option>
                  <option value="suspended">Suspended</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                <span>Current period end</span>
                <input
                  name="currentPeriodEnd"
                  type="date"
                  defaultValue={
                    organization.subscription?.currentPeriodEnd
                      ? organization.subscription.currentPeriodEnd.toISOString().slice(0, 10)
                      : ''
                  }
                  className="rounded-lg bg-slate-950 px-3 py-2"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Save subscription
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <h2 className="text-base font-semibold">Invitations</h2>
            <div className="mt-4 space-y-3 text-sm">
              {organization.invitations.length === 0 ? (
                <p className="text-slate-500">No invitations yet.</p>
              ) : (
                organization.invitations.map((invite) => (
                  <div key={invite.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    <p className="font-medium text-white">{invite.email}</p>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {invite.accessRole} · {invite.status}
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-400">
                      Accept link: {`/platform/auth/accept-invite?token=${invite.token}`}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </PlatformAdminShell>
  );
}
