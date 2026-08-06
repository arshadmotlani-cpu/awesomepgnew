'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import {
  addVendorNoteAction,
  allocateVendorPaymentAction,
  getPurchaseReturnContextAction,
  recordPurchaseReturnAction,
  recordVendorPaymentAction,
  reverseVendorPaymentAction,
  type VendorLedgerActionState,
} from '@/src/hair/actions/vendorLedger';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhVendor } from '@/src/hair/db/schema';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import {
  FYH_VENDOR_PAYMENT_METHOD_LABELS,
  FYH_VENDOR_PAYMENT_METHODS,
} from '@/src/hair/lib/vendorPaymentMethods';
import { vendorFilePreviewHref } from '@/src/hair/lib/vendorFileLinks';
import { vendorStatementPdfHref } from '@/src/hair/lib/vendorStatementLinks';
import type {
  VendorLedgerInvoiceRow,
  VendorLedgerPaymentRow,
} from '@/src/hair/services/purchaseBrain';
import type {
  VendorDashboard,
  VendorStatement,
  VendorTimelineEvent,
} from '@/src/hair/services/vendorBrain';

const initialState: VendorLedgerActionState = {};
const fieldClass =
  'fyh-input w-full text-[0.8125rem] outline-none focus:border-fyh-accent/50';

function statusClass(status: string): string {
  if (status === 'paid') return 'text-fyh-success';
  if (status === 'partial') return 'text-fyh-warning';
  return 'text-fyh-text-muted';
}

type LedgerProps = {
  vendor: FyhVendor;
  outstandingPaise: number;
  unallocatedAdvancePaise: number;
  invoices: VendorLedgerInvoiceRow[];
  payments: VendorLedgerPaymentRow[];
  dashboard: VendorDashboard;
  timeline: VendorTimelineEvent[];
  statement: VendorStatement | null;
  statementPeriod: { from: string; to: string };
};

