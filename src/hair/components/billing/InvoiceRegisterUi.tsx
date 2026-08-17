'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  MoreHorizontal,
  Printer,
  Share2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  exportInvoiceRegisterAction,
  getInvoicePrintHtmlAction,
  getInvoiceSharePreviewAction,
  type InvoiceRegisterExportFormat,
} from '@/src/hair/actions/invoiceRegister';
import { PrintInvoiceButton } from '@/src/hair/components/billing/BillingUi';
import { InvoicePreviewModal } from '@/src/hair/components/billing/InvoicePreviewModal';
import { Button } from '@/src/hair/components/ui/button';
import { FyhDatePicker } from '@/src/hair/components/ui/FyhDatePicker';
import {
  FYH_INVOICE_STATUSES,
  FYH_PAYMENT_METHODS,
  type FyhInvoiceStatus,
} from '@/src/hair/db/schema/billing';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { InvoiceRegisterRow } from '@/src/hair/services/invoiceRegisterQueries';
import { cn } from '@/src/hair/lib/utils';

export type InvoiceRegisterUiProps = {
  rows: InvoiceRegisterRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  filters: Record<string, string>;
};

const STATUS_LABELS: Record<FyhInvoiceStatus, string> = {
  draft: 'Draft',
  unpaid: 'Unpaid',
  partial: 'Partial',
  paid: 'Paid',
  void: 'Void',
  refunded: 'Refunded',
};

const STATUS_BADGE: Record<FyhInvoiceStatus, string> = {
  draft: 'bg-white/10 text-fyh-text-muted',
  unpaid: 'bg-fyh-danger/15 text-fyh-danger',
  partial: 'bg-fyh-warning/15 text-fyh-warning',
  paid: 'bg-fyh-success/15 text-fyh-success',
  void: 'bg-white/8 text-fyh-text-muted line-through',
  refunded: 'bg-fyh-accent/15 text-fyh-accent',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank: 'Bank',
  wallet: 'Wallet',
  gift_card: 'Gift card',
};

const fieldClass =
  'fyh-select h-9 w-full min-w-0 text-[0.8125rem] outline-none focus:border-fyh-accent/50';

function buildQuery(base: Record<string, string>, patch: Record<string, string | undefined>): string {
  const next: Record<string, string> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value) next[key] = value;
    else delete next[key];
  }
  const qs = new URLSearchParams(next).toString();
  return qs ? `?${qs}` : '';
}

