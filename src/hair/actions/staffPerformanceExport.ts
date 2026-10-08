'use server';

import { requirePermission } from '@/src/hair/lib/auth/permissions';
import { parseStaffPerformanceSearchParams } from '@/src/hair/lib/staffPerformancePeriod';
import { getStaffPerformanceCommandCenter } from '@/src/hair/services/staffPerformanceDashboard';
import { getTenantContextForAction } from '@/src/hair/lib/tenant/getTenantContext';
import { getSalonSettings } from '@/src/hair/services/settings';
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
    from?: string;
    to?: string;
    staff?: string;
    category?: string;
    locations?: string;
  };
  format: StaffPerformanceExportFormat;
}): Promise<ExportStaffPerformanceResult> {
  try {
    await requirePermission('page:dashboard_staff');
    const ctx = await getTenantContextForAction();
    const settings = await getSalonSettings(ctx);
    const timezone = settings.timezone?.trim() || 'Asia/Kolkata';
    const parsed = parseStaffPerformanceSearchParams(input.filters, timezone);
    const snapshot = await getStaffPerformanceCommandCenter(
      {
        fromDayKey: parsed.fromDayKey,
        toDayKey: parsed.toDayKey,
        staffIds: parsed.staffIds,
        category: parsed.category,
        locationIds: parsed.locationIds,
      },
      ctx,
    );

    const base = `fyh-staff-performance-${parsed.fromDayKey}_to_${parsed.toDayKey}`;

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
