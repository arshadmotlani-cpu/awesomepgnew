import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_BILLING_SETTINGS,
  DEFAULT_INVENTORY_SETTINGS,
  DEFAULT_PRINTER_SETTINGS,
  DEFAULT_WHATSAPP_SETTINGS,
} from '../../../src/hair/services/settings.ts';

test('settings defaults are conservative', () => {
  assert.equal(DEFAULT_BILLING_SETTINGS.defaultMarkDue, false);
  assert.equal(DEFAULT_BILLING_SETTINGS.defaultMarkFullDue, false);
  assert.equal(DEFAULT_BILLING_SETTINGS.defaultCreditOverpayAsAdvance, false);
  assert.equal(DEFAULT_PRINTER_SETTINGS.receiptWidthMm, 80);
  assert.equal(DEFAULT_PRINTER_SETTINGS.autoPrint, false);
  assert.equal(DEFAULT_WHATSAPP_SETTINGS.enabled, false);
  assert.equal(DEFAULT_INVENTORY_SETTINGS.allowNegativeStock, false);
});
