import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ONBOARDING_STEPS,
  tourTargetSelector,
} from '../../src/lib/cockroach/onboardingSteps';

test('ONBOARDING_STEPS has 11 steps with expected tour targets', () => {
  assert.equal(ONBOARDING_STEPS.length, 11);
  assert.equal(ONBOARDING_STEPS[0]!.subSteps[0]!.target, 'support');
  assert.equal(ONBOARDING_STEPS[1]!.subSteps[0]!.target, 'room');
  assert.equal(ONBOARDING_STEPS[1]!.subSteps[1]!.target, 'bed-grid');
  assert.equal(ONBOARDING_STEPS[5]!.subSteps.length, 3);
  assert.equal(ONBOARDING_STEPS[5]!.durationMs, 12000);
  assert.equal(ONBOARDING_STEPS[9]!.id, 'ps4-addon');
  assert.equal(ONBOARDING_STEPS[10]!.id, 'done');
});

test('tourTargetSelector builds data attribute query', () => {
  assert.equal(tourTargetSelector('reserve'), '[data-roachie-tour="reserve"]');
});
