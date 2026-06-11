'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PgPaymentModal } from './PgPaymentModal';
import { PgPaymentHistory } from './PgPaymentHistory';

type Category = {
  id: string;
  name: string;
  qrCodeImageUrl: string;
  upiId: string | null;
};

type Props = {
  pgId: string;
  pgName: string;
  uploadScreenshot: (formData: FormData) => Promise<string>;
};

export function PgPaymentsPanel({ pgId, pgName, uploadScreenshot }: Props) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Category | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/pg/${pgId}/payment-categories`)
      .then((r) => r.json())
      .then((data: { categories?: Category[] }) => setCategories(data.categories ?? []))
      .finally(() => setLoading(false));
  }, [open, pgId]);

  return (
    <div className="border-t border-white/5 bg-[#0B0F14]/80 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-semibold text-[#FF5A1F]"
      >
        <span>💳 Payments</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-4">
          {loading ? (
            <p className="text-sm text-apg-silver">Loading payment options…</p>
          ) : categories.length === 0 ? (
            <p className="text-sm text-apg-silver">No payment categories configured yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelected(cat)}
                  className="rounded-xl border border-white/10 bg-black/30 p-3 text-left transition hover:border-[#FF5A1F]/40"
                >
                  <p className="font-medium text-white">{cat.name}</p>
                  {cat.upiId ? (
                    <p className="mt-1 truncate text-xs text-apg-silver">{cat.upiId}</p>
                  ) : null}
                  <span className="mt-2 text-xs text-[#FF5A1F]">Pay with QR →</span>
                </button>
              ))}
            </div>
          )}

          <p className="text-xs text-apg-silver">
            Sign in as a resident of this PG to submit payment proof.{' '}
            <Link href="/login" className="text-[#FF5A1F] underline">Sign in</Link>
          </p>

          <PgPaymentHistory key={historyKey} pgId={pgId} />
        </div>
      ) : null}

      {selected ? (
        <PgPaymentModal
          pgId={pgId}
          pgName={pgName}
          category={selected}
          onClose={() => setSelected(null)}
          onSubmitted={() => setHistoryKey((k) => k + 1)}
          uploadScreenshot={uploadScreenshot}
        />
      ) : null}
    </div>
  );
}
