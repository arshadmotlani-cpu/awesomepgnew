'use client';

import { useActionState } from 'react';
import {
import { AmountWithWords } from '@/src/owner/components/ui/AmountWithWords';
  syncIntegrationsAction,
  createRecurringObligationAction,
  type WealthActionState,
} from '@/src/owner/actions/wealth';
import { SourceBadge } from '@/src/owner/components/wealth/SourceBadge';

async function syncFormAction(
  _prev: WealthActionState,
  _formData: FormData,
): Promise<WealthActionState> {
  return syncIntegrationsAction();
}

type IntegrationSource = {
  sourceSystem: string;
  factCount: number;
  lastSyncedAt: string | null;
};

export function IntegrationsUi({
  sources,
  recurring,
}: {
  sources: IntegrationSource[];
  recurring: Array<{
    id: string;
    name: string;
    amountPaise: number;
    frequency: string;
    nextDueDate: string | null;
  }>;
}) {
  const [syncState, syncAction, syncPending] = useActionState<WealthActionState, FormData>(
    syncFormAction,
    {},
  );
  const [recState, recAction, recPending] = useActionState<WealthActionState, FormData>(
    createRecurringObligationAction,
    {},
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Integrations</h1>
        <p className="mt-1 text-sm text-[color:var(--oo-muted)]">
          Engine financial facts synced into Owner OS without duplicating operational ledgers.
        </p>
      </header>

      <section className="rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-4">
        <form action={syncAction}>
          <button
            type="submit"
            disabled={syncPending}
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {syncPending ? 'Syncing…' : 'Sync all engines'}
          </button>
        </form>
        {syncState.success ? <p className="mt-2 text-sm text-emerald-400">{syncState.success}</p> : null}
        {syncState.error ? <p className="mt-2 text-sm text-red-400">{syncState.error}</p> : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-[color:var(--oo-muted)]">Synced sources</h2>
        <div className="space-y-2">
          {sources.length === 0 ? (
            <p className="text-sm text-[color:var(--oo-muted)]">No integration facts yet. Run sync.</p>
          ) : (
            sources.map((s) => (
              <div
                key={s.sourceSystem}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-[color:var(--oo-surface)] px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <SourceBadge source={s.sourceSystem} />
                  <span className="text-sm text-[color:var(--oo-muted)]">{s.factCount} facts</span>
                </div>
                <span className="text-xs text-[color:var(--oo-muted)]">
                  {s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleString('en-IN') : '—'}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-4">
        <h2 className="text-sm font-medium text-white">Recurring obligations</h2>
        <form action={recAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input name="name" placeholder="Name" required className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <input name="amountRupees" type="number" step="0.01" placeholder="Amount (₹)" required className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <input name="nextDueDate" type="date" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <select name="frequency" className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            <option value="MONTHLY">Monthly</option>
            <option value="WEEKLY">Weekly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="YEARLY">Yearly</option>
          </select>
          <button type="submit" disabled={recPending} className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white">
            Add recurring
          </button>
        </form>
        {recState.success ? <p className="mt-2 text-sm text-emerald-400">{recState.success}</p> : null}
        <div className="mt-4 space-y-2">
          {recurring.map((r) => (
            <div key={r.id} className="flex justify-between text-sm">
              <span className="text-white">{r.name}</span>
              <span className="tabular-nums text-[color:var(--oo-muted)]">
                <AmountWithWords paise={r.amountPaise} /> · {r.frequency}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
