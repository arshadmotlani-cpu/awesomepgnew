/**
 * Generate historical sales import template files.
 * Usage: npx tsx scripts/generate-historical-import-template.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

const headers = [
  'row_id',
  'transaction_date',
  'customer_name',
  'customer_phone',
  'description',
  'amount_inr',
  'payment_method',
  'gst_percent',
  'discount_inr',
  'original_invoice_ref',
  'quantity',
];

const sampleRows = [
  [
    '2024-01-15-001',
    '2024-01-15',
    'Priya Sharma',
    '9876543210',
    'Haircut & styling',
    1180,
    'upi',
    18,
    0,
    'LEG-2024-0115',
    1,
  ],
  [
    '2024-02-20-001',
    '2024-02-20',
    'Walk-in Guest',
    '',
    'Keratin treatment',
    5900,
    'card',
    18,
    0,
    '',
    1,
  ],
];

async function main() {
  const docsDir = path.join(process.cwd(), 'docs/foryourhair/imports');
  const publicDir = path.join(process.cwd(), 'public/fyh/imports');
  await mkdir(docsDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });

  const csvLines = [headers.join(',')];
  for (const row of sampleRows) {
    csvLines.push(row.map((c) => (String(c).includes(',') ? `"${c}"` : String(c))).join(','));
  }
  const csv = csvLines.join('\n') + '\n';
  await writeFile(path.join(docsDir, 'historical-sales-template.csv'), csv);
  await writeFile(path.join(publicDir, 'historical-sales-template.csv'), csv);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Historical Sales');
  sheet.addRow(headers);
  for (const row of sampleRows) {
    sheet.addRow(row);
  }
  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const xlsxPathDocs = path.join(docsDir, 'historical-sales-template.xlsx');
  const xlsxPathPublic = path.join(publicDir, 'historical-sales-template.xlsx');
  await writeFile(xlsxPathDocs, Buffer.from(buffer));
  await writeFile(xlsxPathPublic, Buffer.from(buffer));

  console.log('Wrote', xlsxPathDocs, xlsxPathPublic);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
