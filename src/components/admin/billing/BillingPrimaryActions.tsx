'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  generateDueInvoicesAction,
  type ActionState,
} from '@/app/(admin)/admin/rent/actions';

const idle: ActionState = { status: 'idle' };

const PRIMARY =
  'inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50';
const SECONDARY =
  'inline-flex items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5';

type Props = {
  billingMonth: string;
  canGenerateRent: boolean;
  needsBillCount: number;
};

function tabHref(tab: string, billingMonth: string) {
  const params = new URLSearchParams({ tab, month: billingMonth });
  return `/admin/revenue/billing?${params.toString()}`;
}

export function BillingPrimaryActions({
  billingMonth,
  canGenerateRent,
  needsBillCount,
}: Props) {
  const [genState, genAction, genPending] = useActionState(generateDueInvoicesAction, idle);
  const monthLabel = billingMonth.slice(0, 7);

  const actions: Array<
    | { key: string; kind: 'form' }
    | { key: string; kind: 'link'; href: string; label: string; primary?: boolean; badge?: number }
  > = [];

  if (canGenerateRent && needsBillCount > 0) {
    actions.push({ key: 'create-bills', kind: 'form' });
  } else if (canGenerateRent) {
    actions.push({ key: 'create-bills', kind: 'form' });
  }

  actions.push({
    key: 'rent',
    kind: 'link',
    href: tabHref('rent', billingMonth),
    label: 'Open rent bills',
    primary: true,
  });

  actions.push({
    key: 'electricity',
    kind: 'link',
    href: tabHref('electricity', billingMonth),
    label: 'Open electricity bills',
  });

  actions.push({
    key: 'electricity-new',
    kind: 'link',
    href: `/admin/electricity/new?month=${monthLabel}`,
    label: 'Create electricity bill',
  });

  actions.push({
    key: 'invoices',
    kind: 'link',
    href: '/admin/invoices',
    label: 'All invoices',
  });

  const visible = actions.slice(0, 5);

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-base font-semibold text-white">What to do next</h2>
      <p className="mt-1 text-sm text-apg-silver">
        {needsBillCount > 0
          ? `${needsBillCount} resident${needsBillCount === 1 ? '' : 's'} still need a bill for ${monthLabel}.`
          : 'Create bills, send payment links, or review collections.'}
      </p>

      {genState.status === 'ok' ? (
        <p className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {genState.message}
        </p>
      ) : genState.status === 'error' ? (
        <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {genState.message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {visible.map((action) => {
          if (action.kind === 'form') {
            return (
              <form key={action.key} action={genAction} className="inline-flex">
                <input type="hidden" name="billingMonth" value={billingMonth} />
                <button type="submit" disabled={genPending || !canGenerateRent} className={PRIMARY}>
                  {genPending ? 'Creating bills…' : `Create bills for ${monthLabel}`}
                </button>
              </form>
            );
          }

          const className = action.primary ? PRIMARY : SECONDARY;
          return (
            <Link key={action.key} href={action.href} className={className}>
              {action.label}
              {action.badge ? (
                <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">{action.badge}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