export function VendorLedgerView({
  vendor,
  outstandingPaise,
  unallocatedAdvancePaise,
  invoices,
  payments,
  dashboard,
  timeline,
  statement,
  statementPeriod,
}: LedgerProps) {
  const openInvoices = invoices.filter((inv) => inv.balancePaise > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">Vendor ledger</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">{vendor.name}</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Invoice-level payables — outstanding is always the sum of open balances
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/vendors/${vendor.id}/edit`}>
            <Button type="button" variant="secondary">
              <Pencil className="mr-2 h-4 w-4" />
              Edit vendor
            </Button>
          </Link>
          <Link href="/purchases/new">
            <Button type="button">Record purchase</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard label="Outstanding" value={formatInrFromPaise(dashboard.outstandingPaise)} accent="warning" />
        <DashboardCard label="Advance balance" value={formatInrFromPaise(dashboard.advanceBalancePaise)} accent="accent" />
        <DashboardCard label="Total purchases" value={formatInrFromPaise(dashboard.totalPurchasesPaise)} />
        <DashboardCard label="Total payments" value={formatInrFromPaise(dashboard.totalPaymentsPaise)} />
        <DashboardCard label="Total returns" value={formatInrFromPaise(dashboard.totalReturnsPaise)} />
        <DashboardCard
          label="Last purchase"
          value={
            dashboard.lastPurchase
              ? `${dashboard.lastPurchase.purchaseNumber} (${dashboard.lastPurchase.purchaseDate})`
              : '—'
          }
          small
        />
        <DashboardCard
          label="Avg payment delay"
          value={
            dashboard.avgPaymentDelayDays != null
              ? `${dashboard.avgPaymentDelayDays} days`
              : '—'
          }
        />
        <DashboardCard label="Open invoices" value={String(invoices.filter((i) => i.balancePaise > 0).length)} />
      </div>

      <VendorStatementSection
        vendorId={vendor.id}
        statement={statement}
        initialPeriod={statementPeriod}
      />

      <VendorActivityTimeline vendorId={vendor.id} events={timeline} />

      <VendorPaymentForm vendorId={vendor.id} openInvoices={openInvoices} />

      {unallocatedAdvancePaise > 0 ? (
        <AdvanceAllocationPanel
          vendorId={vendor.id}
          payments={payments.filter(
            (p) => p.payment.status === 'active' && p.unallocatedPaise > 0,
          )}
          openInvoices={openInvoices}
        />
      ) : null}

      <section className="space-y-3">
        <h2 className="fyh-display text-lg font-semibold">Invoices</h2>
        {invoices.length === 0 ? (
          <div className="fyh-glass px-6 py-12 text-center text-sm text-fyh-text-muted">
            No purchase invoices yet. Record a purchase to open a payable.
          </div>
        ) : (
          <div className="fyh-glass overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Purchase date</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--fyh-border)]">
                {invoices.map((inv) => (
                  <tr key={inv.payableId} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/purchases/${inv.purchaseId}`}
                        className="font-medium hover:text-fyh-accent"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-fyh-text-muted">
                      {inv.purchaseDate}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatInrFromPaise(inv.amountPaise)}</td>
                    <td className="px-4 py-3 tabular-nums text-fyh-success">
                      {formatInrFromPaise(inv.paidPaise)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-fyh-warning">
                      {formatInrFromPaise(inv.balancePaise)}
                    </td>
                    <td className={`px-4 py-3 capitalize ${statusClass(inv.status)}`}>
                      {inv.status}
                    </td>
                    <td className="px-4 py-3">
                      {inv.balancePaise > 0 ? (
                        <ReturnInvoiceButton vendorId={vendor.id} purchaseId={inv.purchaseId} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="fyh-display text-lg font-semibold">Payments</h2>
        {payments.length === 0 ? (
          <div className="fyh-glass px-6 py-12 text-center text-sm text-fyh-text-muted">
            No vendor payments recorded yet.
          </div>
        ) : (
          <div className="fyh-glass overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Payment #</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Allocated</th>
                  <th>Unallocated</th>
                  <th>Reference</th>
                  <th>Entered by</th>
                  <th>Notes</th>
                  <th>Attachment</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--fyh-border)]">
                {payments.map(({ payment, allocatedPaise, unallocatedPaise }) => (
                  <tr
                    key={payment.id}
                    className={`hover:bg-white/[0.03] ${payment.status === 'reversed' ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium">
                      {payment.paymentNumber}
                      {payment.status === 'reversed' ? (
                        <span className="ml-2 text-xs text-fyh-danger">Reversed</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-fyh-text-muted">
                      {payment.paymentDate}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {FYH_VENDOR_PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatInrFromPaise(payment.amountPaise)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-fyh-success">
                      {formatInrFromPaise(allocatedPaise)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-fyh-accent">
                      {unallocatedPaise > 0 ? formatInrFromPaise(unallocatedPaise) : '—'}
                    </td>
                    <td className="px-4 py-3 text-fyh-text-muted">{payment.reference || '—'}</td>
                    <td className="px-4 py-3 text-fyh-text-muted">{payment.staffName}</td>
                    <td className="px-4 py-3 text-fyh-text-muted max-w-[8rem] truncate">
                      {payment.notes || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {payment.attachmentUrl ? (
                        <a
                          href={vendorFilePreviewHref(payment.attachmentUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-fyh-accent hover:underline"
                        >
                          View
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {payment.status === 'active' ? (
                        <ReversePaymentButton vendorId={vendor.id} paymentId={payment.id} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function DashboardCard({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: string;
  accent?: 'warning' | 'accent';
  small?: boolean;
}) {
  const valueClass =
    accent === 'warning'
      ? 'text-fyh-warning'
      : accent === 'accent'
        ? 'text-fyh-accent'
        : 'text-fyh-text';
  return (
    <div className="fyh-glass p-4">
      <p className="fyh-label">{label}</p>
      <p
        className={`fyh-display mt-1 font-semibold ${small ? 'text-sm' : 'text-xl'} ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}

function VendorStatementSection({
  vendorId,
  statement,
  initialPeriod,
}: {
  vendorId: string;
  statement: VendorStatement | null;
  initialPeriod: { from: string; to: string };
}) {
  const [from, setFrom] = useState(initialPeriod.from);
  const [to, setTo] = useState(initialPeriod.to);

  return (
    <section className="fyh-glass space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="fyh-display text-lg font-semibold">Vendor statement</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="fyh-label" htmlFor="stmtFrom">
              From
            </label>
            <Input
              id="stmtFrom"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="fyh-label" htmlFor="stmtTo">
              To
            </label>
            <Input id="stmtTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <a href={vendorStatementPdfHref(vendorId, from, to)}>
            <Button type="button">Download PDF</Button>
          </a>
        </div>
      </div>

      {statement ? (
        <>
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-fyh-text-muted">Opening</p>
              <p className="font-medium tabular-nums">
                {formatInrFromPaise(statement.openingBalancePaise)}
              </p>
            </div>
            <div>
              <p className="text-fyh-text-muted">Purchases</p>
              <p className="font-medium tabular-nums">
                {formatInrFromPaise(statement.periodTotals.purchasesPaise)}
              </p>
            </div>
            <div>
              <p className="text-fyh-text-muted">Payments</p>
              <p className="font-medium tabular-nums">
                {formatInrFromPaise(statement.periodTotals.paymentsPaise)}
              </p>
            </div>
            <div>
              <p className="text-fyh-text-muted">Closing</p>
              <p className="font-medium tabular-nums text-fyh-warning">
                {formatInrFromPaise(statement.closingBalancePaise)}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--fyh-border)]">
                {statement.lines.map((line, idx) => (
                  <tr key={`${line.date}-${line.type}-${idx}`}>
                    <td className="px-3 py-2 tabular-nums">{line.date}</td>
                    <td className="px-3 py-2 capitalize">{line.type}</td>
                    <td className="px-3 py-2">{line.reference}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {line.debitPaise > 0 ? formatInrFromPaise(line.debitPaise) : '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {line.creditPaise > 0 ? formatInrFromPaise(line.creditPaise) : '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums font-medium">
                      {formatInrFromPaise(line.balancePaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}

function VendorActivityTimeline({
  vendorId,
  events,
}: {
  vendorId: string;
  events: VendorTimelineEvent[];
}) {
  const [state, formAction, pending] = useActionState(addVendorNoteAction, initialState);

  return (
    <section className="space-y-3">
      <h2 className="fyh-display text-lg font-semibold">Activity timeline</h2>
      <form action={formAction} className="fyh-glass flex flex-wrap gap-2 p-4">
        <input type="hidden" name="vendorId" value={vendorId} />
        <Input name="note" placeholder="Add a note…" className="min-w-[16rem] flex-1" required />
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Add note'}
        </Button>
        {state.error ? <p className="w-full text-sm text-fyh-danger">{state.error}</p> : null}
        {state.success ? <p className="w-full text-sm text-fyh-success">{state.success}</p> : null}
      </form>
      {events.length === 0 ? (
        <div className="fyh-glass px-6 py-8 text-center text-sm text-fyh-text-muted">
          No activity yet.
        </div>
      ) : (
        <div className="fyh-glass divide-y divide-[color:var(--fyh-border)]">
          {events.map((evt) => (
            <div key={evt.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{evt.title}</p>
                {evt.subtitle ? (
                  <p className="text-fyh-text-muted">{evt.subtitle}</p>
                ) : null}
                <p className="text-xs text-fyh-text-muted">
                  {evt.occurredAt.toISOString().slice(0, 16).replace('T', ' ')}
                  {evt.staffName ? ` · ${evt.staffName}` : ''}
                </p>
              </div>
              <div className="text-right">
                {evt.amountPaise != null ? (
                  <p className="tabular-nums font-medium">{formatInrFromPaise(evt.amountPaise)}</p>
                ) : null}
                {evt.href ? (
                  <Link href={evt.href} className="text-fyh-accent hover:underline">
                    View
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ReversePaymentButton({
  vendorId,
  paymentId,
}: {
  vendorId: string;
  paymentId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(reverseVendorPaymentAction, initialState);

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Reverse
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <Input name="reason" placeholder="Reason" required className="max-w-[10rem]" />
      <div className="flex gap-1">
        <Button type="submit" size="sm" disabled={pending}>
          Confirm
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {state.error ? <p className="text-xs text-fyh-danger">{state.error}</p> : null}
    </form>
  );
}

function VendorPaymentForm({
  vendorId,
  openInvoices,
}: {
  vendorId: string;
  openInvoices: VendorLedgerInvoiceRow[];
}) {
  const [state, formAction, pending] = useActionState(recordVendorPaymentAction, initialState);
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  const allocationsJson = useMemo(() => {
    const rows = openInvoices
      .map((inv) => {
        const rupees = Number(allocations[inv.payableId] ?? 0);
        if (!Number.isFinite(rupees) || rupees <= 0) return null;
        return { payableId: inv.payableId, amountPaise: Math.round(rupees * 100) };
      })
      .filter(Boolean);
    return JSON.stringify(rows);
  }, [allocations, openInvoices]);

  return (
    <section className="fyh-glass space-y-4 p-5">
      <h2 className="fyh-display text-lg font-semibold">Record payment</h2>
      <p className="text-sm text-fyh-text-muted">
        Leave invoice allocations empty to record an advance. One payment can settle multiple
        invoices.
      </p>
      <form action={formAction} encType="multipart/form-data" className="space-y-4">
        <input type="hidden" name="vendorId" value={vendorId} />
        <input type="hidden" name="allocationsJson" value={allocationsJson} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="paymentDate">
              Payment date *
            </label>
            <Input
              id="paymentDate"
              name="paymentDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="amountRupees">
              Amount (₹) *
            </label>
            <Input id="amountRupees" name="amountRupees" type="number" min="0" step="0.01" required />
          </div>
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="paymentMethod">
              Method *
            </label>
            <select id="paymentMethod" name="paymentMethod" className={fieldClass} defaultValue="cash">
              {FYH_VENDOR_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {FYH_VENDOR_PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="fyh-label" htmlFor="reference">
              Reference
            </label>
            <Input id="reference" name="reference" placeholder="UPI ref / cheque #" />
          </div>
        </div>

        {openInvoices.length > 0 ? (
          <div className="space-y-2">
            <p className="fyh-label">Allocate to open invoices (optional)</p>
            <div className="divide-y divide-[color:var(--fyh-border)] rounded border border-[color:var(--fyh-border)]">
              {openInvoices.map((inv) => (
                <div
                  key={inv.payableId}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{inv.invoiceNumber}</span>
                    <span className="ml-2 text-fyh-text-muted">
                      balance {formatInrFromPaise(inv.balancePaise)}
                    </span>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="₹ allocate"
                    className="max-w-[8rem]"
                    value={allocations[inv.payableId] ?? ''}
                    onChange={(e) =>
                      setAllocations((prev) => ({ ...prev, [inv.payableId]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="fyh-label" htmlFor="notes">
            Notes
          </label>
          <Input id="notes" name="notes" />
        </div>

        <div className="space-y-2">
          <label className="fyh-label" htmlFor="attachment">
            Attachment (optional)
          </label>
          <Input id="attachment" name="attachment" type="file" accept="application/pdf,image/*" />
        </div>

        {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-fyh-success">{state.success}</p> : null}

        <Button type="submit" disabled={pending}>
          {pending ? 'Recording…' : 'Record payment'}
        </Button>
      </form>
    </section>
  );
}

function AdvanceAllocationPanel({
  vendorId,
  payments,
  openInvoices,
}: {
  vendorId: string;
  payments: VendorLedgerPaymentRow[];
  openInvoices: VendorLedgerInvoiceRow[];
}) {
  const [paymentId, setPaymentId] = useState(payments[0]?.payment.id ?? '');
  const [state, formAction, pending] = useActionState(allocateVendorPaymentAction, initialState);
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  const selected = payments.find((p) => p.payment.id === paymentId);

  const allocationsJson = useMemo(() => {
    const rows = openInvoices
      .map((inv) => {
        const rupees = Number(allocations[inv.payableId] ?? 0);
        if (!Number.isFinite(rupees) || rupees <= 0) return null;
        return { payableId: inv.payableId, amountPaise: Math.round(rupees * 100) };
      })
      .filter(Boolean);
    return JSON.stringify(rows);
  }, [allocations, openInvoices]);

  if (!payments.length || !openInvoices.length) return null;

  return (
    <section className="fyh-glass space-y-4 p-5">
      <h2 className="fyh-display text-lg font-semibold">Allocate advance</h2>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="vendorId" value={vendorId} />
        <input type="hidden" name="paymentId" value={paymentId} />
        <input type="hidden" name="allocationsJson" value={allocationsJson} />

        <div className="space-y-2 max-w-md">
          <label className="fyh-label" htmlFor="advancePaymentId">
            Payment with advance
          </label>
          <select
            id="advancePaymentId"
            className={fieldClass}
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
          >
            {payments.map(({ payment, unallocatedPaise }) => (
              <option key={payment.id} value={payment.id}>
                {payment.paymentDate} — {formatInrFromPaise(unallocatedPaise)} unallocated
              </option>
            ))}
          </select>
        </div>

        {selected ? (
          <p className="text-sm text-fyh-text-muted">
            Available to allocate: {formatInrFromPaise(selected.unallocatedPaise)}
          </p>
        ) : null}

        <div className="divide-y divide-[color:var(--fyh-border)] rounded border border-[color:var(--fyh-border)]">
          {openInvoices.map((inv) => (
            <div
              key={inv.payableId}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium">{inv.invoiceNumber}</span>
                <span className="ml-2 text-fyh-text-muted">
                  balance {formatInrFromPaise(inv.balancePaise)}
                </span>
              </div>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="₹ allocate"
                className="max-w-[8rem]"
                value={allocations[inv.payableId] ?? ''}
                onChange={(e) =>
                  setAllocations((prev) => ({ ...prev, [inv.payableId]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>

        {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-fyh-success">{state.success}</p> : null}

        <Button type="submit" disabled={pending}>
          {pending ? 'Allocating…' : 'Allocate to invoices'}
        </Button>
      </form>
    </section>
  );
}

function ReturnInvoiceButton({
  vendorId,
  purchaseId,
}: {
  vendorId: string;
  purchaseId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Return
      </Button>
      {open ? (
        <ReturnDialog
          vendorId={vendorId}
          purchaseId={purchaseId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ReturnDialog({
  vendorId,
  purchaseId,
  onClose,
}: {
  vendorId: string;
  purchaseId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Awaited<
    ReturnType<typeof getPurchaseReturnContextAction>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, formAction, pending] = useActionState(recordPurchaseReturnAction, initialState);
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getPurchaseReturnContextAction(purchaseId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [purchaseId]);

  const returnLinesJson = useMemo(() => {
    if (!detail?.lines) return '[]';
    const rows = detail.lines
      .map(({ line }) => {
        const qty = Number(quantities[line.productId] ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) return null;
        return { productId: line.productId, quantity: qty };
      })
      .filter(Boolean);
    return JSON.stringify(rows);
  }, [detail, quantities]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="fyh-glass max-h-[90vh] w-full max-w-lg overflow-y-auto p-5">
        <h3 className="fyh-display text-lg font-semibold">Record return</h3>
        <p className="mt-1 text-sm text-fyh-text-muted">
          Returns reduce stock and the invoice payable balance.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-fyh-text-muted">Loading purchase lines…</p>
        ) : (
          <form action={formAction} className="mt-4 space-y-4">
            <input type="hidden" name="vendorId" value={vendorId} />
            <input type="hidden" name="purchaseId" value={purchaseId} />
            <input type="hidden" name="returnLinesJson" value={returnLinesJson} />

            <div className="space-y-2">
              <label className="fyh-label" htmlFor="returnDate">
                Return date *
              </label>
              <Input
                id="returnDate"
                name="returnDate"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </div>

            <div className="space-y-2">
              <p className="fyh-label">Products to return</p>
              {detail?.lines?.map(({ line, productName }) => (
                <div key={line.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {productName}{' '}
                    <span className="text-fyh-text-muted">(purchased {line.quantity})</span>
                  </span>
                  <Input
                    type="number"
                    min="0"
                    max={line.quantity}
                    step="0.01"
                    className="max-w-[6rem]"
                    value={quantities[line.productId] ?? ''}
                    onChange={(e) =>
                      setQuantities((prev) => ({ ...prev, [line.productId]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="fyh-label" htmlFor="returnNotes">
                Notes
              </label>
              <Input id="returnNotes" name="notes" />
            </div>

            {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}
            {state.success ? <p className="text-sm text-fyh-success">{state.success}</p> : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Record return'}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
