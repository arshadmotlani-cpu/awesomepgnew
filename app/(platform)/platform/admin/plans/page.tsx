import { savePlanAction } from '@/src/platform/actions/admin';
import { PlatformAdminShell } from '@/src/platform/components/PlatformAdminShell';
import { listPlatformPlans } from '@/src/platform/services/admin';

export default async function PlatformPlansPage() {
  const plans = await listPlatformPlans();

  return (
    <PlatformAdminShell title="Plans" subtitle="Maintain plan catalog and entitlement limit JSON.">
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <form action={savePlanAction} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-base font-semibold">Create plan</h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span>Slug</span>
              <input name="slug" required className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Name</span>
              <input name="name" required className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Limits JSON</span>
              <textarea
                name="limitsJson"
                rows={8}
                defaultValue={'{\n  "users": 10,\n  "locations": 1\n}'}
                className="rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Save plan
            </button>
          </div>
        </form>

        <div className="space-y-4">
          {plans.map((plan) => (
            <form
              key={plan.id}
              action={savePlanAction}
              className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6"
            >
              <input type="hidden" name="id" value={plan.id} />
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm">
                  <span>Slug</span>
                  <input name="slug" defaultValue={plan.slug} className="rounded-lg bg-slate-950 px-3 py-2" />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>Name</span>
                  <input name="name" defaultValue={plan.name} className="rounded-lg bg-slate-950 px-3 py-2" />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>Limits JSON</span>
                  <textarea
                    name="limitsJson"
                    rows={8}
                    defaultValue={JSON.stringify(plan.limits ?? {}, null, 2)}
                    className="rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Update plan
                </button>
              </div>
            </form>
          ))}
        </div>
      </div>
    </PlatformAdminShell>
  );
}
