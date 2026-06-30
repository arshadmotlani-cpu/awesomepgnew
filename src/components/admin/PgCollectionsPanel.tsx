'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { ImageFileInput } from '@/src/components/shared/ImageFileInput';
import {
  createPaymentCategoryAction,
  togglePgPaymentsAction,
  uploadQrImageAction,
} from '@/app/(admin)/admin/pgs/payment-actions';
import { paiseToInr } from '@/src/lib/format';

type Category = {
  id: string;
  name: string;
  qrCodeImageUrl: string;
  upiId: string | null;
  isActive: boolean;
};

type QrPayment = {
  id: string;
  pgName: string;
  categoryName: string;
  customerName: string;
  amountPaise: number;
  month: string | null;
  status: string;
  paymentScreenshotUrl: string;
  createdAt: string;
};

type ElectricityProof = {
  invoiceId: string;
  invoiceNumber: string;
  roomNumber: string;
  amountPaise: number;
  paymentProofUrl: string | null;
};

type RentProof = {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  roomNumber: string;
  bedCode: string;
  billingMonth: string;
  rentPaise: number;
  paymentProofUrl: string | null;
};

const REQUIRED_CATEGORIES = ['Rent', 'Electricity'] as const;

export function PgCollectionsPanel({
  pgId,
  hasPaymentEnabled,
  electricityProofs,
  rentProofs = [],
}: {
  pgId: string;
  hasPaymentEnabled: boolean;
  electricityProofs: ElectricityProof[];
  rentProofs?: RentProof[];
}) {
  const qrUploadInputId = useId();
  const [enabled, setEnabled] = useState(hasPaymentEnabled);
  const [categories, setCategories] = useState<Category[]>([]);
  const [qrPayments, setQrPayments] = useState<QrPayment[]>([]);
  const [upiId, setUpiId] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [catRes, payRes] = await Promise.all([
      fetch(`/api/pg/${pgId}/payment-categories`),
      fetch(`/api/owner/payments?pgId=${pgId}`),
    ]);
    const catData = (await catRes.json()) as { categories?: Category[] };
    const payData = (await payRes.json()) as { payments?: QrPayment[] };
    setCategories(catData.categories ?? []);
    setQrPayments(payData.payments ?? []);
  }, [pgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasRent = categories.some((c) => /rent/i.test(c.name) && c.isActive);
  const hasElectricity = categories.some((c) => /electricity/i.test(c.name) && c.isActive);
  const setupComplete = enabled && hasRent && hasElectricity;

  async function onToggle() {
    setBusy(true);
    await togglePgPaymentsAction(pgId, !enabled);
    setEnabled(!enabled);
    setBusy(false);
  }

  async function onUploadQr(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const url = await uploadQrImageAction(fd);
      setQrUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onAddPresetCategory(categoryName: string) {
    if (!qrUrl) {
      setError('Upload a QR image first.');
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.set('name', categoryName);
    fd.set('qrCodeImageUrl', qrUrl);
    if (upiId) fd.set('upiId', upiId);
    fd.set('isActive', 'on');
    const result = await createPaymentCategoryAction(pgId, fd);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed');
      return;
    }
    setQrUrl('');
    setUpiId('');
    await load();
  }

  const pendingQr = qrPayments.filter((p) => p.status === 'pending');
  const pendingCount = pendingQr.length + electricityProofs.length + rentProofs.length;

  return (
    <section
      id="pg-section-collections"
      className="scroll-mt-6 space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"
    >
      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-white">Collections — rent & electricity</h2>
        <p className="text-sm text-zinc-400">
          Tenants pay on <strong className="text-zinc-300">/pgs</strong> by scanning your QR (rent)
          or from their resident dashboard (electricity invoice + screenshot). Approve payment
          screenshots in{' '}
          <Link href="/admin/operations?filter=payment_proof" className="text-[#FF5A1F] hover:underline">
            Operations → Payment Reviews
          </Link>
          .
        </p>
      </header>

      <ol className="grid gap-2 text-sm sm:grid-cols-3">
        <SetupStep
          done={enabled}
          label="Enable payments on /pgs"
          hint="Shows QR pay section on listing cards"
        />
        <SetupStep
          done={hasRent}
          label="Rent QR category"
          hint="For monthly rent UPI payments"
        />
        <SetupStep
          done={hasElectricity}
          label="Electricity / daily / reservation QR"
          hint="Optional backup; invoices also accept proof"
        />
      </ol>

      {!setupComplete ? (
        <p className="text-xs text-amber-200">
          Complete the steps above so tenants can pay rent and electricity without Razorpay checkout.
        </p>
      ) : (
        <p className="text-xs text-emerald-400">Collections ready — tenants can submit payments.</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 p-4">
        <div>
          <p className="text-sm font-medium text-white">Payments on /pgs</p>
          <p className="text-xs text-zinc-500">
            {enabled ? 'Enabled — QR section visible on this PG card' : 'Disabled — hidden from /pgs'}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onToggle()}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-300'
          }`}
        >
          {enabled ? 'Enabled' : 'Enable payments'}
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 p-4">
        <h3 className="text-sm font-medium text-zinc-300">QR categories</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Upload one QR per category. Rent/deposit/booking uses <strong>shiba.motlani@oksbi</strong>;
          electricity, daily stays & reservations use <strong>9049163636@pthdfc</strong>.
        </p>

        {categories.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {categories.map((cat) => (
              <li
                key={cat.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cat.qrCodeImageUrl}
                  alt=""
                  className="h-16 w-16 rounded bg-white object-contain"
                />
                <div>
                  <p className="font-medium text-white">{cat.name}</p>
                  {cat.upiId ? <p className="text-xs text-zinc-400">{cat.upiId}</p> : null}
                </div>
                <span
                  className={`text-xs ${cat.isActive ? 'text-emerald-400' : 'text-zinc-500'}`}
                >
                  {cat.isActive ? 'Active' : 'Inactive'}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
          <label className="block text-sm">
            <span className="text-zinc-400">UPI ID (optional)</span>
            <input
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="name@upi"
              className="mt-1 w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-400">QR image (upload once, then add categories)</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <label
                htmlFor={qrUploadInputId}
                className="cursor-pointer rounded-lg border border-dashed border-zinc-600 px-3 py-2 text-sm text-zinc-400"
              >
                <ImageFileInput
                  id={qrUploadInputId}
                  inputClassName="hidden"
                  disabled={uploading}
                  onFileSelected={(file) => void onUploadQr(file ?? null)}
                />
                {uploading ? 'Uploading…' : 'Upload QR'}
              </label>
              {qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrUrl} alt="" className="h-16 w-16 rounded bg-white object-contain" />
              ) : null}
            </div>
          </label>
          <div className="flex flex-wrap gap-2">
            {REQUIRED_CATEGORIES.map((name) => {
              const exists = categories.some((c) => c.name === name);
              return (
                <button
                  key={name}
                  type="button"
                  disabled={busy || exists || !qrUrl}
                  onClick={() => void onAddPresetCategory(name)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                >
                  {exists ? `✓ ${name}` : `+ Add ${name} QR`}
                </button>
              );
            })}
          </div>
        </div>
        {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}
      </div>

      <div>
        <h3 className="text-sm font-medium text-zinc-300">
          Awaiting your approval
          {pendingCount > 0 ? (
            <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">
              {pendingCount}
            </span>
          ) : null}
        </h3>
        {pendingCount === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            No pending rent or electricity payments. Submissions appear when tenants pay via QR or
            upload invoice screenshots.
          </p>
        ) : (
          <div className="mt-3 rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 text-sm">
            <p className="text-zinc-200">
              {pendingCount} payment proof{pendingCount === 1 ? '' : 's'} awaiting review.
            </p>
            <Link
              href="/admin/operations?filter=payment_proof"
              className="mt-3 inline-flex rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
            >
              Review in Payment Reviews →
            </Link>
          </div>
        )}
      </div>

      {qrPayments.filter((p) => p.status !== 'pending').length > 0 ? (
        <details className="text-sm text-zinc-500">
          <summary className="cursor-pointer text-zinc-400">Past QR submissions</summary>
          <ul className="mt-2 space-y-1">
            {qrPayments
              .filter((p) => p.status !== 'pending')
              .map((p) => (
                <li key={p.id}>
                  {p.customerName} — {p.categoryName} — {paiseToInr(p.amountPaise)} — {p.status}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function SetupStep({
  done,
  label,
  hint,
}: {
  done: boolean;
  label: string;
  hint: string;
}) {
  return (
    <li
      className={`rounded-lg border p-3 ${
        done ? 'border-emerald-800/50 bg-emerald-950/20' : 'border-zinc-800 bg-zinc-950/40'
      }`}
    >
      <p className={`text-sm font-medium ${done ? 'text-emerald-300' : 'text-zinc-300'}`}>
        {done ? '✓' : '○'} {label}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>
    </li>
  );
}
