import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hairPublicToInternal,
  isHairHost,
  isHairProtectedPath,
  isHairPublicPath,
  isHairTenantExemptPath,
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
  assert.equal(hairPublicToInternal('/vendors'), '/fyh/vendors');
  assert.equal(hairPublicToInternal('/vendors/new'), '/fyh/vendors/new');
  assert.equal(hairPublicToInternal('/purchases'), '/fyh/purchases');
  assert.equal(hairPublicToInternal('/expenses'), '/fyh/expenses');
  assert.equal(isHairPublicPath('/vendors'), true);
  assert.equal(isHairProtectedPath('/vendors'), true);
  assert.equal(hairPublicToInternal('/admin'), null);
});

test('maps /team for preview and fyhair public paths', () => {
  assert.equal(isHairPublicPath('/team'), true);
  assert.equal(hairPublicToInternal('/team'), '/fyh/team');
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

test('salon-software marketing page is public and unauthenticated', () => {
  assert.equal(isHairPublicPath('/salon-software'), true);
  assert.equal(isHairProtectedPath('/salon-software'), false);
  assert.equal(isHairProtectedPath('/fyh/salon-software'), false);
  assert.equal(hairPublicToInternal('/salon-software'), '/fyh/salon-software');
});

test('select-organization is tenant-exempt on public and /fyh paths', () => {
  assert.equal(isHairTenantExemptPath('/select-organization'), true);
  assert.equal(isHairTenantExemptPath('/fyh/select-organization'), true);
  assert.equal(isHairTenantExemptPath('/landing'), false);
});

test('subscribe paywall is tenant-exempt and publicly routable', () => {
  assert.equal(isHairTenantExemptPath('/subscribe'), true);
  assert.equal(isHairTenantExemptPath('/fyh/subscribe'), true);
  assert.equal(isHairPublicPath('/subscribe'), true);
  assert.equal(hairPublicToInternal('/subscribe'), '/fyh/subscribe');
});

test('Phase F tenant subdomains are Hair hosts', () => {
  assert.equal(isHairHost('acme.fyhair.app'), true);
  assert.equal(isHairHost('acme.fyhair.localhost'), true);
  assert.equal(isHairHost('www.fyhair.app'), false);
});
