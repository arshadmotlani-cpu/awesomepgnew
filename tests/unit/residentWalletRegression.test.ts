import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const residentAreaSection = readFileSync(
  join(process.cwd(), 'src/components/customer/account/ResidentAreaSection.tsx'),
  'utf8',
);
const residentPortalTabData = readFileSync(
  join(process.cwd(), 'src/services/residentPortalTabData.ts'),
  'utf8',
);
const stayHub = readFileSync(
  join(process.cwd(), 'src/components/customer/account/resident/ResidentStayHub.tsx'),
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
  assert.match(stayHub, /id: 'wallet'/);
  assert.match(stayHub, /<ProfileWalletPanel/);
  assert.match(residentPortalTabData, /walletBooking/);
});

test('wallet sub-tab wires deposit balance, ledger, policy, and refund tracking', () => {
  assert.match(profileWalletPanel, /RequestMoneySheet/);
  assert.match(profileWalletPanel, /RequestMoneySheet/);
  assert.match(profileWalletPanel, /Deposit deductions/);
  assert.match(profileWalletPanel, /Refund history/);
  assert.doesNotMatch(profileWalletPanel, /Deposit refund not available yet/);
  assert.match(residentPortalTabData, /getDepositSummaryForBooking/);
  assert.match(residentPortalTabData, /refundableBalancePaise/);
});

test('move-out refund is inline on vacating home', () => {
  assert.match(vacatingHome, /DepositRefundRequestForm/);
  assert.doesNotMatch(vacatingHome, /residentProfileHref\('wallet'\)/);
  assert.doesNotMatch(requestsHome, /Request deposit refund/);
});

test('financial engine falls back to latest booking for wallet SSOT', () => {
  assert.match(financialEngine, /getLatestBookingFinancialContext/);
  assert.match(
    financialEngine,
    /if \(!activeTenancy\)[\s\S]*getLatestBookingFinancialContext/,
  );
});

test('payments are on My Stay, not gated on financialAccount', () => {
  assert.match(stayHub, /id: 'overview'/);
  assert.match(stayHub, /id: 'payments'/);
  assert.match(stayHub, /id: 'requests'/);
  assert.match(stayHub, /id: 'wallet'/);
  assert.match(stayHub, /ResidentPaymentsV2Hub/);
  assert.doesNotMatch(stayHub, /Due Rent \/ Bill Due/);
  assert.doesNotMatch(
    residentAreaSection,
    /activeTab === 'payments' && primaryBooking && financialAccount/,
  );
});

test('account feature nav lists Referrals only on profile hub', () => {
  const nav = readFileSync(join(process.cwd(), 'src/lib/residentNavigation.ts'), 'utf8');
  assert.match(nav, /label: 'Referrals'/);
  assert.match(nav, /label: 'Concierge'/);
  assert.doesNotMatch(nav, /label: 'Invoices'/);
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
