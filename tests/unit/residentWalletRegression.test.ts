import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const residentAreaSection = readFileSync(
  join(process.cwd(), 'src/components/customer/account/ResidentAreaSection.tsx'),
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
const simpleAccountHub = readFileSync(
  join(process.cwd(), 'src/components/customer/simple/SimpleAccountHub.tsx'),
  'utf8',
);

test('wallet tab is always available for residents with a booking', () => {
  assert.match(residentAreaSection, /activeTab === 'wallet' && primaryBooking/);
  assert.match(residentAreaSection, /activeTab === 'wallet'[\s\S]*<ResidentWalletView/);
  assert.doesNotMatch(
    residentAreaSection,
    /\{financialAccount \?\s*\(\s*\n\s*<ResidentWalletView/,
    'wallet content must not be gated on financialAccount',
  );
});

test('wallet tab wires deposit balance, ledger, policy, and refund tracking', () => {
  assert.match(residentAreaSection, /DepositWalletSection/);
  assert.match(residentAreaSection, /ResidentDepositLedger/);
  assert.match(residentAreaSection, /ResidentDepositBreakdown/);
  assert.match(residentAreaSection, /DepositRefundNotice/);
  assert.match(residentAreaSection, /ResidentRequestForms/);
  assert.match(residentAreaSection, /ResidentWalletRequestStatus/);
  assert.doesNotMatch(
    residentAreaSection,
    /depositWallet\.totalCollectedPaise > 0 \?/,
    'deposit wallet must not be hidden when collected is zero',
  );
});

test('request refund lives only in wallet', () => {
  assert.match(residentRequestForms, /Request refund/);
  assert.doesNotMatch(requestsHome, /Request deposit refund/);
  assert.doesNotMatch(vacatingHome, /Request refund/);
  assert.match(vacatingHome, /residentTabHref\('wallet'\)/);
  assert.match(requestsHome, /deposit_refund[\s\S]*residentTabHref\('wallet'\)/);
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

test('resident nav uses My Stay and Bills labels', () => {
  const nav = readFileSync(join(process.cwd(), 'src/lib/residentNavigation.ts'), 'utf8');
  assert.match(nav, /label: 'My Stay'/);
  assert.match(nav, /label: 'Bills'/);
});

test('restored deposit wallet components exist on disk', () => {
  const files = [
    'src/components/customer/account/DepositWalletSection.tsx',
    'src/components/customer/account/ResidentRequestForms.tsx',
    'src/components/customer/account/resident/ResidentDepositLedger.tsx',
    'src/components/customer/account/resident/ResidentDepositBreakdown.tsx',
    'src/components/customer/account/resident/ResidentWalletRequestStatus.tsx',
  ];
  for (const file of files) {
    readFileSync(join(process.cwd(), file), 'utf8');
  }
});
