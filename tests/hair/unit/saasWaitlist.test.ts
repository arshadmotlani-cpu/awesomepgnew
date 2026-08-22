import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSaasWaitlistForm } from '../../../src/hair/lib/saasWaitlist.ts';

test('waitlist parse requires salon, owner, email', () => {
  const bad = parseSaasWaitlistForm({
    salonName: '',
    ownerName: 'A',
    email: 'nope',
    phone: '',
    city: '',
    notes: '',
    website: '',
  });
  assert.equal(bad.ok, false);
});

test('waitlist parse accepts a valid lead and lowercases email', () => {
  const ok = parseSaasWaitlistForm({
    salonName: 'North Salon',
    ownerName: 'Priya',
    email: 'Priya@Example.COM',
    phone: '999',
    city: 'Nagpur',
    notes: 'POS',
    website: '',
  });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value.email, 'priya@example.com');
});

test('honeypot website field is rejected', () => {
  const bot = parseSaasWaitlistForm({
    salonName: 'North Salon',
    ownerName: 'Priya',
    email: 'priya@example.com',
    phone: '',
    city: '',
    notes: '',
    website: 'http://spam',
  });
  assert.equal(bot.ok, false);
});
