'use client';

import { useActionState, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import {
  generateInvoicesAction,
  type ActionState,
} from '@/app/(admin)/admin/rent/actions';
import { generatePaymentLinkAction } from '@/app/(admin)/admin/residents/paymentActions';
import { buildBillingWhatsAppUrl, openWhatsAppUrl } from '@/src/lib/billing/adminWhatsApp';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { isRentBillingOverviewActionable } from '@/src/lib/billing/rentBillingOverview';
import type { RentBillingOverviewRow } from '@/src/services/rentInvoices';
import type { BillingCycleOperationRow } from '@/src/services/rentInvoices';

const idle: ActionState = { status: 'idle' };

type Props = {
  billingMonth: string;
  rows: RentBillingOverviewRow[];
  canGenerateRent: boolean;
  canSendLinks: boolean;
  dueSoon?: BillingCycleOperationRow[];
  generatedPending?: BillingCycleOperationRow[];
};

export function BillingOverviewPanel({
  billingMonth,
  rows,
  canGenerateRent,
  canSendLinks,
  dueSoon = [],
  generatedPending = [],
}: Props) {
  const [query, setQuery] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkIndex, setBulkIndex] = useState(0);
  const [bulkQueue, setBulkQueue] = useState<RentBillingOverviewRow[]>([]);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const actionableRows = useMemo(
    () => rows.filter(isRentBillingOverviewActionable),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = query.replace(/\D/g, '');
    if (!q) return actionableRows;
    return actionableRows.filter(
      (r) =>
        r.customerFullName.toLowerCase().includes(q) ||
        r.customerPhone.replace(/\D/g, '').includes(digits) ||
        r.pgName.toLowerCase().includes(q) ||
        r.bedCode.toLowerCase().includes(q) ||
        r.bookingCode.toLowerCase().includes(q),
    );
  }, [query, actionableRows]);

  const pendingSend = useMemo(
    () => actionableRows.filter((r) => r.depositDuePaise > 0),
    [actionableRows],
  );

  const generatedElsewhere = useMemo(
    () => rows.filter((r) => r.invoiceStatus !== 'none' && r.depositDuePaise <= 0).length,
    [rows],
  );

  const rentTabHref = `/admin/revenue/billing?tab=rent&month=${billingMonth}`;

  const sendOne = useCallback(
    async (row: RentBillingOverviewRow) => {
      const depositPaise = row.depositDuePaise > 0 ? row.depositDuePaise : 0;
      if (depositPaise <= 0) return null;

      const fd = new FormData();
      fd.set('residentId', row.customerId);
      fd.set('pgId', row.pgId);
      fd.set('pgName', row.pgName);
      fd.set('residentName', row.customerFullName);
      fd.set('residentPhone', row.customerPhone);
      fd.set('amountPaise', String(depositPaise));
      fd.set('purpose', 'deposit');
      fd.set('roomNumber', row.roomNumber);
      if (row.dueDate) fd.set('dueDate', row.dueDate);

      const result = await generatePaymentLinkAction(fd);
      if (!result.ok) {
        setBulkError(result.message);
        return null;
      }

      return buildBillingWhatsAppUrl({
        kind: 'deposit',
        customerName: row.customerFullName,
        phone: row.customerPhone,
        pgName: row.pgName,
        amountPaise: depositPaise,
        dueDate: row.dueDate ?? billingMonth.slice(0, 7),
        roomNumber: row.roomNumber,
        paymentLinkUrl: result.publicUrl,
      });
    },
    [billingMonth],
  );

  async function startBulkSend() {
    setBulkQueue(pendingSend);
    setBulkIndex(0);
    setBulkError(null);
    setBulkOpen(true);
    const first = pendingSend[0];
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
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-white">Bills needing attention</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Residents who still need a bill created or have security deposit due. Bills already created
          are on the{' '}
          <Link href={rentTabHref} className="font-semibold text-[#FF5A1F] hover:underline">
            Rent bills
          </Link>{' '}
          tab.
        </p>
      </header>

      {dueSoon.length > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-500/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-200">Due within 24 hours</p>
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
                  {paiseToInr(r.rentPaise)} · due {formatDate(r.dueDate)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {generatedPending.length > 0 ? (
        <div className="mb-4 rounded-xl border border-white/10 bg-[#1A1F27] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">
            Created — not yet due
          </p>
          <ul className="mt-2 space-y-2">
            {generatedPending.slice(0, 6).map((r) => (
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

      {canSendLinks && pendingSend.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm text-emerald-100">
            {pendingSend.length} resident{pendingSend.length === 1 ? '' : 's'} with security deposit
            still due.
          </p>
          <button
            type="button"
            onClick={() => void startBulkSend()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white"
          >
            <WhatsAppIcon className="h-4 w-4" />
            Send deposit links ({pendingSend.length})
          </button>
        </div>
      ) : null}

      {actionableRows.length > 0 ? (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, PG, bed, booking code…"
          className="apg-admin-field mb-4 w-full rounded-lg border border-white/10 bg-[#12161D] px-3 py-2 text-sm text-white"
        />
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium text-white">Nothing needs your attention here</p>
            <p className="mt-2 text-xs text-apg-silver">
              {generatedElsewhere > 0
                ? `${generatedElsewhere} rent bill(s) for this month are on the Rent bills tab.`
                : 'No residents waiting for billing this month.'}
            </p>
            {generatedElsewhere > 0 ? (
              <Link
                href={rentTabHref}
                className="mt-4 inline-block text-sm font-semibold text-[#FF5A1F] hover:underline"
              >
                Open rent bills →
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase text-apg-silver">
                    Resident
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase text-apg-silver">
                    Move-in
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase text-apg-silver">
                    Bed
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-apg-silver">
                    Expected rent
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-apg-silver">
                    Deposit due
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase text-apg-silver">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-apg-silver">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => (
                  <OverviewRow
                    key={r.bookingId}
                    row={r}
                    billingMonth={billingMonth}
                    canGenerateRent={canGenerateRent}
                    canSendLinks={canSendLinks}
                    onSend={() => sendOne(r)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {bulkOpen && bulkQueue[bulkIndex] ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
            <p className="text-xs text-apg-silver">
              {bulkIndex + 1} of {bulkQueue.length}
            </p>
            <h3 className="text-lg font-semibold text-white">
              {bulkQueue[bulkIndex]!.customerFullName}
            </h3>
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

function OverviewRow({
  row,
  billingMonth,
  canGenerateRent,
  canSendLinks,
  onSend,
}: {
  row: RentBillingOverviewRow;
  billingMonth: string;
  canGenerateRent: boolean;
  canSendLinks: boolean;
  onSend: () => Promise<string | null>;
}) {
  const [genState, genAction, genPending] = useActionState(generateInvoicesAction, idle);
  const [sendErr, setSendErr] = useState<string | null>(null);

  return (
    <tr className="hover:bg-white/[0.03]">
      <td className="px-4 py-3">
        <Link
          href={`/admin/residents/${row.customerId}`}
          className="font-medium text-white hover:text-[#FF5A1F]"
        >
          {row.customerFullName}
        </Link>
        <p className="font-mono text-[11px] text-apg-silver">{row.customerPhone}</p>
      </td>
      <td className="px-4 py-3 text-xs text-apg-silver">{formatDate(row.checkInDate)}</td>
      <td className="px-4 py-3 text-xs text-apg-silver">
        {row.pgName}
        <br />
        R{row.roomNumber} · {row.bedCode}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-white">
        {paiseToInr(row.expectedRentPaise)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-amber-200">
        {row.depositDuePaise > 0 ? paiseToInr(row.depositDuePaise) : '—'}
      </td>
      <td className="px-4 py-3">
        {row.isDueForGeneration ? (
          <Badge tone="amber">Needs bill</Badge>
        ) : row.depositDuePaise > 0 ? (
          <Badge tone="amber">Deposit due</Badge>
        ) : (
          <Badge tone="zinc">Move-in later</Badge>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end gap-1">
          {canGenerateRent && row.isDueForGeneration ? (
            <form action={genAction}>
              <input type="hidden" name="billingMonth" value={billingMonth} />
              <input type="hidden" name="bookingIds" value={row.bookingId} />
              <button
                type="submit"
                disabled={genPending}
                className="text-xs font-semibold text-[#FF5A1F] hover:underline disabled:opacity-50"
              >
                Create bill
              </button>
            </form>
          ) : null}
          {canSendLinks && row.depositDuePaise > 0 ? (
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  setSendErr(null);
                  const url = await onSend();
                  if (url) openWhatsAppUrl(url);
                  else setSendErr('Could not send link.');
                })();
              }}
              className="inline-flex items-center gap-1 text-xs text-[#25D366] hover:underline"
            >
              <WhatsAppIcon className="h-3 w-3" />
              Send deposit link
            </button>
          ) : null}
          {genState.status === 'ok' ? (
            <span className="text-[10px] text-emerald-300">Bill created</span>
          ) : null}
          {sendErr ? <span className="text-[10px] text-rose-300">{sendErr}</span> : null}
        </div>
      </td>
    </tr>
  );
}
