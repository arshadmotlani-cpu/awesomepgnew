/**
 * Pure derivation graph builder from flat refs.
 */

import { labelForDerivationStep } from '@/src/roomOs/explain/stepCatalog';
import type {
  DerivationGraph,
  DerivationGraphEdge,
  DerivationGraphNode,
} from '@/src/roomOs/explain/types';
import type { DerivationRef } from '@/src/roomOs/types';

const ENGINE_ORDER = [
  'Occupancy',
  'Electricity',
  'LedgerProjection',
  'PropertyProjector',
  'WorkQueueProjector',
];

function nodeId(ref: DerivationRef): string {
  return `${ref.engine}:${ref.stepId}:${ref.inputDigest}`;
}

export function buildDerivationGraph(refs: DerivationRef[]): DerivationGraph {
  const nodeMap = new Map<string, DerivationGraphNode>();

  for (const ref of refs) {
    const id = nodeId(ref);
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id,
        stepId: ref.stepId,
        engine: ref.engine,
        label: labelForDerivationStep(ref.stepId, ref.engine),
        inputDigest: ref.inputDigest,
        outputDigest: ref.outputDigest,
      });
    }
  }

  const nodes = [...nodeMap.values()].sort((a, b) => {
    const engineDiff =
      ENGINE_ORDER.indexOf(a.engine) - ENGINE_ORDER.indexOf(b.engine);
    if (engineDiff !== 0) return engineDiff;
    return a.stepId.localeCompare(b.stepId);
  });

  const edges: DerivationGraphEdge[] = [];
  for (let i = 1; i < nodes.length; i += 1) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    if (prev.engine !== curr.engine || ENGINE_ORDER.includes(curr.engine)) {
      edges.push({ from: prev.id, to: curr.id, relation: 'feeds' });
    }
  }

  return { nodes, edges };
}
