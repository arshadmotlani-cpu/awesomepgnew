/**
 * Explain Engine types — Wave 4 read-only explainability.
 */

import type { DerivationRef } from '@/src/roomOs/types';

export type ExplainScope =
  | { kind: 'booking'; bookingId: string; asOf?: string }
  | { kind: 'property'; pgId: string; billingMonth?: string; asOf?: string };

export type DerivationGraphNode = {
  id: string;
  stepId: string;
  engine: string;
  label: string;
  inputDigest: string;
  outputDigest: string;
};

export type DerivationGraphEdge = {
  from: string;
  to: string;
  relation: 'feeds' | 'depends';
};

export type DerivationGraph = {
  nodes: DerivationGraphNode[];
  edges: DerivationGraphEdge[];
};

export type ExplanationReport = {
  contractVersion: 'explain/v1';
  scope: ExplainScope;
  status: 'ready' | 'not_found';
  refs: DerivationRef[];
  graph: DerivationGraph;
  narrative: string[];
  computedAt: string;
};
