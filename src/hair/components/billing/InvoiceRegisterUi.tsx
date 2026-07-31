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
  Search,
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
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
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

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank: 'Bank',
  wallet: 'Wallet',
  gift_card: 'Gift card',
};

const fieldClass =
  'fyh-select w-full min-w-[8rem] text-[0.8125rem] outline-none focus:border-fyh-accent/50';

function buildQuery(base: Record<string, string>, patch: Record<string, string | undefined>): string {
  const next: Record<string, string> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value) next[key] = value;
    else delete next[key];
  }
  const qs = new URLSearchParams(next).toString();
  return qs ? `?${qs}` : '';
}

function InvoiceRowActions({ row }: { row: InvoiceRegisterRow }) {
  const [open, setOpen] = useState(false);
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
        className="h-8 w-8 p-0"
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
            <Link
              href={`/billing/${row.id}`}
              className="flex items-center gap-2 px-3 py-2 text-sm text-fyh-text hover:bg-white/6"
              onClick={() => setOpen(false)}
            >
              <ExternalLink className="h-3.5 w-3.5" /> View
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

function ServicesCell({ summary }: { summary: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!summary) return <span className="text-fyh-text-muted">—</span>;
  const short = summary.length > 48 ? `${summary.slice(0, 48)}…` : summary;
  return (
    <div className="max-w-[16rem]">
      <p className={cn('text-sm', !expanded && 'truncate')}>{expanded ? summary : short}</p>
      {summary.length > 48 ? (
        <button
          type="button"
          className="mt-0.5 text-xs text-fyh-accent hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
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
  const [searchDraft, setSearchDraft] = useState(filters.q ?? '');

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const filterRecord = useMemo(() => {
    const raw: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      raw[key] = value;
    });
    return raw;
  }, [searchParams]);

  const pushFilters = useCallback(
    (patch: Record<string, string | undefined>) => {
      const href = `/billing/invoices${buildQuery(filterRecord, { ...patch, page: patch.page ?? '1' })}`;
      router.push(href);
    },
    [filterRecord, router],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      const trimmed = searchDraft.trim();
      if ((filters.q ?? '') === trimmed) return;
      pushFilters({ q: trimmed || undefined, page: '1' });
    }, 350);
    return () => window.clearTimeout(t);
  }, [searchDraft, filters.q, pushFilters]);

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="fyh-section-eyebrow">Billing</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">Invoice Register</h1>
          <p className="mt-2 text-sm text-fyh-text-secondary">
            Every invoice from Quick Sale, appointments, and historical import — searchable and exportable.
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

      {exportError ? <p className="text-sm text-fyh-danger">{exportError}</p> : null}

      <form
        method="get"
        className="fyh-glass space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const next: Record<string, string | undefined> = { page: '1' };
          for (const [key, value] of fd.entries()) {
            if (typeof value === 'string' && value.trim()) next[key] = value.trim();
          }
          if (searchDraft.trim()) next.q = searchDraft.trim();
          router.push(`/billing/invoices${buildQuery({}, next)}`);
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fyh-text-muted" />
          <Input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search invoice number, customer, mobile, or services…"
            className="pl-9"
            aria-label="Search invoices"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div className="space-y-1">
            <label className="fyh-label" htmlFor="from">
              From
            </label>
            <Input id="from" name="from" type="date" defaultValue={filters.from ?? ''} />
          </div>
          <div className="space-y-1">
            <label className="fyh-label" htmlFor="to">
              To
            </label>
            <Input id="to" name="to" type="date" defaultValue={filters.to ?? ''} />
          </div>
          <div className="space-y-1">
            <label className="fyh-label" htmlFor="invoiceNumber">
              Invoice #
            </label>
            <Input
              id="invoiceNumber"
              name="invoiceNumber"
              defaultValue={filters.invoiceNumber ?? ''}
              placeholder="FYH-"
            />
          </div>
          <div className="space-y-1">
            <label className="fyh-label" htmlFor="customer">
              Customer
            </label>
            <Input id="customer" name="customer" defaultValue={filters.customer ?? ''} />
          </div>
          <div className="space-y-1">
            <label className="fyh-label" htmlFor="mobile">
              Mobile
            </label>
            <Input id="mobile" name="mobile" defaultValue={filters.mobile ?? ''} />
          </div>
          <div className="space-y-1">
            <label className="fyh-label" htmlFor="paymentMode">
              Payment mode
            </label>
            <select
              id="paymentMode"
              name="paymentMode"
              defaultValue={filters.paymentMode ?? ''}
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
            <label className="fyh-label" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={filters.status ?? ''}
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
          <div className="flex items-end gap-2">
            <Button type="submit" variant="secondary" className="flex-1">
              Apply filters
            </Button>
            <Link href="/billing/invoices">
              <Button type="button" variant="ghost">
                Clear
              </Button>
            </Link>
          </div>
        </div>
      </form>

      <div className="fyh-glass overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--fyh-border)] px-4 py-3 text-sm text-fyh-text-secondary">
          <span>
            {totalCount.toLocaleString()} invoice{totalCount === 1 ? '' : 's'}
            {filters.q ? ` matching “${filters.q}”` : ''}
          </span>
          <div className="flex items-center gap-2">
            <label className="fyh-label mb-0" htmlFor="pageSize">
              Rows
            </label>
            <select
              id="pageSize"
              className={cn(fieldClass, 'w-auto')}
              value={String(pageSize)}
              onChange={(e) => pushFilters({ pageSize: e.target.value, page: '1' })}
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
          <div className="px-6 py-16 text-center">
            <p className="fyh-display text-xl font-semibold">No invoices found</p>
            <p className="mt-2 text-sm text-fyh-text-muted">
              Try adjusting filters or complete a Quick Sale checkout.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-[color:var(--fyh-border)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/billing/${row.id}`}
                      className="font-semibold tabular-nums text-fyh-accent hover:underline"
                    >
                      {row.invoiceNumber}
                    </Link>
                    <InvoiceRowActions row={row} />
                  </div>
                  <p className="mt-1 text-sm">{row.customerName}</p>
                  <p className="text-xs text-fyh-text-muted">{row.mobile}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fyh-text-secondary">
                    <span>{row.invoiceDate.toISOString().slice(0, 10)}</span>
                    <span className="capitalize">{STATUS_LABELS[row.status]}</span>
                    <span>{row.paymentModes}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold tabular-nums text-fyh-text">
                    {formatInrFromPaise(row.grandTotalPaise)}
                  </p>
                </div>
              ))}
            </div>

            <div className="hidden max-h-[calc(100vh-22rem)] overflow-auto md:block">
              <table className="w-full min-w-[1100px] text-left">
                <thead className="sticky top-0 z-10 bg-fyh-elevated shadow-[0_1px_0_var(--fyh-border-strong)]">
                  <tr>
                    <th className="w-10 px-3 py-3" />
                    <th className="px-3 py-3">Invoice #</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Mobile</th>
                    <th className="px-3 py-3">Services</th>
                    <th className="px-3 py-3">Payment</th>
                    <th className="px-3 py-3 text-right">Taxable</th>
                    <th className="px-3 py-3 text-right">GST</th>
                    <th className="px-3 py-3 text-right">Total</th>
                    <th className="px-3 py-3 text-right">Paid</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-3">
                        <InvoiceRowActions row={row} />
                      </td>
                      <td className="px-3 py-3 font-medium tabular-nums">
                        <Link
                          href={`/billing/${row.id}`}
                          className="text-fyh-accent hover:underline"
                        >
                          {row.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-fyh-text-secondary">
                        {row.invoiceDate.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-3 py-3">{row.customerName}</td>
                      <td className="px-3 py-3 tabular-nums text-fyh-text-secondary">{row.mobile}</td>
                      <td className="px-3 py-3">
                        <ServicesCell summary={row.servicesSummary} />
                      </td>
                      <td className="px-3 py-3 text-sm text-fyh-text-secondary">{row.paymentModes}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatInrFromPaise(row.taxablePaise)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatInrFromPaise(row.gstPaise)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-medium">
                        {formatInrFromPaise(row.grandTotalPaise)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatInrFromPaise(row.paidPaise)}
                      </td>
                      <td className="px-3 py-3 capitalize text-fyh-text-secondary">
                        {STATUS_LABELS[row.status]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--fyh-border)] px-4 py-3">
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
      </div>
    </div>
  );
}
