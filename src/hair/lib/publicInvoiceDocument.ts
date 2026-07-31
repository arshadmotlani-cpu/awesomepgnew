import { paiseToIndianWords } from '@/src/hair/lib/amountInWords';
import { escapeHtml } from '@/src/hair/lib/salonTime';
import type { InvoiceDetail } from '@/src/hair/services/invoices';
import type { FyhInvoiceStatus, FyhPaymentMethod } from '@/src/hair/db/schema/billing';
import type { FyhWhatsappSettings } from '@/src/hair/db/schema/settings';

const PAYMENT_LABELS: Record<FyhPaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank: 'Bank transfer',
  wallet: 'Wallet',
  gift_card: 'Gift card',
};

const STATUS_LABELS: Record<FyhInvoiceStatus, string> = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  partial: 'Partially paid',
  draft: 'Draft',
  void: 'Void',
  refunded: 'Refunded',
};

export type PublicInvoiceLineView = {
  name: string;
  qty: string;
  rateLabel: string;
  discountLabel: string;
  taxableLabel: string;
  gstLabel: string;
  gstPct: string;
  totalLabel: string;
};

export type PublicInvoiceViewModel = {
  businessName: string;
  businessAddress: string | null;
  businessPhone: string | null;
  gstin: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  status: FyhInvoiceStatus;
  statusLabel: string;
  customerName: string;
  customerPhone: string;
  customerCode: string | null;
  lines: PublicInvoiceLineView[];
  subtotalLabel: string;
  discountLabel: string;
  gstLabel: string;
  grandTotalLabel: string;
  paidLabel: string;
  balanceLabel: string;
  paymentModes: string;
  amountInWords: string;
  terms: string | null;
  showDiscount: boolean;
  showBalance: boolean;
};

function formatInrPlain(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(paise / 100);
}

function formatInvoiceDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, '');
}

function paymentModesFromDetail(payments: InvoiceDetail['payments']): string {
  const modes = [
    ...new Set(payments.map((p) => PAYMENT_LABELS[p.method as FyhPaymentMethod] ?? p.method)),
  ];
  return modes.join(', ') || '—';
}

function businessPhoneFromSettings(settings: FyhWhatsappSettings | null | undefined): string | null {
  const phone = settings?.businessPhone?.trim();
  return phone || null;
}

export function buildPublicInvoiceViewModel(detail: InvoiceDetail): PublicInvoiceViewModel {
  const {
    invoice,
    customerName,
    customerPhone,
    customerCode,
    businessName,
    businessAddress,
    gstin,
    whatsappSettings,
    invoiceNotes,
    lines,
    payments,
  } = detail;

  const money = formatInrPlain;
  const balancePaise = Math.max(0, invoice.grandTotalPaise - invoice.amountPaidPaise);

  return {
    businessName: businessName ?? 'For Your Hair',
    businessAddress: businessAddress ?? null,
    businessPhone: businessPhoneFromSettings(whatsappSettings),
    gstin: gstin ?? null,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: formatInvoiceDate(invoice.createdAt),
    status: invoice.status,
    statusLabel: STATUS_LABELS[invoice.status] ?? invoice.status,
    customerName,
    customerPhone,
    customerCode: customerCode ?? null,
    lines: lines.map((line) => {
      const qty = Number(line.quantity);
      const gross = line.unitPricePaise * qty;
      const taxable = Math.max(0, gross - line.discountPaise);
      const gstPct = (line.gstBps / 100).toFixed(line.gstBps % 100 === 0 ? 0 : 1);
      return {
        name: line.nameSnapshot,
        qty: formatQty(qty),
        rateLabel: money(line.unitPricePaise),
        discountLabel: line.discountPaise > 0 ? money(line.discountPaise) : '—',
        taxableLabel: money(taxable),
        gstLabel: money(line.taxPaise),
        gstPct: `${gstPct}%`,
        totalLabel: money(line.lineTotalPaise),
      };
    }),
    subtotalLabel: money(invoice.subtotalPaise),
    discountLabel: money(invoice.discountPaise),
    gstLabel: money(invoice.taxPaise),
    grandTotalLabel: money(invoice.grandTotalPaise),
    paidLabel: money(invoice.amountPaidPaise),
    balanceLabel: money(balancePaise),
    paymentModes: paymentModesFromDetail(payments),
    amountInWords: paiseToIndianWords(invoice.grandTotalPaise),
    terms: invoiceNotes?.trim() || null,
    showDiscount: invoice.discountPaise > 0,
    showBalance: balancePaise > 0,
  };
}

