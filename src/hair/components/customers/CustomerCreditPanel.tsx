'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AdvancePaymentModal } from '@/src/hair/components/advance-payment/AdvancePaymentModal';
import { Button } from '@/src/hair/components/ui/button';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { formatSalonDisplayDate } from '@/src/hair/lib/formatSalonDate';
import type { CustomerCreditHistoryRow, CustomerCreditSummary } from '@/src/hair/services/customerAdvance';

type Props = {
  customerId: string;
  summary: CustomerCreditSummary;
  history: CustomerCreditHistoryRow[];
  canReceiveAdvance: boolean;
};

export function CustomerCreditPanel({
  customerId,
  summary,
  history,
  canReceiveAdvance,
}: Props) {
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <section className="fyh-glass space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="fyh-section-eyebrow">Customer credit</p>
          <h2 className="fyh-display text-lg font-semibold text-fyh-text">
            {formatInrFromPaise(summary.availablePaise)} available
          </h2>
          <p className="mt-1 text-sm text-fyh-text-muted">
            Total advance {formatInrFromPaise(summary.totalAdvancePaise)} · used{' '}
            {formatInrFromPaise(summary.consumedPaise)} · remaining{' '}
            {formatInrFromPaise(summary.availablePaise)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReceiveAdvance ? (
            <Button type="button" size="sm" variant="primary" onClick={() => setAdvanceOpen(true)}>
              Receive advance
            </Button>
          ) : null}
          <Link href="/advance-payment">
            <Button type="button" size="sm" variant="secondary">Full screen</Button>
          </Link>
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-fyh-accent"
        onClick={() => setShowHistory((v) => !v)}
      >
        {showHistory ? 'Hide history' : 'View history'}
      </Button>

      {showHistory ? (
        <div className="overflow-x-auto rounded-xl border border-[color:var(--fyh-border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium text-right">Credit</th>
                <th className="px-3 py-2 font-medium text-right">Used</th>
                <th className="px-3 py-2 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-fyh-text-muted">
                    No credit activity yet.
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id} className="border-t border-[color:var(--fyh-border)]/60">
                    <td className="px-3 py-2 whitespace-nowrap text-fyh-text-secondary">
                      {formatSalonDisplayDate(row.date.toISOString())}
                    </td>
                    <td className="px-3 py-2">
                      {row.invoiceId ? (
                        <Link
                          href={`/billing/invoices?invoice=${row.invoiceNumber ?? row.invoiceId}`}
                          className="text-fyh-accent hover:underline"
                        >
                          {row.description}
                        </Link>
                      ) : (
                        row.description
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.creditPaise > 0 ? formatInrFromPaise(row.creditPaise) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.usedPaise > 0 ? formatInrFromPaise(row.usedPaise) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatInrFromPaise(row.balanceAfterPaise)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      <AdvancePaymentModal
        open={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        canReceiveAdvance={canReceiveAdvance}
      />
    </section>
  );
}
