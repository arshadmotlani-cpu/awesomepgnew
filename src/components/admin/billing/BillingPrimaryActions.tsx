'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  generateRentBillsAction,
  type ActionState,
} from '@/app/(admin)/admin/rent/actions';

const idle: ActionState = { status: 'idle' };

const PRIMARY =
  'inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-5 py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50';
const SECONDARY =
  'inline-flex items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10 px-5 py-3 text-sm font-semibold text-sky-100 hover:bg-sky-500/20';

type Props = {
  billingMonth: string;
  canGenerateRent: boolean;
};

function monthInputValue(billingMonth: string): string {
  return billingMonth.slice(0, 7);
}

function dueDateDefault(billingMonth: string, day = 15): string {
  const [y, m] = billingMonth.slice(0, 7).split('-').map(Number);
  const maxDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const d = Math.min(day, maxDay);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function BillingPrimaryActions({ billingMonth, canGenerateRent }: Props) {
  const [genState, genAction, genPending] = useActionState(generateRentBillsAction, idle);
  const monthValue = monthInputValue(billingMonth);
  const defaultDueDate = dueDateDefault(billingMonth, 15);

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-[#1A1F27] p-6">
      <h2 className="text-lg font-semibold text-white">Billing Centre</h2>
      <p className="mt-1 text-sm text-apg-silver">
        Generate monthly rent and electricity bills for all active residents. Pricing flows from
        catalog rates → billing profile → invoice.
      </p>

      {genState.status === 'ok' ? (
        <p className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {genState.message}
        </p>
      ) : genState.status === 'error' ? (
        <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {genState.message}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-[#12161C] p-5">
          <h3 className="text-base font-semibold text-white">Generate Rent Bills</h3>
          <p className="mt-1 text-xs text-apg-silver">
            One rent invoice per active assigned resident. Vacant beds, cancelled bookings, and
            checkout residents are skipped automatically.
          </p>
          <form action={genAction} className="mt-4 space-y-3">
            <label className="block text-xs text-apg-silver">
              Billing month
              <input
                type="month"
                name="billingMonthInput"
                defaultValue={monthValue}
                required
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-apg-silver">
              Collection due date
              <input
                type="date"
                name="collectionDueDate"
                defaultValue={defaultDueDate}
                required
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
            </label>
            <button type="submit" disabled={genPending || !canGenerateRent} className={PRIMARY}>
              {genPending ? 'Generating rent bills…' : 'Generate Rent Bills'}
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#12161C] p-5">
          <h3 className="text-base font-semibold text-white">Generate Electricity Bills</h3>
          <p className="mt-1 text-xs text-apg-silver">
            Choose billing month, PG, and room. Occupants and meter readings load automatically.
            Split equally by default — or enter fixed amounts per resident.
          </p>
          <Link
            href={`/admin/billing/electricity/generate?month=${monthValue}`}
            className={`${SECONDARY} mt-4`}
          >
            Generate Electricity Bills →
          </Link>
        </div>
      </div>
    </section>
  );
}
