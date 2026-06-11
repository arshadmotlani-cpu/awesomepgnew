const COMPLETE_KEY = 'roachie-onboarding-complete';
const SKIPPED_KEY = 'roachie-onboarding-skipped';

function storage(): Storage | null {
  try {
    if (typeof globalThis.localStorage?.getItem === 'function') {
      return globalThis.localStorage;
    }
  } catch {
    /* private mode / SSR */
  }
  return null;
}

/** Tour finished normally (step 10). */
export function isOnboardingComplete(): boolean {
  const ls = storage();
  if (!ls) return false;
  return ls.getItem(COMPLETE_KEY) === '1';
}

/** User tapped Skip anytime. */
export function isOnboardingSkipped(): boolean {
  const ls = storage();
  if (!ls) return false;
  return ls.getItem(SKIPPED_KEY) === '1';
}

export function shouldRunOnboarding(): boolean {
  return !isOnboardingComplete() && !isOnboardingSkipped();
}

export function markOnboardingComplete(): void {
  storage()?.setItem(COMPLETE_KEY, '1');
}

export function markOnboardingSkipped(): void {
  storage()?.setItem(SKIPPED_KEY, '1');
}

/** Reset helpers for tests / dev only. */
export function clearOnboardingState(): void {
  const ls = storage();
  if (!ls) return;
  ls.removeItem(COMPLETE_KEY);
  ls.removeItem(SKIPPED_KEY);
}