/** Shared stylesheet — used by on-screen page and print/download HTML. */
export const PUBLIC_INVOICE_STYLES = `
:root {
  --fyh-ink: #14261c;
  --fyh-muted: #5c6b62;
  --fyh-border: #d9e2db;
  --fyh-gold: #b8954a;
  --fyh-gold-soft: #f4efe4;
  --fyh-paper: #ffffff;
  --fyh-canvas: #f3f1ec;
}

*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
}

.fyh-invoice-body {
  font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--fyh-ink);
  background: var(--fyh-canvas);
  -webkit-font-smoothing: antialiased;
  line-height: 1.45;
  min-height: 100vh;
}

.fyh-invoice-page {
  min-height: 100vh;
  padding: 24px 16px 48px;
}

.fyh-invoice-toolbar {
  max-width: 210mm;
  margin: 0 auto 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.fyh-invoice-btn {
  appearance: none;
  border: 1px solid var(--fyh-border);
  background: var(--fyh-paper);
  color: var(--fyh-ink);
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.fyh-invoice-btn:hover {
  border-color: var(--fyh-gold);
  box-shadow: 0 2px 8px rgba(20, 38, 28, 0.06);
}

.fyh-invoice-sheet {
  width: 210mm;
  max-width: 100%;
  min-height: 297mm;
  margin: 0 auto;
  background: var(--fyh-paper);
  border: 1px solid var(--fyh-border);
  border-radius: 4px;
  box-shadow: 0 8px 32px rgba(20, 38, 28, 0.08);
  padding: 14mm 16mm 12mm;
  position: relative;
}

.fyh-invoice-sheet::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, #5b21b6 0%, var(--fyh-gold) 100%);
  border-radius: 4px 4px 0 0;
}

.fyh-invoice-header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--fyh-border);
  margin-bottom: 18px;
}

.fyh-invoice-brand {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  min-width: 0;
}

.fyh-invoice-logo {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 12px;
}

.fyh-invoice-brand-name {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--fyh-ink);
}

.fyh-invoice-brand-meta {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--fyh-muted);
  white-space: pre-line;
}

.fyh-invoice-brand-meta strong {
  color: var(--fyh-ink);
  font-weight: 600;
}

.fyh-invoice-title-block {
  text-align: right;
  flex-shrink: 0;
}

.fyh-invoice-doc-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--fyh-ink);
}

.fyh-invoice-status {
  display: inline-block;
  margin-top: 10px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.fyh-invoice-status--paid { background: #dcfce7; color: #166534; }
.fyh-invoice-status--unpaid { background: #fef3c7; color: #92400e; }
.fyh-invoice-status--partial { background: #fef3c7; color: #92400e; }
.fyh-invoice-status--void,
.fyh-invoice-status--refunded { background: #f1f5f9; color: #64748b; }
.fyh-invoice-status--draft { background: #e2e8f0; color: #475569; }

.fyh-invoice-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.fyh-invoice-meta-block h2 {
  margin: 0 0 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--fyh-muted);
}

.fyh-invoice-meta-block p {
  margin: 0;
  font-size: 13px;
  color: var(--fyh-ink);
}

.fyh-invoice-meta-block .muted {
  color: var(--fyh-muted);
  font-size: 12px;
  margin-top: 2px;
}

.fyh-invoice-meta-block .highlight {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.fyh-invoice-table-wrap {
  overflow-x: auto;
  margin-bottom: 18px;
}

.fyh-invoice-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.fyh-invoice-table thead th {
  padding: 10px 8px;
  text-align: left;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fyh-muted);
  background: var(--fyh-gold-soft);
  border-bottom: 1px solid var(--fyh-border);
}

.fyh-invoice-table thead th.num { text-align: right; }

.fyh-invoice-table tbody td {
  padding: 10px 8px;
  border-bottom: 1px solid #eef2ef;
  vertical-align: top;
}

.fyh-invoice-table tbody td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.fyh-invoice-table tbody td.service {
  font-weight: 500;
  min-width: 120px;
}

.fyh-invoice-table tbody tr:last-child td {
  border-bottom: 1px solid var(--fyh-border);
}

.fyh-invoice-summary {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
}

.fyh-invoice-totals {
  width: min(100%, 280px);
  font-size: 13px;
}

.fyh-invoice-totals-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 5px 0;
  color: var(--fyh-muted);
}

.fyh-invoice-totals-row span:last-child {
  font-variant-numeric: tabular-nums;
  color: var(--fyh-ink);
  font-weight: 500;
}

.fyh-invoice-totals-row.grand {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 2px solid var(--fyh-ink);
  font-size: 16px;
  font-weight: 700;
  color: var(--fyh-ink);
}

.fyh-invoice-totals-row.grand span:last-child {
  font-weight: 700;
}

.fyh-invoice-totals-row.balance span:last-child {
  color: #b45309;
  font-weight: 700;
}

.fyh-invoice-words {
  margin: 0 0 16px;
  padding: 12px 14px;
  background: var(--fyh-gold-soft);
  border-left: 3px solid var(--fyh-gold);
  font-size: 12px;
  font-style: italic;
  color: #334155;
}

.fyh-invoice-payment {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin-bottom: 24px;
  font-size: 12px;
}

.fyh-invoice-payment dt {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fyh-muted);
  margin: 0 0 4px;
}

.fyh-invoice-payment dd {
  margin: 0;
  font-weight: 600;
  color: var(--fyh-ink);
}

.fyh-invoice-footer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 24px;
  align-items: end;
  padding-top: 16px;
  border-top: 1px solid var(--fyh-border);
}

.fyh-invoice-thanks {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--fyh-ink);
}

.fyh-invoice-terms {
  margin: 0;
  font-size: 11px;
  color: var(--fyh-muted);
  max-width: 360px;
  white-space: pre-line;
}

.fyh-invoice-signatures {
  display: flex;
  gap: 32px;
  align-items: flex-end;
}

.fyh-invoice-signature {
  text-align: center;
  min-width: 120px;
}

.fyh-invoice-signature-line {
  width: 140px;
  border-top: 1px solid var(--fyh-ink);
  margin: 0 auto 6px;
  padding-top: 40px;
}

.fyh-invoice-signature-label {
  font-size: 10px;
  color: var(--fyh-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.fyh-invoice-qr {
  width: 72px;
  height: 72px;
  border: 1.5px dashed var(--fyh-border);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: var(--fyh-muted);
  text-align: center;
  padding: 4px;
  line-height: 1.3;
}

@media (max-width: 640px) {
  .fyh-invoice-header { flex-direction: column; }
  .fyh-invoice-title-block { text-align: left; }
  .fyh-invoice-meta { grid-template-columns: 1fr; }
  .fyh-invoice-footer { grid-template-columns: 1fr; }
  .fyh-invoice-signatures { justify-content: space-between; }
}

@media print {
  @page { size: A4; margin: 10mm; }

  .fyh-invoice-body,
  body.fyh-invoice-body {
    background: #fff;
  }

  .fyh-invoice-page {
    padding: 0;
    min-height: auto;
  }

  .fyh-invoice-toolbar {
    display: none !important;
  }

  .fyh-invoice-sheet {
    width: 100%;
    min-height: auto;
    border: none;
    border-radius: 0;
    box-shadow: none;
    padding: 0;
  }

  .fyh-invoice-sheet::before {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  .fyh-invoice-table thead th,
  .fyh-invoice-words,
  .fyh-invoice-status {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
`;

