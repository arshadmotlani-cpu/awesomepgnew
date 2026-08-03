/**
 * Professional Invoice Register PDF (print HTML) — banks / CA / GST / audit.
 * Branding from invoice branding SSOT + salon settings. Never shows UTC.
 */

import { inArray, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhInvoicePayments, type FyhPaymentMethod } from '@/src/hair/db/schema';
import {
  INVOICE_BRAND_LOGO,
  INVOICE_BUSINESS,
  INVOICE_REGISTER_BRAND,
} from '@/src/hair/lib/invoiceBranding';
import { fyhPublicBaseUrl } from '@/src/hair/lib/invoicePublicLinks';
import { escapeHtml } from '@/src/hair/lib/salonTime';
import type { SalonSettings } from '@/src/hair/services/settings';
import type { InvoiceRegisterRow } from '@/src/hair/services/invoiceRegisterQueries';

const TZ_DEFAULT = 'Asia/Kolkata';

export type InvoiceRegisterPdfBranding = {
  displayName: string;
  tradeName: string;
  documentSubtitle: string;
  preparedBy: string;
  addressLines: string[];
  phone: string | null;
  email: string | null;
  gstin: string | null;
  logoUrl: string;
  logoAlt: string;
  timezone: string;
};

export type InvoiceRegisterPdfPeriod = {
  from: Date | null;
  to: Date | null;
};

export type InvoiceRegisterPdfPaymentBreakdown = {
  cashPaise: number;
  upiPaise: number;
  cardPaise: number;
  walletPaise: number;
  otherPaise: number;
};

export type InvoiceRegisterPdfSummary = {
  totalInvoices: number;
  totalRevenuePaise: number;
  outstandingPaise: number;
  gstCollectedPaise: number;
  taxableValuePaise: number;
  averageInvoicePaise: number;
  payments: InvoiceRegisterPdfPaymentBreakdown;
};

function formatInrPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function formatReportDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatGeneratedStamp(date: Date, timezone: string): { date: string; time: string } {
  const datePart = new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return { date: datePart, time: `${timePart} IST` };
}

