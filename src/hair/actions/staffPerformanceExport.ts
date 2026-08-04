'use server';

import { requirePermission } from '@/src/hair/lib/auth/permissions';
import {
  parseStaffPerformanceSearchParams,
  type StaffPerformancePeriodPreset,
  type StaffRevenueCategory,
} from '@/src/hair/lib/staffPerformancePeriod';
import { getStaffPerformanceCommandCenter } from '@/src/hair/services/staffPerformanceDashboard';
import {
  exportStaffPerformanceCsv,
  exportStaffPerformanceExcel,
  exportStaffPerformancePdfHtml,
} from '@/src/hair/services/staffPerformanceExport';

export type StaffPerformanceExportFormat = 'xlsx' | 'csv' | 'pdf';

export type ExportStaffPerformanceResult =
  | { ok: true; format: 'xlsx'; filename: string; base64: string }
  | { ok: true; format: 'csv'; filename: string; content: string }
  | { ok: true; format: 'pdf'; filename: string; content: string }
  | { ok: false; error: string };

export async function exportStaffPerformanceAction(input: {
  filters: {
    period?: string;
    from?: string;
    to?: string;
    staff?: string;
    category?: string;
  };
  format: StaffPerformanceExportFormat;
}): Promise<ExportStaffPerformanceResult> {
  try {
    await requirePermission('page:dashboard');
    const parsed = parseStaffPerformanceSearchParams(input.filters);
    const snapshot = await getStaffPerformanceCommandCenter({
      period: parsed.preset as StaffPerformancePeriodPreset,
      from: parsed.from,
      to: parsed.to,
      staffIds: parsed.staffIds,
      category: parsed.category as StaffRevenueCategory,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const base = `fyh-staff-performance-${stamp}`;

    if (input.format === 'xlsx') {
      const buf = await exportStaffPerformanceExcel(snapshot);
      return { ok: true, format: 'xlsx', filename: `${base}.xlsx`, base64: buf.toString('base64') };
    }
    if (input.format === 'csv') {
      return {
        ok: true,
        format: 'csv',
        filename: `${base}.csv`,
        content: exportStaffPerformanceCsv(snapshot),
      };
    }
    return {
      ok: true,
      format: 'pdf',
      filename: `${base}.html`,
      content: exportStaffPerformancePdfHtml(snapshot),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Export failed' };
  }
}
