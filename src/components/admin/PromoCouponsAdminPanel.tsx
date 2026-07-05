'use client';

import { useState, useTransition } from 'react';
import { paiseToInr } from '@/src/lib/format';
import type { PromoCouponAdminRow } from '@/src/services/promoCouponAdmin';

export function PromoCouponsAdminPanel({
  coupons,
  createAction,
  toggleAction,
  deleteAction,
}: {
  coupons: PromoCouponAdminRow[];
  createAction: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
  toggleAction: (id: string, active: boolean) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">Coupons</h2>
          <p className="mt-1 text-xs text-apg-silver">Admin promo codes — extends daily date coupon</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          {showForm ? 'Cancel' : 'Create coupon'}
        </button>
      </div>

      {showForm ? (
        <form
          className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2"
          action={(fd) => {
            startTransition(async () => {
              setError(null);
              const result = await createAction(fd);
              if (!result.ok) setError(result.error ?? 'Failed');
              else setShowForm(false);
            });
          }}
        >
          <label className="block sm:col-span-2">
            <span className="text-xs text-apg-silver">Code</span>
            <input name="code" required className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <span className="text-xs text-apg-silver">Type</span>
            <select name="type" className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white">
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-apg-silver">Scope</span>
            <select name="scope" className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white">
              <option value="rent_invoice">Rent invoice</option>
              <option value="booking_rent">Booking checkout</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-apg-silver">Percent (e.g. 10)</span>
            <input name="percent" type="number" min={1} max={100} placeholder="10" className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <span className="text-xs text-apg-silver">Fixed ₹ (optional)</span>
            <input name="fixedInr" type="number" min={0} className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <span className="text-xs text-apg-silver">Usage limit</span>
            <input name="usageLimit" type="number" min={1} className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs text-apg-silver">Reason / label</span>
            <input name="reason" className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
          </label>
          {error ? <p className="sm:col-span-2 text-xs text-rose-300">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="sm:col-span-2 rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? 'Creating…' : 'Save coupon'}
          </button>
        </form>
      ) : null}

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase text-apg-silver">
              <th className="py-2 pr-3">Code</th>
              <th className="py-2 pr-3">Scope</th>
              <th className="py-2 pr-3">Uses</th>
              <th className="py-2 pr-3">Discount given</th>
              <th className="py-2 pr-3">Remaining</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {coupons.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-apg-silver">
                  No admin coupons yet.
                </td>
              </tr>
            ) : (
              coupons.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-3 font-mono text-white">{c.code}</td>
                  <td className="py-2 pr-3 text-apg-silver">{c.scope}</td>
                  <td className="py-2 pr-3 text-white">{c.usageCount}</td>
                  <td className="py-2 pr-3 text-white">{paiseToInr(c.totalDiscountPaise)}</td>
                  <td className="py-2 pr-3 text-apg-silver">
                    {c.remainingUses != null ? c.remainingUses : '∞'}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${c.active ? 'bg-emerald-500/15 text-emerald-200' : 'bg-zinc-500/15 text-zinc-300'}`}
                    >
                      {c.active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startTransition(() => toggleAction(c.id, !c.active))}
                        className="text-xs text-apg-orange hover:underline"
                      >
                        {c.active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startTransition(() => deleteAction(c.id))}
                        className="text-xs text-rose-300 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
