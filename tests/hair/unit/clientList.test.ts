import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { walletBalanceFromLedger } from '@/src/hair/domain/ledger/plan';
import {
  CLIENT_LIST_COLUMNS,
  advanceBalanceFromLedgerEntries,
  duesFromLedgerTotals,
  formatClientDate,
  includeCustomerInClientList,
  isClientVisit,
  membershipListLabel,
  packageListLabel,
  visibleClientActions,
  visitDateBounds,
  whatsAppHref,
} from '@/src/hair/lib/clientList';

const root = process.cwd();

describe('Client list columns', () => {
  it('uses the finalized column order and omits audit and marketing columns', () => {
    assert.deepEqual([...CLIENT_LIST_COLUMNS], [
      'Action',
      'Customer Name',
      'Customer Code',
      'Mobile Number',
      'Membership',
      'Package',
      'Loyalty Points',
      'Advance Balance',
      'Dues',
      'Email',
      '1st Visit Date',
      'Last Visit Date',
      'Date of Birth',
      'Gender',
    ]);
    const src = readFileSync(join(root, 'src/hair/components/customers/CustomersList.tsx'), 'utf8');
    for (const removed of ['Anniversary', 'Area', 'Source of Client', 'Created By', 'Modified By']) {
      assert.equal(src.includes(removed), false);
    }
    assert.doesNotMatch(src, /deleteCustomer|Permanent delete|Delete customer/i);
  });
});

describe('Client search and actions', () => {
  it('searches name, code, phone, and email', () => {
    const src = readFileSync(join(root, 'src/hair/services/customerDirectory.ts'), 'utf8');
    assert.match(src, /fullName/);
    assert.match(src, /customerCode/);
    assert.match(src, /phone/);
    assert.match(src, /email/);
  });

  it('shows view, edit, WhatsApp, and archive, and never a delete action', () => {
    assert.deepEqual(
      visibleClientActions({ canEdit: true, canArchive: true, whatsAppHref: 'https://wa.me/9198' }),
      ['view', 'edit', 'whatsapp', 'archive'],
    );
    assert.deepEqual(
      visibleClientActions({ canEdit: false, canArchive: false, whatsAppHref: null }),
      ['view'],
    );
    const actions = readFileSync(join(root, 'src/hair/actions/customers.ts'), 'utf8');
    assert.match(actions, /customers\.customer\.edit/);
    assert.match(actions, /customers\.customer\.archive/);
    assert.match(actions, /archiveCustomer/);
    assert.doesNotMatch(actions, /deleteCustomer\(/);
  });

  it('builds a WhatsApp link from the mobile number', () => {
    assert.equal(whatsAppHref('9876543210'), 'https://wa.me/919876543210');
    assert.equal(whatsAppHref(''), null);
  });
});

describe('Client balances stay on ledger truth', () => {
  it('keeps an unpaid due separate from advance', () => {
    const dues = duesFromLedgerTotals(80_000, 0);
    const advance = advanceBalanceFromLedgerEntries([
      { kind: 'advance_credit', direction: 'credit', amountPaise: 25_000 },
      { kind: 'receivable_open', direction: 'debit', amountPaise: 80_000 },
    ]);
    assert.equal(dues, 80_000);
    assert.equal(advance, 25_000);
  });

  it('reduces dues when the outstanding invoice is settled and does not add that cash to advance', () => {
    assert.equal(duesFromLedgerTotals(80_000, 80_000), 0);
    assert.equal(duesFromLedgerTotals(80_000, 30_000), 50_000);
    const advance = walletBalanceFromLedger([
      { kind: 'receivable_settled', direction: 'credit', amountPaise: 80_000 },
      { kind: 'payment_received', direction: 'debit', amountPaise: 80_000 },
    ]);
    assert.equal(advance, 0);
  });

  it('reduces advance when wallet credit is consumed', () => {
    assert.equal(
      advanceBalanceFromLedgerEntries([
        { kind: 'advance_credit', direction: 'credit', amountPaise: 25_000 },
        { kind: 'wallet_redemption', direction: 'debit', amountPaise: 10_000 },
      ]),
      15_000,
    );
  });
});

describe('Client membership, package, and visits', () => {
  it('shows the active membership plan and not a cash balance', () => {
    assert.equal(membershipListLabel({ planName: 'Gold', discountBps: 1000 }), 'Gold · 10%');
    assert.equal(membershipListLabel(null), null);
  });

  it('shows remaining package credits', () => {
    assert.equal(
      packageListLabel({ names: ['Hair Spa'], remainingCredits: 3 }),
      'Hair Spa · 3 left',
    );
    assert.equal(packageListLabel({ names: ['Hair Spa'], remainingCredits: 0 }), null);
  });

  it('derives first and last visit from valid history only', () => {
    assert.equal(isClientVisit({ kind: 'invoice', status: 'void', source: 'quick_sale' }), false);
    assert.equal(isClientVisit({ kind: 'invoice', status: 'unpaid', source: 'quick_sale' }), true);
    assert.equal(isClientVisit({ kind: 'invoice', status: 'paid', source: 'advance_payment' }), false);
    assert.equal(isClientVisit({ kind: 'appointment', status: 'completed' }), true);
    assert.equal(isClientVisit({ kind: 'appointment', status: 'cancelled' }), false);
    const bounds = visitDateBounds(['2026-03-02', '2025-11-01', '2026-01-15']);
    assert.equal(bounds.firstVisitOn, '2025-11-01');
    assert.equal(bounds.lastVisitOn, '2026-03-02');
    assert.equal(formatClientDate(bounds.firstVisitOn), '1 Nov 2025');
  });

  it('archives by hiding the customer and keeps inactive rows off the default list', () => {
    assert.equal(includeCustomerInClientList(true), true);
    assert.equal(includeCustomerInClientList(false), false);
    const service = readFileSync(join(root, 'src/hair/services/customers.ts'), 'utf8');
    assert.match(service, /isActive: false/);
    const directory = readFileSync(join(root, 'src/hair/services/customerDirectory.ts'), 'utf8');
    assert.match(directory, /eq\(fyhCustomers\.isActive, true\)/);
    assert.match(directory, /'paid', 'partial', 'unpaid'/);
    assert.match(directory, /'completed', 'paid'/);
    assert.match(directory, /advance_payment/);
    assert.match(directory, /excludeVoidInvoiceLedger/);
    assert.doesNotMatch(directory, /delete\(fyhCustomers\)/);
  });
});