function statusClass(status: FyhInvoiceStatus): string {
  return `fyh-invoice-status fyh-invoice-status--${status}`;
}

function renderInvoiceSheetHtml(vm: PublicInvoiceViewModel): string {
  const contactParts = [
    vm.businessPhone ? `Tel: ${escapeHtml(vm.businessPhone)}` : '',
    vm.gstin ? `GSTIN: ${escapeHtml(vm.gstin)}` : '',
  ].filter(Boolean);

  const lineRows = vm.lines
    .map(
      (line) => `<tr>
        <td class="service">${escapeHtml(line.name)}</td>
        <td class="num">${escapeHtml(line.qty)}</td>
        <td class="num">${escapeHtml(line.rateLabel)}</td>
        <td class="num">${escapeHtml(line.discountLabel)}</td>
        <td class="num">${escapeHtml(line.taxableLabel)}</td>
        <td class="num">${escapeHtml(line.gstLabel)}<br/><span style="color:#5c6b62;font-size:10px">${escapeHtml(line.gstPct)}</span></td>
        <td class="num">${escapeHtml(line.totalLabel)}</td>
      </tr>`,
    )
    .join('');

  const discountRow = vm.showDiscount
    ? `<div class="fyh-invoice-totals-row"><span>Discount</span><span>− ${escapeHtml(vm.discountLabel)}</span></div>`
    : '';

  const balanceRow = vm.showBalance
    ? `<div class="fyh-invoice-totals-row balance"><span>Balance due</span><span>${escapeHtml(vm.balanceLabel)}</span></div>`
    : '';

  const customerIdRow = vm.customerCode
    ? `<p class="muted">Customer ID: ${escapeHtml(vm.customerCode)}</p>`
    : '';

  const termsBlock = vm.terms
    ? `<p class="fyh-invoice-terms">${escapeHtml(vm.terms)}</p>`
    : '';

  return `<article class="fyh-invoice-sheet">
  <header class="fyh-invoice-header">
    <div class="fyh-invoice-brand">
      <img class="fyh-invoice-logo" src="/fyh/mark-filled.svg" alt="" width="52" height="52"/>
      <div>
        <h1 class="fyh-invoice-brand-name">${escapeHtml(vm.businessName)}</h1>
        <p class="fyh-invoice-brand-meta">${vm.businessAddress ? escapeHtml(vm.businessAddress) : ''}${contactParts.length ? `${vm.businessAddress ? '<br/>' : ''}${contactParts.join('<br/>')}` : ''}</p>
      </div>
    </div>
    <div class="fyh-invoice-title-block">
      <p class="fyh-invoice-doc-title">TAX INVOICE</p>
      <span class="${statusClass(vm.status)}">${escapeHtml(vm.statusLabel)}</span>
    </div>
  </header>

  <section class="fyh-invoice-meta">
    <div class="fyh-invoice-meta-block">
      <h2>Invoice details</h2>
      <p class="highlight">${escapeHtml(vm.invoiceNumber)}</p>
      <p class="muted">Date: ${escapeHtml(vm.invoiceDate)}</p>
    </div>
    <div class="fyh-invoice-meta-block">
      <h2>Bill to</h2>
      <p class="highlight">${escapeHtml(vm.customerName)}</p>
      <p class="muted">${escapeHtml(vm.customerPhone)}</p>
      ${customerIdRow}
    </div>
  </section>

  <div class="fyh-invoice-table-wrap">
    <table class="fyh-invoice-table">
      <thead>
        <tr>
          <th>Service</th>
          <th class="num">Qty</th>
          <th class="num">Rate</th>
          <th class="num">Discount</th>
          <th class="num">Taxable</th>
          <th class="num">GST</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>
  </div>

  <section class="fyh-invoice-summary">
    <div class="fyh-invoice-totals">
      <div class="fyh-invoice-totals-row"><span>Subtotal</span><span>${escapeHtml(vm.subtotalLabel)}</span></div>
      ${discountRow}
      <div class="fyh-invoice-totals-row"><span>GST</span><span>${escapeHtml(vm.gstLabel)}</span></div>
      <div class="fyh-invoice-totals-row grand"><span>Grand total</span><span>${escapeHtml(vm.grandTotalLabel)}</span></div>
      <div class="fyh-invoice-totals-row"><span>Paid</span><span>${escapeHtml(vm.paidLabel)}</span></div>
      ${balanceRow}
    </div>
  </section>

  <p class="fyh-invoice-words">${escapeHtml(vm.amountInWords)}</p>

  <dl class="fyh-invoice-payment">
    <div><dt>Payment method</dt><dd>${escapeHtml(vm.paymentModes)}</dd></div>
  </dl>

  <footer class="fyh-invoice-footer">
    <div>
      <p class="fyh-invoice-thanks">Thank you for choosing ${escapeHtml(vm.businessName)}.</p>
      ${termsBlock}
    </div>
    <div class="fyh-invoice-signatures">
      <div class="fyh-invoice-signature">
        <div class="fyh-invoice-signature-line"></div>
        <p class="fyh-invoice-signature-label">Authorized signatory</p>
      </div>
      <div class="fyh-invoice-qr" aria-hidden="true">QR<br/>coming soon</div>
    </div>
  </footer>
</article>`;
}

/** Full HTML document for print route and download. */
export function buildPublicInvoiceDocumentHtml(detail: InvoiceDetail): string {
  const vm = buildPublicInvoiceViewModel(detail);
  const sheet = renderInvoiceSheetHtml(vm);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex, nofollow"/>
  <title>${escapeHtml(vm.invoiceNumber)} — ${escapeHtml(vm.businessName)}</title>
  <style>${PUBLIC_INVOICE_STYLES}</style>
</head>
<body class="fyh-invoice-body">
  <div class="fyh-invoice-page">${sheet}</div>
</body>
</html>`;
}

/** Sheet markup only — for embedding in React page with shared CSS. */
export function renderPublicInvoiceSheetHtml(detail: InvoiceDetail): string {
  return renderInvoiceSheetHtml(buildPublicInvoiceViewModel(detail));
}
