/**
 * Preflight scope validation — ADR-OR-001 error codes.
 */

import { isPreflightScenario, SCENARIO_SCOPE_REQUIREMENTS } from '@/src/roomOs/integrity/catalog/v1/scenarios';
import { bookingBelongsToPg, pgExists } from '@/src/roomOs/integrity/checks/readers/resolvePgForRoom';
import type { PreflightError, PreflightScope } from '@/src/roomOs/integrity/types';

export type ValidateScopeResult =
  | { ok: true; scope: PreflightScope }
  | { ok: false; error: PreflightError };

export async function validatePreflightScope(input: PreflightScope): Promise<ValidateScopeResult> {
  if (!input.pgId?.trim()) {
    return { ok: false, error: { code: 'INVALID_SCOPE', message: 'pgId is required.' } };
  }
  if (!input.requestedAt?.trim()) {
    return { ok: false, error: { code: 'INVALID_SCOPE', message: 'requestedAt is required.' } };
  }
  if (!input.scenario?.trim()) {
    return { ok: false, error: { code: 'INVALID_SCOPE', message: 'scenario is required.' } };
  }
  if (!isPreflightScenario(input.scenario)) {
    return { ok: false, error: { code: 'UNKNOWN_SCENARIO', message: `Unknown scenario: ${input.scenario}` } };
  }

  const requirements = SCENARIO_SCOPE_REQUIREMENTS[input.scenario];
  if (requirements.bookingId && !input.bookingId) {
    return {
      ok: false,
      error: { code: 'INVALID_SCOPE', message: `bookingId is required for ${input.scenario}.` },
    };
  }
  if (requirements.customerId && !input.customerId && !input.bookingId) {
    return {
      ok: false,
      error: {
        code: 'INVALID_SCOPE',
        message: `customerId or bookingId is required for ${input.scenario}.`,
      },
    };
  }
  if (requirements.roomId && !input.roomId) {
    return {
      ok: false,
      error: { code: 'INVALID_SCOPE', message: `roomId is required for ${input.scenario}.` },
    };
  }
  if (requirements.bedId && !input.bedId) {
    return {
      ok: false,
      error: { code: 'INVALID_SCOPE', message: `bedId is required for ${input.scenario}.` },
    };
  }
  if (requirements.billingMonth && !input.billingMonth) {
    return {
      ok: false,
      error: { code: 'INVALID_SCOPE', message: `billingMonth is required for ${input.scenario}.` },
    };
  }

  const exists = await pgExists(input.pgId);
  if (!exists) {
    return { ok: false, error: { code: 'PG_NOT_FOUND', message: `Property ${input.pgId} not found.` } };
  }

  if (input.bookingId) {
    const belongs = await bookingBelongsToPg(input.bookingId, input.pgId);
    if (!belongs) {
      return {
        ok: false,
        error: {
          code: 'SCOPE_MISMATCH',
          message: `Booking ${input.bookingId} does not belong to property ${input.pgId}.`,
        },
      };
    }
  }

  return { ok: true, scope: input };
}
