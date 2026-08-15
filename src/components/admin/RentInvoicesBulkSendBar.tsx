'use client';

import { useCallback, useState } from 'react';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import { generatePaymentLinkAction } from '@/app/(admin)/admin/residents/paymentActions';
import { buildBillingWhatsAppUrl, openWhatsAppUrl } from '@/src/lib/billing/adminWhatsApp';

export type RentInvoiceSendRow = {
  id: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  rentPaise: number;
  dueDate: string;
  isOverdue?: boolean;
};

export function RentInvoicesBulkSendBar({
  rows,
  canSendLinks,
}: {
  rows: RentInvoiceSendRow[];
  canSendLinks: boolean;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkIndex, setBulkIndex] = useState(0);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const sendOne = useCallback(async (row: RentInvoiceSendRow) => {
    const fd = new FormData();
    fd.set('residentId', row.customerId);
    fd.set('pgId', row.pgId);
    fd.set('pgName', row.pgName);
    fd.set('residentName', row.customerFullName);
    fd.set('residentPhone', row.customerPhone);
    fd.set('amountPaise', String(row.rentPaise));
    fd.set('purpose', 'rent');
    fd.set('roomNumber', row.roomNumber);
    fd.set('dueDate', row.dueDate);
    if (row.isOverdue) fd.set('isOverdue', '1');

    const result = await generatePaymentLinkAction(fd);
    if (!result.ok) {
      setBulkError(result.message);
      return null;
    }

    return buildBillingWhatsAppUrl({
      kind: 'rent',
      customerName: row.customerFullName,
      phone: row.customerPhone,
      pgName: row.pgName,
      amountPaise: row.rentPaise,
      dueDate: row.dueDate,
      roomNumber: row.roomNumber,
      isOverdue: row.isOverdue,
      paymentLinkUrl: result.publicUrl,
    });
  }, []);

  if (!canSendLinks || rows.length === 0) return null;

  async function startBulkSend() {
    setBulkIndex(0);
    setBulkError(null);
    setBulkOpen(true);
    const first = rows[0];
    if (!first) return;
    const url = await sendOne(first);
    if (url) openWhatsAppUrl(url);
  }

  async function bulkNext() {
    const nextIndex = bulkIndex + 1;
    if (nextIndex >= rows.length) {
      setBulkOpen(false);
      setBulkIndex(0);
      return;
    }
    const person = rows[nextIndex];
    const url = person ? await sendOne(person) : null;
    if (url) openWhatsAppUrl(url);
    setBulkIndex(nextIndex);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
        <p className="text-sm text-emerald-100">
          {rows.length} unpaid rent bill{rows.length === 1 ? '' : 's'} — send payment links via
          WhatsApp.
        </p>
        <button
          type="button"
          onClick={() => void startBulkSend()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white"
        >
          <WhatsAppIcon className="h-4 w-4" />
          Send all ({rows.length})
        </button>
      </div>

      {bulkOpen && rows[bulkIndex] ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
            <p className="text-xs text-apg-silver">
              {bulkIndex + 1} of {rows.length}
            </p>
            <h3 className="text-lg font-semibold text-white">{rows[bulkIndex]!.customerFullName}</h3>
            {bulkError ? <p className="mt-2 text-xs text-rose-300">{bulkError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void bulkNext()}
                className="flex-1 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white"
              >
                {bulkIndex + 1 >= rows.length ? 'Finish' : 'Sent — next'}
              </button>
              <button
                type="button"
                onClick={() => setBulkOpen(false)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-apg-silver"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
