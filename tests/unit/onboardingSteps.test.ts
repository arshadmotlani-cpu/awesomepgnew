import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ONBOARDING_STEPS,
  tourTargetSelector,
} from '../../src/lib/cockroach/onboardingSteps';

test('ONBOARDING_STEPS has essential tour steps only', () => {
  assert.equal(ONBOARDING_STEPS.length, 6);
  assert.equal(ONBOARDING_STEPS[0]!.subSteps[0]!.target, 'support');
  assert.equal(ONBOARDING_STEPS[1]!.subSteps[0]!.target, 'bed-map');
  assert.equal(ONBOARDING_STEPS[2]!.subSteps[0]!.target, 'bed-grid');
  assert.equal(ONBOARDING_STEPS[3]!.id, 'bed-notice');
  assert.equal(ONBOARDING_STEPS[5]!.id, 'done');
});

test('tourTargetSelector builds data attribute query', () => {
  assert.equal(tourTargetSelector('reserve'), '[data-roachie-tour="reserve"]');
});
