import type ExcelJS from 'exceljs';

/** Write a clickable Excel hyperlink cell (Excel, Numbers, LibreOffice). */
export function setExcelHyperlinkCell(
  cell: ExcelJS.Cell,
  text: string,
  url: string,
): void {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Excel hyperlink must be absolute URL, got: ${url}`);
  }
  cell.value = {
    text,
    hyperlink: url,
    tooltip: url,
  };
  cell.font = { color: { argb: 'FF0563C1' }, underline: true };
}