function StatusBadge({ status }: { status: FyhInvoiceStatus }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide',
        STATUS_BADGE[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function PaymentBadge({ modes }: { modes: string }) {
  if (!modes) return <span className="text-fyh-text-muted">—</span>;
  const first = modes.split(',')[0]?.trim() ?? modes;
  const label = PAYMENT_LABELS[first.toLowerCase()] ?? first;
  return (
    <span className="inline-flex rounded-md bg-white/8 px-1.5 py-0.5 text-[0.6875rem] font-medium text-fyh-text-secondary">
      {label}
    </span>
  );
}

function InvoiceRowActions({
  row,
  onPreview,
}: {
  row: InvoiceRegisterRow;
  onPreview: (invoiceId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pdfHref = `/fyh/api/invoices/${row.id}/print?download=1`;

  function loadPrintHtml(onReady: (html: string) => void) {
    startTransition(async () => {
      const res = await getInvoicePrintHtmlAction(row.id);
      if (res.ok) {
        setPrintHtml(res.html);
        onReady(res.html);
      }
    });
  }

  function share() {
    startTransition(async () => {
      const res = await getInvoiceSharePreviewAction({
        invoiceId: row.id,
        invoiceNumber: row.invoiceNumber,
        customerName: row.customerName,
        customerPhone: row.mobile,
        grandTotalPaise: row.grandTotalPaise,
      });
      if (res.ok) {
        window.open(res.waUrl, '_blank', 'noopener,noreferrer');
      }
      setOpen(false);
    });
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        aria-label="Invoice actions"
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-1 min-w-[11rem] rounded-xl border border-[color:var(--fyh-border-strong)] bg-fyh-elevated py-1 shadow-xl">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fyh-text hover:bg-white/6"
              onClick={() => {
                onPreview(row.id);
                setOpen(false);
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" /> View
            </button>
            <Link
              href={`/billing/${row.id}`}
              className="flex items-center gap-2 px-3 py-2 text-sm text-fyh-text-muted hover:bg-white/6"
              onClick={() => setOpen(false)}
            >
              Staff detail
            </Link>
            <a
              href={pdfHref}
              className="flex items-center gap-2 px-3 py-2 text-sm text-fyh-text hover:bg-white/6"
              onClick={() => setOpen(false)}
            >
              <Download className="h-3.5 w-3.5" /> Download PDF
            </a>
            <button
              type="button"
              disabled={pending}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fyh-text hover:bg-white/6 disabled:opacity-50"
              onClick={() => {
                if (printHtml) {
                  const w = window.open('', '_blank', 'width=800,height=900');
                  if (w) {
                    w.document.write(printHtml);
                    w.document.close();
                    w.focus();
                    w.print();
                  }
                  setOpen(false);
                  return;
                }
                loadPrintHtml((html) => {
                  const w = window.open('', '_blank', 'width=800,height=900');
                  if (w) {
                    w.document.write(html);
                    w.document.close();
                    w.focus();
                    w.print();
                  }
                  setOpen(false);
                });
              }}
            >
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
            <button
              type="button"
              disabled={pending}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fyh-text hover:bg-white/6 disabled:opacity-50"
              onClick={share}
            >
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
          </div>
        </>
      ) : null}
      {printHtml ? (
        <span className="sr-only">
          <PrintInvoiceButton html={printHtml} />
        </span>
      ) : null}
    </div>
  );
}

function RegisterFilterBar({
  filters,
  onReplace,
}: {
  filters: Record<string, string>;
  onReplace: (patch: Record<string, string | undefined>) => void;
}) {
  const [fromDate, setFromDate] = useState(filters.from ?? '');
  const [toDate, setToDate] = useState(filters.to ?? '');
  const [paymentMode, setPaymentMode] = useState(filters.paymentMode ?? '');
  const [status, setStatus] = useState(filters.status ?? '');

  useEffect(() => {
    if ((filters.from ?? '') === fromDate) return;
    const timer = window.setTimeout(() => {
      onReplace({ from: fromDate || undefined });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [fromDate, filters.from, onReplace]);

  useEffect(() => {
    if ((filters.to ?? '') === toDate) return;
    const timer = window.setTimeout(() => {
      onReplace({ to: toDate || undefined });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [toDate, filters.to, onReplace]);

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-[color:var(--fyh-border)] bg-fyh-base/95 px-4 py-2.5 backdrop-blur md:-mx-8 md:px-8">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="space-y-1">
          <label className="fyh-label text-xs" htmlFor="from">
            From
          </label>
          <FyhDatePicker
            id="from"
            value={fromDate}
            onChange={setFromDate}
            placeholder="From date"
            aria-label="From date"
          />
        </div>
        <div className="space-y-1">
          <label className="fyh-label text-xs" htmlFor="to">
            To
          </label>
          <FyhDatePicker
            id="to"
            value={toDate}
            onChange={setToDate}
            placeholder="To date"
            aria-label="To date"
          />
        </div>
        <div className="space-y-1">
          <label className="fyh-label text-xs" htmlFor="paymentMode">
            Payment
          </label>
          <select
            id="paymentMode"
            value={paymentMode}
            onChange={(e) => {
              const value = e.target.value;
              setPaymentMode(value);
              onReplace({ paymentMode: value || undefined });
            }}
            className={fieldClass}
          >
            <option value="">All</option>
            {FYH_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABELS[m] ?? m}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="fyh-label text-xs" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => {
              const value = e.target.value;
              setStatus(value);
              onReplace({ status: value || undefined });
            }}
            className={fieldClass}
          >
            <option value="">All</option>
            {FYH_INVOICE_STATUSES.filter((s) => s !== 'draft').map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export function InvoiceRegisterUi({
  rows,
  totalCount,
  page,
  pageSize,
  filters,
}: InvoiceRegisterUiProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportPending, startExport] = useTransition();
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const openPreview = useCallback((invoiceId: string) => setPreviewInvoiceId(invoiceId), []);
  const closePreview = useCallback(() => setPreviewInvoiceId(null), []);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const filterRecord = useMemo(() => {
    const raw: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      raw[key] = value;
    });
    return raw;
  }, [searchParams]);

  const replaceFilters = useCallback(
    (patch: Record<string, string | undefined>) => {
      const href = `/billing/invoices${buildQuery(filterRecord, { ...patch, page: patch.page ?? '1' })}`;
      router.replace(href);
    },
    [filterRecord, router],
  );

  const filterBarKey = `${filters.from ?? ''}|${filters.to ?? ''}|${filters.paymentMode ?? ''}|${filters.status ?? ''}`;

  function runExport(format: InvoiceRegisterExportFormat) {
    setExportError(null);
    startExport(async () => {
      const result = await exportInvoiceRegisterAction({ filters: filterRecord, format });
      if (!result.ok) {
        setExportError(result.error);
        return;
      }
      if (result.format === 'xlsx') {
        const bin = atob(result.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      if (result.format === 'csv') {
        const blob = new Blob([result.content], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      const win = window.open('', '_blank');
      if (!win) {
        setExportError('Allow pop-ups to open the register PDF');
        return;
      }
      win.document.write(result.content);
      win.document.close();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">Billing</p>
          <h1 className="fyh-display mt-1 font-semibold">Invoice Register</h1>
          <p className="mt-2 text-sm text-fyh-text-secondary">
            Every invoice from Quick Sale, appointments, and historical import — searchable and
            exportable.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={exportPending}
            onClick={() => runExport('xlsx')}
          >
            Excel
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={exportPending}
            onClick={() => runExport('csv')}
          >
            CSV
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={exportPending}
            onClick={() => runExport('pdf')}
          >
            PDF Register
          </Button>
        </div>
      </div>

      {exportError ? <p className="mb-3 text-sm text-fyh-danger">{exportError}</p> : null}

      <RegisterFilterBar key={filterBarKey} filters={filters} onReplace={replaceFilters} />

      <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-fyh-text-secondary">
        <span>
          {totalCount.toLocaleString()} invoice{totalCount === 1 ? '' : 's'}
          {filters.q ? ` matching “${filters.q}”` : ''}
        </span>
        <div className="flex items-center gap-2">
          <label className="fyh-label mb-0 text-xs" htmlFor="pageSize">
            Rows
          </label>
          <select
            id="pageSize"
            className={cn(fieldClass, 'w-auto min-w-[4.5rem]')}
            value={String(pageSize)}
            onChange={(e) => replaceFilters({ pageSize: e.target.value, page: '1' })}
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
          <div>
            <p className="fyh-display text-xl font-semibold">No invoices found</p>
            <p className="mt-2 text-sm text-fyh-text-muted">
              Try adjusting filters or use the search bar above to find invoices.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3 pb-3 md:hidden">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl border border-[color:var(--fyh-border)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="font-semibold tabular-nums text-fyh-accent hover:underline"
                    onClick={() => openPreview(row.id)}
                  >
                    {row.invoiceNumber}
                  </button>
                  <InvoiceRowActions row={row} onPreview={openPreview} />
                </div>
                <p className="mt-1 text-sm font-medium">{row.customerName}</p>
                <p className="text-xs text-fyh-text-muted">{row.mobile}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-fyh-text-secondary">
                    {row.invoiceDate.toISOString().slice(0, 10)}
                  </span>
                  <StatusBadge status={row.status} />
                  <PaymentBadge modes={row.paymentModes} />
                </div>
                <p className="mt-2 text-sm font-semibold tabular-nums text-fyh-text">
                  {formatInrFromPaise(row.grandTotalPaise)}
                </p>
              </div>
            ))}
          </div>

          <div className="hidden min-h-0 max-h-[calc(100vh-12rem)] flex-1 overflow-auto md:block">
            <table className="fyh-table-compact table-fixed w-full text-left">
              <thead className="sticky top-0 z-10 bg-fyh-elevated shadow-[0_1px_0_var(--fyh-border-strong)]">
                <tr>
                  <th className="w-[9%] px-2 py-2">Invoice #</th>
                  <th className="w-[8%] px-2 py-2">Date</th>
                  <th className="w-[16%] px-2 py-2">Customer</th>
                  <th className="w-[18%] px-2 py-2">Service</th>
                  <th className="w-[9%] px-2 py-2">Payment</th>
                  <th className="w-[8%] px-2 py-2 text-right">Taxable</th>
                  <th className="w-[8%] px-2 py-2 text-right">GST</th>
                  <th className="w-[8%] px-2 py-2 text-right">Total</th>
                  <th className="w-[8%] px-2 py-2">Status</th>
                  <th className="w-[4%] px-2 py-2" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-2 py-2 font-semibold tabular-nums">
                      <button
                        type="button"
                        className="text-fyh-accent hover:underline"
                        onClick={() => openPreview(row.id)}
                      >
                        {row.invoiceNumber}
                      </button>
                    </td>
                    <td className="px-2 py-2 tabular-nums text-fyh-text-secondary">
                      {row.invoiceDate.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-2 py-2">
                      <p className="truncate font-medium">{row.customerName}</p>
                      {row.mobile ? (
                        <p className="truncate text-xs text-fyh-text-muted">{row.mobile}</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      {row.servicesSummary ? (
                        <p
                          className="line-clamp-2 text-sm leading-snug"
                          title={row.servicesSummary}
                        >
                          {row.servicesSummary}
                        </p>
                      ) : (
                        <span className="text-fyh-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <PaymentBadge modes={row.paymentModes} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatInrFromPaise(row.taxablePaise)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatInrFromPaise(row.gstPaise)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">
                      {formatInrFromPaise(row.grandTotalPaise)}
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-2 py-2">
                      <InvoiceRowActions row={row} onPreview={openPreview} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {totalPages > 1 ? (
        <div className="sticky bottom-0 z-20 -mx-4 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--fyh-border)] bg-fyh-base/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
          <p className="text-sm text-fyh-text-muted">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={`/billing/invoices${buildQuery(filterRecord, {
                page: String(Math.max(1, page - 1)),
              })}`}
              aria-disabled={page <= 1}
              className={cn(page <= 1 && 'pointer-events-none opacity-40')}
            >
              <Button type="button" variant="secondary" size="sm">
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
            </Link>
            <Link
              href={`/billing/invoices${buildQuery(filterRecord, {
                page: String(Math.min(totalPages, page + 1)),
              })}`}
              aria-disabled={page >= totalPages}
              className={cn(page >= totalPages && 'pointer-events-none opacity-40')}
            >
              <Button type="button" variant="secondary" size="sm">
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      ) : null}

      <InvoicePreviewModal invoiceId={previewInvoiceId} onClose={closePreview} />
    </div>
  );
}
