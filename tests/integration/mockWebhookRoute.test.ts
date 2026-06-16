import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { hasDatabaseUrl } from '../../src/lib/db/env';

const FORGED_EVENT = {
  kind: 'payment_succeeded',
  providerPaymentId: 'forged_pay_integration_test',
  providerOrderId: 'forged_order_integration_test',
  amountPaise: 1,
  currency: 'INR',
  receipt: 'APG-2099-9999',
};

function mockWebhookRequest(body: string, headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/webhooks/mock', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}

describe('mock webhook route source guard ordering', () => {
  it('verifies auth runs before recordPaymentSuccess in route handler', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/api/webhooks/mock/route.ts'),
      'utf8',
    );
    const authIdx = source.indexOf('verifyMockWebhookRequest');
    const payIdx = source.indexOf('recordPaymentSuccess');
    assert.ok(authIdx >= 0, 'route must call verifyMockWebhookRequest');
    assert.ok(payIdx >= 0, 'route references recordPaymentSuccess');
    assert.ok(authIdx < payIdx, 'auth must precede payment lifecycle handlers');
  });
});

describe('POST /api/webhooks/mock route integration', () => {
  const envBackup = {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    MOCK_WEBHOOK_SECRET: process.env.MOCK_WEBHOOK_SECRET,
  };

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.VERCEL_ENV = undefined;
    process.env.MOCK_WEBHOOK_SECRET = 'integration-test-mock-webhook-secret';
  });

  afterEach(() => {
    process.env.NODE_ENV = envBackup.NODE_ENV;
    process.env.VERCEL_ENV = envBackup.VERCEL_ENV;
    process.env.MOCK_WEBHOOK_SECRET = envBackup.MOCK_WEBHOOK_SECRET;
  });

  it('returns 404 in production', async () => {
    process.env.NODE_ENV = 'production';
    const { POST } = await import('../../app/api/webhooks/mock/route');
    const res = await POST(mockWebhookRequest(JSON.stringify(FORGED_EVENT)));
    assert.equal(res.status, 404);
  });

  it('rejects unsigned payload with 401', async () => {
    const { POST } = await import('../../app/api/webhooks/mock/route');
    const body = JSON.stringify(FORGED_EVENT);
    const res = await POST(mockWebhookRequest(body));
    assert.equal(res.status, 401);
    const json = (await res.json()) as { ok: boolean; reason?: string };
    assert.equal(json.ok, false);
    assert.match(json.reason ?? '', /signature/i);
  });

  if (hasDatabaseUrl()) {
    it('does not create payment rows or confirm bookings on unsigned POST', async () => {
      const { db } = await import('../../src/db/client');
      const { bookings, payments } = await import('../../src/db/schema');

      const [pending] = await db
        .select({
          id: bookings.id,
          bookingCode: bookings.bookingCode,
          status: bookings.status,
        })
        .from(bookings)
        .where(eq(bookings.status, 'pending_payment'))
        .limit(1);

      if (!pending) return;

      const paymentsBefore = await db
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.bookingId, pending.id));

      const { POST } = await import('../../app/api/webhooks/mock/route');
      const body = JSON.stringify({
        ...FORGED_EVENT,
        receipt: pending.bookingCode,
      });
      const res = await POST(mockWebhookRequest(body));
      assert.equal(res.status, 401);

      const [bookingAfter] = await db
        .select({ status: bookings.status })
        .from(bookings)
        .where(eq(bookings.id, pending.id))
        .limit(1);
      assert.equal(bookingAfter?.status, pending.status);

      const paymentsAfter = await db
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.bookingId, pending.id));
      assert.equal(paymentsAfter.length, paymentsBefore.length);
    });
  }
});
