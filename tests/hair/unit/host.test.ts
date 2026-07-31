import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hairPublicToInternal,
  isHairHost,
  isHairProtectedPath,
  isHairPublicPath,
} from '../../../src/hair/lib/host.ts';

test('detects fyhair and foryourhair hosts', () => {
  assert.equal(isHairHost('fyhair.awesomepg.in'), true);
  assert.equal(isHairHost('fyhair.localhost'), true);
  assert.equal(isHairHost('foryourhair.awesomepg.in'), true);
  assert.equal(isHairHost('foryourhair.localhost'), true);
  assert.equal(isHairHost('invest.awesomepg.in'), false);
  assert.equal(isHairHost('www.awesomepg.in'), false);
  assert.equal(isHairHost('awesomepg.in'), false);
});

test('maps public paths to /fyh internals', () => {
  assert.equal(hairPublicToInternal('/login'), '/fyh/auth/login');
  assert.equal(hairPublicToInternal('/dashboard'), '/fyh/dashboard');
  assert.equal(hairPublicToInternal('/customers/1'), '/fyh/customers/1');
  assert.equal(hairPublicToInternal('/admin'), null);
});

test('protects app modules but not login', () => {
  assert.equal(isHairProtectedPath('/dashboard'), true);
  assert.equal(isHairProtectedPath('/login'), false);
  assert.equal(isHairPublicPath('/billing'), true);
  assert.equal(isHairPublicPath('/quick-sale'), true);
  assert.equal(hairPublicToInternal('/quick-sale'), '/fyh/quick-sale');
  assert.equal(isHairPublicPath('/advance-payment'), true);
  assert.equal(hairPublicToInternal('/advance-payment'), '/fyh/advance-payment');
  assert.equal(isHairPublicPath('/loyalty'), true);
  assert.equal(isHairProtectedPath('/loyalty'), true);
  assert.equal(hairPublicToInternal('/loyalty'), '/fyh/loyalty');
  assert.equal(isHairPublicPath('/settings/salon'), true);
  assert.equal(hairPublicToInternal('/settings/billing'), '/fyh/settings/billing');
  assert.equal(isHairPublicPath('/assets'), false);
  assert.equal(isHairPublicPath('/i/FYH-00001'), true);
  assert.equal(isHairPublicPath('/invoice/FYH-00001'), true);
  assert.equal(hairPublicToInternal('/i/FYH-00001'), '/fyh/i/FYH-00001');
  assert.equal(hairPublicToInternal('/invoice/FYH-00001'), '/fyh/invoice/FYH-00001');
  assert.equal(isHairProtectedPath('/i/FYH-00001'), false);
  assert.equal(isHairProtectedPath('/invoice/FYH-00001'), false);
});
