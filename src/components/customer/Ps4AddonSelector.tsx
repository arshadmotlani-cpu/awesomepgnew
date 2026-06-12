'use client';

import { PS4_ADDON_LABEL, PS4_LOUNGE_HEADLINE, PS4_LOUNGE_HOURLY_NOTE, PS4_PLANS, type Ps4PlanId } from '@/src/lib/playstation/plans';
import { paiseToInr } from '@/src/lib/format';

type Props = {
  selectedPlan: Ps4PlanId | null;
  onChange: (plan: Ps4PlanId | null) => void;
  disabled?: boolean;
};

/** Optional PS4 gaming maintenance add-on — separate from bed rent / deposit. */
export function Ps4AddonSelector({ selectedPlan, onChange, disabled }: Props) {
  return (
    <section
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
      data-roachie-tour="ps4-addon"
    >
      <h2 className="text-base font-semibold text-zinc-900">Optional add-ons</h2>
      <p className="mt-1 text-sm font-medium text-zinc-800">{PS4_LOUNGE_HEADLINE}</p>
      <p className="mt-1 text-sm text-zinc-500">
        {PS4_LOUNGE_HOURLY_NOTE} {PS4_ADDON_LABEL} — separate from your bed rent and deposit.
      </p>

      <div className="mt-4 space-y-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 hover:bg-zinc-50">
          <input
            type="radio"
            name="ps4Plan"
            value=""
            checked={selectedPlan === null}
            disabled={disabled}
            onChange={() => onChange(null)}
            className="mt-1"
          />
          <span className="text-sm text-zinc-700">No PS4 add-on</span>
        </label>

        {(Object.values(PS4_PLANS) as Array<(typeof PS4_PLANS)[Ps4PlanId]>).map((plan) => (
          <label
            key={plan.id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 hover:bg-zinc-50 has-[:checked]:border-indigo-300 has-[:checked]:bg-indigo-50/40"
          >
            <input
              type="radio"
              name="ps4Plan"
              value={plan.id}
              checked={selectedPlan === plan.id}
              disabled={disabled}
              onChange={() => onChange(plan.id)}
              className="mt-1"
            />
            <span className="flex-1 text-sm">
              <span className="font-medium text-zinc-900">{plan.label}</span>
              <span className="block text-xs text-zinc-500">{plan.description}</span>
            </span>
            <span className="text-sm font-semibold text-zinc-900">{paiseToInr(plan.pricePaise)}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

export function ps4AddonPaise(plan: Ps4PlanId | null | undefined): number {
  if (!plan) return 0;
  return PS4_PLANS[plan].pricePaise;
}
