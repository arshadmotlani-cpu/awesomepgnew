import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Available Services modal requires staff in redemption selection', () => {
  const modal = read('src/hair/components/quick-sale/AvailableServicesModal.tsx');
  assert.match(modal, /staff: StaffAllocation\[\]/);
  assert.match(modal, /QuickSaleStaffRow/);
  assert.match(modal, /Select the staff member who performed this service/);
  assert.match(modal, /Performed by/);
});

test('Quick Sale maps prepaid selection staff onto basket lines', () => {
  const shell = read('src/hair/components/quick-sale/QuickSaleShell.tsx');
  const fn = shell.slice(shell.indexOf('addPrepaidSelections'), shell.indexOf('resetTransactionState'));
  assert.match(fn, /staff: sel\.staff/);
  assert.doesNotMatch(fn, /staff: \[\]/);
});
