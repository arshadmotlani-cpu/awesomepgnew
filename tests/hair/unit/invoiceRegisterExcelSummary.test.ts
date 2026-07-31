import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import {
  INR_EXCEL_NUM_FMT,
  appendInvoiceRegisterExcelSummary,
  computeRegisterSummaryTotals,
} from '@/src/hair/lib/export/invoiceRegisterExcelSummary';
import { exportInvoiceRegisterExcel } from '@/src/hair/services/invoiceRegisterExport';
import { exportHistoricalImportRegisters } from '@/src/hair/services/historicalImportExport';
import type { InvoiceRegisterRow } from '@/src/hair/services/invoiceRegisterQueries';

function sampleRegisterRows(): InvoiceRegisterRow[] {
  return [
    {
      id: '11111111-1111-1111-1111-111111111111',
      invoiceNumber: 'FYH-00001',
      invoiceDate: new Date('2026-04-15T10:00:00.000Z'),
      customerName: 'Customer A',
      mobile: '9876543210',
      servicesSummary: 'Haircut',
      paymentModes: 'UPI',
      taxablePaise: 100_000,
      gstPaise: 18_000,
      grandTotalPaise: 118_000,
      paidPaise: 118_000,
      status: 'paid',
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      invoiceNumber: 'FYH-00002',
      invoiceDate: new Date('2026-04-20T10:00:00.000Z'),
      customerName: 'Customer B',
      mobile: '9876543211',
      servicesSummary: 'Facial',
      paymentModes: 'Cash',
      taxablePaise: 200_000,
      gstPaise: 36_000,
      grandTotalPaise: 236_000,
      paidPaise: 236_000,
      status: 'paid',
    },
  ];
}

describe('appendInvoiceRegisterExcelSummary', () => {
  it('writes formula rows with bold labels, borders, and cached totals', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Test');
    sheet.addRow([
      'Invoice Number',
      '',
      '',
      '',
      '',
      '',
      'Taxable Amount',
      'GST',
      'Grand Total',
      'Paid Amount',
    ]);
    sheet.addRow(['FYH-1', '', '', '', '', '', 1000, 180, 1180, 1180]);
    sheet.addRow(['FYH-2', '', '', '', '', '', 2000, 360, 2360, 2360]);

    const cached = computeRegisterSummaryTotals([
      { taxable: 1000, gst: 180, grandTotal: 1180, paid: 1180 },
      { taxable: 2000, gst: 360, grandTotal: 2360, paid: 2360 },
    ]);

    const summaryStart = appendInvoiceRegisterExcelSummary(sheet, 2, 3, {
      invoiceNumberCol: 1,
      taxableCol: 7,
      gstCol: 8,
      grandTotalCol: 9,
      paidCol: 10,
    }, cached);

    assert.equal(summaryStart, 5);
    assert.equal(sheet.getRow(4).cellCount, 0);

    const labelCell = sheet.getCell('F5');
    assert.equal(labelCell.value, 'Total Invoices:');
    assert.equal(labelCell.font?.bold, true);
    assert.equal(labelCell.border?.top?.style, 'thin');

    const countCell = sheet.getCell('G5');
    const countVal = countCell.value as ExcelJS.CellFormulaValue;
    assert.equal(countVal.formula, 'COUNTA(A2:A3)');
    assert.equal(countVal.result, 2);

    const taxableCell = sheet.getCell('G6');
    const taxableVal = taxableCell.value as ExcelJS.CellFormulaValue;
    assert.equal(taxableVal.formula, 'SUM(G2:G3)');
    assert.equal(taxableVal.result, 3000);
    assert.equal(taxableCell.numFmt, INR_EXCEL_NUM_FMT);

    const gstCell = sheet.getCell('H7');
    const gstVal = gstCell.value as ExcelJS.CellFormulaValue;
    assert.equal(gstVal.formula, 'SUM(H2:H3)');
    assert.equal(gstVal.result, 540);

    const grandCell = sheet.getCell('I8');
    const grandVal = grandCell.value as ExcelJS.CellFormulaValue;
    assert.equal(grandVal.formula, 'SUM(I2:I3)');
    assert.equal(grandVal.result, 3540);

    const paidCell = sheet.getCell('J9');
    const paidVal = paidCell.value as ExcelJS.CellFormulaValue;
    assert.equal(paidVal.formula, 'SUM(J2:J3)');
    assert.equal(paidVal.result, 3540);
  });
});

describe('exportInvoiceRegisterExcel summary', () => {
  it('includes matching formula summary at the bottom', async () => {
    const rows = sampleRegisterRows();
    const expected = computeRegisterSummaryTotals(
      rows.map((r) => ({
        taxable: r.taxablePaise / 100,
        gst: r.gstPaise / 100,
        grandTotal: r.grandTotalPaise / 100,
        paid: r.paidPaise / 100,
      })),
    );

    const buf = await exportInvoiceRegisterExcel(rows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.getWorksheet('Invoice Register');
    assert.ok(sheet);

    const taxableSummary = sheet.getCell('G6').value as ExcelJS.CellFormulaValue;
    assert.equal(taxableSummary.formula, 'SUM(G2:G3)');
    assert.equal(taxableSummary.result, expected.taxable);
    assert.equal(sheet.getCell('F6').value, 'Total Taxable Amount:');
  });
});

describe('exportHistoricalImportRegisters monthly summary', () => {
  it('adds the same summary to each month file and combined register', async () => {
    const rows = [
      {
        invoiceId: 'a',
        invoiceNumber: 'FYH-A1',
        invoiceDate: '2026-04-10',
        customerName: 'A',
        mobileNumber: '9000000001',
        service: 'Cut',
        paymentMode: 'cash',
        amountInr: 100,
        gstInr: 18,
        grandTotalInr: 118,
        paidInr: 118,
        invoiceStatus: 'paid',
      },
      {
        invoiceId: 'b',
        invoiceNumber: 'FYH-M1',
        invoiceDate: '2026-05-12',
        customerName: 'B',
        mobileNumber: '9000000002',
        service: 'Color',
        paymentMode: 'upi',
        amountInr: 200,
        gstInr: 36,
        grandTotalInr: 236,
        paidInr: 236,
        invoiceStatus: 'paid',
      },
    ];

    const outputs = await exportHistoricalImportRegisters('batch-test', rows);
    assert.ok(outputs.has('April Invoice Register.xlsx'));
    assert.ok(outputs.has('May Invoice Register.xlsx'));
    assert.ok(outputs.has('Combined Invoice Register.xlsx'));

    const aprilWb = new ExcelJS.Workbook();
    await aprilWb.xlsx.load(outputs.get('April Invoice Register.xlsx')!);
    const april = aprilWb.getWorksheet('Invoices');
    assert.ok(april);
    const aprilGrand = april.getCell('I7').value as ExcelJS.CellFormulaValue;
    assert.equal(aprilGrand.formula, 'SUM(I2:I2)');
    assert.equal(aprilGrand.result, 118);

    const combinedWb = new ExcelJS.Workbook();
    await combinedWb.xlsx.load(outputs.get('Combined Invoice Register.xlsx')!);
    const combined = combinedWb.getWorksheet('All Invoices');
    assert.ok(combined);
    const combinedGrand = combined.getCell('I8').value as ExcelJS.CellFormulaValue;
    assert.equal(combinedGrand.formula, 'SUM(I2:I3)');
    assert.equal(combinedGrand.result, 354);
  });
});
