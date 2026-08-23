import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import { setExcelHyperlinkCell } from '@/src/hair/lib/export/excelHyperlink';
import {
  FYH_PUBLIC_HOST,
  invoicePublicViewUrl,
} from '@/src/hair/lib/invoicePublicLinks';
import { exportInvoiceRegisterExcel } from '@/src/hair/services/invoiceRegisterExport';
import type { InvoiceRegisterRow } from '@/src/hair/services/invoiceRegisterQueries';

describe('invoicePublicViewUrl', () => {
  it('uses public /i/{invoiceNumber} path without auth billing UUID', () => {
    const url = invoicePublicViewUrl('11111111-1111-1111-1111-111111111111');
    assert.match(url, /^https:\/\//);
    assert.ok(url.includes('/i/11111111-1111-1111-1111-111111111111'));
    assert.ok(!url.includes('/billing/'));
  });
});

describe('exportInvoiceRegisterExcel hyperlinks', () => {
  it('writes a clickable View Invoice hyperlink column only', async () => {
    const rows: InvoiceRegisterRow[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        invoiceNumber: 'FYH-00099',
        publicAccessToken: '11111111-1111-1111-1111-111111111111',
        invoiceDate: new Date('2026-04-15T10:00:00.000Z'),
        customerName: 'Test Customer',
        mobile: '9876543210',
        servicesSummary: 'Haircut',
        paymentModes: 'UPI',
        taxablePaise: 100000,
        gstPaise: 18000,
        grandTotalPaise: 118000,
        paidPaise: 118000,
        status: 'paid',
      },
    ];

    const buf = await exportInvoiceRegisterExcel(rows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.getWorksheet('Invoice Register');
    assert.ok(sheet);

    const headerRow = sheet.getRow(1);
    assert.equal(headerRow.getCell(12).value, 'View Invoice');
    assert.equal(headerRow.getCell(13).value, null);

    const cell = sheet.getCell(2, 12);
    const value = cell.value as ExcelJS.CellHyperlinkValue;
    assert.equal(value.text, 'View Invoice');
    const expected = invoicePublicViewUrl(rows[0]!.publicAccessToken);
    assert.equal(value.hyperlink, expected);
    assert.match(value.hyperlink, /^https:\/\/.+\/i\/11111111-1111-1111-1111-111111111111$/);

    if (!process.env.FYH_APP_URL && !process.env.NEXT_PUBLIC_APP_URL) {
      assert.ok(expected.startsWith(FYH_PUBLIC_HOST));
    }
  });

  it('setExcelHyperlinkCell rejects relative URLs', () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('t');
    const cell = sheet.getCell('A1');
    assert.throws(
      () => setExcelHyperlinkCell(cell, 'View', '/billing/x'),
      /absolute URL/,
    );
  });
});
