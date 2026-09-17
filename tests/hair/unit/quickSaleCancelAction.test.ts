import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Quick Sale cancel action (header close)', () => {
  it('removes three-dot sale menu and exposes cancel close button', () => {
    const header = read('src/hair/components/quick-sale/QuickSaleCustomerHeader.tsx');
    assert.doesNotMatch(header, /MoreVertical/);
    assert.doesNotMatch(header, /qs-sale-menu/);
    assert.doesNotMatch(header, /Hold bill/);
    assert.doesNotMatch(header, /New sale/);
    assert.match(header, /data-testid="qs-cancel-sale"/);
    assert.match(header, /aria-label="Cancel sale"/);
  });

  it('shell confirms cancel when sale has content and uses cancelSale reset', () => {
    const shell = read('src/hair/components/quick-sale/QuickSaleShell.tsx');
    assert.match(shell, /requestCancelSale/);
    assert.match(shell, /hasActiveTransaction/);
    assert.match(shell, /qs-cancel-sale-confirm/);
    assert.match(shell, /Cancel this sale\?/);
    assert.match(shell, /All unsaved items and payment entries will be cleared/);
    const reqFn = shell.slice(
      shell.indexOf('const requestCancelSale'),
      shell.indexOf('async function resumeHold'),
    );
    assert.match(reqFn, /cancelSale\(\)/);
    assert.match(reqFn, /setCancelSaleConfirmOpen\(true\)/);
    const cancelFn = shell.slice(
      shell.indexOf('const cancelSale'),
      shell.indexOf('const requestCancelSale'),
    );
    assert.match(cancelFn, /clearSaleState/);
    assert.match(cancelFn, /setStep\('customer'\)/);
  });

  it('checkout bar no longer shows Hold Bill', () => {
    const checkout = read('src/hair/components/quick-sale/QuickSaleCheckoutBar.tsx');
    assert.doesNotMatch(checkout, /qs-hold-bill/);
    assert.doesNotMatch(checkout, /Hold Bill/);
  });
});
