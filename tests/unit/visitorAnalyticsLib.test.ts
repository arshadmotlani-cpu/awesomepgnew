import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDeviceType } from '@/src/lib/analytics/device';
import { pathToPageKey, shouldTrackPath } from '@/src/lib/analytics/pageKeys';
import { shouldSkipAnalyticsUserAgent } from '@/src/lib/analytics/botFilter';
import { classifyTrafficSource } from '@/src/lib/analytics/trafficSource';
import { classifyTrafficSource } from '@/src/lib/analytics/trafficSource';

test('pathToPageKey maps customer routes', () => {
  assert.equal(pathToPageKey('/'), 'Home');
  assert.equal(pathToPageKey('/login'), 'Login');
  assert.equal(pathToPageKey('/pgs'), 'PG Listing');
  assert.equal(pathToPageKey('/pgs/awesome-delhi'), 'PG Detail');
  assert.equal(pathToPageKey('/pgs/awesome-delhi/rooms/abc'), 'Rooms');
  assert.equal(pathToPageKey('/booking/new'), 'Reservation');
  assert.equal(pathToPageKey('/booking/APG-2026-1/pay'), 'Payment');
  assert.equal(pathToPageKey('/account/kyc'), 'KYC');
});

test('shouldTrackPath skips admin and api', () => {
  assert.equal(shouldTrackPath('/admin'), false);
  assert.equal(shouldTrackPath('/admin/bookings'), false);
  assert.equal(shouldTrackPath('/api/health'), false);
  assert.equal(shouldTrackPath('/pgs'), true);
});

test('shouldSkipAnalyticsUserAgent skips bots but allows verify script', () => {
  assert.equal(shouldSkipAnalyticsUserAgent('Googlebot/2.1'), true);
  assert.equal(shouldSkipAnalyticsUserAgent('Mozilla/5.0 Chrome/120'), false);
  assert.equal(shouldSkipAnalyticsUserAgent('AwesomePG-Analytics-Verify/1.0'), false);
});

test('parseDeviceType classifies common agents', () => {
  assert.equal(parseDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'mobile');
  assert.equal(parseDeviceType('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
  assert.equal(parseDeviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'desktop');
});

test('classifyTrafficSource uses utm and referrer', () => {
  assert.equal(classifyTrafficSource(null, 'google'), 'google');
  assert.equal(classifyTrafficSource(null, null), 'direct');
  assert.equal(classifyTrafficSource('https://www.google.com/search?q=pg', null), 'google');
  assert.equal(classifyTrafficSource('https://l.instagram.com/', null), 'instagram');
  assert.equal(classifyTrafficSource('https://example.com', null), 'other');
});
