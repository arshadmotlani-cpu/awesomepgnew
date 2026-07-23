import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { SettlementStatementDocumentModel } from '@/src/lib/vacating/settlementStatementModel';
import {
  drawPdfHeading,
  drawPdfMuted,
  drawPdfPair,
  drawPdfTopRightTitle,
  formatInrPdf,
  PDF_LINE_H,
  PDF_MARGIN,
  PDF_PAGE_H,
  PDF_PAGE_W,
  PDF_TEXT,
  sanitizeFilenamePart,
  sanitizeForPdf,
} from '@/src/lib/billing/financialDocumentPdf';

export function settlementStatementPdfFilename(statementNumber: string): string {
  return `${sanitizeFilenamePart(statementNumber, 'settlement-statement')}.pdf`;
}

export async function generateSettlementStatementPdf(
  document: SettlementStatementDocumentModel,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const page = pdf.addPage([PDF_PAGE_W, PDF_PAGE_H]);
  let y = PDF_PAGE_H - PDF_MARGIN;

  page.drawText(sanitizeForPdf(document.letterhead.businessName), {
    x: PDF_MARGIN,
    y,
    size: 16,
    font: fonts.bold,
    color: PDF_TEXT,
  });
  drawPdfTopRightTitle({ page, text: document.modeLabel, fonts });
  y -= 24;

  y = drawPdfMuted({ page, y, text: document.letterhead.pgName, fonts });
  for (const line of document.letterhead.addressLines) {
    y = drawPdfMuted({ page, y, text: line, fonts });
  }
  y -= PDF_LINE_H;
  y = drawPdfMuted({ page, y, text: `Statement ${document.statementNumber}`, fonts });
  y = drawPdfMuted({ page, y, text: `Issued ${document.issuedAt}`, fonts });
  y -= PDF_LINE_H;

  y = drawPdfHeading({ page, y, text: 'Resident', fonts });
  y = drawPdfMuted({
    page,
    y,
    text: `${document.customerName} · ${document.customerPhone}`,
    fonts,
  });
  y = drawPdfMuted({
    page,
    y,
    text: `Booking ${document.bookingCode} · Room ${document.roomNumber} · Bed ${document.bedCode}`,
    fonts,
  });
  y -= PDF_LINE_H;

  y = drawPdfHeading({ page, y, text: 'Summary', fonts });
  for (const metric of document.heroMetrics) {
    y = drawPdfPair({ page, y, label: metric.label, value: metric.value, fonts });
  }
  y -= PDF_LINE_H;

  y = drawPdfHeading({ page, y, text: document.rentSummary.title, fonts });
  for (const row of document.rentSummary.rows) {
    y = drawPdfPair({ page, y, label: row.label, value: row.value, fonts });
  }
  y -= PDF_LINE_H;

  y = drawPdfPair({
    page,
    y,
    label: document.refundTotalLabel,
    value: formatInrPdf(document.estimatedRefundPaise),
    fonts,
  });
  if (document.estimatedUnusedRentCreditPaise > 0) {
    y = drawPdfPair({
      page,
      y,
      label: 'Unused rent credit',
      value: formatInrPdf(document.estimatedUnusedRentCreditPaise),
      fonts,
    });
  }
  y -= PDF_LINE_H;
  y = drawPdfMuted({ page, y, text: document.disclaimer, fonts });

  return pdf.save();
}
