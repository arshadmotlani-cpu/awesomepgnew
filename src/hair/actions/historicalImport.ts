'use server';

import { requireSuperAdmin } from '@/src/hair/lib/auth/guards';
import {
  getHistoricalImportBatch,
  importHistoricalSales,
  previewHistoricalSales,
} from '@/src/hair/services/historicalImport';
import { exportHistoricalImportBatchXlsx } from '@/src/hair/services/historicalImportExport';
import type { HistoricalImportSummary } from '@/src/hair/db/schema';

export type HistoricalImportActionState = {
  error?: string;
  success?: string;
  summary?: HistoricalImportSummary;
  batchId?: string;
  skippedExistingBatch?: boolean;
};

async function fileBuffer(formData: FormData): Promise<{ fileName: string; buffer: Buffer } | null> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return null;
  const arrayBuffer = await file.arrayBuffer();
  return { fileName: file.name, buffer: Buffer.from(arrayBuffer) };
}

export async function previewHistoricalImportAction(
  _prev: HistoricalImportActionState,
  formData: FormData,
): Promise<HistoricalImportActionState> {
  try {
    await requireSuperAdmin();
    const file = await fileBuffer(formData);
    if (!file) return { error: 'Select an Excel file (.xlsx)' };

    const parsed = await previewHistoricalSales(file.buffer);
    const summary: HistoricalImportSummary = {
      totalRows: parsed.rows.length,
      imported: parsed.rows.length,
      skipped: 0,
      failed: parsed.parseErrors.length,
      totalRevenuePaise: parsed.rows.reduce((s, r) => s + r.amountPaise, 0),
      totalGstPaise: 0,
      failedRows: parsed.parseErrors.map((e) => ({
        rowNumber: e.rowNumber,
        reason: e.reason,
      })),
    };

    return {
      success: `Preview: ${parsed.rows.length} row(s) ready to import`,
      summary,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Preview failed' };
  }
}

export async function runHistoricalImportAction(
  _prev: HistoricalImportActionState,
  formData: FormData,
): Promise<HistoricalImportActionState> {
  try {
    const admin = await requireSuperAdmin();
    const file = await fileBuffer(formData);
    if (!file) return { error: 'Select an Excel file (.xlsx)' };

    const force = formData.get('force') === 'true';
    const result = await importHistoricalSales({
      fileName: file.fileName,
      buffer: file.buffer,
      uploadedByAdminId: admin.id,
      force,
    });

    if (result.skippedExistingBatch) {
      return {
        success: 'This file was already imported (same checksum). No new invoices created.',
        summary: result.summary,
        batchId: result.batchId ?? undefined,
        skippedExistingBatch: true,
      };
    }

    if (result.validationFailed) {
      return {
        error: 'Import aborted: Excel validation failed. See summary for details.',
        summary: result.summary,
      };
    }

    return {
      success: `Import complete: ${result.summary.imported} imported, ${result.summary.skipped} skipped, ${result.summary.failed} failed`,
      summary: result.summary,
      batchId: result.batchId ?? undefined,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Import failed' };
  }
}

export async function exportHistoricalImportBatchAction(batchId: string): Promise<{
  ok: boolean;
  error?: string;
  base64?: string;
  fileName?: string;
}> {
  try {
    await requireSuperAdmin();
    const batch = await getHistoricalImportBatch(batchId);
    if (!batch) return { ok: false, error: 'Import batch not found' };
    const buffer = await exportHistoricalImportBatchXlsx(batchId);
    return {
      ok: true,
      base64: buffer.toString('base64'),
      fileName: `historical-import-${batchId.slice(0, 8)}.xlsx`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Export failed' };
  }
}
