import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  SITE_OWNER_PHONE_LOCAL,
  siteWhatsAppPhoneDigits,
  siteWhatsAppUrl,
} from '../../src/lib/siteContact';

test('site contact uses owner WhatsApp digits', () => {
  assert.equal(SITE_OWNER_PHONE_LOCAL, '9049163636');
  assert.equal(siteWhatsAppPhoneDigits(), '919049163636');
  assert.equal(siteWhatsAppUrl(), 'https://wa.me/919049163636');
  assert.ok(
    siteWhatsAppUrl('Hello').startsWith('https://wa.me/919049163636?text='),
  );
});
