/**
 * Integrity preflight scenario allowlist — OR-0 catalog (OPERATIONS_RECOVERY).
 */

import type { PreflightScenario } from '@/src/roomOs/integrity/types';

export type ScenarioScopeRequirements = {
  bookingId?: boolean;
  customerId?: boolean;
  roomId?: boolean;
  bedId?: boolean;
  billingMonth?: boolean;
};

export const SCENARIO_SCOPE_REQUIREMENTS: Record<PreflightScenario, ScenarioScopeRequirements> = {
  ROLLBACK_VACATING: { bookingId: true },
  REACTIVATE_BOOKING: { bookingId: true },
  RENT_ONLY_ONBOARDING: { bookingId: true },
  REGENERATE_ELECTRICITY: { roomId: true, billingMonth: true },
  REPAIR_OCCUPANCY: { bookingId: true },
  ROOM_TRANSFER: { bookingId: true, bedId: true },
};

export function isPreflightScenario(value: string): value is PreflightScenario {
  return (Object.keys(SCENARIO_SCOPE_REQUIREMENTS) as PreflightScenario[]).includes(
    value as PreflightScenario,
  );
}
