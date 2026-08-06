import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  drawPdfHeading,
  drawPdfMuted,
  drawPdfPair,
  formatInrPdf,
  PDF_LINE_H,
  PDF_MARGIN,
  PDF_PAGE_H,
  PDF_PAGE_W,
  PDF_TEXT,
  sanitizeFilenamePart,
  sanitizeForPdf,
  type PdfFontPair,
} from '@/src/lib/billing/financialDocumentPdf';
import type { VendorStatement } from '@/src/hair/services/vendorBrain';

export function vendorStatementPdfFilename(vendorName: string, from: string, to: string): string {
  const part = sanitizeFilenamePart(vendorName, 'vendor');
  return `${part}-statement-${from}-to-${to}.pdf`;
}

function typeLabel(type: string): string {
  switch (type) {
    case 'opening':
      return 'Opening';
    case 'purchase':
      return 'Purchase';
    case 'payment':
      return 'Payment';
    case 'return':
      return 'Return';
    default:
      return type;
  }
}

export async function generateVendorStatementPdf(statement: VendorStatement): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts: PdfFontPair = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  let page = pdf.addPage([PDF_PAGE_W, PDF_PAGE_H]);
  let y = PDF_PAGE_H - PDF_MARGIN;

  page.drawText(sanitizeForPdf('Vendor Statement'), {
    x: PDF_MARGIN,
    y,
    size: 16,
    font: fonts.bold,
    color: PDF_TEXT,
  });
  y -= 22;
  y = drawPdfMuted({ page, y, text: statement.vendor.name, fonts });
  y = drawPdfMuted({ page, y, text: `Period: ${statement.from} to ${statement.to}`, fonts });
  y -= PDF_LINE_H;

  y = drawPdfHeading({ page, y, text: 'Summary', fonts });
  y = drawPdfPair({ page, y, label: 'Opening balance', value: formatInrPdf(statement.openingBalancePaise), fonts });
  y = drawPdfPair({ page, y, label: 'Purchases', value: formatInrPdf(statement.periodTotals.purchasesPaise), fonts });
  y = drawPdfPair({ page, y, label: 'Payments', value: formatInrPdf(statement.periodTotals.paymentsPaise), fonts });
  y = drawPdfPair({ page, y, label: 'Returns', value: formatInrPdf(statement.periodTotals.returnsPaise), fonts });
  y = drawPdfPair({ page, y, label: 'Closing balance', value: formatInrPdf(statement.closingBalancePaise), fonts });
  y -= PDF_LINE_H;

  y = drawPdfHeading({ page, y, text: 'Transactions', fonts });
  y -= 4;

  for (const line of statement.lines) {
    if (y < PDF_MARGIN + 40) {
      page = pdf.addPage([PDF_PAGE_W, PDF_PAGE_H]);
      y = PDF_PAGE_H - PDF_MARGIN;
    }
    const row = `${line.date}  ${typeLabel(line.type)}  ${line.reference}`;
    page.drawText(sanitizeForPdf(row.slice(0, 72)), {
      x: PDF_MARGIN,
      y,
      size: 9,
      font: fonts.regular,
      color: PDF_TEXT,
    });
    const debit = line.debitPaise > 0 ? formatInrPdf(line.debitPaise) : '';
    const credit = line.creditPaise > 0 ? formatInrPdf(line.creditPaise) : '';
    page.drawText(sanitizeForPdf(debit), {
      x: PDF_MARGIN + 300,
      y,
      size: 9,
      font: fonts.regular,
      color: PDF_TEXT,
    });
    page.drawText(sanitizeForPdf(credit), {
      x: PDF_MARGIN + 380,
      y,
      size: 9,
      font: fonts.regular,
      color: PDF_TEXT,
    });
    page.drawText(sanitizeForPdf(formatInrPdf(line.balancePaise)), {
      x: PDF_MARGIN + 460,
      y,
      size: 9,
      font: fonts.bold,
      color: PDF_TEXT,
    });
    y -= PDF_LINE_H;
  }

  return pdf.save();
}
