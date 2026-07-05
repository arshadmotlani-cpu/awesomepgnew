'use client';

import { useTransition } from 'react';
import { paiseToInr, formatDateTime } from '@/src/lib/format';
import type { ReferralWithdrawalRow } from '@/src/services/referralWithdrawals';

export function ReferralWithdrawalsAdminPanel({
  rows,
  approveAction,
  rejectAction,
  markPaidAction,
}: {
  rows: ReferralWithdrawalRow[];
  approveAction: (id: string) => Promise<void>;
  rejectAction: (id: string, reason: string) => Promise<void>;
  markPaidAction: (id: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
        Referral withdrawals
      </h2>
      <p className="mt-1 text-xs text-apg-silver">Operations queue — separate from deposit refunds</p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase text-apg-silver">
              <th className="py-2 pr-3">Resident</th>
              <th className="py-2 pr-3">Amount</th>
              <th className="py-2 pr-3">UPI</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Requested</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-apg-silver">
                  No withdrawal requests.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3 text-white">{r.customerName}</td>
                  <td className="py-2 pr-3 text-white">{paiseToInr(r.amountPaise)}</td>
                  <td className="py-2 pr-3 font-mono text-apg-silver">{r.upiId ?? '—'}</td>
                  <td className="py-2 pr-3 capitalize text-apg-silver">{r.status}</td>
                  <td className="py-2 pr-3 text-apg-silver">{formatDateTime(r.requestedAt)}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      {r.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => startTransition(() => approveAction(r.id))}
                            className="text-xs text-emerald-300 hover:underline"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              const reason = window.prompt('Rejection reason?') ?? '';
                              if (reason.trim()) {
                                startTransition(() => rejectAction(r.id, reason.trim()));
                              }
                            }}
                            className="text-xs text-rose-300 hover:underline"
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                      {r.status === 'approved' ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => startTransition(() => markPaidAction(r.id))}
                          className="text-xs text-apg-orange hover:underline"
                        >
                          Mark paid
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
