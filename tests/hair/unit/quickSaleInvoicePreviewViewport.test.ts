import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
function readSrc(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Quick Sale success dialog fits invoice preview in viewport scaler', () => {
  const dialog = readSrc('src/hair/components/quick-sale/QuickSaleSuccessDialog.tsx');
  assert.match(dialog, /FyhInvoicePreviewViewport/);
  assert.match(dialog, /max-h-\[min\(96dvh/);
  assert.match(dialog, /overflow-hidden/);
  assert.doesNotMatch(dialog, /overflow-y-auto p-3 md:p-6/);
});

test('FyhInvoicePreviewViewport scales sheet with transform (not font overrides)', () => {
  const viewport = readSrc('src/hair/components/billing/FyhInvoicePreviewViewport.tsx');
  assert.match(viewport, /transform: `scale\(\$\{layout\.scale\}\)`/);
  assert.match(viewport, /\.fyh-invoice-sheet/);
  assert.match(viewport, /ResizeObserver/);
  assert.match(viewport, /data-invoice-preview-scale/);
});

test('Invoice modal styles support preview viewport fit', () => {
  const styles = readSrc('src/hair/components/billing/fyhInvoiceModalStyles.ts');
  assert.match(styles, /\.fyh-invoice-preview-viewport/);
  assert.match(styles, /\.fyh-invoice-preview-measure/);
});
