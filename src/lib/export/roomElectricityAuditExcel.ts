import ExcelJS from 'exceljs';
import type { RoomElectricityAuditView } from '@/src/lib/billing/buildRoomElectricityAuditView';
import type { ElectricityPaymentHistoryRow } from '@/src/services/electricityPaymentHistory';

function paiseToInr(paise: number): number {
  return paise / 100;
}

function formatDateLabel(iso: string): string {
  return iso.slice(0, 10);
}

export async function exportRoomElectricityAuditExcel(input: {
  audit: RoomElectricityAuditView;
  paymentHistory: ElectricityPaymentHistoryRow[];
  pgName: string;
}): Promise<Buffer> {
  const { audit, paymentHistory, pgName } = input;
  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet('Room Summary');
  const residents = wb.addWorksheet('Residents');
  const payments = wb.addWorksheet('Payment History');

  const s = audit.roomSummary;
  summary.addRow(['Room Electricity Audit']);
  summary.addRow(['PG', pgName]);
  summary.addRow(['Room', s.roomNumber]);
  summary.addRow(['Billing period', `${s.billingPeriodStart} to ${s.billingPeriodEnd}`]);
  summary.addRow(['Meter start', s.meterStartUnits]);
  summary.addRow(['Meter end', s.meterEndUnits]);
  summary.addRow(['Units consumed', s.unitsConsumed]);
  summary.addRow(['Rate per unit (INR)', paiseToInr(s.ratePerUnitPaise)]);
  summary.addRow(['Gross total (INR)', paiseToInr(s.grossTotalPaise)]);
  summary.addRow(['Residents', s.residentCount]);
  summary.addRow(['Generated', s.generatedAt ? formatDateLabel(s.generatedAt) : '']);
  summary.addRow(['Collected (INR)', paiseToInr(s.collectedPaise)]);
  summary.addRow(['Outstanding (INR)', paiseToInr(s.outstandingPaise)]);
  summary.addRow(['Collection %', s.collectionPercentage]);
  summary.addRow(['Reconciliation gap (INR)', paiseToInr(audit.reconciliationGapPaise)]);
  summary.addRow(['Balanced', audit.isBalanced ? 'Yes' : 'No']);
  summary.getColumn(1).width = 28;
  summary.getColumn(2).width = 24;

  residents.addRow([
    'Resident',
    'Bed',
    'Check-in',
    'Check-out',
    'Days',
    'Occupancy %',
    'Units',
    'Allocated (INR)',
    'Prev outstanding (INR)',
    'Prev collected (INR)',
    'Paid (INR)',
    'Outstanding (INR)',
    'Status',
    'Invoice',
  ]);
  residents.getRow(1).font = { bold: true };

  for (const row of audit.residentRows) {
    residents.addRow([
      row.customerName,
      row.bedCode ?? '',
      row.checkIn,
      row.checkOut ?? '',
      row.daysCharged,
      row.occupancyPct,
      row.unitsAllocated ?? '',
      paiseToInr(row.amountAllocatedPaise),
      paiseToInr(row.previousOutstandingPaise),
      paiseToInr(row.previousCollectedPaise),
      paiseToInr(row.currentPaidPaise),
      paiseToInr(row.currentOutstandingPaise),
      row.status,
      row.invoiceNumber ?? '',
    ]);
  }

  residents.columns.forEach((col) => {
    col.width = 16;
  });

  payments.addRow([
    'Date',
    'Resident',
    'Amount (INR)',
    'Invoice',
    'Mode',
    'Source',
    'Collected by',
    'Billing month',
  ]);
  payments.getRow(1).font = { bold: true };

  for (const row of paymentHistory) {
    payments.addRow([
      row.date,
      row.customerName,
      paiseToInr(row.amountPaise),
      row.invoiceNumber ?? '',
      row.paymentMode,
      row.source,
      row.collectedBy,
      row.billingMonth,
    ]);
  }

  payments.columns.forEach((col) => {
    col.width = 18;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function roomElectricityAuditExcelFilename(roomNumber: string, billingMonth: string): string {
  const month = billingMonth.slice(0, 7);
  return `electricity-audit-room-${roomNumber}-${month}.xlsx`;
}
