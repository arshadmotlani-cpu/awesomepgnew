'use server';

import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  exportRoomElectricityAuditExcel,
  roomElectricityAuditExcelFilename,
} from '@/src/lib/export/roomElectricityAuditExcel';
import {
  exportRoomElectricityAuditPdf,
  roomElectricityAuditPdfFilename,
} from '@/src/lib/export/roomElectricityAuditPdf';
import { loadRoomElectricityAuditBundle } from '@/src/services/roomElectricityAuditBundle';

export type ExportRoomElectricityAuditFormat = 'xlsx' | 'pdf';

export type ExportRoomElectricityAuditResult =
  | { ok: true; format: 'xlsx'; filename: string; base64: string }
  | { ok: true; format: 'pdf'; filename: string; base64: string }
  | { ok: false; error: string };

export async function exportRoomElectricityAuditAction(input: {
  billId: string;
  format: ExportRoomElectricityAuditFormat;
}): Promise<ExportRoomElectricityAuditResult> {
  try {
    await requireAdminPermission('electricity:write');
    const bundle = await loadRoomElectricityAuditBundle(input.billId);
    if (!bundle) {
      return { ok: false, error: 'Electricity bill not found.' };
    }

    const { audit, paymentHistory, pgName, billingMonth } = bundle;
    if (!audit) {
      return {
        ok: false,
        error:
          'Full electricity audit is incomplete for this bill (missing breakdown/ledger). Export unavailable until artifacts are present.',
      };
    }
    const roomNumber = audit.roomSummary.roomNumber;

    if (input.format === 'xlsx') {
      const buf = await exportRoomElectricityAuditExcel({ audit, paymentHistory, pgName });
      return {
        ok: true,
        format: 'xlsx',
        filename: roomElectricityAuditExcelFilename(roomNumber, billingMonth),
        base64: buf.toString('base64'),
      };
    }

    const pdfBytes = await exportRoomElectricityAuditPdf({ audit, pgName });
    return {
      ok: true,
      format: 'pdf',
      filename: roomElectricityAuditPdfFilename(roomNumber, billingMonth),
      base64: Buffer.from(pdfBytes).toString('base64'),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Export failed' };
  }
}