function splitAddress(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [...INVOICE_BUSINESS.addressLines];
  return raw
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Resolve register branding — settings override when present, branding SSOT otherwise. */
export function resolveInvoiceRegisterPdfBranding(
  settings: Pick<
    SalonSettings,
    'businessName' | 'businessAddress' | 'gstin' | 'timezone' | 'billingSettings' | 'whatsappSettings'
  > | null,
): InvoiceRegisterPdfBranding {
  const timezone = settings?.timezone?.trim() || TZ_DEFAULT;
  const settingsName = settings?.businessName?.trim();
  const phone =
    settings?.whatsappSettings?.businessPhone?.trim() || INVOICE_BUSINESS.phone || null;
  const email = settings?.billingSettings?.businessEmail?.trim() || null;
  const gstin = settings?.gstin?.trim() || null;
  const logoUrl = `${fyhPublicBaseUrl()}${INVOICE_BRAND_LOGO.src}`;

  return {
    displayName: INVOICE_REGISTER_BRAND.displayName,
    tradeName: settingsName || INVOICE_REGISTER_BRAND.tradeName || INVOICE_BUSINESS.name,
    documentSubtitle: INVOICE_REGISTER_BRAND.documentSubtitle,
    preparedBy: INVOICE_REGISTER_BRAND.preparedBy,
    addressLines: splitAddress(settings?.businessAddress),
    phone,
    email,
    gstin,
    logoUrl,
    logoAlt: INVOICE_BRAND_LOGO.alt,
    timezone,
  };
}

export function computeInvoiceRegisterPdfSummary(
  rows: InvoiceRegisterRow[],
  payments: InvoiceRegisterPdfPaymentBreakdown,
): InvoiceRegisterPdfSummary {
  const totalInvoices = rows.length;
  const totalRevenuePaise = rows.reduce((s, r) => s + r.grandTotalPaise, 0);
  const outstandingPaise = rows.reduce(
    (s, r) => s + Math.max(0, r.grandTotalPaise - r.paidPaise),
    0,
  );
  const gstCollectedPaise = rows.reduce((s, r) => s + r.gstPaise, 0);
  const taxableValuePaise = rows.reduce((s, r) => s + r.taxablePaise, 0);
  const averageInvoicePaise =
    totalInvoices > 0 ? Math.round(totalRevenuePaise / totalInvoices) : 0;
  return {
    totalInvoices,
    totalRevenuePaise,
    outstandingPaise,
    gstCollectedPaise,
    taxableValuePaise,
    averageInvoicePaise,
    payments,
  };
}

export async function loadInvoiceRegisterPaymentBreakdown(
  invoiceIds: string[],
): Promise<InvoiceRegisterPdfPaymentBreakdown> {
  const empty: InvoiceRegisterPdfPaymentBreakdown = {
    cashPaise: 0,
    upiPaise: 0,
    cardPaise: 0,
    walletPaise: 0,
    otherPaise: 0,
  };
  if (invoiceIds.length === 0) return empty;

  const rows = await hairDb
    .select({
      method: fyhInvoicePayments.method,
      totalPaise: sql<number>`coalesce(sum(${fyhInvoicePayments.amountPaise}), 0)::bigint`.mapWith(
        Number,
      ),
    })
    .from(fyhInvoicePayments)
    .where(inArray(fyhInvoicePayments.invoiceId, invoiceIds))
    .groupBy(fyhInvoicePayments.method);

  for (const row of rows) {
    const method = row.method as FyhPaymentMethod;
    const amount = Number(row.totalPaise) || 0;
    if (method === 'cash') empty.cashPaise += amount;
    else if (method === 'upi') empty.upiPaise += amount;
    else if (method === 'card') empty.cardPaise += amount;
    else if (method === 'wallet') empty.walletPaise += amount;
    else empty.otherPaise += amount;
  }
  return empty;
}

function formatPeriodLabel(
  period: InvoiceRegisterPdfPeriod,
  timezone: string,
  rows: InvoiceRegisterRow[],
): { fromLabel: string; toLabel: string; hasExplicit: boolean } {
  if (period.from && period.to) {
    // `to` is exclusive end — show last inclusive salon day
    const inclusiveEnd = new Date(period.to.getTime() - 1);
    return {
      fromLabel: formatReportDate(period.from, timezone),
      toLabel: formatReportDate(inclusiveEnd, timezone),
      hasExplicit: true,
    };
  }
  if (rows.length === 0) {
    const now = new Date();
    const label = formatReportDate(now, timezone);
    return { fromLabel: label, toLabel: label, hasExplicit: false };
  }
  const times = rows.map((r) => r.invoiceDate.getTime());
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  return {
    fromLabel: formatReportDate(min, timezone),
    toLabel: formatReportDate(max, timezone),
    hasExplicit: Boolean(period.from || period.to),
  };
}

function cssQuoted(value: string): string {
  return JSON.stringify(value);
}

export function renderInvoiceRegisterPdfHtml(input: {
  rows: InvoiceRegisterRow[];
  branding: InvoiceRegisterPdfBranding;
  period: InvoiceRegisterPdfPeriod;
  summary: InvoiceRegisterPdfSummary;
  generatedAt?: Date;
  /** When false, omit auto-print (sample / test generation). Default true. */
  autoPrint?: boolean;
}): string {
  const { rows, branding, period, summary } = input;
  const generatedAt = input.generatedAt ?? new Date();
  const autoPrint = input.autoPrint !== false;
  const generated = formatGeneratedStamp(generatedAt, branding.timezone);
  const periodLabels = formatPeriodLabel(period, branding.timezone, rows);
  const money = formatInrPaise;

  const contactBits = [
    branding.phone ? `Mobile ${escapeHtml(branding.phone)}` : null,
    branding.email ? `Email ${escapeHtml(branding.email)}` : null,
    branding.gstin ? `GSTIN ${escapeHtml(branding.gstin)}` : null,
  ].filter(Boolean);

  const addressHtml = branding.addressLines
    .map((line) => `<div>${escapeHtml(line.replace(/,$/, ''))}</div>`)
    .join('');

  const bodyRows = rows
    .map((r, index) => {
      const stripe = index % 2 === 1 ? ' class="alt"' : '';
      const service =
        r.servicesSummary.length > 72
          ? `${r.servicesSummary.slice(0, 72)}…`
          : r.servicesSummary;
      return `<tr${stripe}>
          <td class="mono">${escapeHtml(r.invoiceNumber)}</td>
          <td>${escapeHtml(formatReportDate(r.invoiceDate, branding.timezone))}</td>
          <td>${escapeHtml(r.customerName)}</td>
          <td class="mono">${escapeHtml(r.mobile)}</td>
          <td>${escapeHtml(service)}</td>
          <td>${escapeHtml(r.paymentModes || '—')}</td>
          <td class="num">${money(r.taxablePaise)}</td>
          <td class="num">${money(r.gstPaise)}</td>
          <td class="num">${money(r.grandTotalPaise)}</td>
          <td>${escapeHtml(r.status)}</td>
        </tr>`;
    })
    .join('');

  const summaryCards = [
    ['Total invoices', String(summary.totalInvoices)],
    ['Total revenue', money(summary.totalRevenuePaise)],
    ['Cash', money(summary.payments.cashPaise)],
    ['UPI', money(summary.payments.upiPaise)],
    ['Card', money(summary.payments.cardPaise)],
    ['Wallet', money(summary.payments.walletPaise)],
    ['Outstanding', money(summary.outstandingPaise)],
    ['GST collected', money(summary.gstCollectedPaise)],
    ['Taxable value', money(summary.taxableValuePaise)],
    ['Average invoice', money(summary.averageInvoicePaise)],
  ];

  const title = `${branding.displayName} — ${branding.documentSubtitle}`;
  const footerLeft = `${branding.displayName} · Invoice Register`;
  const footerRight = `Generated from ${branding.preparedBy} · ${generated.date} ${generated.time}`;
  const headerLeft = `${branding.displayName} · ${branding.documentSubtitle}`;
  const headerRight = `${periodLabels.fromLabel} – ${periodLabels.toLabel}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --ink: #142018;
    --muted: #5a6a60;
    --line: #c9d4cc;
    --band: #eef3ef;
    --band-strong: #e2ebe5;
    --accent: #1a3d2c;
    --paper: #ffffff;
  }
  * { box-sizing: border-box; }
  @page {
    size: A4 landscape;
    margin: 16mm 12mm 18mm 12mm;
    @top-left {
      content: ${cssQuoted(headerLeft)};
      font-size: 8px;
      color: #5a6a60;
      font-family: Georgia, "Times New Roman", serif;
    }
    @top-right {
      content: ${cssQuoted(headerRight)};
      font-size: 8px;
      color: #5a6a60;
      font-family: Georgia, "Times New Roman", serif;
    }
    @bottom-left {
      content: ${cssQuoted(footerLeft)};
      font-size: 8px;
      color: #5a6a60;
      font-family: Georgia, "Times New Roman", serif;
    }
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-size: 8px;
      color: #5a6a60;
      font-family: Georgia, "Times New Roman", serif;
    }
    @bottom-right {
      content: ${cssQuoted(footerRight)};
      font-size: 8px;
      color: #5a6a60;
      font-family: Georgia, "Times New Roman", serif;
    }
  }
  body {
    margin: 0;
    color: var(--ink);
    background: var(--paper);
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
    font-size: 10.5px;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet { width: 100%; }
  .masthead {
    display: grid;
    grid-template-columns: 88px 1fr auto;
    gap: 16px;
    align-items: start;
    padding-bottom: 12px;
    border-bottom: 2px solid var(--accent);
  }
  .logo {
    width: 84px;
    height: auto;
    object-fit: contain;
    display: block;
  }
  .brand-name {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.01em;
    color: var(--accent);
  }
  .brand-sub {
    margin: 2px 0 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }
  .brand-meta {
    margin-top: 8px;
    color: var(--muted);
    font-size: 9.5px;
    line-height: 1.45;
  }
  .meta-panel {
    min-width: 210px;
    border: 1px solid var(--line);
    background: var(--band);
    padding: 10px 12px;
  }
  .meta-panel .label {
    display: block;
    font-size: 8.5px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 2px;
  }
  .meta-panel .value {
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .meta-panel .value:last-child { margin-bottom: 0; }
  .period-range {
    font-size: 12px;
    font-weight: 700;
  }
  .summary {
    margin: 14px 0 12px;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }
  .summary-card {
    border: 1px solid var(--line);
    background: var(--paper);
    padding: 8px 10px;
  }
  .summary-card .k {
    font-size: 8.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .summary-card .v {
    margin-top: 3px;
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  table.register {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  table.register thead { display: table-header-group; }
  table.register th,
  table.register td {
    border: 1px solid var(--line);
    padding: 6px 7px;
    vertical-align: top;
    word-wrap: break-word;
  }
  table.register th {
    background: var(--band-strong);
    color: var(--accent);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    text-align: left;
  }
  table.register td.num,
  table.register th.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.register td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 9.5px; }
  table.register tbody tr.alt td { background: #f7faf8; }
  .screen-footer {
    margin-top: 14px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 9px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .empty {
    margin: 24px 0;
    color: var(--muted);
    text-align: center;
  }
  @media print {
    .screen-footer { display: none; }
  }
</style>
</head>
<body>
<div class="sheet">
  <header class="masthead">
    <img class="logo" src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.logoAlt)}" width="84" height="50"/>
    <div>
      <h1 class="brand-name">${escapeHtml(branding.displayName)}</h1>
      <p class="brand-sub">${escapeHtml(branding.documentSubtitle)}</p>
      <div class="brand-meta">
        ${addressHtml}
        ${contactBits.length ? `<div style="margin-top:4px">${contactBits.join(' · ')}</div>` : ''}
        ${branding.tradeName && branding.tradeName !== branding.displayName
          ? `<div style="margin-top:2px">Trade name: ${escapeHtml(branding.tradeName)}</div>`
          : ''}
      </div>
    </div>
    <div class="meta-panel">
      <span class="label">Reporting period</span>
      <div class="value period-range">${escapeHtml(periodLabels.fromLabel)}<br/>to<br/>${escapeHtml(periodLabels.toLabel)}</div>
      <span class="label">Generated on</span>
      <div class="value">${escapeHtml(generated.date)}<br/>${escapeHtml(generated.time)}</div>
      <span class="label">Prepared by</span>
      <div class="value">${escapeHtml(branding.preparedBy)}</div>
    </div>
  </header>

  <section class="summary" aria-label="Register summary">
    ${summaryCards
      .map(
        ([k, v]) =>
          `<div class="summary-card"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`,
      )
      .join('')}
  </section>

  ${
    rows.length === 0
      ? `<p class="empty">No invoices in this reporting period.</p>`
      : `<table class="register">
    <thead>
      <tr>
        <th style="width:9%">Invoice #</th>
        <th style="width:8%">Date</th>
        <th style="width:14%">Customer</th>
        <th style="width:9%">Mobile</th>
        <th style="width:18%">Service</th>
        <th style="width:9%">Payment</th>
        <th class="num" style="width:9%">Taxable</th>
        <th class="num" style="width:7%">GST</th>
        <th class="num" style="width:9%">Total</th>
        <th style="width:8%">Status</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>`
  }

  <div class="screen-footer">
    <span>${escapeHtml(footerLeft)}</span>
    <span>${escapeHtml(footerRight)}</span>
  </div>
</div>
${
  autoPrint
    ? `<script>
  window.onload = function () {
    window.print();
  };
</script>`
    : ''
}
</body>
</html>`;
}

export async function buildInvoiceRegisterPdfHtml(input: {
  rows: InvoiceRegisterRow[];
  settings: SalonSettings | null;
  period: InvoiceRegisterPdfPeriod;
  generatedAt?: Date;
  autoPrint?: boolean;
}): Promise<string> {
  const branding = resolveInvoiceRegisterPdfBranding(input.settings);
  const payments = await loadInvoiceRegisterPaymentBreakdown(input.rows.map((r) => r.id));
  const summary = computeInvoiceRegisterPdfSummary(input.rows, payments);
  return renderInvoiceRegisterPdfHtml({
    rows: input.rows,
    branding,
    period: input.period,
    summary,
    generatedAt: input.generatedAt,
    autoPrint: input.autoPrint,
  });
}
