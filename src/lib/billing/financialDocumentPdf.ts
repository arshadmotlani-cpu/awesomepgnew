import { rgb, type PDFFont } from 'pdf-lib';

export const PDF_PAGE_W = 595.28;
export const PDF_PAGE_H = 841.89;
export const PDF_MARGIN = 48;
export const PDF_CONTENT_W = PDF_PAGE_W - PDF_MARGIN * 2;
export const PDF_LINE_H = 14;

export const PDF_BRAND = rgb(1, 0.353, 0.122);
export const PDF_TEXT = rgb(0.12, 0.12, 0.12);
export const PDF_MUTED = rgb(0.42, 0.42, 0.42);
export const PDF_RULE = rgb(0.82, 0.82, 0.82);

export function formatInrPdf(paise: number): string {
  const amount = paise / 100;
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function sanitizeForPdf(text: string): string {
  return text
    .replace(/\u20b9/g, 'Rs.')
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
}

export function sanitizeFilenamePart(value: string, fallback: string): string {
  const safe = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe || fallback;
}

export type PdfFontPair = {
  regular: PDFFont;
  bold: PDFFont;
};

export function drawPdfPair(args: {
  page: { drawText: (text: string, opts: Record<string, unknown>) => void };
  y: number;
  label: string;
  value: string;
  fonts: PdfFontPair;
  labelX?: number;
  valueX?: number;
}): number {
  args.page.drawText(sanitizeForPdf(args.label), {
    x: args.labelX ?? PDF_MARGIN,
    y: args.y,
    size: 10,
    font: args.fonts.regular,
    color: PDF_MUTED,
  });
  args.page.drawText(sanitizeForPdf(args.value), {
    x: args.valueX ?? PDF_MARGIN + 220,
    y: args.y,
    size: 10,
    font: args.fonts.bold,
    color: PDF_TEXT,
  });
  return args.y - PDF_LINE_H;
}

export function drawPdfHeading(args: {
  page: { drawText: (text: string, opts: Record<string, unknown>) => void };
  y: number;
  text: string;
  fonts: PdfFontPair;
  size?: number;
}): number {
  const size = args.size ?? 11;
  args.page.drawText(sanitizeForPdf(args.text), {
    x: PDF_MARGIN,
    y: args.y,
    size,
    font: args.fonts.bold,
    color: PDF_TEXT,
  });
  return args.y - size - 6;
}

export function drawPdfMuted(args: {
  page: { drawText: (text: string, opts: Record<string, unknown>) => void };
  y: number;
  text: string;
  fonts: PdfFontPair;
}): number {
  args.page.drawText(sanitizeForPdf(args.text), {
    x: PDF_MARGIN,
    y: args.y,
    size: 10,
    font: args.fonts.regular,
    color: PDF_MUTED,
  });
  return args.y - PDF_LINE_H;
}

export function drawPdfTopRightTitle(args: {
  page: { drawText: (text: string, opts: Record<string, unknown>) => void };
  text: string;
  fonts: PdfFontPair;
  width?: number;
}): void {
  args.page.drawText(sanitizeForPdf(args.text), {
    x: PDF_PAGE_W - PDF_MARGIN - (args.width ?? 180),
    y: PDF_PAGE_H - PDF_MARGIN - 4,
    size: 11,
    font: args.fonts.bold,
    color: PDF_BRAND,
  });
}
