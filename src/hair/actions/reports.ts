'use server';

import { requirePermission } from '@/src/hair/lib/auth/permissions';
import { rowsToCsv, paiseToCsvRupees } from '@/src/hair/lib/export/csv';
import { getReportsSnapshot } from '@/src/hair/services/reports';
import { salonDayBounds, salonMonthStartUtc } from '@/src/hair/lib/salonTime';
import { getSalonSettings } from '@/src/hair/services/settings';
import type {
  AdvanceRow,
  DiscountReportRow,
  GstDetailRow,
  LoyaltyRow,
  MembershipReportRow,
  PackageReportRow,
  PaymentMethodSplitRow,
  ProductCatalogRow,
  ReceivableRow,
  WalletBalanceRow,
} from '@/src/hair/services/reportQueries';

export type FyhReportKey =
  | 'discounts'
  | 'gst-detail'
  | 'payment-methods'
  | 'loyalty'
  | 'memberships'
  | 'packages'
  | 'products'
  | 'stock'
  | 'low-stock'
  | 'receivables'
  | 'advances'
  | 'wallet-balances'
  | 'overview';

export type FyhExportFormat = 'csv' | 'pdf';

export type ReportExportActionState = { error?: string; csv?: string; filename?: string };

export type ExportReportResult =
  | { ok: true; format: 'csv'; filename: string; content: string }
  | { ok: true; format: 'pdf'; filename: string; content: string }
  | { ok: false; error: string };

