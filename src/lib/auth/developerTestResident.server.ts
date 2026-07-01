import { env } from '@/src/lib/env';
import type { CustomerSession } from '@/src/lib/auth/session';

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/** True only in non-production when DEVELOPER_TEST_EMAIL matches the signed-in resident. */
export function isDeveloperTestResidentEmail(email: string | null | undefined): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const configured = normalizeEmail(env.DEVELOPER_TEST_EMAIL);
  if (!configured) return false;
  return normalizeEmail(email) === configured;
}

export function isDeveloperTestSession(session: CustomerSession | null | undefined): boolean {
  if (!session || session.kind !== 'customer') return false;
  return isDeveloperTestResidentEmail(session.email);
}

export {
  DEV_RESIDENT_DURATION_COOKIE,
  applyDeveloperTestEligibilityOverride,
  applyDeveloperTestRefundPageOverride,
  isDeveloperTestActive,
  mapDevDurationToBookingMode,
  parseDevResidentDurationMode,
  type DevResidentDurationMode,
} from '@/src/lib/auth/developerTestResident.shared';
