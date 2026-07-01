import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const residentAreaSection = readFileSync(
  join(process.cwd(), 'src/components/customer/account/ResidentAreaSection.tsx'),
  'utf8',
);
const profileHub = readFileSync(
  join(process.cwd(), 'src/components/customer/account/resident/ResidentProfileHub.tsx'),
  'utf8',
);
const profileWalletPanel = readFileSync(
  join(process.cwd(), 'src/components/customer/account/resident/ProfileWalletPanel.tsx'),
  'utf8',
);
const requestsHome = readFileSync(
  join(process.cwd(), 'src/components/customer/account/resident/requests/RequestsHome.tsx'),
  'utf8',
);
const vacatingHome = readFileSync(
  join(process.cwd(), 'src/components/customer/account/resident/vacating/VacatingHome.tsx'),
  'utf8',
);
const residentRequestForms = readFileSync(
  join(process.cwd(), 'src/components/customer/account/ResidentRequestForms.tsx'),
  'utf8',
);
const financialEngine = readFileSync(
  join(process.cwd(), 'src/services/residentFinancialEngine.ts'),
  'utf8',
);

test('wallet sub-tab is always available for residents with a booking', () => {
  assert.match(residentAreaSection, /activeTab === 'profile' && primaryBooking/);
  assert.match(residentAreaSection, /<ResidentProfileHub/);
  assert.match(profileHub, /id: 'wallet'/);
  assert.match(profileHub, /<ProfileWalletPanel/);
  assert.match(residentAreaSection, /walletBooking/);
  assert.doesNotMatch(
    residentAreaSection,
    /\{financialAccount \?\s*\(\s*\n\s*<ProfileWalletPanel/,
    'wallet content must not be gated on financialAccount',
  );
});

test('wallet sub-tab wires deposit balance, ledger, policy, and refund tracking', () => {
  assert.match(profileWalletPanel, /ResidentRequestForms/);
  assert.match(profileWalletPanel, /Deposit deductions/);
  assert.match(profileWalletPanel, /Refund history/);
  assert.match(profileWalletPanel, /Refund not available yet/);
  assert.match(residentAreaSection, /getDepositSummaryForBooking/);
  assert.match(residentAreaSection, /refundableBalancePaise/);
});

test('request refund lives only in wallet', () => {
  assert.match(residentRequestForms, /Request refund/);
  assert.doesNotMatch(requestsHome, /Request deposit refund/);
  assert.doesNotMatch(vacatingHome, /Request refund/);
  assert.match(vacatingHome, /residentProfileHref\('wallet'\)/);
  assert.match(requestsHome, /residentProfileHref\('wallet'\)/);
});

test('financial engine falls back to latest booking for wallet SSOT', () => {
  assert.match(financialEngine, /getLatestBookingFinancialContext/);
  assert.match(
    financialEngine,
    /if \(!activeTenancy\)[\s\S]*getLatestBookingFinancialContext/,
  );
});

test('payments tab is not gated on financialAccount', () => {
  assert.match(residentAreaSection, /activeTab === 'payments' && primaryBooking/);
  assert.doesNotMatch(
    residentAreaSection,
    /activeTab === 'payments' && primaryBooking && financialAccount/,
  );
});

test('resident nav uses Profile and Payments labels', () => {
  const nav = readFileSync(join(process.cwd(), 'src/lib/residentNavigation.ts'), 'utf8');
  assert.match(nav, /label: 'Profile'/);
  assert.match(nav, /label: 'Payments'/);
});

test('restored deposit wallet components exist on disk', () => {
  const files = [
    'src/components/customer/account/ResidentRequestForms.tsx',
    'src/components/customer/account/resident/ProfileWalletPanel.tsx',
    'src/components/customer/account/resident/ResidentDepositLedger.tsx',
    'src/components/customer/account/resident/ResidentDepositBreakdown.tsx',
    'src/components/customer/account/resident/ResidentWalletRequestStatus.tsx',
  ];
  for (const file of files) {
    readFileSync(join(process.cwd(), file), 'utf8');
  }
});
