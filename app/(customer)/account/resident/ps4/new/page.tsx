import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { paiseToInr } from '@/src/lib/format';
import { PS4_ADDON_LABEL, PS4_PLANS } from '@/src/lib/playstation/plans';
import { isActiveTenant } from '@/src/services/playstationMembership';
import { subscribePs4Action } from './actions';

export const dynamic = 'force-dynamic';

export default async function NewPs4SubscriptionPage() {
  const session = await requireCustomerSession('/account/resident/ps4/new');
  const active = await isActiveTenant(session.customerId);
  if (!active) {
    redirect('/account/resident');
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-10 sm:px-6">
      <header>
        <Link
          href="/account/resident"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
        >
          ← Back to resident dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          Subscribe to PS4 add-on
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{PS4_ADDON_LABEL}</p>
      </header>

      <form action={subscribePs4Action} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        {(Object.values(PS4_PLANS)).map((plan) => (
          <label
            key={plan.id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 hover:bg-zinc-50 has-[:checked]:border-indigo-300 has-[:checked]:bg-indigo-50/40"
          >
            <input type="radio" name="plan" value={plan.id} required className="mt-1" />
            <span className="flex-1 text-sm">
              <span className="font-medium text-zinc-900">{plan.label}</span>
              <span className="block text-xs text-zinc-500">{plan.description}</span>
            </span>
            <span className="text-sm font-semibold">{paiseToInr(plan.pricePaise)}</span>
          </label>
        ))}
        <p className="text-xs text-zinc-500">
          Payment uses the electricity / daily UPI QR — separate from rent.
        </p>
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Continue to payment →
        </button>
      </form>
    </div>
  );
}
