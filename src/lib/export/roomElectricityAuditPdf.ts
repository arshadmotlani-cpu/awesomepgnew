import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { RoomElectricityAuditView } from '@/src/lib/billing/buildRoomElectricityAuditView';
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
} from '@/src/lib/billing/financialDocumentPdf';

export function roomElectricityAuditPdfFilename(roomNumber: string, billingMonth: string): string {
  const month = billingMonth.slice(0, 7);
  return `${sanitizeFilenamePart(`electricity-audit-room-${roomNumber}-${month}`, 'electricity-audit')}.pdf`;
}

export async function exportRoomElectricityAuditPdf(input: {
  audit: RoomElectricityAuditView;
  pgName: string;
}): Promise<Uint8Array> {
  const { audit, pgName } = input;
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  let page = pdf.addPage([PDF_PAGE_W, PDF_PAGE_H]);
  let y = PDF_PAGE_H - PDF_MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < PDF_MARGIN) {
      page = pdf.addPage([PDF_PAGE_W, PDF_PAGE_H]);
      y = PDF_PAGE_H - PDF_MARGIN;
    }
  };

  page.drawText(sanitizeForPdf('Room Electricity Audit'), {
    x: PDF_MARGIN,
    y,
    size: 16,
    font: fonts.bold,
    color: PDF_TEXT,
  });
  y -= 24;

  const s = audit.roomSummary;
  y = drawPdfMuted({ page, y, text: `${pgName} · Room ${s.roomNumber}`, fonts });
  y = drawPdfMuted({
    page,
    y,
    text: `Period ${s.billingPeriodStart} to ${s.billingPeriodEnd}`,
    fonts,
  });
  y -= PDF_LINE_H;

  y = drawPdfHeading({ page, y, text: 'Room summary', fonts });
  y = drawPdfPair({ page, y, label: 'Meter', value: `${s.meterStartUnits} → ${s.meterEndUnits}`, fonts });
  y = drawPdfPair({
    page,
    y,
    label: 'Units / rate / gross',
    value: `${s.unitsConsumed} units @ ${formatInrPdf(s.ratePerUnitPaise)} = ${formatInrPdf(s.grossTotalPaise)}`,
    fonts,
  });
  y = drawPdfPair({ page, y, label: 'Residents', value: String(s.residentCount), fonts });
  y = drawPdfPair({
    page,
    y,
    label: 'Collection',
    value: `${formatInrPdf(s.collectedPaise)} collected · ${formatInrPdf(s.outstandingPaise)} outstanding (${s.collectionPercentage}%)`,
    fonts,
  });
  y = drawPdfPair({
    page,
    y,
    label: 'Reconciliation',
    value: audit.isBalanced
      ? 'Balanced'
      : `Gap ${formatInrPdf(audit.reconciliationGapPaise)}`,
    fonts,
  });
  y -= PDF_LINE_H;

  y = drawPdfHeading({ page, y, text: 'Resident breakdown', fonts });
  for (const row of audit.residentRows) {
    ensureSpace(PDF_LINE_H * 4);
    y = drawPdfMuted({
      page,
      y,
      text: `${row.customerName}${row.bedCode ? ` · ${row.bedCode}` : ''} · ${row.daysCharged}d (${row.occupancyPct}%)`,
      fonts,
    });
    y = drawPdfPair({
      page,
      y,
      label: 'Allocated / paid / due',
      value: `${formatInrPdf(row.amountAllocatedPaise)} / ${formatInrPdf(row.currentPaidPaise)} / ${formatInrPdf(row.currentOutstandingPaise)}`,
      fonts,
    });
    if (row.previousCollectedPaise > 0 || row.previousOutstandingPaise > 0) {
      y = drawPdfPair({
        page,
        y,
        label: 'Prior outstanding / collected',
        value: `${formatInrPdf(row.previousOutstandingPaise)} / ${formatInrPdf(row.previousCollectedPaise)}`,
        fonts,
      });
    }
  }

  return pdf.save();
}
