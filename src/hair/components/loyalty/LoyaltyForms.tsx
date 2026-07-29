'use client';

import { useActionState } from 'react';
import {
  createBridalAction,
  sellMembershipAction,
  sellPackageAction,
  type LoyaltyActionState,
} from '@/src/hair/actions/loyalty';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';

type CustomerOpt = { id: string; fullName: string; phone: string };
type PlanOpt = { id: string; name: string; priceLabel: string };

const empty: LoyaltyActionState = {};

export function LoyaltyForms({
  customers,
  membershipPlans,
  packagePlans,
}: {
  customers: CustomerOpt[];
  membershipPlans: PlanOpt[];
  packagePlans: PlanOpt[];
}) {
  const [memState, memAction, memPending] = useActionState(sellMembershipAction, empty);
  const [pkgState, pkgAction, pkgPending] = useActionState(sellPackageAction, empty);
  const [bridalState, bridalAction, bridalPending] = useActionState(createBridalAction, empty);

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <form action={memAction} className="space-y-2 rounded-2xl border border-[color:var(--fyh-border)] p-4">
        <h2 className="text-sm font-semibold">Sell membership</h2>
        <CustomerSelect customers={customers} />
        <select
          name="planId"
          required
          className="flex h-10 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm"
          defaultValue=""
        >
          <option value="" disabled>
            Plan
          </option>
          {membershipPlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.priceLabel}
            </option>
          ))}
        </select>
        {memState.error ? <p className="text-xs text-fyh-danger">{memState.error}</p> : null}
        {memState.success ? <p className="text-xs text-fyh-success">{memState.success}</p> : null}
        <Button type="submit" size="sm" disabled={memPending || membershipPlans.length === 0}>
          Activate
        </Button>
      </form>

      <form action={pkgAction} className="space-y-2 rounded-2xl border border-[color:var(--fyh-border)] p-4">
        <h2 className="text-sm font-semibold">Sell package</h2>
        <CustomerSelect customers={customers} />
        <select
          name="planId"
          required
          className="flex h-10 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm"
          defaultValue=""
        >
          <option value="" disabled>
            Package
          </option>
          {packagePlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.priceLabel}
            </option>
          ))}
        </select>
        {pkgState.error ? <p className="text-xs text-fyh-danger">{pkgState.error}</p> : null}
        {pkgState.success ? <p className="text-xs text-fyh-success">{pkgState.success}</p> : null}
        <Button type="submit" size="sm" disabled={pkgPending || packagePlans.length === 0}>
          Sell
        </Button>
      </form>

      <form action={bridalAction} className="space-y-2 rounded-2xl border border-[color:var(--fyh-border)] p-4">
        <h2 className="text-sm font-semibold">Create bridal profile</h2>
        <CustomerSelect customers={customers} />
        <Input name="brideName" required placeholder="Bride name" />
        <Input name="weddingDate" type="date" />
        <Input name="notes" placeholder="Notes" />
        {bridalState.error ? <p className="text-xs text-fyh-danger">{bridalState.error}</p> : null}
        {bridalState.success ? (
          <p className="text-xs text-fyh-success">{bridalState.success}</p>
        ) : null}
        <Button type="submit" size="sm" disabled={bridalPending}>
          Create
        </Button>
      </form>
    </section>
  );
}

function CustomerSelect({ customers }: { customers: CustomerOpt[] }) {
  return (
    <select
      name="customerId"
      required
      className="flex h-10 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm"
      defaultValue=""
    >
      <option value="" disabled>
        Customer
      </option>
      {customers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.fullName} · {c.phone}
        </option>
      ))}
    </select>
  );
}
