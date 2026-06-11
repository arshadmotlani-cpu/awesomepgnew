import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearOnboardingState,
  isOnboardingComplete,
  isOnboardingSkipped,
  markOnboardingComplete,
  markOnboardingSkipped,
  shouldRunOnboarding,
} from '../../src/lib/cockroach/onboardingStorage';

function withLocalStorage(run: () => void) {
  const store = new Map<string, string>();
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
  try {
    run();
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: original,
    });
  }
}

test('onboarding storage tracks complete and skip independently', () => {
  withLocalStorage(() => {
  clearOnboardingState();
  assert.equal(shouldRunOnboarding(), true);

  markOnboardingSkipped();
  assert.equal(isOnboardingSkipped(), true);
  assert.equal(shouldRunOnboarding(), false);

  clearOnboardingState();
  markOnboardingComplete();
  assert.equal(isOnboardingComplete(), true);
  assert.equal(shouldRunOnboarding(), false);
  });
});
