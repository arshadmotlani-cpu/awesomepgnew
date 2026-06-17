'use client';

import { useCallback, useState } from 'react';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import { RentInvoicesBulkSendBar, type RentInvoiceSendRow } from '@/src/components/admin/RentInvoicesBulkSendBar';
import { generatePaymentLinkAction } from '@/app/(admin)/admin/residents/paymentActions';
import { buildBillingWhatsAppUrl, openWhatsAppUrl } from '@/src/lib/billing/adminWhatsApp';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { BillingCycleOperationRow } from '@/src/services/rentInvoices';

export function BillingCycleOperationsPanel({
  dueSoon,
  generatedPending,
  canSendLinks,
}: {
  dueSoon: BillingCycleOperationRow[];
  generatedPending: BillingCycleOperationRow[];
  canSendLinks: boolean;
}) {
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [reminderIndex, setReminderIndex] = useState(0);
  const [reminderOpen, setReminderOpen] = useState(false);

  const sendRows: RentInvoiceSendRow[] = dueSoon.map((r) => ({
    id: r.invoiceId,
    customerId: r.customerId,
    customerFullName: r.customerFullName,
    customerPhone: r.customerPhone,
    pgId: r.pgId,
    pgName: r.pgName,
    roomNumber: r.roomNumber,
    rentPaise: r.rentPaise,
    dueDate: r.dueDate,
    isOverdue: r.status === 'overdue',
  }));

  const sendOneReminder = useCallback(async (row: BillingCycleOperationRow) => {
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
    if (row.status === 'overdue') fd.set('isOverdue', '1');

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
      isOverdue: row.status === 'overdue',
      paymentLinkUrl: result.publicUrl,
    });
  }, []);

  async function startReminderBulk() {
    if (dueSoon.length === 0) return;
    setReminderOpen(true);
    setReminderIndex(0);
    setBulkError(null);
    const url = await sendOneReminder(dueSoon[0]!);
    if (url) openWhatsAppUrl(url);
  }

  async function reminderNext() {
    const next = reminderIndex + 1;
    if (next >= dueSoon.length) {
      setReminderOpen(false);
      setReminderIndex(0);
      return;
    }
    setReminderIndex(next);
    const url = await sendOneReminder(dueSoon[next]!);
    if (url) openWhatsAppUrl(url);
  }

  if (dueSoon.length === 0 && generatedPending.length === 0) return null;

  return (
    <div className="mb-8 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Billing cycle operations</h2>
          <p className="mt-1 text-xs text-apg-silver">
            Invoices due within 24 hours are surfaced here. Next-cycle invoices stay visible before
            due date.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RentInvoicesBulkSendBar rows={sendRows} canSendLinks={canSendLinks} />
          {canSendLinks && dueSoon.length > 0 ? (
            <button
              type="button"
              onClick={startReminderBulk}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Send due reminders ({dueSoon.length})
            </button>
          ) : null}
        </div>
      </div>

      {bulkError ? <p className="mt-3 text-xs text-rose-300">{bulkError}</p> : null}

      {dueSoon.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-300">Due soon</p>
          <ul className="mt-2 space-y-2">
            {dueSoon.map((r) => (
              <li
                key={r.invoiceId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-xs"
              >
                <span className="text-white">
                  {r.customerFullName} · {r.pgName} · {r.invoiceNumber}
                </span>
                <span className="text-apg-silver">
                  {paiseToInr(r.rentPaise)} · due {formatDate(r.dueDate)} ({r.daysUntilDue}d)
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {generatedPending.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-300">
            Generated — not yet due
          </p>
          <ul className="mt-2 space-y-2">
            {generatedPending.slice(0, 8).map((r) => (
              <li
                key={r.invoiceId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-xs"
              >
                <span className="text-white">
                  {r.customerFullName} · {r.invoiceNumber}
                </span>
                <span className="text-apg-silver">
                  {paiseToInr(r.rentPaise)} · due {formatDate(r.dueDate)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {reminderOpen && dueSoon.length > 1 ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-apg-silver">
          <span>
            Reminder {reminderIndex + 1} / {dueSoon.length}
          </span>
          <button
            type="button"
            onClick={reminderNext}
            className="rounded border border-white/10 px-2 py-1 text-white hover:bg-white/5"
          >
            Next →
          </button>
        </div>
      ) : null}
    </div>
  );
}
