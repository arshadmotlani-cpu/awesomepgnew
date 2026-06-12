import assert from 'node:assert/strict';
import test from 'node:test';
import { BOOKING_GUIDE } from '../../src/lib/guides/bookingGuide';
import { RESIDENT_GUIDE } from '../../src/lib/guides/residentGuide';
import { ADMIN_GUIDE } from '../../src/lib/guides/adminGuide';
import { searchGuideArticles } from '../../src/lib/guides/searchGuides';

test('booking guide has unique article ids', () => {
  const ids = BOOKING_GUIDE.articles.map((a) => a.id);
  assert.equal(ids.length, new Set(ids).size);
});

test('resident guide has unique article ids', () => {
  const ids = RESIDENT_GUIDE.articles.map((a) => a.id);
  assert.equal(ids.length, new Set(ids).size);
});

test('admin guide has troubleshooting topics', () => {
  const trouble = ADMIN_GUIDE.articles.filter((a) => a.category === 'Troubleshooting');
  assert.ok(trouble.length >= 5);
});

test('searchGuideArticles finds rent and KYC topics', () => {
  const rentHits = searchGuideArticles(RESIDENT_GUIDE.articles, 'rent invoice');
  assert.ok(rentHits.some((a) => a.id === 'pay-rent'));

  const kycHits = searchGuideArticles(BOOKING_GUIDE.articles, 'kyc identity');
  assert.ok(kycHits.some((a) => a.id === 'kyc-checkin'));

  const adminHits = searchGuideArticles(ADMIN_GUIDE.articles, 'payment not showing');
  assert.ok(adminHits.some((a) => a.id === 'fix-payment-not-showing'));
});

test('search with empty query returns all articles', () => {
  assert.equal(searchGuideArticles(BOOKING_GUIDE.articles, '').length, BOOKING_GUIDE.articles.length);
});
