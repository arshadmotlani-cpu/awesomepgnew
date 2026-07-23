import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { SettlementStatementDocumentModel } from '@/src/lib/vacating/settlementStatementModel';

function formatInrPdf(paise: number): string {
  const amount = paise / 100;
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function sanitizeForPdf(text: string): string {
  return text
    .replace(/\u20b9/g, 'Rs.')
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
}

const PAGE_W = 595.28;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE_H = 14;
const BRAND = rgb(1, 0.353, 0.122);
const TEXT = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.42, 0.42, 0.42);

export function settlementStatementPdfFilename(statementNumber: string): string {
  const safe = statementNumber
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${safe || 'settlement-statement'}.pdf`;
}

class PdfWriter {
  private page;
  private y: number;
  private font: PDFFont;
  private fontBold: PDFFont;

  constructor(
    private doc: PDFDocument,
    font: PDFFont,
    fontBold: PDFFont,
  ) {
    this.font = font;
    this.fontBold = fontBold;
    this.page = doc.addPage([PAGE_W, 841.89]);
    this.y = 841.89 - MARGIN;
  }

  drawTitle(text: string, size = 16) {
    this.page.drawText(sanitizeForPdf(text), {
      x: MARGIN,
      y: this.y,
      size,
      font: this.fontBold,
      color: TEXT,
    });
    this.y -= size + 8;
  }

  drawMuted(text: string, size = 10) {
    this.page.drawText(sanitizeForPdf(text), {
      x: MARGIN,
      y: this.y,
      size,
      font: this.font,
      color: MUTED,
    });
    this.y -= LINE_H;
  }

  drawLine(text: string, size = 10, bold = false) {
    this.page.drawText(sanitizeForPdf(text), {
      x: MARGIN,
      y: this.y,
      size,
      font: bold ? this.fontBold : this.font,
      color: TEXT,
    });
    this.y -= LINE_H;
  }

  drawPair(label: string, value: string) {
    this.page.drawText(sanitizeForPdf(label), {
      x: MARGIN,
      y: this.y,
      size: 10,
      font: this.font,
      color: MUTED,
    });
    this.page.drawText(sanitizeForPdf(value), {
      x: MARGIN + 220,
      y: this.y,
      size: 10,
      font: this.fontBold,
      color: TEXT,
    });
    this.y -= LINE_H;
  }

  gap(n = 1) {
    this.y -= LINE_H * n;
  }

  drawTopRight(text: string, size = 11) {
    this.page.drawText(sanitizeForPdf(text), {
      x: PAGE_W - MARGIN - 180,
      y: 841.89 - MARGIN - 4,
      size,
      font: this.fontBold,
      color: BRAND,
    });
  }
}

export async function generateSettlementStatementPdf(
  document: SettlementStatementDocumentModel,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = new PdfWriter(pdf, font, fontBold);

  w.drawTitle(document.letterhead.businessName);
  w.drawLine(document.letterhead.pgName, 12, true);
  for (const line of document.letterhead.addressLines) w.drawMuted(line);
  w.gap();

  w.drawTopRight(document.modeLabel);
  w.drawLine(`Statement ${document.statementNumber}`, 10, true);
  w.drawMuted(`Issued ${document.issuedAt}`);
  w.gap(2);

  w.drawLine('Resident', 11, true);
  w.drawMuted(`${document.customerName} · ${document.customerPhone}`);
  w.drawMuted(`Booking ${document.bookingCode} · Room ${document.roomNumber} · Bed ${document.bedCode}`);
  w.gap();
  w.drawLine('Move-out dates', 11, true);
  w.drawPair('Notice given', document.noticeGivenDate);
  w.drawPair('Leaving date', document.vacatingDate);
  w.gap(2);

  w.drawLine('Summary', 11, true);
  for (const kpi of document.summaryKpis) {
    w.drawPair(kpi.label, kpi.value);
  }
  w.gap(2);

  w.drawLine('Calculation detail', 11, true);
  for (const line of document.lineItems) {
    w.drawPair(`${line.section} — ${line.label}`, line.amount);
    if (line.detail) w.drawMuted(`  ${line.detail}`);
  }
  w.gap(2);

  w.drawPair(
    document.mode === 'final' ? 'Final refund' : 'Estimated refund',
    formatInrPdf(document.estimatedRefundPaise),
  );
  w.gap();
  w.drawMuted(document.disclaimer);

  return pdf.save();
}
