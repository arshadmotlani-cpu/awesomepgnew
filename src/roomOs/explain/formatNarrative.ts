/**
 * Assemble human-readable narrative from derivation graph — no recompute.
 */

import type { DerivationGraph } from '@/src/roomOs/explain/types';

export function formatExplanationNarrative(graph: DerivationGraph): string[] {
  if (graph.nodes.length === 0) {
    return ['No derivation steps recorded for this scope.'];
  }

  return graph.nodes.map((node, index) => {
    const prefix = `${index + 1}.`;
    return `${prefix} ${node.label} (${node.inputDigest} → ${node.outputDigest})`;
  });
}
