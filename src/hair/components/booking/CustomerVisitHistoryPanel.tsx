'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadCustomerVisitHistoryAction } from '@/src/hair/actions/booking';
import { Button } from '@/src/hair/components/ui/button';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { CustomerVisitRow } from '@/src/hair/services/bookingContext';

type Props = {
  customerId: string;
  customerName: string;
  open: boolean;
  onClose: () => void;
};

export function CustomerVisitHistoryPanel({ customerId, customerName, open, onClose }: Props) {
  const [rows, setRows] = useState<CustomerVisitRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadCustomerVisitHistoryAction(customerId)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [open, customerId]);

  if (!open) return null;

  return (
    <div className="fyh-form-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="fyh-form-modal-panel flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--fyh-radius-lg)]"
        role="dialog"
        aria-labelledby="visit-history-title"
      >
        <div className="flex items-center justify-between border-b border-[color:var(--fyh-border)] px-4 py-3">
          <div>
            <h2 id="visit-history-title" className="fyh-modal-title">Visit history</h2>
            <p className="text-sm text-fyh-text-secondary">{customerName}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="text-center text-sm text-fyh-text-muted">Loading history…</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-fyh-text-muted">No visits yet</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li
                  key={row.appointmentId}
                  className="fyh-card !p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-fyh-text">{row.displayDate}</p>
                      <p className="text-sm text-fyh-text-secondary">{row.servicesLabel}</p>
                      <p className="text-xs text-fyh-text-muted">{row.staffName}</p>
                    </div>
                    <div className="text-right">
                      {row.amountPaise > 0 ? (
                        <p className="font-semibold text-fyh-text">
                          {formatInrFromPaise(row.amountPaise)}
                        </p>
                      ) : null}
                      <p className="text-xs text-fyh-text-muted">{row.paymentStatus}</p>
                    </div>
                  </div>
                  {row.invoiceId ? (
                    <Link
                      href={`/billing/${row.invoiceId}`}
                      className="mt-2 inline-block text-sm font-medium text-fyh-accent hover:text-fyh-accent-soft"
                    >
                      View invoice →
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
