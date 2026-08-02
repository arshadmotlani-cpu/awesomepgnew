/**
 * Scope digest — deterministic hash of normalized preflight input.
 */

import { createHash } from 'node:crypto';
import type { PreflightScope } from '@/src/roomOs/integrity/types';

export function normalizePreflightScope(scope: PreflightScope): Record<string, unknown> {
  return {
    pgId: scope.pgId,
    scenario: scope.scenario,
    bookingId: scope.bookingId ?? null,
    customerId: scope.customerId ?? null,
    roomId: scope.roomId ?? null,
    bedId: scope.bedId ?? null,
    billingMonth: scope.billingMonth ?? null,
    linkedPayment: scope.linkedPayment ?? null,
    constraints: scope.constraints ?? null,
    requestedAt: scope.requestedAt,
  };
}

export function computeScopeDigest(scope: PreflightScope): string {
  return createHash('sha256').update(JSON.stringify(normalizePreflightScope(scope))).digest('hex');
}
