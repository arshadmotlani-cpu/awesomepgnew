/**
 * SSOT server-side invoice PDF — used by admin and resident download routes.
 * Data comes from InvoiceDocumentModel (invoiceDocumentModel.ts).
 */
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import type { InvoiceDocumentModel } from '@/src/lib/billing/invoiceDocumentModel';
import { titleCase } from '@/src/lib/format';

function formatInrPdf(paise: number): string {
  const amount = paise / 100;
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Standard PDF fonts only support WinAnsi — strip rupee and other unsupported glyphs. */
function sanitizeForPdf(text: string): string {
  return text
    .replace(/\u20b9/g, 'Rs.')
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE_H = 14;
const BRAND = rgb(1, 0.353, 0.122);
const TEXT = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.82, 0.82, 0.82);

const STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  partial: 'Partial',
  sent: 'Due',
  overdue: 'Overdue',
  draft: 'Due',
  payment_in_progress: 'Processing',
  processing: 'Processing',
  settled: 'Settled',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  expired: 'Expired',
};

export function invoicePdfFilename(invoiceNumber: string): string {
  const safe = invoiceNumber
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${safe || 'invoice'}.pdf`;
}

function monthLabel(billingMonth: string | null): string | null {
  if (!billingMonth) return null;
  const d = billingMonth.slice(0, 7);
  try {
    const [y, m] = d.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return billingMonth;
  }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i]!;
    }
  }
  lines.push(current);
  return lines;
}

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
};

class PdfWriter {
  private page: PDFPage;
  private y: number;

  constructor(
    private pdfDoc: PDFDocument,
    private fonts: Fonts,
    page?: PDFPage,
  ) {
    this.page = page ?? pdfDoc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  get regular(): PDFFont {
    return this.fonts.regular;
  }

  get bold(): PDFFont {
    return this.fonts.bold;
  }

  cursorY(): number {
    return this.y;
  }

  setCursorY(y: number): void {
    this.y = y;
  }

  moveDown(amount: number): void {
    this.y -= amount;
  }

  currentPage(): PDFPage {
    return this.page;
  }

  private ensureSpace(needed: number) {
    if (this.y - needed >= MARGIN) return;
    this.page = this.pdfDoc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  drawRule(gap = 10) {
    this.ensureSpace(gap + 4);
    this.y -= gap;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.75,
      color: RULE,
    });
    this.y -= 12;
  }

  drawHeading(text: string, size = 11) {
    this.ensureSpace(LINE_H + 4);
    this.page.drawText(sanitizeForPdf(text), {
      x: MARGIN,
      y: this.y,
      size,
      font: this.fonts.bold,
      color: TEXT,
    });
    this.y -= size + 6;
  }

  drawMuted(text: string, size = 9) {
    const lines = wrapText(sanitizeForPdf(text), this.fonts.regular, size, CONTENT_W);
    for (const line of lines) {
      this.ensureSpace(LINE_H);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y,
        size,
        font: this.fonts.regular,
        color: MUTED,
      });
      this.y -= LINE_H;
    }
  }

  drawLabelValue(label: string, value: string, opts?: { boldValue?: boolean }) {
    this.ensureSpace(LINE_H);
    this.page.drawText(sanitizeForPdf(label), {
      x: MARGIN,
      y: this.y,
      size: 9,
      font: this.fonts.regular,
      color: MUTED,
    });
    const valueFont = opts?.boldValue ? this.fonts.bold : this.fonts.regular;
    const safeValue = sanitizeForPdf(value);
    const valueWidth = valueFont.widthOfTextAtSize(safeValue, 9);
    this.page.drawText(safeValue, {
      x: PAGE_W - MARGIN - valueWidth,
      y: this.y,
      size: 9,
      font: valueFont,
      color: TEXT,
    });
    this.y -= LINE_H;
  }

  ensureLine(lines = 1) {
    this.ensureSpace(LINE_H * lines);
  }
}

export async function generateInvoicePdf(document: InvoiceDocumentModel): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { regular, bold };
  const w = new PdfWriter(pdfDoc, fonts);

  w.currentPage().drawText(sanitizeForPdf(document.letterhead.businessName), {
    x: MARGIN,
    y: w.cursorY(),
    size: 18,
    font: w.bold,
    color: BRAND,
  });
  const invNumWidth = w.bold.widthOfTextAtSize(document.invoiceNumber, 11);
  w.currentPage().drawText(sanitizeForPdf(document.invoiceNumber), {
    x: PAGE_W - MARGIN - invNumWidth,
    y: w.cursorY() + 2,
    size: 11,
    font: w.bold,
    color: TEXT,
  });
  w.moveDown(22);

  w.currentPage().drawText('TAX INVOICE', {
    x: PAGE_W - MARGIN - w.bold.widthOfTextAtSize('TAX INVOICE', 8),
    y: w.cursorY(),
    size: 8,
    font: w.bold,
    color: MUTED,
  });
  w.moveDown(14);

  w.drawMuted(document.letterhead.pgName, 11);
  for (const line of document.letterhead.addressLines) {
    w.drawMuted(line);
  }
  w.drawMuted(`GSTIN: ${document.letterhead.gstin}`);
  if (document.letterhead.contactPhone) w.drawMuted(`Phone: ${document.letterhead.contactPhone}`);
  if (document.letterhead.contactEmail) w.drawMuted(`Email: ${document.letterhead.contactEmail}`);

  w.drawRule(8);

  const statusLabel = STATUS_LABELS[document.status] ?? titleCase(document.status);
  const billingLabel = monthLabel(document.billingMonth);
  w.drawLabelValue('Invoice date', document.issuedAt);
  if (document.dueDate) w.drawLabelValue('Due date', document.dueDate);
  w.drawLabelValue('Invoice type', titleCase(document.invoiceType.replace(/_/g, ' ')));
  if (billingLabel) w.drawLabelValue('Billing month', billingLabel);
  w.drawLabelValue('Payment status', statusLabel, { boldValue: true });

  w.drawRule();

  w.drawHeading('Bill to');
  w.drawMuted(document.customerName, 11);
  w.drawMuted(`Phone: ${document.customerPhone}`);
  if (document.customerEmail) w.drawMuted(document.customerEmail);
  const location = [
    document.roomNumber ? `Room ${document.roomNumber}` : null,
    document.bedCode ? `Bed ${document.bedCode}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (location) w.drawMuted(location);
  if (document.bookingCode) w.drawMuted(`Booking ${document.bookingCode}`);

  if (document.stayDates) {
    w.moveDown(4);
    w.drawHeading('Stay');
    w.drawMuted(document.stayDates.displayLabel);
    if (document.stayDates.checkIn && document.stayDates.checkOut) {
      w.drawLabelValue('Check-in', document.stayDates.checkIn);
      w.drawLabelValue('Check-out', document.stayDates.checkOut);
    }
    if (document.stayDates.noticeNote) w.drawMuted(document.stayDates.noticeNote);
    if (document.stayDates.stayPeriodNote) w.drawMuted(document.stayDates.stayPeriodNote);
  }

  w.drawRule();

  w.drawHeading('Description');
  w.moveDown(2);
  w.currentPage().drawText('Item', {
    x: MARGIN,
    y: w.cursorY(),
    size: 8,
    font: w.bold,
    color: MUTED,
  });
  w.currentPage().drawText('Period', {
    x: MARGIN + 260,
    y: w.cursorY(),
    size: 8,
    font: w.bold,
    color: MUTED,
  });
  w.currentPage().drawText('Amount', {
    x: PAGE_W - MARGIN - w.bold.widthOfTextAtSize('Amount', 8),
    y: w.cursorY(),
    size: 8,
    font: w.bold,
    color: MUTED,
  });
  w.moveDown(12);
  w.drawRule(4);

  const items =
    document.lineItems.length > 0
      ? document.lineItems
      : [
          {
            kind: document.invoiceType,
            label: titleCase(document.invoiceType.replace(/_/g, ' ')),
            subtitle: null as string | null,
            period: billingLabel,
            amountPaise: document.totals.totalPaise,
          },
        ];

  for (const line of items) {
    w.ensureLine(2);
    w.currentPage().drawText(sanitizeForPdf(line.label), {
      x: MARGIN,
      y: w.cursorY(),
      size: 9,
      font: w.bold,
      color: TEXT,
    });
    const amt = formatInrPdf(line.amountPaise);
    w.currentPage().drawText(amt, {
      x: PAGE_W - MARGIN - w.regular.widthOfTextAtSize(amt, 9),
      y: w.cursorY(),
      size: 9,
      font: w.regular,
      color: TEXT,
    });
    w.moveDown(LINE_H);
    if (line.subtitle || line.period) {
      const sub = [line.subtitle, line.period].filter(Boolean).join(' · ');
      w.drawMuted(sub);
    }
    w.moveDown(2);
  }

  w.drawRule();
  w.drawHeading('Summary');
  w.drawLabelValue('Subtotal', formatInrPdf(document.totals.subtotalPaise));
  if (document.totals.lateFeePaise > 0) {
    w.drawLabelValue('Late fee', formatInrPdf(document.totals.lateFeePaise));
  }
  if (document.totals.discountPaise > 0) {
    const discLabel = document.totals.discountLabel
      ? `Discount (${document.totals.discountLabel})`
      : 'Discount';
    w.drawLabelValue(discLabel, `-${formatInrPdf(document.totals.discountPaise)}`);
  }
  if (document.totals.taxPaise != null && document.totals.taxPaise > 0) {
    w.drawLabelValue(document.totals.taxLabel ?? 'Tax', formatInrPdf(document.totals.taxPaise));
  }
  w.drawRule(6);
  w.drawLabelValue('Total', formatInrPdf(document.totals.totalPaise), { boldValue: true });
  if (document.totals.paidPaise > 0) {
    w.drawLabelValue('Amount paid', formatInrPdf(document.totals.paidPaise));
  }
  w.drawLabelValue('Balance due', formatInrPdf(document.totals.balanceDuePaise), { boldValue: true });

  const hasPayment =
    document.payment.paymentMode ||
    document.payment.paymentReference ||
    document.payment.paidAt ||
    document.status === 'paid';

  if (hasPayment) {
    w.drawRule();
    w.drawHeading('Payment');
    if (document.payment.paymentMode) {
      w.drawLabelValue('Payment method', document.payment.paymentMode);
    }
    if (document.payment.paidAt) {
      w.drawLabelValue('Payment date', document.payment.paidAt);
    }
    if (document.payment.collectedByName) {
      w.drawLabelValue('Collected by', document.payment.collectedByName);
    }
    if (document.payment.paymentReference) {
      w.drawLabelValue('Transaction reference', document.payment.paymentReference);
    }
    if (document.payment.paymentLinkUrl && document.totals.balanceDuePaise > 0) {
      w.moveDown(4);
      w.drawMuted('Pay via UPI:');
      w.drawMuted(document.payment.paymentLinkUrl);
    }
  }

  if (document.bookingPaymentSummary) {
    w.drawRule();
    w.drawHeading('Booking payment summary');
    w.drawLabelValue(
      'Booking payment received',
      formatInrPdf(document.bookingPaymentSummary.totalPaymentPaise),
    );
    for (const line of document.bookingPaymentSummary.allocationLines) {
      w.drawLabelValue(line.label, formatInrPdf(line.amountPaise));
    }
    w.drawLabelValue(
      'Total allocated',
      formatInrPdf(document.bookingPaymentSummary.totalAllocatedPaise),
      { boldValue: true },
    );
    if (document.bookingPaymentSummary.advanceRentCreditPaise > 0) {
      w.drawMuted(
        `Advance rent credit ${formatInrPdf(document.bookingPaymentSummary.advanceRentCreditPaise)} applies to future rent invoices.`,
      );
    }
    w.drawLabelValue(
      'Refundable deposit held',
      formatInrPdf(document.bookingPaymentSummary.currentDepositHeldPaise),
    );
  }

  w.drawRule(12);
  w.drawMuted(
    'This is a computer-generated tax invoice from Awesome PG. For billing queries, contact your PG office.',
  );
  if (document.notes) {
    w.moveDown(4);
    w.drawMuted(`Notes: ${document.notes}`);
  }
  if (document.cancellationReason) {
    w.drawMuted(`Cancellation reason: ${document.cancellationReason}`);
  }

  return pdfDoc.save();
}
