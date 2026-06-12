import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildKycWhatsAppMessage,
  buildKycWhatsAppUrl,
  customerKycUploadUrl,
  needsKycReminder,
  whatsAppPhoneDigits,
} from '../../src/lib/kyc/adminWhatsApp';

test('customerKycUploadUrl points to identity section', () => {
  assert.equal(
    customerKycUploadUrl('https://awesomepg.in'),
    'https://awesomepg.in/account/profile?section=identity',
  );
});

test('buildKycWhatsAppUrl encodes message with KYC link', () => {
  const url = buildKycWhatsAppUrl({
    phone: '9876543210',
    customerName: 'Arshad Khan',
    baseUrl: 'https://awesomepg.in',
  });
  assert.ok(url?.startsWith('https://wa.me/919876543210?text='));
  const decoded = decodeURIComponent(url!.split('text=')[1]!);
  assert.match(decoded, /complete your KYC/);
  assert.match(decoded, /account\/profile\?section=identity/);
  assert.match(decoded, /Hi Arshad/);
});

test('needsKycReminder for pending and rejected only', () => {
  assert.equal(needsKycReminder('pending'), true);
  assert.equal(needsKycReminder('rejected'), true);
  assert.equal(needsKycReminder('approved'), false);
});

test('whatsAppPhoneDigits normalises Indian numbers', () => {
  assert.equal(whatsAppPhoneDigits('+919876543210'), '919876543210');
  assert.equal(whatsAppPhoneDigits('invalid'), null);
});

test('buildKycWhatsAppMessage uses first name', () => {
  const msg = buildKycWhatsAppMessage({
    customerName: 'Ishan Patel',
    kycUrl: 'https://awesomepg.in/account/profile?section=identity',
  });
  assert.match(msg, /^Hi Ishan,/);
});
