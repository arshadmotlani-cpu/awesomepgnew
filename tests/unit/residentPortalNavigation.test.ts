import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseResidentTab,
  parseResidentStaySub,
  parseResidentPaymentsSub,
  legacySubFromTab,
  residentStayHref,
  residentPaymentsHref,
  residentTabHref,
  legacyResidentTabHref,
} from '@/src/lib/accountNavigation';

test('parseResidentTab maps legacy tabs to referrals default', () => {
  assert.equal(parseResidentTab('referrals'), 'referrals');
  assert.equal(parseResidentTab('concierge'), 'concierge');
  assert.equal(parseResidentTab('requests'), 'referrals');
});

test('legacySubFromTab maps wallet and invoices into My Stay', () => {
  assert.deepEqual(legacySubFromTab('wallet'), { staySub: 'wallet', profileSub: 'wallet' });
  assert.deepEqual(legacySubFromTab('vacating'), { staySub: 'requests', requestsCategory: 'move_out' });
  assert.deepEqual(legacySubFromTab('invoices'), { staySub: 'payments', paymentsSub: 'invoices' });
});

test('residentStayHref uses /account/resident with sub param', () => {
  assert.equal(residentStayHref('payments'), '/account/resident');
  assert.equal(residentStayHref('requests'), '/account/resident?sub=requests');
  assert.match(residentStayHref('wallet'), /\/account\/resident\?sub=wallet/);
});

test('residentPaymentsHref keeps invoices inside Payments', () => {
  assert.equal(residentPaymentsHref('due'), '/account/resident');
  assert.equal(residentPaymentsHref('invoices'), '/account/resident?sub=payments&pay=invoices');
  assert.equal(residentPaymentsHref('history'), '/account/resident?sub=payments&pay=history');
});

test('legacyResidentTabHref maps home to My Stay overview', () => {
  assert.match(legacyResidentTabHref('home'), /\/account\/resident\?sub=overview/);
  assert.equal(legacyResidentTabHref('requests'), '/account/resident?sub=requests');
  assert.equal(legacyResidentTabHref('invoices'), '/account/resident?sub=payments&pay=invoices');
});

test('parseResidentStaySub defaults to payments', () => {
  assert.equal(parseResidentStaySub(undefined), 'payments');
  assert.equal(parseResidentStaySub('requests'), 'requests');
});

test('parseResidentPaymentsSub defaults to due', () => {
  assert.equal(parseResidentPaymentsSub(undefined), 'due');
  assert.equal(parseResidentPaymentsSub('invoices'), 'invoices');
});

test('requests deep links stay on My Stay', () => {
  assert.equal(
    residentTabHref('requests', { category: 'move_out' }),
    '/account/resident?sub=requests&category=move_out',
  );
});
