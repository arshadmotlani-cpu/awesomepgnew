'use client';

import { useCallback, useEffect, useState } from 'react';
import { paiseToInr } from '@/src/lib/format';

type Record = {
  id: string;
  categoryName: string;
  amountPaise: number;
  month: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

const STATUS_STYLES = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

export function PgPaymentHistory({ pgId }: { pgId: string }) {
  const [records, setRecords] = useState<Record[]>([]);
  const [status, setStatus] = useState('');
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ pgId });
    if (status) params.set('status', status);
    if (month) params.set('month', month);
    const res = await fetch(`/api/payment-record?${params}`);
    const data = (await res.json()) as { ok: boolean; records?: Record[] };
    setRecords(data.records ?? []);
    setLoading(false);
  }, [pgId, status, month]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <h3 className="text-sm font-semibold text-white">Your payments</h3>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
        />
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-apg-silver">Loading…</p>
      ) : records.length === 0 ? (
        <p className="mt-3 text-sm text-apg-silver">No payments yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {records.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium text-white">{r.categoryName}</span>
                {r.month ? <span className="ml-2 text-apg-silver">{r.month}</span> : null}
                <p className="text-xs text-apg-silver">{paiseToInr(r.amountPaise)}</p>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}
              >
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
