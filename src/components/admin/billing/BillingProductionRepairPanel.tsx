'use client';

import { useActionState } from 'react';
import {
  previewJuneElectricityIntegrityAction,
  previewShantinagarJulyRentAction,
  previewShantinagarOccupancySsotAction,
  runJuneElectricityIntegrityAction,
  runShantinagarJulyRentAction,
  runShantinagarOccupancySsotAction,
  type ProductionRepairActionState,
} from '@/app/(admin)/admin/billing/production-repair-actions';

const idle: ProductionRepairActionState = { status: 'idle' };

function RepairBlock({
  title,
  description,
  previewAction,
  runAction,
  runLabel,
  runConfirm,
}: {
  title: string;
  description: string;
  previewAction: typeof previewShantinagarJulyRentAction;
  runAction: typeof runShantinagarJulyRentAction;
  runLabel: string;
  runConfirm: string;
}) {
  const [previewState, previewFormAction, previewPending] = useActionState(previewAction, idle);
  const [runState, runFormAction, runPending] = useActionState(runAction, idle);
  const active = previewState.status !== 'idle' ? previewState : runState;

  return (
    <div className="rounded-xl border border-white/10 bg-[#141820] p-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-apg-silver">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <form action={previewFormAction}>
          <button
            type="submit"
            disabled={previewPending || runPending}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            {previewPending ? 'Previewing…' : 'Preview (dry run)'}
          </button>
        </form>
        <form
          action={runFormAction}
          onSubmit={(e) => {
            if (!window.confirm(runConfirm)) e.preventDefault();
          }}
        >
          <button
            type="submit"
            disabled={previewPending || runPending}
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {runPending ? 'Running…' : runLabel}
          </button>
        </form>
      </div>
      {active.status === 'ok' || active.status === 'error' ? (
        <div className="mt-4 space-y-2">
          <p
            className={
              active.status === 'ok' ? 'text-sm text-emerald-300' : 'text-sm text-rose-300'
            }
          >
            {active.message}
          </p>
          {'report' in active && active.report ? (
            <pre className="max-h-96 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-zinc-200 whitespace-pre-wrap">
              {active.report}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Super Admin production billing repairs — no terminal or cron required. */
export function BillingProductionRepairPanel() {
  return (
    <section className="mb-8 rounded-2xl border border-violet-500/40 bg-violet-500/10 p-6">
      <header>
        <p className="text-lg font-semibold text-violet-100">Production billing repair</p>
        <p className="mt-1 text-sm text-violet-200/90">
          Super Admin only. Run certified repairs from Billing Centre — preview first, then apply.
          Room 101 pricing is never changed by the Shantinagar +1% repair.
        </p>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <RepairBlock
          title="Shantinagar occupancy SSOT (rooms 101–302)"
          description="Final occupancy source of truth: closes invalid residents (Harshad, empty 102, vacant 301), fixes bed assignments, regenerates affected June electricity, then July rent for active residents only. Prints full certification."
          previewAction={previewShantinagarOccupancySsotAction}
          runAction={runShantinagarOccupancySsotAction}
          runLabel="Run occupancy SSOT repair"
          runConfirm="Apply Shantinagar occupancy SSOT repair? This updates bookings, reservations, and regenerates affected billing. Preview first."
        />
        <RepairBlock
          title="Shantinagar +1% & July rent"
          description="Applies +1% monthly rent to rooms 102, 202–204, 301–302 (skips 101 and 201). Then generates July rent for every active assigned resident."
          previewAction={previewShantinagarJulyRentAction}
          runAction={runShantinagarJulyRentAction}
          runLabel="Run pricing + July rent"
          runConfirm="Apply Shantinagar +1% pricing and generate July rent invoices? This updates bed prices and creates rent invoices."
        />
        <RepairBlock
          title="June 2026 electricity integrity"
          description="Audits Shantinagar rooms 101–204 against meter readings and occupancy. Voids and regenerates only incorrect June electricity bills; removes invalid residents; syncs July rent profiles where needed."
          previewAction={previewJuneElectricityIntegrityAction}
          runAction={runJuneElectricityIntegrityAction}
          runLabel="Run June electricity repair"
          runConfirm="Repair June 2026 electricity invoices? Incorrect bills will be voided and regenerated from meter data."
        />
      </div>
    </section>
  );
}
