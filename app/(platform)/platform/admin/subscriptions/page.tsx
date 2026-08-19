import { updateSubscriptionAction } from '@/src/platform/actions/admin';
import { PlatformAdminShell } from '@/src/platform/components/PlatformAdminShell';
import { listPlatformPlans, listPlatformSubscriptions } from '@/src/platform/services/admin';

export default async function PlatformSubscriptionsPage() {
  const [subscriptions, plans] = await Promise.all([
    listPlatformSubscriptions(),
    listPlatformPlans(),
  ]);

  return (
    <PlatformAdminShell title="Subscriptions" subtitle="Adjust plan assignment and lifecycle state.">
      <div className="space-y-4">
        {subscriptions.map((subscription) => (
          <form
            key={subscription.id}
            action={updateSubscriptionAction}
            className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6"
          >
            <input type="hidden" name="organizationId" value={subscription.organizationId} />
            <div className="mb-4">
              <p className="font-medium text-white">{subscription.organizationName}</p>
              <p className="text-xs text-slate-500">Subscription {subscription.id}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm">
                <span>Plan</span>
                <select
                  name="planId"
                  defaultValue={subscription.planId}
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
                  defaultValue={subscription.status}
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
                    subscription.currentPeriodEnd
                      ? subscription.currentPeriodEnd.toISOString().slice(0, 10)
                      : ''
                  }
                  className="rounded-lg bg-slate-950 px-3 py-2"
                />
              </label>
            </div>
            <button
              type="submit"
              className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Save subscription
            </button>
          </form>
        ))}
      </div>
    </PlatformAdminShell>
  );
}
