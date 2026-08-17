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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div
        className="fyh-booking-modal flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-fyh-elevated shadow-2xl"
        role="dialog"
        aria-labelledby="visit-history-title"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 id="visit-history-title" className="text-lg font-semibold text-white">
              Visit history
            </h2>
            <p className="text-sm text-white/75">{customerName}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-center text-sm text-white/70">Loading history…</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-white/70">No visits yet</p>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li
                  key={row.appointmentId}
                  className="rounded-xl border border-white/10 bg-black/25 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{row.displayDate}</p>
                      <p className="text-sm text-white/90">{row.servicesLabel}</p>
                      <p className="text-sm text-white/70">{row.staffName}</p>
                    </div>
                    <div className="text-right">
                      {row.amountPaise > 0 ? (
                        <p className="font-semibold text-white">
                          {formatInrFromPaise(row.amountPaise)}
                        </p>
                      ) : null}
                      <p className="text-xs text-white/70">{row.paymentStatus}</p>
                    </div>
                  </div>
                  {row.invoiceId ? (
                    <Link
                      href={`/billing/${row.invoiceId}`}
                      className="mt-2 inline-block text-sm font-medium text-fyh-forest hover:underline"
                    >
                      Invoice {row.invoiceNumber ?? row.invoiceId.slice(0, 8)}
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
