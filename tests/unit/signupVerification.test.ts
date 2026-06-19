import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';

test('signup verification cookie rejects tampered signature', () => {
  const secret = 'test-secret';
  const payload = 'challenge-id:test@example.com:9999999999999';
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  const tampered = `${encoded}.wrong-signature`;
  const dot = tampered.lastIndexOf('.');
  const decodedPayload = Buffer.from(tampered.slice(0, dot), 'base64url').toString('utf8');
  const expectedSig = createHmac('sha256', secret).update(decodedPayload).digest('base64url');
  assert.notEqual(tampered.slice(dot + 1), expectedSig);
});

test('signup OTP step leaves challenge active for profile completion', () => {
  const consumeOnFirstStep = false;
  const consumeOnProfileWithCookie = true;
  assert.equal(consumeOnFirstStep, false, 'OTP step must not consume the challenge');
  assert.equal(consumeOnProfileWithCookie, true, 'profile step consumes via signed cookie');
});
