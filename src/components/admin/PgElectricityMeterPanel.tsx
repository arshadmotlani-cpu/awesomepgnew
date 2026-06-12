'use client';

import { useState } from 'react';
import {
  addRoomElectricityPrepaidAction,
  approveElectricityProofAction,
  recordMonthlyMeterAction,
  uploadMeterPhotoAction,
} from '@/app/(admin)/admin/pgs/electricity-actions';
import { defaultBillingMonth } from '@/src/lib/dateDefaults';
import { adminPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { PaymentScreenshotPreview } from '@/src/components/admin/PaymentScreenshotPreview';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { MeterLog } from '@/src/db/schema/meterLogs';
import type { ElectricityBill } from '@/src/db/schema/electricityBills';
import type { RoomElectricityPrepaidLedgerEntry } from '@/src/db/schema/roomElectricityPrepaidLedger';

type RoomSummary = {
  roomId: string;
  roomNumber: string;
  floorLabel: string;
  logs: MeterLog[];
  latestBill: ElectricityBill | undefined;
  prepaidCreditPaise: number;
  prepaidLedger: RoomElectricityPrepaidLedgerEntry[];
};

type PendingProof = {
  invoiceId: string;
  invoiceNumber: string;
  roomNumber: string;
  amountPaise: number;
  paymentProofUrl: string | null;
};

export function PgElectricityMeterPanel({
  pgId,
  rooms,
  pendingProofs,
  blobUploadConfigured,
}: {
  pgId: string;
  rooms: RoomSummary[];
  pendingProofs: PendingProof[];
  blobUploadConfigured: boolean;
}) {
  return (
    <section className="mt-8 space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Electricity billing</h2>
        <p className="text-sm text-zinc-400">
          Upload monthly meter readings with photos. Bills split among monthly residents by active
          days in the month. Use estimated billing when meter data is missing.
        </p>
      </div>

      {pendingProofs.length > 0 ? (
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 p-4">
          <h3 className="text-sm font-medium text-amber-200">Pending payment proofs</h3>
          <ul className="mt-2 space-y-2">
            {pendingProofs.map((p) => (
              <li
                key={p.invoiceId}
                className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-300"
              >
                <span>
                  {p.invoiceNumber} · Room {p.roomNumber} · {paiseToInr(p.amountPaise)}
                </span>
                <div className="flex items-center gap-2">
                  {p.paymentProofUrl ? (
                    <PaymentScreenshotPreview
                      url={p.paymentProofUrl}
                      viewHref={adminPaymentProofViewUrl('electricity', p.invoiceId)}
                      alt={`${p.invoiceNumber} payment proof`}
                      className="h-16 w-16 rounded border border-zinc-600 object-contain bg-black/40"
                    />
                  ) : null}
                  <ApproveProofButton invoiceId={p.invoiceId} pgId={pgId} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {rooms.length === 0 ? (
        <p className="text-sm text-zinc-500">Add rooms and beds first.</p>
      ) : (
        <div className="space-y-4">
          {rooms.map((room) => (
            <RoomMeterCard
              key={room.roomId}
              pgId={pgId}
              room={room}
              blobUploadConfigured={blobUploadConfigured}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ApproveProofButton({ invoiceId, pgId }: { invoiceId: string; pgId: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await approveElectricityProofAction(invoiceId, pgId);
        setPending(false);
      }}
      className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
    >
      {pending ? '…' : 'Approve'}
    </button>
  );
}

function RoomMeterCard({
  pgId,
  room,
  blobUploadConfigured,
}: {
  pgId: string;
  room: RoomSummary;
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

  const latestLog = room.logs[0];
  const bill = room.latestBill;
  const [prepaidInr, setPrepaidInr] = useState('');
  const [prepaidNote, setPrepaidNote] = useState('');
  const [prepaidPending, setPrepaidPending] = useState(false);
  const [prepaidError, setPrepaidError] = useState<string | null>(null);
  const [prepaidSuccess, setPrepaidSuccess] = useState(false);

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
    fd.append('roomId', room.roomId);
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

  async function onAddPrepaid(e: React.FormEvent) {
    e.preventDefault();
    setPrepaidPending(true);
    setPrepaidError(null);
    setPrepaidSuccess(false);
    const fd = new FormData();
    fd.append('roomId', room.roomId);
    fd.append('amountInr', prepaidInr);
    fd.append('paidByNote', prepaidNote);
    const result = await addRoomElectricityPrepaidAction(pgId, fd);
    setPrepaidPending(false);
    if (!result.ok) {
      setPrepaidError(result.error ?? 'Failed');
      return;
    }
    setPrepaidSuccess(true);
    setPrepaidInr('');
    setPrepaidNote('');
  }

  return (
    <div className="rounded-xl border border-zinc-800 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-white">
          Room {room.roomNumber} <span className="text-zinc-500">· {room.floorLabel}</span>
        </h3>
        {bill?.isEstimated ? (
          <span className="rounded-full bg-amber-900/50 px-2 py-0.5 text-xs text-amber-200">
            Estimated bill (pending meter update)
          </span>
        ) : null}
      </div>

      <dl className="mt-2 grid gap-1 text-xs text-zinc-400 sm:grid-cols-2">
        <div>
          Latest reading:{' '}
          <span className="text-zinc-200">
            {latestLog ? `${latestLog.units} units (${latestLog.readingType})` : '—'}
          </span>
        </div>
        {bill ? (
          <div>
            Last bill:{' '}
            <span className="text-zinc-200">
              {bill.unitsConsumed} units · {paiseToInr(bill.totalPaise)}
              {bill.prepaidCreditAppliedPaise > 0
                ? ` (−${paiseToInr(bill.prepaidCreditAppliedPaise)} prepaid)`
                : ''}{' '}
              · {formatDate(bill.billingMonth)}
            </span>
          </div>
        ) : null}
        <div>
          Pending offline prepaid:{' '}
          <span className="font-medium text-emerald-300">
            {room.prepaidCreditPaise > 0 ? paiseToInr(room.prepaidCreditPaise) : '—'}
          </span>
        </div>
      </dl>

      {room.prepaidLedger.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[11px] text-zinc-500">
          {room.prepaidLedger.map((entry) => (
            <li key={entry.id}>
              {entry.entryKind === 'added' ? '+' : '−'}
              {paiseToInr(entry.amountPaise)}
              {entry.paidByNote ? ` · ${entry.paidByNote}` : ''}
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={onAddPrepaid} className="mt-3 rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
        <p className="text-xs font-medium text-emerald-200">
          Add offline prepaid (former tenant paid outside website)
        </p>
        <p className="mt-1 text-[11px] text-emerald-100/70">
          Applied automatically when you generate the next bill for this room.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-zinc-400">Amount (₹)</span>
            <input
              type="number"
              min={0.01}
              step="0.01"
              required
              value={prepaidInr}
              onChange={(e) => setPrepaidInr(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-zinc-400">Who paid / note</span>
            <input
              type="text"
              required
              placeholder="e.g. Rahul — paid cash before vacating"
              value={prepaidNote}
              onChange={(e) => setPrepaidNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={prepaidPending}
          className="mt-2 rounded-lg border border-emerald-700/50 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-50"
        >
          {prepaidPending ? 'Saving…' : 'Save prepaid credit'}
        </button>
        {prepaidError ? <p className="mt-2 text-xs text-rose-400">{prepaidError}</p> : null}
        {prepaidSuccess ? (
          <p className="mt-2 text-xs text-emerald-400">Prepaid credit saved for this room.</p>
        ) : null}
      </form>

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
          Generate estimated bill from historical average (no photo)
        </label>
        {!useEstimate && blobUploadConfigured ? (
          <label className="text-sm sm:col-span-2">
            <span className="text-zinc-400">Meter photo</span>
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm text-zinc-400"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            {uploading ? <span className="text-xs text-zinc-500">Uploading…</span> : null}
            {meterUrl ? <span className="text-xs text-emerald-400">Photo uploaded</span> : null}
          </label>
        ) : !useEstimate ? (
          <p className="text-xs text-amber-400 sm:col-span-2">
            Configure Vercel Blob to upload meter photos, or use estimated billing.
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e54f1a] disabled:opacity-50"
          >
            {pending ? 'Saving…' : useEstimate ? 'Create estimated bill' : 'Record reading + bill'}
          </button>
        </div>
      </form>
      {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}
      {success ? <p className="mt-2 text-sm text-emerald-400">Saved.</p> : null}
    </div>
  );
}
