/**
 * Staff performance command-center exports (CSV / XLSX / print HTML).
 */

import ExcelJS from 'exceljs';
import { paiseToCsvRupees, rowsToCsv } from '@/src/hair/lib/export/csv';
import type { StaffPerformanceCommandCenterSnapshot } from '@/src/hair/services/staffPerformanceDashboard';

export type StaffPerformanceExportSheet = {
  name: string;
  headers: string[];
  rows: (string | number)[][];
};

function categoryRows(
  title: string,
  rows: StaffPerformanceCommandCenterSnapshot['serviceTable'],
): StaffPerformanceExportSheet {
  return {
    name: title,
    headers: [
      'Staff',
      'Revenue (₹)',
      'Units/Count',
      'Avg value (₹)',
      'Refunds (₹)',
      'Discount %',
      'Commission (₹)',
    ],
    rows: rows.map((r) => [
      r.name,
      paiseToCsvRupees(r.revenuePaise),
      r.unitsOrCount,
      paiseToCsvRupees(r.averageValuePaise),
      paiseToCsvRupees(r.refundsPaise),
      r.discountPct,
      paiseToCsvRupees(r.commissionPaise),
    ]),
  };
}

/** Pure builder — used by action + unit tests. */
export function buildStaffPerformanceExportSheets(
  snapshot: StaffPerformanceCommandCenterSnapshot,
): StaffPerformanceExportSheet[] {
  const leaderboard: StaffPerformanceExportSheet = {
    name: 'Leaderboard',
    headers: [
      'Rank',
      'Staff',
      'Revenue (₹)',
      'Customers',
      'Avg bill (₹)',
      'Services sold',
      'Products sold',
    ],
    rows: snapshot.leaderboard.map((r, i) => [
      i + 1,
      r.name,
      paiseToCsvRupees(r.revenuePaise),
      r.customersServed,
      paiseToCsvRupees(r.averageBillPaise),
      r.servicesSoldCount,
      r.productsSoldCount,
    ]),
  };

  return [
    leaderboard,
    categoryRows('Services', snapshot.serviceTable),
    categoryRows('Products', snapshot.productTable),
    categoryRows('Packages', snapshot.packageTable),
    categoryRows('Memberships', snapshot.membershipTable),
  ];
}

export function exportStaffPerformanceCsv(snapshot: StaffPerformanceCommandCenterSnapshot): string {
  const sheets = buildStaffPerformanceExportSheets(snapshot);
  const parts: string[] = [];
  for (const sheet of sheets) {
    parts.push(`# ${sheet.name}`);
    parts.push(rowsToCsv(sheet.headers, sheet.rows));
    parts.push('');
  }
  return parts.join('\n');
}

export async function exportStaffPerformanceExcel(
  snapshot: StaffPerformanceCommandCenterSnapshot, ctx?: TenantContext | null): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FYH';
  for (const sheet of buildStaffPerformanceExportSheets(snapshot)) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    ws.addRow(sheet.headers);
    ws.getRow(1).font = { bold: true };
    for (const row of sheet.rows) ws.addRow(row);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function exportStaffPerformancePdfHtml(
  snapshot: StaffPerformanceCommandCenterSnapshot,
): string {
  const sheets = buildStaffPerformanceExportSheets(snapshot);
  const sections = sheets
    .map((sheet) => {
      const head = sheet.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
      const body = sheet.rows
        .map(
          (row) =>
            `<tr>${row.map((c) => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`,
        )
        .join('');
      return `<h2>${escapeHtml(sheet.name)}</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Staff Performance · ${escapeHtml(snapshot.periodLabel)}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;color:#111;padding:24px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:24px 0 8px;text-transform:uppercase;letter-spacing:.06em}
  p{color:#555;margin:0 0 16px;font-size:13px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
  th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
  th{background:#f5f5f5}
  @media print{button{display:none}}
</style></head><body>
<button onclick="window.print()">Print / Save PDF</button>
<h1>Staff Performance · ${escapeHtml(snapshot.salonName)}</h1>
<p>${escapeHtml(snapshot.periodLabel)} · Combined ${escapeHtml(paiseToCsvRupees(snapshot.kpis.combinedRevenuePaise))} ₹</p>
${sections}
<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
