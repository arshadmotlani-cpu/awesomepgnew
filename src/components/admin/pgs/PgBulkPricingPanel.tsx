'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  applyBulkPgPricingAction,
  previewBulkPgPricingAction,
} from '@/app/(admin)/admin/pgs/pricing-actions';
import { paiseToInr, formatDateTime } from '@/src/lib/format';
import type {
  BulkPgPricingPreview,
  PgPricingRevisionRow,
} from '@/src/services/bulkPgPricing';

type BedRow = {
  bedId: string;
  roomNumber: string;
  bedCode: string;
  floorLabel: string;
  currentRentPaise: number;
  newRentPaise: number;
  currentDepositPaise: number;
  newDepositPaise: number;
};

type Props = {
  pgId: string;
  pgName: string;
  isSuperAdmin: boolean;
  summary: {
    bedCount: number;
    oldAvgRentPaise: number;
    oldAvgDepositPaise: number;
  };
  beds: BedRow[];
  revisions: PgPricingRevisionRow[];
  lastRevision: PgPricingRevisionRow | null;
};

const SURFACE = 'rounded-2xl border border-white/10 bg-[#1A1F27] p-5';

export function PgBulkPricingPanel({
  pgId,
  pgName,
  isSuperAdmin,
  summary,
  beds,
  revisions,
  lastRevision,
}: Props) {
  const router = useRouter();
  const [rentPct, setRentPct] = useState('');
  const [depositPct, setDepositPct] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [preview, setPreview] = useState<BulkPgPricingPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const showPreview = preview != null;

  const tableRows = useMemo(() => {
    if (showPreview) return preview.beds;
    return beds.map((b) => ({
      ...b,
      newRentPaise: b.currentRentPaise,
      newDepositPaise: b.currentDepositPaise,
    }));
  }, [beds, preview, showPreview]);

  async function onPreview() {
    setError(null);
    setSuccess(null);
    setPending(true);
    const result = await previewBulkPgPricingAction({
      pgId,
      rentPercentChange: rentPct.trim() ? Number(rentPct) : null,
      depositPercentChange: depositPct.trim() ? Number(depositPct) : null,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setPreview(null);
      return;
    }
    setPreview(result.preview);
  }

  async function onApply() {
    setError(null);
    setSuccess(null);
    setPending(true);
    const result = await applyBulkPgPricingAction({
      pgId,
      rentPercentChange: rentPct.trim() ? Number(rentPct) : null,
      depositPercentChange: depositPct.trim() ? Number(depositPct) : null,
      reason,
      confirmation: confirm,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(
      `Updated ${result.bedsUpdated} bed(s). Revision ${result.revisionId.slice(0, 8)}… — existing bookings unchanged.`,
    );
    setPreview(null);
    setConfirm('');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total beds" value={String(summary.bedCount)} />
        <Stat label="Avg monthly rent" value={paiseToInr(summary.oldAvgRentPaise)} />
        <Stat label="Avg deposit" value={paiseToInr(summary.oldAvgDepositPaise)} />
        <Stat
          label="Last revision"
          value={
            lastRevision
              ? formatDateTime(lastRevision.createdAt)
              : 'Never'
          }
        />
      </div>

      {!isSuperAdmin ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Only Super Admin can apply bulk pricing changes. You can view current rates below.
        </p>
      ) : null}

      <section className={SURFACE}>
        <h2 className="text-sm font-semibold text-white">Bulk rent update</h2>
        <p className="mt-1 text-xs text-apg-silver">
          Percentage applies to monthly rent (and scales daily/weekly tiers). Future bookings only.
        </p>
        <label className="mt-4 flex max-w-xs flex-col gap-1 text-xs text-apg-silver">
          Rent change (%)
          <input
            type="number"
            step="0.1"
            value={rentPct}
            onChange={(e) => setRentPct(e.target.value)}
            placeholder="+5 or -5"
            className="h-10 rounded-lg border border-white/15 bg-[#0B0F14] px-3 text-sm text-white"
          />
        </label>
      </section>

      <section className={SURFACE}>
        <h2 className="text-sm font-semibold text-white">Bulk deposit update</h2>
        <p className="mt-1 text-xs text-apg-silver">
          Percentage applies to monthly security deposit on each bed.
        </p>
        <label className="mt-4 flex max-w-xs flex-col gap-1 text-xs text-apg-silver">
          Deposit change (%)
          <input
            type="number"
            step="0.1"
            value={depositPct}
            onChange={(e) => setDepositPct(e.target.value)}
            placeholder="+5"
            className="h-10 rounded-lg border border-white/15 bg-[#0B0F14] px-3 text-sm text-white"
          />
        </label>
      </section>

      {isSuperAdmin ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => void onPreview()}
            className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-50"
          >
            Preview changes
          </button>
        </div>
      ) : null}

      {showPreview && preview ? (
        <section className={`${SURFACE} border-[#FF5A1F]/40`}>
          <h2 className="text-sm font-semibold text-white">Preview — {pgName}</h2>
          <p className="mt-1 text-xs text-apg-silver">
            {preview.summary.bedCount} beds · inventory rent{' '}
            {paiseToInr(preview.summary.oldTotalMonthlyRentPaise)} →{' '}
            {paiseToInr(preview.summary.newTotalMonthlyRentPaise)}
          </p>
          <div className="mt-4 max-h-80 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-apg-silver">
                <tr>
                  <th className="pb-2 pr-2">Bed</th>
                  <th className="pb-2 pr-2">Rent</th>
                  <th className="pb-2">Deposit</th>
                </tr>
              </thead>
              <tbody className="text-white">
                {preview.beds
                  .filter(
                    (b) =>
                      b.newRentPaise !== b.currentRentPaise ||
                      b.newDepositPaise !== b.currentDepositPaise,
                  )
                  .map((b) => (
                    <tr key={b.bedId} className="border-t border-white/5">
                      <td className="py-2 pr-2">
                        R{b.roomNumber} {b.bedCode}
                      </td>
                      <td className="py-2 pr-2">
                        {paiseToInr(b.currentRentPaise)} → {paiseToInr(b.newRentPaise)}
                      </td>
                      <td className="py-2">
                        {paiseToInr(b.currentDepositPaise)} → {paiseToInr(b.newDepositPaise)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <p className="font-semibold">Warning</p>
            <p className="mt-1">
              This updates pricing for <strong>future bookings only</strong>. Existing residents,
              invoices, deposits, and checkout settlements will not change.
            </p>
          </div>

          <label className="mt-4 flex flex-col gap-1 text-xs text-apg-silver">
            Reason (optional)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-10 rounded-lg border border-white/15 bg-[#0B0F14] px-3 text-sm text-white"
            />
          </label>
          <label className="mt-3 flex flex-col gap-1 text-xs text-apg-silver">
            Type UPDATE to confirm
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-10 rounded-lg border border-white/15 bg-[#0B0F14] px-3 text-sm text-white font-mono"
            />
          </label>
          <button
            type="button"
            disabled={pending || confirm.trim().toUpperCase() !== 'UPDATE'}
            onClick={() => void onApply()}
            className="mt-4 rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {pending ? 'Applying…' : 'Apply changes'}
          </button>
        </section>
      ) : null}

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-400">{success}</p> : null}

      <section className={SURFACE}>
        <h2 className="text-sm font-semibold text-white">Current pricing table</h2>
        <div className="mt-3 max-h-96 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-apg-silver">
              <tr>
                <th className="pb-2">Room · Bed</th>
                <th className="pb-2">Rent</th>
                <th className="pb-2">Deposit</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((b) => (
                <tr key={b.bedId} className="border-t border-white/5 text-white">
                  <td className="py-2">
                    {b.floorLabel} · {b.roomNumber} {b.bedCode}
                  </td>
                  <td className="py-2">{paiseToInr(b.currentRentPaise)}</td>
                  <td className="py-2">{paiseToInr(b.currentDepositPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={SURFACE}>
        <h2 className="text-sm font-semibold text-white">Price revision history</h2>
        {revisions.length === 0 ? (
          <p className="mt-2 text-sm text-apg-silver">No bulk revisions yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {revisions.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-white/10 bg-[#0B0F14] px-4 py-3 text-sm"
              >
                <p className="font-medium text-white">
                  {formatDateTime(r.createdAt)} · {r.adminName}
                </p>
                <p className="mt-1 text-apg-silver">
                  Rent {r.rentPercentChange != null ? `${r.rentPercentChange > 0 ? '+' : ''}${r.rentPercentChange}%` : '—'}
                  {' · '}
                  Deposit{' '}
                  {r.depositPercentChange != null
                    ? `${r.depositPercentChange > 0 ? '+' : ''}${r.depositPercentChange}%`
                    : '—'}
                  {' · '}
                  {r.bedsAffected} beds
                </p>
                <p className="mt-1 text-xs text-apg-silver">
                  Avg rent {paiseToInr(r.oldAvgRentPaise)} → {paiseToInr(r.newAvgRentPaise)}
                  {' · '}
                  Avg deposit {paiseToInr(r.oldAvgDepositPaise)} →{' '}
                  {paiseToInr(r.newAvgDepositPaise)}
                </p>
                {r.reason ? <p className="mt-1 text-xs text-zinc-400">{r.reason}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={SURFACE}>
      <p className="text-xs uppercase tracking-wide text-apg-silver">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
