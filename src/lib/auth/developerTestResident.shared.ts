import type { DepositRefundEligibility } from '@/src/lib/vacating/depositRefundEligibility';

export const DEV_RESIDENT_DURATION_COOKIE = 'dev_resident_duration_mode';

export type DevResidentDurationMode = 'monthly' | 'weekly' | 'daily';

const DEV_DURATION_MODES: DevResidentDurationMode[] = ['monthly', 'weekly', 'daily'];

export function parseDevResidentDurationMode(
  value: string | null | undefined,
): DevResidentDurationMode | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  return DEV_DURATION_MODES.includes(normalized as DevResidentDurationMode)
    ? (normalized as DevResidentDurationMode)
    : null;
}

export function mapDevDurationToBookingMode(mode: DevResidentDurationMode): string {
  if (mode === 'weekly') return 'weekly';
  if (mode === 'daily') return 'daily';
  return 'monthly';
}

export function isDeveloperTestActive(developerTestEmail: string | null | undefined): boolean {
  return Boolean(developerTestEmail?.trim());
}

/** Unlocks resident workflow gates in UI when developer test mode is active. */
export function applyDeveloperTestEligibilityOverride(
  developerTestEmail: string | null | undefined,
  eligibility: DepositRefundEligibility,
): DepositRefundEligibility {
  if (!isDeveloperTestActive(developerTestEmail)) return eligibility;
  return {
    canRequestRefund: true,
    lockReason: null,
    unlockState: 'unlocked',
  };
}

export function applyDeveloperTestRefundPageOverride(
  developerTestEmail: string | null | undefined,
  canRenderForm: boolean,
  blockedMessage: string | null,
): { canRenderForm: boolean; blockedMessage: string | null } {
  if (!isDeveloperTestActive(developerTestEmail)) {
    return { canRenderForm, blockedMessage };
  }
  return {
    canRenderForm: true,
    blockedMessage: null,
  };
}
