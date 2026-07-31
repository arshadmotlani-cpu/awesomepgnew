import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findClosestOfficialService,
  isCatalogHygieneEnforced,
  isOfficialCatalogName,
  isTestServiceName,
  shouldHideServiceFromBillable,
  stripTestNoise,
} from '../../../src/hair/lib/serviceCatalogHygiene.ts';

test('isTestServiceName detects UAT, RC, and demo labels', () => {
  assert.equal(isTestServiceName('RC Haircut UAT'), true);
  assert.equal(isTestServiceName('Premium Hair Trimming UAT UAT'), true);
  assert.equal(isTestServiceName('TEST Blow Dry'), true);
  assert.equal(isTestServiceName('RC-001 Demo'), true);
  assert.equal(isTestServiceName('STYLIST SIGNATURE HAIR CUT'), false);
});

test('isOfficialCatalogName matches allowlisted salon services', () => {
  assert.equal(isOfficialCatalogName('STYLIST SIGNATURE HAIR CUT'), true);
  assert.equal(isOfficialCatalogName('RC Haircut UAT'), false);
});

test('stripTestNoise removes UAT and RC noise for fuzzy matching', () => {
  assert.equal(stripTestNoise('RC Haircut UAT UAT'), 'Haircut');
});

test('findClosestOfficialService maps polluted labels to official catalogue', () => {
  const match = findClosestOfficialService('RC Haircut UAT UAT');
  assert.ok(match);
  assert.match(match!.entry.name, /hair cut/i);
  assert.equal(isOfficialCatalogName(match!.entry.name), true);
});

test('shouldHideServiceFromBillable respects HAIR_CATALOG_STRICT', () => {
  const prev = process.env.HAIR_CATALOG_STRICT;
  process.env.HAIR_CATALOG_STRICT = '1';
  try {
    assert.equal(isCatalogHygieneEnforced(), true);
    assert.equal(shouldHideServiceFromBillable('RC Haircut UAT', null), true);
    assert.equal(shouldHideServiceFromBillable('STYLIST SIGNATURE HAIR CUT', null), false);
  } finally {
    if (prev === undefined) delete process.env.HAIR_CATALOG_STRICT;
    else process.env.HAIR_CATALOG_STRICT = prev;
  }

  process.env.HAIR_CATALOG_STRICT = '0';
  try {
    assert.equal(shouldHideServiceFromBillable('RC Haircut UAT', 'RC-CUT'), false);
  } finally {
    if (prev === undefined) delete process.env.HAIR_CATALOG_STRICT;
    else process.env.HAIR_CATALOG_STRICT = prev;
  }
});
