import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
function readSrc(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Quick Sale invoice viewer is portaled and viewport-fitted', () => {
  const dialog = readSrc('src/hair/components/quick-sale/QuickSaleSuccessDialog.tsx');
  assert.match(dialog, /createPortal/);
  assert.match(dialog, /document\.body/);
  assert.match(dialog, /qs-invoice-viewer-root/);
  assert.match(dialog, /qs-invoice-viewer-main/);
  assert.match(dialog, /qs-invoice-viewer-toolbar/);
  assert.match(dialog, /qs-invoice-viewer-header--compact/);
  const css = readSrc('src/hair/styles/globals.css');
  assert.match(css, /\.qs-invoice-viewer-root[\s\S]*100dvh/);
  assert.doesNotMatch(dialog, /qs-success-root/);
  assert.doesNotMatch(dialog, /qs-success-backdrop/);
});

test('FyhInvoicePreviewViewport scales sheet with transform (not font overrides)', () => {
  const viewport = readSrc('src/hair/components/billing/FyhInvoicePreviewViewport.tsx');
  assert.match(viewport, /transform: `scale\(\$\{layout\.scale\}\)`/);
  assert.match(viewport, /\.fyh-invoice-sheet/);
  assert.match(viewport, /ResizeObserver/);
  assert.match(viewport, /data-invoice-preview-scale/);
  assert.match(viewport, /Math\.min\(scaleW, scaleH, 1\)/);
});

test('Invoice modal styles support Quick Sale viewer fit', () => {
  const styles = readSrc('src/hair/components/billing/fyhInvoiceModalStyles.ts');
  assert.match(styles, /QS_INVOICE_VIEWER_SCREEN_STYLES/);
  assert.match(styles, /qs-invoice-viewer-preview/);
  assert.match(styles, /\.fyh-invoice-preview-viewport/);
});

test('Shell resets to fresh customer step when invoice viewer closes', () => {
  const shell = readSrc('src/hair/components/quick-sale/QuickSaleShell.tsx');
  assert.match(shell, /closeCompletedInvoiceViewer/);
  assert.match(shell, /closeCompletedInvoiceViewer[\s\S]*resetForNext\(\)/);
  assert.match(shell, /onDone=\{closeCompletedInvoiceViewer\}/);
  const closeFn = shell.slice(
    shell.indexOf('const closeCompletedInvoiceViewer'),
    shell.indexOf('const cancelSale'),
  );
  assert.doesNotMatch(closeFn, /setStep\('sale'\)/);
  assert.match(closeFn, /resetForNext/);
});

test('post-checkout close clears customer and session draft (no stale restore)', () => {
  const shell = readSrc('src/hair/components/quick-sale/QuickSaleShell.tsx');
  const clearBlock = shell.slice(
    shell.indexOf('const clearSaleState'),
    shell.indexOf('const resetForNext'),
  );
  assert.match(clearBlock, /setCustomer\(null\)/);
  assert.match(clearBlock, /clearQuickSaleSession\(\)/);
  assert.match(clearBlock, /clearCheckoutPending\(\)/);
  assert.match(shell, /finalizeSuccess[\s\S]*clearQuickSaleSession/);
});
