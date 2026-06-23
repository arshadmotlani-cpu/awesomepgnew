'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { ImageFileInput, ImageFileInputInline } from '@/src/components/shared/ImageFileInput';
import {
  createPaymentCategoryAction,
  togglePgPaymentsAction,
  updatePaymentCategoryAction,
  uploadQrImageAction,
} from '@/app/(admin)/admin/pgs/payment-actions';
import { PaymentScreenshotPreview } from '@/src/components/admin/PaymentScreenshotPreview';
import { adminPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { paiseToInr } from '@/src/lib/format';

type Category = {
  id: string;
  name: string;
  qrCodeImageUrl: string;
  upiId: string | null;
  isActive: boolean;
};

type Payment = {
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

const PRESET_NAMES = ['Rent, Deposit & Booking', 'Electricity, Daily & Reservation', 'Maintenance', 'Custom'];

export function PgPaymentsAdminPanel({
  pgId,
  hasPaymentEnabled,
}: {
  pgId: string;
  hasPaymentEnabled: boolean;
}) {
  const qrUploadInputId = useId();
  const [enabled, setEnabled] = useState(hasPaymentEnabled);
  const [categories, setCategories] = useState<Category[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [name, setName] = useState('Rent');
  const [customName, setCustomName] = useState('');
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
    const payData = (await payRes.json()) as { payments?: Payment[] };
    setCategories(catData.categories ?? []);
    setPayments(payData.payments ?? []);
  }, [pgId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function onCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    const finalName = name === 'Custom' ? customName.trim() : name;
    if (!finalName || !qrUrl) {
      setError('Name and QR image are required.');
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.set('name', finalName);
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

  async function onReview(id: string, status: 'approved' | 'rejected') {
    await fetch(`/api/payment-record/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function onUpdateCategory(cat: Category, newQrUrl: string) {
    const fd = new FormData();
    fd.set('name', cat.name);
    fd.set('qrCodeImageUrl', newQrUrl);
    if (cat.upiId) fd.set('upiId', cat.upiId);
    if (cat.isActive) fd.set('isActive', 'on');
    await updatePaymentCategoryAction(pgId, cat.id, fd);
    await load();
  }

  return (
    <section className="mt-8 space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Payments management</h2>
          <p className="text-sm text-zinc-400">QR-based UPI payments per category.</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onToggle()}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            enabled
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-zinc-800 text-zinc-300'
          }`}
        >
          {enabled ? 'Payments enabled' : 'Payments disabled'}
        </button>
      </div>

      <form onSubmit={onCreateCategory} className="grid gap-3 rounded-xl border border-zinc-800 p-4 sm:grid-cols-2">
        <h3 className="sm:col-span-2 text-sm font-medium text-zinc-300">Add payment category</h3>
        <label className="text-sm">
          <span className="text-zinc-400">Category</span>
          <select
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          >
            {PRESET_NAMES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        {name === 'Custom' ? (
          <label className="text-sm">
            <span className="text-zinc-400">Custom name</span>
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            />
          </label>
        ) : null}
        <label className="text-sm">
          <span className="text-zinc-400">UPI ID (optional)</span>
          <input
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder="name@upi"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-zinc-400">QR code image *</span>
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
              {uploading ? 'Uploading…' : 'Upload QR image'}
            </label>
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrUrl} alt="QR preview" className="h-20 w-20 rounded object-contain bg-white" />
            ) : null}
          </div>
        </label>
        <button
          type="submit"
          disabled={busy || uploading}
          className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white sm:col-span-2"
        >
          Add category
        </button>
        {error ? <p className="sm:col-span-2 text-sm text-rose-400">{error}</p> : null}
      </form>

      <div>
        <h3 className="mb-2 text-sm font-medium text-zinc-300">Categories</h3>
        {categories.length === 0 ? (
          <p className="text-sm text-zinc-500">No categories yet.</p>
        ) : (
          <ul className="space-y-3">
            {categories.map((cat) => (
              <li key={cat.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-800 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cat.qrCodeImageUrl} alt="" className="h-24 w-24 rounded bg-white object-contain" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">{cat.name}</p>
                  {cat.upiId ? <p className="text-xs text-zinc-400">{cat.upiId}</p> : null}
                  <label className="mt-2 block text-xs text-zinc-500">
                    Replace QR
                    <ImageFileInputInline
                      className="mt-1 block text-xs"
                      onFileSelected={async (file) => {
                        if (!file) return;
                        const fd = new FormData();
                        fd.append('file', file);
                        const url = await uploadQrImageAction(fd);
                        await onUpdateCategory(cat, url);
                      }}
                    />
                  </label>
                </div>
                <span className={`text-xs ${cat.isActive ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {cat.isActive ? 'Active' : 'Inactive'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-zinc-300">Incoming payments</h3>
        {payments.length === 0 ? (
          <p className="text-sm text-zinc-500">No payment submissions yet.</p>
        ) : (
          <ul className="space-y-2">
            {payments.map((p) => (
              <li key={p.id} className="rounded-xl border border-zinc-800 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-white">
                      {p.customerName} — {p.categoryName}
                    </p>
                    <p className="text-zinc-400">
                      {paiseToInr(p.amountPaise)}
                      {p.month ? ` · ${p.month}` : ''}
                    </p>
                    <PaymentScreenshotPreview
                      url={p.paymentScreenshotUrl}
                      viewHref={adminPaymentProofViewUrl('qr', p.id)}
                      alt={`${p.customerName} payment screenshot`}
                      className="h-24 w-24 rounded-lg border border-zinc-700 object-contain bg-black/40"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase text-zinc-400">{p.status}</span>
                    {p.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void onReview(p.id, 'approved')}
                          className="rounded bg-emerald-600 px-2 py-1 text-xs text-white"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void onReview(p.id, 'rejected')}
                          className="rounded bg-rose-600 px-2 py-1 text-xs text-white"
                        >
                          Reject
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
