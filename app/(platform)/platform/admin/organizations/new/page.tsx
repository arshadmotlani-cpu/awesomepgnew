import { createOrganizationAction } from '@/src/platform/actions/admin';
import { PlatformAdminShell } from '@/src/platform/components/PlatformAdminShell';
import { listPlatformPlans } from '@/src/platform/services/admin';

export default async function NewOrganizationPage() {
  const plans = await listPlatformPlans();

  return (
    <PlatformAdminShell
      title="Create Organization"
      subtitle="Provision a new FYHAIR salon, first owner, primary location, and subscription."
    >
      <form action={createOrganizationAction} className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-base font-semibold">Organization</h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span>Organization name</span>
              <input name="organizationName" required className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Slug</span>
              <input name="slug" required className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Business email</span>
              <input name="businessEmail" type="email" required className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Timezone</span>
              <input
                name="defaultTimezone"
                defaultValue="Asia/Kolkata"
                className="rounded-lg bg-slate-950 px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>GSTIN</span>
              <input name="gstin" className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Invoice prefix</span>
              <input name="invoicePrefix" defaultValue="FYH" className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-base font-semibold">Primary location</h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span>Location name</span>
              <input name="primaryLocationName" required className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Address</span>
              <textarea name="primaryLocationAddress" rows={3} className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-base font-semibold">Subscription</h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span>Plan</span>
              <select name="planId" required className="rounded-lg bg-slate-950 px-3 py-2">
                <option value="">Select a plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} ({plan.slug})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span>Status</span>
              <select
                name="subscriptionStatus"
                defaultValue="trial"
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
              <span>Trial / period end</span>
              <input name="trialEndsAt" type="date" className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-base font-semibold">First owner</h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span>Full name</span>
              <input name="firstOwnerName" required className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Email</span>
              <input name="firstOwnerEmail" type="email" required className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Mobile</span>
              <input name="firstOwnerPhone" className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
          </div>
        </section>

        <div className="xl:col-span-2">
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Create organization and owner invite
          </button>
        </div>
      </form>
    </PlatformAdminShell>
  );
}
