/**
 * Minimal payment receipt PDF stub — follows invoicePdf patterns where feasible.
 * Full branded layout can replace this without changing the service API.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type ReceiptPdfInput = {
  receiptNumber: string;
  customerName?: string | null;
  amountPaise: number;
  method: string;
  paidAt: Date;
  transactionRef?: string | null;
  pgName?: string | null;
};

function formatInrPdf(paise: number): string {
  const amount = paise / 100;
  return `Rs. ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function sanitizeForPdf(text: string): string {
  return text
    .replace(/\u20b9/g, 'Rs.')
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
}

export function receiptPdfFilename(receiptNumber: string): string {
  const safe = receiptNumber
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${safe || 'receipt'}.pdf`;
}

export async function generateReceiptPdf(input: ReceiptPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const brand = rgb(1, 0.353, 0.122);
  const text = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.42, 0.42, 0.42);

  let y = 780;
  page.drawText(sanitizeForPdf('Awesome PG'), { x: 48, y, size: 18, font: bold, color: brand });
  y -= 28;
  page.drawText(sanitizeForPdf('Payment Receipt'), { x: 48, y, size: 14, font: bold, color: text });
  y -= 32;

  const lines: Array<[string, string]> = [
    ['Receipt', input.receiptNumber],
    ['Customer', input.customerName ?? '—'],
    ['PG', input.pgName ?? '—'],
    ['Amount', formatInrPdf(input.amountPaise)],
    ['Method', input.method],
    ['Paid at', input.paidAt.toISOString()],
    ['Txn ref', input.transactionRef ?? '—'],
  ];

  for (const [label, value] of lines) {
    page.drawText(sanitizeForPdf(label), { x: 48, y, size: 10, font, color: muted });
    page.drawText(sanitizeForPdf(value), { x: 160, y, size: 10, font, color: text });
    y -= 18;
  }

  y -= 24;
  page.drawText(
    sanitizeForPdf('This is a system-generated receipt stub (Collections Phase 3).'),
    { x: 48, y, size: 9, font, color: muted },
  );

  return doc.save();
}
