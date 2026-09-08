import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseResidentTab,
  parseResidentStaySub,
  legacySubFromTab,
  residentStayHref,
  residentTabHref,
  legacyResidentTabHref,
} from '@/src/lib/accountNavigation';

test('parseResidentTab maps legacy tabs to account features or stay redirects', () => {
  assert.equal(parseResidentTab('vacating'), 'requests');
  assert.equal(parseResidentTab('requests'), 'requests');
  assert.equal(parseResidentTab('invoices'), 'invoices');
  assert.equal(parseResidentTab('home'), 'requests');
});

test('legacySubFromTab maps wallet to My Stay wallet sub', () => {
  assert.deepEqual(legacySubFromTab('wallet'), { staySub: 'wallet', profileSub: 'wallet' });
  assert.deepEqual(legacySubFromTab('vacating'), { requestsCategory: 'move_out' });
});

test('residentStayHref uses /account/resident with sub param', () => {
  assert.equal(residentStayHref('payments'), '/account/resident');
  assert.match(residentStayHref('wallet'), /\/account\/resident\?sub=wallet/);
});

test('legacyResidentTabHref maps home to My Stay overview', () => {
  assert.match(legacyResidentTabHref('home'), /\/account\/resident\?sub=overview/);
  assert.equal(legacyResidentTabHref('profile'), '/account/profile');
});

test('parseResidentStaySub defaults to payments', () => {
  assert.equal(parseResidentStaySub(undefined), 'payments');
  assert.equal(parseResidentStaySub('wallet'), 'wallet');
});

test('invoices legacy payments sub maps to invoices tab', () => {
  assert.equal(residentTabHref('invoices'), '/account/profile?section=resident&tab=invoices');
});
