import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseResidentTab,
  parseResidentProfileSub,
  legacySubFromTab,
  residentProfileHref,
} from '@/src/lib/accountNavigation';

test('parseResidentTab maps legacy tabs to V2', () => {
  assert.equal(parseResidentTab('home'), 'profile');
  assert.equal(parseResidentTab('wallet'), 'profile');
  assert.equal(parseResidentTab('vacating'), 'requests');
  assert.equal(parseResidentTab('payments'), 'payments');
  assert.equal(parseResidentTab('profile'), 'profile');
});

test('legacySubFromTab maps wallet to profile wallet sub', () => {
  assert.deepEqual(legacySubFromTab('wallet'), { profileSub: 'wallet' });
  assert.deepEqual(legacySubFromTab('vacating'), { requestsCategory: 'move_out' });
});

test('residentProfileHref includes sub param', () => {
  assert.match(residentProfileHref('wallet'), /tab=profile/);
  assert.match(residentProfileHref('wallet'), /sub=wallet/);
});

test('parseResidentProfileSub defaults to overview', () => {
  assert.equal(parseResidentProfileSub(undefined), 'overview');
  assert.equal(parseResidentProfileSub('wallet'), 'wallet');
});
