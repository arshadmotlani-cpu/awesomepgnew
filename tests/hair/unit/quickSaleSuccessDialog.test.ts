import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
function readSrc(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Quick Sale success dialog loads public invoice preview action', () => {
  const dialog = readSrc('src/hair/components/quick-sale/QuickSaleSuccessDialog.tsx');
  assert.match(dialog, /getQuickSaleInvoicePreviewAction/);
  assert.match(dialog, /PUBLIC_INVOICE_STYLES/);
  assert.doesNotMatch(dialog, /printHtml/);
  assert.doesNotMatch(dialog, /getNotificationPreviewAction/);
});

test('Quick Sale success dialog uses redesigned layout and actions', () => {
  const dialog = readSrc('src/hair/components/quick-sale/QuickSaleSuccessDialog.tsx');
  assert.match(dialog, /qs-success-root/);
  assert.match(dialog, /qs-success-header/);
  assert.match(dialog, /qs-success-body/);
  assert.match(dialog, /qs-success-actions/);
  assert.match(dialog, /Sale Completed/);
  assert.match(dialog, /Print Invoice/);
  assert.match(dialog, /Download PDF/);
  assert.match(dialog, /Share on WhatsApp/);
  assert.match(dialog, /Open Invoice/);
  assert.match(dialog, /View Customer/);
  assert.match(dialog, /Create Next Appointment/);
  assert.match(dialog, /invoicePublicPrintUrl/);
  assert.match(dialog, /invoicePublicViewUrl/);
});

test('Quick Sale shell passes customerId to success dialog', () => {
  const shell = readSrc('src/hair/components/quick-sale/QuickSaleShell.tsx');
  assert.match(shell, /customerId=\{customer\.id\}/);
  assert.doesNotMatch(shell, /printHtml/);
});

test('getQuickSaleInvoicePreviewAction uses public invoice SSOT', () => {
  const action = readSrc('src/hair/actions/quickSale.ts');
  assert.match(action, /getQuickSaleInvoicePreviewAction/);
  assert.match(action, /renderPublicInvoiceSheetHtml/);
  assert.match(action, /buildPublicInvoicePrintHtml/);
  assert.match(action, /buildPublicInvoiceViewModel/);
  assert.match(action, /requireFyhPermission\(\{ permission: 'quick_sale\.access'/);
  const checkoutFn = action.slice(
    action.indexOf('export async function completeQuickSaleAction'),
    action.indexOf('export type QuickSaleInvoicePreviewResult'),
  );
  assert.match(checkoutFn, /requireFyhPermission\(\{ permission: 'quick_sale\.sale\.complete'/);
  assert.match(checkoutFn, /advancePaise: result\.advancePaise/);
  assert.doesNotMatch(checkoutFn, /buildInvoicePrintHtml/);
  assert.doesNotMatch(checkoutFn, /printHtml/);
});

test('Shared invoice modal styles extracted for preview and success', () => {
  const styles = readSrc('src/hair/components/billing/fyhInvoiceModalStyles.ts');
  const preview = readSrc('src/hair/components/billing/InvoicePreviewModal.tsx');
  assert.match(styles, /FYH_INVOICE_MODAL_SCREEN_STYLES/);
  assert.match(styles, /FYH_INVOICE_MODAL_PRINT_STYLES/);
  assert.match(styles, /qs-success-invoice-scroll/);
  assert.match(preview, /fyhInvoiceModalStyles/);
});
