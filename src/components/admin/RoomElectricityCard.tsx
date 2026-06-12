'use client';

import { useState } from 'react';
import {
  recordMonthlyMeterAction,
  uploadMeterPhotoAction,
} from '@/app/(admin)/admin/pgs/electricity-actions';
import { defaultBillingMonth } from '@/src/lib/dateDefaults';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { MeterLog } from '@/src/db/schema/meterLogs';
import type { ElectricityBill } from '@/src/db/schema/electricityBills';

export function RoomElectricityCard({
  pgId,
  roomId,
  logs,
  latestBill,
  blobUploadConfigured,
}: {
  pgId: string;
  roomId: string;
  logs: MeterLog[];
  latestBill: ElectricityBill | undefined;
  blobUploadConfigured: boolean;
}) {
  const [units, setUnits] = useState('');
  const [rateInr, setRateInr] = useState('');
  const [meterUrl, setMeterUrl] = useState('');
  const [useEstimate, setUseEstimate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const latestLog = logs[0];

  async function onFile(file: File | null) {
    if (!file || !blobUploadConfigured) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const url = await uploadMeterPhotoAction(fd);
      setMeterUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(false);
    const fd = new FormData();
    fd.append('roomId', roomId);
    fd.append('units', units);
    fd.append('ratePerUnitInr', rateInr);
    fd.append('billingMonth', defaultBillingMonth());
    fd.append('meterImageUrl', meterUrl);
    if (useEstimate) fd.append('useEstimate', 'on');
    const result = await recordMonthlyMeterAction(pgId, fd);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed');
      return;
    }
    setSuccess(true);
    setUnits('');
    setMeterUrl('');
  }

  return (
    <div className="rounded-lg border border-indigo-900/50 bg-indigo-950/20 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-indigo-300/80">
        Electricity (room meter)
      </p>

      <dl className="mt-2 grid gap-1 text-xs text-zinc-400 sm:grid-cols-2">
        <div>
          Latest reading:{' '}
          <span className="text-zinc-200">
            {latestLog
              ? `${latestLog.units} units · ${latestLog.readingType} · ${formatDate(latestLog.recordedAt)}`
              : '—'}
          </span>
        </div>
        {latestBill ? (
          <div>
            Last bill:{' '}
            <span className="text-zinc-200">
              {latestBill.unitsConsumed} units · {paiseToInr(latestBill.totalPaise)} ·{' '}
              {formatDate(latestBill.billingMonth)}
            </span>
            {latestBill.isEstimated ? (
              <span className="ml-1 text-amber-400">(estimated)</span>
            ) : null}
          </div>
        ) : (
          <div className="text-zinc-500">No electricity bill yet for this room.</div>
        )}
      </dl>

      <form onSubmit={onSubmit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-zinc-400">Current meter units</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            disabled={useEstimate}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white disabled:opacity-50"
          />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Rate per unit (₹)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            required
            value={rateInr}
            onChange={(e) => setRateInr(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300 sm:col-span-2">
          <input
            type="checkbox"
            checked={useEstimate}
            onChange={(e) => setUseEstimate(e.target.checked)}
          />
          Estimated bill from historical average (no meter photo)
        </label>
        {!useEstimate && blobUploadConfigured ? (
          <label className="text-sm sm:col-span-2">
            <span className="text-zinc-400">Meter photo *</span>
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm text-zinc-400"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            {uploading ? <span className="text-xs text-zinc-500">Uploading…</span> : null}
            {meterUrl ? <span className="text-xs text-emerald-400">Photo ready</span> : null}
          </label>
        ) : !useEstimate ? (
          <p className="text-xs text-amber-400 sm:col-span-2">
            Configure Vercel Blob public storage for meter photos, or use estimated billing.
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {pending
              ? 'Saving…'
              : useEstimate
                ? 'Create estimated bill'
                : 'Record reading & generate bill'}
          </button>
        </div>
      </form>
      {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}
      {success ? (
        <p className="mt-2 text-sm text-emerald-400">
          Bill created — tenant shares appear on resident dashboard. Approve payments in Collections
          below.
        </p>
      ) : null}
    </div>
  );
}
