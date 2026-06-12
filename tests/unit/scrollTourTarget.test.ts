import assert from 'node:assert/strict';
import test from 'node:test';
import { ONBOARDING_STEPS } from '../../src/lib/cockroach/onboardingSteps';

test('onboarding tour sub-step count matches progress denominator', () => {
  const total = ONBOARDING_STEPS.reduce((n, s) => n + s.subSteps.length, 0);
  assert.ok(total >= ONBOARDING_STEPS.length);
  assert.equal(total, 6);
});
