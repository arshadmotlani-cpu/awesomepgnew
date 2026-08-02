/**
 * Explain Engine orchestrator — Wave 4 read-only.
 */

import { collectDerivationRefs } from '@/src/roomOs/explain/collectDerivationRefs';
import { buildDerivationGraph } from '@/src/roomOs/explain/buildDerivationGraph';
import { formatExplanationNarrative } from '@/src/roomOs/explain/formatNarrative';
import type { ExplainScope, ExplanationReport } from '@/src/roomOs/explain/types';

export async function runExplain(scope: ExplainScope): Promise<ExplanationReport> {
  const refs = await collectDerivationRefs(scope);
  const graph = buildDerivationGraph(refs);
  const narrative = formatExplanationNarrative(graph);

  return {
    contractVersion: 'explain/v1',
    scope,
    status: refs.length > 0 ? 'ready' : 'not_found',
    refs,
    graph,
    narrative,
    computedAt: new Date().toISOString(),
  };
}
