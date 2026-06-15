'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import { generatePaymentLinkAction } from '@/app/(admin)/admin/residents/paymentActions';
import { buildBillingWhatsAppUrl, openWhatsAppUrl } from '@/src/lib/billing/adminWhatsApp';
import { formatDate, paiseToInr } from '@/src/lib/format';

export type ElectricityInvoiceSendRow = {
  id: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  amountPaise: number;
  dueDate: string;
  isOverdue?: boolean;
};

type Props = {
  rows: ElectricityInvoiceSendRow[];
  canSendLinks: boolean;
  billingMonth?: string;
};

export function ElectricityBulkSendPanel({ rows, canSendLinks, billingMonth }: Props) {
  const [query, setQuery] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkIndex, setBulkIndex] = useState(0);
  const [bulkQueue, setBulkQueue] = useState<ElectricityInvoiceSendRow[]>([]);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = query.replace(/\D/g, '');
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.customerFullName.toLowerCase().includes(q) ||
        r.customerPhone.replace(/\D/g, '').includes(digits) ||
        r.pgName.toLowerCase().includes(q) ||
        r.roomNumber.toLowerCase().includes(q),
    );
  }, [query, rows]);

  const sendOne = useCallback(async (row: ElectricityInvoiceSendRow) => {
    if (row.amountPaise <= 0) return null;

    const fd = new FormData();
    fd.set('residentId', row.customerId);
    fd.set('pgId', row.pgId);
    fd.set('pgName', row.pgName);
    fd.set('residentName', row.customerFullName);
    fd.set('residentPhone', row.customerPhone);
    fd.set('amountPaise', String(row.amountPaise));
    fd.set('purpose', 'electricity');
    fd.set('roomNumber', row.roomNumber);
    fd.set('dueDate', row.dueDate);
    if (row.isOverdue) fd.set('isOverdue', '1');

    const result = await generatePaymentLinkAction(fd);
    if (!result.ok) {
      setBulkError(result.message);
      return null;
    }

    return buildBillingWhatsAppUrl({
      kind: 'electricity',
      customerName: row.customerFullName,
      phone: row.customerPhone,
      pgName: row.pgName,
      amountPaise: row.amountPaise,
      dueDate: row.dueDate,
      roomNumber: row.roomNumber,
      isOverdue: row.isOverdue,
      paymentLinkUrl: result.publicUrl,
    });
  }, []);

  async function startBulkSend() {
    setBulkQueue(rows);
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
    if (nextIndex >= bulkQueue.length) {
      setBulkOpen(false);
      setBulkIndex(0);
      return;
    }
    const person = bulkQueue[nextIndex];
    const url = person ? await sendOne(person) : null;
    if (url) openWhatsAppUrl(url);
    setBulkIndex(nextIndex);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#1A1F27] p-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Electricity invoices</h2>
          <p className="mt-1 text-xs text-apg-silver">
            {rows.length} pending invoice{rows.length === 1 ? '' : 's'} from room meter readings.
            Create bills at{' '}
            <Link href={`/admin/electricity/new${billingMonth ? `?month=${billingMonth.slice(0, 7)}` : ''}`} className="text-[#FF5A1F] hover:underline">
              New electricity bill
            </Link>{' '}
            or from PG → Rooms.
          </p>
        </div>
        {canSendLinks && rows.length > 0 ? (
          <button
            type="button"
            onClick={() => void startBulkSend()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white"
          >
            <WhatsAppIcon className="h-4 w-4" />
            Send all ({rows.length})
          </button>
        ) : null}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, phone, PG, room…"
        className="apg-admin-field w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
      />

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03]">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-apg-silver">Resident</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-apg-silver">PG · room</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-apg-silver">Amount</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase text-apg-silver">Due</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-apg-silver">Send</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((r) => (
                <ElectricityRow key={r.id} row={r} canSendLinks={canSendLinks} onSend={() => sendOne(r)} />
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-apg-silver">No electricity invoices match.</p>
        ) : null}
      </div>

      {bulkOpen && bulkQueue[bulkIndex] ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
            <p className="text-xs text-apg-silver">
              {bulkIndex + 1} of {bulkQueue.length}
            </p>
            <h3 className="text-lg font-semibold text-white">{bulkQueue[bulkIndex]!.customerFullName}</h3>
            {bulkError ? <p className="mt-2 text-xs text-rose-300">{bulkError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void bulkNext()}
                className="flex-1 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white"
              >
                {bulkIndex + 1 >= bulkQueue.length ? 'Finish' : 'Sent — next'}
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
    </section>
  );
}

function ElectricityRow({
  row,
  canSendLinks,
  onSend,
}: {
  row: ElectricityInvoiceSendRow;
  canSendLinks: boolean;
  onSend: () => Promise<string | null>;
}) {
  const [err, setErr] = useState<string | null>(null);

  return (
    <tr className="hover:bg-white/[0.03]">
      <td className="px-4 py-3">
        <p className="font-medium text-white">{row.customerFullName}</p>
        <p className="font-mono text-[11px] text-apg-silver">{row.customerPhone}</p>
      </td>
      <td className="px-4 py-3 text-xs text-apg-silver">
        {row.pgName} · R{row.roomNumber}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-white">{paiseToInr(row.amountPaise)}</td>
      <td className="px-4 py-3 text-xs text-apg-silver">{formatDate(row.dueDate)}</td>
      <td className="px-4 py-3 text-right">
        {canSendLinks ? (
          <button
            type="button"
            onClick={() => {
              void (async () => {
                setErr(null);
                const url = await onSend();
                if (url) openWhatsAppUrl(url);
                else setErr('Could not send.');
              })();
            }}
            className="inline-flex items-center gap-1 text-xs text-[#25D366] hover:underline"
          >
            <WhatsAppIcon className="h-3 w-3" />
            WhatsApp
          </button>
        ) : (
          <span className="text-[10px] text-apg-silver">—</span>
        )}
        {err ? <p className="text-[10px] text-rose-300">{err}</p> : null}
      </td>
    </tr>
  );
}
