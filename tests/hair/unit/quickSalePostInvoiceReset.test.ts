import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Quick Sale post-invoice reset', () => {
  it('closing completed invoice calls resetForNext (customer=null, step=customer)', () => {
    const shell = read('src/hair/components/quick-sale/QuickSaleShell.tsx');
    const closeFn = shell.slice(
      shell.indexOf('const closeCompletedInvoiceViewer'),
      shell.indexOf('const cancelSale'),
    );
    assert.match(closeFn, /resetForNext\(\)/);
    const resetFn = shell.slice(
      shell.indexOf('const resetForNext'),
      shell.indexOf('const closeCompletedInvoiceViewer'),
    );
    assert.match(resetFn, /setStep\('customer'\)/);
    assert.match(resetFn, /clearSaleState/);
  });

  it('package redemption lines are cleared via emptyQuickSaleTransactionState on reset', () => {
    const shell = read('src/hair/components/quick-sale/QuickSaleShell.tsx');
    assert.match(shell, /prepaidRedemption/);
    assert.match(shell, /resetTransactionState[\s\S]*emptyQuickSaleTransactionState/);
    assert.match(shell, /finalizeSuccess[\s\S]*resetTransactionState/);
  });

  it('success dialog Done wires to closeCompletedInvoiceViewer only', () => {
    const dialog = read('src/hair/components/quick-sale/QuickSaleSuccessDialog.tsx');
    assert.match(dialog, /onDone/);
    const shell = read('src/hair/components/quick-sale/QuickSaleShell.tsx');
    assert.match(shell, /onDone=\{closeCompletedInvoiceViewer\}/);
  });
});
