import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasActiveTips,
  shouldRunOnboardingTour,
  shouldShowRoachieGuide,
} from '../../src/lib/cockroach/guidePaths';

test('shouldShowRoachieGuide hides browse, home, booking, account, and login', () => {
  assert.equal(shouldShowRoachieGuide('/'), false);
  assert.equal(shouldShowRoachieGuide('/pgs'), false);
  assert.equal(shouldShowRoachieGuide('/pgs?city=bangalore'), false);
  assert.equal(shouldShowRoachieGuide('/booking/new'), false);
  assert.equal(shouldShowRoachieGuide('/booking/ABC123'), false);
  assert.equal(shouldShowRoachieGuide('/account/resident'), false);
  assert.equal(shouldShowRoachieGuide('/login'), false);
});

test('shouldShowRoachieGuide shows peek on PG detail and room pages', () => {
  assert.equal(shouldShowRoachieGuide('/pgs/shantinagar-awesome-pg'), true);
  assert.equal(shouldShowRoachieGuide('/pgs/shantinagar-awesome-pg/rooms/abc'), true);
});

test('shouldRunOnboardingTour on PG detail and room pages', () => {
  assert.equal(shouldRunOnboardingTour('/pgs/shantinagar-awesome-pg'), true);
  assert.equal(shouldRunOnboardingTour('/pgs/shantinagar-awesome-pg/rooms/abc'), true);
  assert.equal(shouldRunOnboardingTour('/booking/new'), false);
});

test('hasActiveTips is true on PG detail and room pages', () => {
  assert.equal(hasActiveTips('/pgs/shantinagar-awesome-pg'), true);
  assert.equal(hasActiveTips('/pgs/shantinagar-awesome-pg/rooms/abc'), true);
});
