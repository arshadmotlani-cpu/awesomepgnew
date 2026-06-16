import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  isMockWebhookRouteEnabled,
  isProductionDeployment,
  mockWebhookSecret,
  signMockWebhookPayload,
  verifyMockWebhookRequest,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from '../../src/lib/payments/mockWebhookAuth';

describe('mock webhook production gate', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVercelEnv = process.env.VERCEL_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.VERCEL_ENV = originalVercelEnv;
  });

  it('is disabled in production deployments', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = undefined;
    assert.equal(isProductionDeployment(), true);
    assert.equal(isMockWebhookRouteEnabled(), false);
  });

  it('is enabled in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.VERCEL_ENV = undefined;
    assert.equal(isMockWebhookRouteEnabled(), true);
  });
});

describe('mock webhook HMAC verification', () => {
  const originalSecret = process.env.MOCK_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.MOCK_WEBHOOK_SECRET = 'test-mock-webhook-secret-32chars';
    process.env.NODE_ENV = 'development';
    process.env.VERCEL_ENV = undefined;
  });

  afterEach(() => {
    process.env.MOCK_WEBHOOK_SECRET = originalSecret;
  });

  it('rejects unsigned webhook payloads', async () => {
    const body = JSON.stringify({
      kind: 'payment_succeeded',
      providerPaymentId: 'forged_pay',
      providerOrderId: 'forged_order',
      amountPaise: 1,
      currency: 'INR',
      receipt: 'APG-2026-0001',
    });
    const headers = new Headers({ 'content-type': 'application/json' });
    const result = await verifyMockWebhookRequest(body, headers);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.match(result.reason, /missing mock webhook signature/i);
    }
  });

  it('rejects tampered webhook bodies', async () => {
    const body = JSON.stringify({
      kind: 'payment_succeeded',
      providerPaymentId: 'forged_pay',
      providerOrderId: 'forged_order',
      amountPaise: 999_999_00,
      currency: 'INR',
      receipt: 'APG-2026-0001',
    });
    const signed = signMockWebhookPayload(body);
    const tampered = body.replace('99999900', '100');
    const headers = new Headers(signed.headers);
    const result = await verifyMockWebhookRequest(tampered, headers);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.match(result.reason, /invalid mock webhook signature/i);
    }
  });

  it('rejects forged signatures with wrong secret', async () => {
    const body = '{"kind":"payment_succeeded"}';
    const timestamp = String(Date.now());
    const forged = createHmac('sha256', 'wrong-secret-wrong-secret')
      .update(`${timestamp}.${body}`)
      .digest('hex');
    const headers = new Headers({
      [SIGNATURE_HEADER]: forged,
      [TIMESTAMP_HEADER]: timestamp,
    });
    const result = await verifyMockWebhookRequest(body, headers);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
    }
  });

  it('requires MOCK_WEBHOOK_SECRET to be configured', () => {
    delete process.env.MOCK_WEBHOOK_SECRET;
    assert.equal(mockWebhookSecret(), null);
  });
});