function escapeCsv(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function defaultReportRange() {
  const settings = await getSalonSettings();
  const tz = settings.timezone?.trim() || 'Asia/Kolkata';
  const { end } = salonDayBounds(tz);
  return { from: salonMonthStartUtc(tz), to: end, tz };
}

async function loadReportRows(reportKey: FyhReportKey) {
  const { from, to } = await defaultReportRange();
  switch (reportKey) {
    case 'discounts': {
      const { discountsReport } = await import('@/src/hair/services/reportQueries');
      return { kind: 'rows' as const, rows: await discountsReport({ from, to }) };
    }
    case 'gst-detail': {
      const { gstDetailReport } = await import('@/src/hair/services/reportQueries');
      return { kind: 'rows' as const, rows: await gstDetailReport({ from, to }) };
    }
    case 'payment-methods': {
      const { paymentMethodSplit } = await import('@/src/hair/services/reportQueries');
      return { kind: 'rows' as const, rows: await paymentMethodSplit({ from, to }) };
    }
    case 'loyalty': {
      const { loyaltyReport } = await import('@/src/hair/services/reportQueries');
      return { kind: 'rows' as const, rows: await loyaltyReport() };
    }
    case 'memberships': {
      const { membershipsReport } = await import('@/src/hair/services/reportQueries');
      return { kind: 'rows' as const, rows: await membershipsReport() };
    }
    case 'packages': {
      const { packagesReport } = await import('@/src/hair/services/reportQueries');
      return { kind: 'rows' as const, rows: await packagesReport() };
    }
    case 'products': {
      const { productsReport } = await import('@/src/hair/services/reportQueries');
      return { kind: 'rows' as const, rows: await productsReport() };
    }
    case 'stock': {
      const { stockReport } = await import('@/src/hair/services/reportQueries');
      return { kind: 'rows' as const, rows: await stockReport() };
    }
    case 'low-stock': {
      const { lowStockReport } = await import('@/src/hair/services/reportQueries');
      return { kind: 'rows' as const, rows: await lowStockReport() };
    }
    case 'receivables': {
      const { receivablesReport } = await import('@/src/hair/services/reportQueries');
      return { kind: 'rows' as const, rows: await receivablesReport() };
    }
    case 'advances': {
      const { advancesReport } = await import('@/src/hair/services/reportQueries');
      return { kind: 'rows' as const, rows: await advancesReport() };
    }
    case 'wallet-balances': {
      const { walletBalancesReport } = await import('@/src/hair/services/reportQueries');
      return { kind: 'rows' as const, rows: await walletBalancesReport() };
    }
    case 'overview': {
      const snap = await getReportsSnapshot();
      return { kind: 'overview' as const, snap };
    }
    default:
      throw new Error(`Unknown report: ${reportKey satisfies never}`);
  }
}

function rowsToCsvContent(headers: string[], rows: unknown[][]): string {
  return rowsToCsv(headers, rows);
}

function formatCsvForReport(reportKey: FyhReportKey, data: Awaited<ReturnType<typeof loadReportRows>>): string {
  if (data.kind === 'overview') {
    const { snap } = data;
    return rowsToCsvContent(
      ['metric', 'value', 'hint'],
      [
        ['today_revenue_paise', snap.todayRevenuePaise, `${snap.todayInvoiceCount} invoices`],
        ['week_revenue_paise', snap.weekRevenuePaise, `${snap.weekInvoiceCount} invoices`],
        ['month_revenue_paise', snap.monthRevenuePaise, `${snap.monthInvoiceCount} invoices`],
        ['month_gst_paise', snap.monthGstPaise, 'paid invoices tax column'],
      ],
    );
  }

  switch (reportKey) {
    case 'discounts': {
      const rows = data.rows as DiscountReportRow[];
      return rowsToCsvContent(
        ['invoice', 'customer', 'paid_at', 'line_discount', 'membership', 'package', 'total'],
        rows.map((r) => [
          r.invoiceNumber,
          r.customerName,
          r.paidAt?.toISOString().slice(0, 10) ?? '',
          paiseToCsvRupees(r.discountPaise),
          paiseToCsvRupees(r.membershipRedemptionPaise),
          paiseToCsvRupees(r.packageRedemptionPaise),
          paiseToCsvRupees(r.totalDiscountPaise),
        ]),
      );
    }
    case 'gst-detail': {
      const rows = data.rows as GstDetailRow[];
      return rowsToCsvContent(
        ['invoice', 'paid_at', 'subtotal', 'gst', 'grand_total'],
        rows.map((r) => [
          r.invoiceNumber,
          r.paidAt?.toISOString().slice(0, 10) ?? '',
          paiseToCsvRupees(r.subtotalPaise),
          paiseToCsvRupees(r.taxPaise),
          paiseToCsvRupees(r.grandTotalPaise),
        ]),
      );
    }
    case 'payment-methods': {
      const rows = data.rows as PaymentMethodSplitRow[];
      return rowsToCsvContent(
        ['method', 'amount', 'entries'],
        rows.map((r) => [r.method, paiseToCsvRupees(r.amountPaise), r.entryCount]),
      );
    }
    case 'loyalty': {
      const rows = data.rows as LoyaltyRow[];
      return rowsToCsvContent(
        ['customer', 'phone', 'points', 'lifetime_spend', 'membership'],
        rows.map((r) => [
          r.customerName,
          r.phone,
          r.rewardPoints,
          paiseToCsvRupees(r.lifetimeSpendPaise),
          r.membership ?? '',
        ]),
      );
    }
    case 'memberships': {
      const rows = data.rows as MembershipReportRow[];
      return rowsToCsvContent(
        ['customer', 'phone', 'plan', 'tier', 'starts', 'expires'],
        rows.map((r) => [r.customerName, r.phone, r.planName, r.tier, r.startsOn, r.expiresOn]),
      );
    }
    case 'packages': {
      const rows = data.rows as PackageReportRow[];
      return rowsToCsvContent(
        ['customer', 'phone', 'plan', 'total', 'used', 'remaining', 'expires'],
        rows.map((r) => [
          r.customerName,
          r.phone,
          r.planName,
          r.totalSessions,
          r.usedSessions,
          r.remainingSessions,
          r.expiresOn ?? '',
        ]),
      );
    }
    case 'products':
    case 'stock':
    case 'low-stock': {
      const rows = data.rows as ProductCatalogRow[];
      return rowsToCsvContent(
        ['name', 'type', 'category', 'brand', 'sell', 'cost', 'stock', 'min_stock', 'active'],
        rows.map((r) => [
          r.name,
          r.productType,
          r.category ?? '',
          r.brand ?? '',
          paiseToCsvRupees(r.sellingPricePaise),
          paiseToCsvRupees(r.costPricePaise),
          r.stockQty,
          r.minStock,
          r.isActive ? 'yes' : 'no',
        ]),
      );
    }
    case 'receivables': {
      const rows = data.rows as ReceivableRow[];
      return rowsToCsvContent(
        ['customer', 'phone', 'balance'],
        rows.map((r) => [r.customerName, r.phone, paiseToCsvRupees(r.balancePaise)]),
      );
    }
    case 'advances': {
      const rows = data.rows as AdvanceRow[];
      return rowsToCsvContent(
        ['customer', 'phone', 'amount', 'reference', 'created_at'],
        rows.map((r) => [
          r.customerName,
          r.phone,
          paiseToCsvRupees(r.amountPaise),
          r.reference ?? '',
          r.createdAt.toISOString(),
        ]),
      );
    }
    case 'wallet-balances': {
      const rows = data.rows as WalletBalanceRow[];
      return rowsToCsvContent(
        ['customer', 'phone', 'balance'],
        rows.map((r) => [r.customerName, r.phone, paiseToCsvRupees(r.balancePaise)]),
      );
    }
    default:
      return '';
  }
}

function formatPrintHtml(title: string, csvContent: string): string {
  const lines = csvContent.split('\n').filter(Boolean);
  const [headerLine, ...bodyLines] = lines;
  const headers = headerLine?.split(',') ?? [];
  const bodyRows = bodyLines.map((line) => line.split(','));
  const th = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const tr = bodyRows
    .map((cells) => `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f4f4f4}</style></head>
<body><h1>${escapeHtml(title)}</h1><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
<script>window.onload=()=>window.print()</script></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** CSV export of the reports overview snapshot (legacy action). */
export async function exportReportsOverviewAction(): Promise<ReportExportActionState> {
  try {
    await requirePermission('action:reports.export');
    const result = await exportReportAction({ reportKey: 'overview', format: 'csv' });
    if (!result.ok) return { error: result.error };
    return { csv: result.content, filename: result.filename };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Export failed' };
  }
}

/** Dynamic-import report queries then emit CSV or print-ready HTML. */
export async function exportReportAction(input: {
  reportKey: FyhReportKey;
  format: FyhExportFormat;
}): Promise<ExportReportResult> {
  try {
    await requirePermission('action:reports.export');
    const data = await loadReportRows(input.reportKey);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `fyh-${input.reportKey}-${stamp}.${input.format === 'csv' ? 'csv' : 'html'}`;
    const csvContent = formatCsvForReport(input.reportKey, data);

    if (input.format === 'csv') {
      return { ok: true, format: 'csv', filename, content: csvContent };
    }
    return {
      ok: true,
      format: 'pdf',
      filename,
      content: formatPrintHtml(`FYH Report · ${input.reportKey}`, csvContent),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Export failed' };
  }
}
