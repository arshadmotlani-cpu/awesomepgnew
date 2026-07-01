import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const residentAreaSection = readFileSync(
  join(process.cwd(), 'src/components/customer/account/ResidentAreaSection.tsx'),
  'utf8',
);

test('wallet tab wires deposit balance, ledger, requests, and due sections', () => {
  assert.match(residentAreaSection, /activeTab === 'wallet' && primaryBooking/);
  assert.match(residentAreaSection, /DepositWalletSection/);
  assert.match(residentAreaSection, /ResidentDepositLedger/);
  assert.match(residentAreaSection, /ResidentRequestForms/);
  assert.match(residentAreaSection, /DepositDueSection/);
  assert.match(residentAreaSection, /ResidentWalletRequestStatus/);
});

test('restored deposit wallet components exist on disk', () => {
  const files = [
    'src/components/customer/account/DepositWalletSection.tsx',
    'src/components/customer/account/ResidentRequestForms.tsx',
    'src/components/customer/account/resident/ResidentDepositLedger.tsx',
    'src/components/customer/account/resident/ResidentWalletRequestStatus.tsx',
  ];
  for (const file of files) {
    readFileSync(join(process.cwd(), file), 'utf8');
  }
});
