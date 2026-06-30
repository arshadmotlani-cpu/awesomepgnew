'use client';

import { useActionState } from 'react';
import {
  repairPipelineTestMisassignmentsAction,
  type PipelineRepairActionState,
} from '@/app/(admin)/admin/billing/pipeline-integrity-actions';
import { paiseToInr } from '@/src/lib/format';
import type { PipelineTestIntegrityIssue } from '@/src/services/billingPipelineIntegrity';

const idle: PipelineRepairActionState = { status: 'idle' };

export function PipelineTestIntegrityPanel({
  issues,
  strayZeroInvoices,
}: {
  issues: PipelineTestIntegrityIssue[];
  strayZeroInvoices: Array<{ invoiceNumber: string; email: string; amountPaise: number }>;
}) {
  const [state, formAction, pending] = useActionState(
    repairPipelineTestMisassignmentsAction,
    idle,
  );

  if (issues.length === 0 && strayZeroInvoices.length === 0) return null;

  return (
    <section className="mb-8 rounded-2xl border border-rose-500/50 bg-rose-500/10 p-6">
      <header>
        <p className="text-lg font-semibold text-rose-100">Billing integrity — action required</p>
        <p className="mt-1 text-sm text-rose-200/90">
          These issues block billing certification. Repair from here — never via terminal scripts.
        </p>
      </header>

      {issues.length > 0 ? (
        <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-950/30 p-4">
          <p className="text-sm font-medium text-rose-100">
            Misassigned pipeline test invoices ({issues.length})
          </p>
          <p className="mt-1 text-xs text-rose-200/80">
            Pipeline test invoices must belong to {issues[0]?.residentEmail ? 'the designated test account only' : 'the designated test account'}.
            Cancel misassigned rows — they are excluded from revenue.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-rose-50/90">
            {issues.map((issue) => (
              <li key={issue.invoiceId}>
                {issue.invoiceNumber} · {issue.residentName} ({issue.residentEmail}) ·{' '}
                {paiseToInr(issue.amountPaise)}
              </li>
            ))}
          </ul>
          <form action={formAction} className="mt-4">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
            >
              {pending ? 'Repairing…' : 'Cancel misassigned test invoices'}
            </button>
          </form>
          {state.status === 'ok' ? (
            <p className="mt-2 text-sm text-emerald-300">{state.message}</p>
          ) : null}
          {state.status === 'error' ? (
            <p className="mt-2 text-sm text-rose-300">{state.message}</p>
          ) : null}
        </div>
      ) : null}

      {strayZeroInvoices.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-950/20 p-4">
          <p className="text-sm font-medium text-amber-100">
            Stray ₹0 production invoices ({strayZeroInvoices.length})
          </p>
          <p className="mt-1 text-xs text-amber-200/80">
            Review in Electricity → duplicates or cancel manually from invoice detail. Creation is
            blocked going forward.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-50/90">
            {strayZeroInvoices.slice(0, 8).map((row) => (
              <li key={row.invoiceNumber}>
                {row.invoiceNumber} · {row.email}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
