/**
 * Structured purchase-write trail for debugging live recalc.
 * Gated to non-production unless CAPITAL_DEBUG_TRAIL=1.
 */
export function capitalTrail(stage: string, detail?: Record<string, unknown>) {
  const enabled =
    process.env.CAPITAL_DEBUG_TRAIL === '1' || process.env.NODE_ENV !== 'production';
  if (!enabled) return;
  console.info(`[capital-trail] ${stage}`, detail ?? {});
}
