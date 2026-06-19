'use client';

import { useActionState } from 'react';
import {
  auditOccupancyAction,
  executeOccupancyDiagnosticsAction,
  previewOccupancyDiagnosticsAction,
  type OccupancyDiagnosticsActionState,
} from '@/app/(admin)/admin/settings/occupancy-diagnostics-actions';

const idle: OccupancyDiagnosticsActionState = { status: 'idle' };

export function OccupancyDiagnosticsPanel() {
  const [auditState, auditAction, auditPending] = useActionState(auditOccupancyAction, idle);
  const [previewState, previewAction, previewPending] = useActionState(
    previewOccupancyDiagnosticsAction,
    idle,
  );
  const [executeState, executeAction, executePending] = useActionState(
    executeOccupancyDiagnosticsAction,
    idle,
  );
  const [dryRunState, dryRunAction, dryRunPending] = useActionState(
    executeOccupancyDiagnosticsAction,
    idle,
  );

  const rows = auditState.status === 'ok' ? auditState.audit ?? [] : [];
  const mismatches = rows.filter((r) => r.mismatch);
  const repairMessage =
    executeState.status === 'ok'
      ? executeState.message
      : dryRunState.status === 'ok'
        ? dryRunState.message
        : previewState.status === 'ok'
          ? previewState.message
          : null;
  const repairError =
    executeState.status === 'error'
      ? executeState.message
      : dryRunState.status === 'error'
        ? dryRunState.message
        : previewState.status === 'error'
          ? previewState.message
          : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <form action={auditAction}>
          <button
            type="submit"
            disabled={auditPending}
            className="rounded-lg border border-white/10 bg-[#12161C] px-4 py-2 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-60"
          >
            {auditPending ? 'Auditing…' : 'Audit Occupancy'}
          </button>
        </form>
        <form action={previewAction}>
          <button
            type="submit"
            disabled={previewPending}
            className="rounded-lg border border-white/10 bg-[#12161C] px-4 py-2 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-60"
          >
            {previewPending ? 'Previewing…' : 'Preview Repair'}
          </button>
        </form>
        <form action={dryRunAction}>
          <input type="hidden" name="dryRun" value="true" />
          <button
            type="submit"
            disabled={dryRunPending}
            className="rounded-lg border border-sky-400/30 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/10 disabled:opacity-60"
          >
            {dryRunPending ? 'Dry running…' : 'Dry Run'}
          </button>
        </form>
        <form action={executeAction}>
          <input type="hidden" name="dryRun" value="false" />
          <button
            type="submit"
            disabled={executePending}
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
          >
            {executePending ? 'Executing…' : 'Execute Repair'}
          </button>
        </form>
      </div>

      {auditState.status === 'ok' ? (
        <p className="text-sm text-emerald-300">{auditState.message}</p>
      ) : null}
      {auditState.status === 'error' ? (
        <p className="text-sm text-rose-300">{auditState.message}</p>
      ) : null}
      {repairMessage ? <p className="text-sm text-emerald-300">{repairMessage}</p> : null}
      {repairError ? <p className="text-sm text-rose-300">{repairError}</p> : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase text-apg-silver">
              <tr>
                <th className="px-3 py-2">Resident</th>
                <th className="px-3 py-2">Customer ID</th>
                <th className="px-3 py-2">Booking ID</th>
                <th className="px-3 py-2">Reservation ID</th>
                <th className="px-3 py-2">Bed</th>
                <th className="px-3 py-2">Residents</th>
                <th className="px-3 py-2">Bed map</th>
                <th className="px-3 py-2">Mismatch?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(mismatches.length > 0 ? mismatches : rows.slice(0, 50)).map((row) => (
                <tr key={row.customerId} className={row.mismatch ? 'bg-rose-500/10' : undefined}>
                  <td className="px-3 py-2 text-white">{row.residentName}</td>
                  <td className="px-3 py-2 font-mono text-xs text-apg-silver">{row.customerId}</td>
                  <td className="px-3 py-2 font-mono text-xs text-apg-silver">
                    {row.bookingId ?? '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-apg-silver">
                    {row.bedReservationId ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-apg-silver">{row.bedLabel ?? '—'}</td>
                  <td className="px-3 py-2 capitalize text-apg-silver">{row.residentsPageStatus}</td>
                  <td className="px-3 py-2 capitalize text-apg-silver">{row.bedMapStatus}</td>
                  <td className="px-3 py-2">
                    {row.mismatch ? (
                      <span className="text-rose-300" title={row.mismatchReason ?? undefined}>
                        Yes
                      </span>
                    ) : (
                      <span className="text-emerald-300">No</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {mismatches.length === 0 && rows.length > 50 ? (
            <p className="px-3 py-2 text-xs text-apg-silver">
              Showing first 50 assigned residents — no mismatches found.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
