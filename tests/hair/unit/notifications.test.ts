import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TEMPLATE_BODIES,
  interpolateTemplate,
  renderTemplate,
  buildWhatsAppUrl,
} from '../../../src/hair/services/notifications.ts';

test('interpolateTemplate replaces placeholders', () => {
  const out = interpolateTemplate('Hi {{name}}, due {{amount}}', {
    name: 'Ada',
    amount: '₹100',
  });
  assert.equal(out, 'Hi Ada, due ₹100');
});

test('buildWhatsAppUrl encodes body and strips non-digits', () => {
  const url = buildWhatsAppUrl('+91 98765 43210', 'Hello & welcome');
  assert.match(url, /^https:\/\/wa\.me\/919876543210\?text=/);
  assert.ok(url.includes(encodeURIComponent('Hello & welcome')));
});

test('renderTemplate uses settings override over default seed', async () => {
  const body = await renderTemplate(
    'review_request',
    { name: 'Sam', link: 'https://example.com/review' },
    { reviewRequestTemplate: 'Hey {{name}} — review us: {{link}}' },
  );
  assert.equal(body, 'Hey Sam — review us: https://example.com/review');
});

test('renderTemplate falls back to default seed without settings or DB lookup', () => {
  const body = interpolateTemplate(DEFAULT_TEMPLATE_BODIES.birthday, { name: 'Alex' });
  assert.equal(body, DEFAULT_TEMPLATE_BODIES.birthday.replace('{{name}}', 'Alex'));
});

test('renderTemplate whatsapp_invoice uses communication override', async () => {
  const body = await renderTemplate(
    'whatsapp_invoice',
    { name: 'Jo', amount: '₹500', link: 'https://x/b/1' },
    { whatsappInvoiceTemplate: 'Bill {{amount}} for {{name}} at {{link}}' },
  );
  assert.equal(body, 'Bill ₹500 for Jo at https://x/b/1');
});
