import assert from 'node:assert/strict';
import test from 'node:test';
import { isHairHost } from '@/src/hair/lib/host';
import {
  isSessionHostOrgMismatch,
  parseHairTenantSlug,
} from '@/src/hair/lib/tenant/subdomain';

test('F1 apex hosts are not tenant-bound', () => {
  assert.equal(parseHairTenantSlug('fyhair.awesomepg.in'), null);
  assert.equal(parseHairTenantSlug('fyhair.localhost'), null);
  assert.equal(isHairHost('fyhair.awesomepg.in'), true);
});

test('F2 tenant slug parsed from fyhair.app and staging parents', () => {
  assert.equal(parseHairTenantSlug('acme.fyhair.app'), 'acme');
  assert.equal(parseHairTenantSlug('acme.fyhair.awesomepg.in'), 'acme');
  assert.equal(parseHairTenantSlug('acme.fyhair.localhost'), 'acme');
  assert.equal(isHairHost('acme.fyhair.app'), true);
  assert.equal(isHairHost('acme.fyhair.localhost'), true);
});

test('F3 reserved labels and invalid hosts rejected', () => {
  assert.equal(parseHairTenantSlug('www.fyhair.app'), null);
  assert.equal(parseHairTenantSlug('api.fyhair.app'), null);
  assert.equal(parseHairTenantSlug('invest.awesomepg.in'), null);
  assert.equal(isHairHost('invest.awesomepg.in'), false);
});

test('F4 Org A session on Org B host is mismatch (deny)', () => {
  const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const orgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.equal(isSessionHostOrgMismatch(orgA, orgB), true);
  assert.equal(isSessionHostOrgMismatch(orgA, orgA), false);
  assert.equal(isSessionHostOrgMismatch(null, orgB), true);
  assert.equal(isSessionHostOrgMismatch(orgA, null), false);
});
