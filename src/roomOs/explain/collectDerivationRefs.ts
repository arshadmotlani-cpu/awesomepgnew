/**
 * Scope-aware derivation ref collector — read-only.
 */

import { loadMaterializedPropertyIndex } from '@/src/roomOs/projectors/property/persistPropertyIndex';
import { buildBookingContextSnapshot } from '@/src/roomOs/engines/occupancy/resolveBookingContext';
import type { ExplainScope } from '@/src/roomOs/explain/types';
import type { DerivationRef } from '@/src/roomOs/types';
import { todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';

function dedupeRefs(refs: DerivationRef[]): DerivationRef[] {
  const seen = new Set<string>();
  const out: DerivationRef[] = [];
  for (const ref of refs) {
    const key = `${ref.engine}:${ref.stepId}:${ref.inputDigest}:${ref.outputDigest}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

export async function collectDerivationRefs(scope: ExplainScope): Promise<DerivationRef[]> {
  if (scope.kind === 'booking') {
    const context = await buildBookingContextSnapshot({
      bookingId: scope.bookingId,
      asOf: scope.asOf,
    });
    if (!context) return [];

    const refs: DerivationRef[] = [...context.bookingContext.derivationRefs];
    if (context.bedBrain.bookingContext?.derivationRefs) {
      refs.push(...context.bedBrain.bookingContext.derivationRefs);
    }
    if (context.ledger?.derivationRefs) {
      refs.push(...context.ledger.derivationRefs);
    }
    return dedupeRefs(refs);
  }

  const asOf = scope.asOf ?? todayString();
  const billingMonth = firstOfMonth(scope.billingMonth ?? asOf);
  const materialized = await loadMaterializedPropertyIndex({
    pgId: scope.pgId,
    billingMonth,
  });

  if (materialized?.derivationRefs?.length) {
    return dedupeRefs(materialized.derivationRefs);
  }

  return [];
}
