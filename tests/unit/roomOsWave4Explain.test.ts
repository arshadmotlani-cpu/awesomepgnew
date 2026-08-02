/**
 * Room OS Wave 4 — Explain Engine tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildDerivationGraph } from '@/src/roomOs/explain/buildDerivationGraph';
import { formatExplanationNarrative } from '@/src/roomOs/explain/formatNarrative';
import { labelForDerivationStep } from '@/src/roomOs/explain/stepCatalog';
import type { DerivationRef } from '@/src/roomOs/types';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

const SAMPLE_REFS: DerivationRef[] = [
  {
    stepId: 'occupancy.resolve',
    engine: 'Occupancy',
    inputDigest: 'bed:b1',
    outputDigest: 'occupied',
  },
  {
    stepId: 'ledger.financial_summary',
    engine: 'LedgerProjection',
    inputDigest: 'booking:b1',
    outputDigest: 'outstanding:1000',
  },
  {
    stepId: 'property_index.assemble',
    engine: 'PropertyProjector',
    inputDigest: 'pg:pg1',
    outputDigest: 'beds:10',
  },
];

describe('Room OS Wave 4 — Explain Engine', () => {
  test('buildDerivationGraph orders nodes by engine chain', () => {
    const graph = buildDerivationGraph(SAMPLE_REFS);
    assert.equal(graph.nodes.length, 3);
    assert.equal(graph.nodes[0]?.engine, 'Occupancy');
    assert.equal(graph.nodes[2]?.engine, 'PropertyProjector');
    assert.ok(graph.edges.length >= 2);
  });

  test('formatExplanationNarrative produces lines without recompute', () => {
    const graph = buildDerivationGraph(SAMPLE_REFS);
    const narrative = formatExplanationNarrative(graph);
    assert.equal(narrative.length, 3);
    assert.match(narrative[0], /^1\./);
    assert.match(narrative[0], /Bed occupancy/);
  });

  test('stepCatalog maps known stepIds', () => {
    assert.match(labelForDerivationStep('occupancy.resolve', 'Occupancy'), /occupancy/i);
  });

  test('explain module must not import repair writers or engines for recompute', () => {
    const files = [
      'src/roomOs/explain/collectDerivationRefs.ts',
      'src/roomOs/explain/runExplain.ts',
      'src/roomOs/explain/buildDerivationGraph.ts',
    ];
    for (const file of files) {
      const src = read(file);
      assert.doesNotMatch(src, /billingIntegrityRepair/);
      assert.doesNotMatch(src, /projectInvoice/);
      assert.doesNotMatch(src, /appendRoomOsOutboxEntry/);
    }
  });

  test('explain/v1 API wrapper exists', () => {
    const api = read('src/roomOs/api/v1/explain.ts');
    assert.match(api, /explain\/v1/);
    assert.match(api, /getExplanation/);
  });
});
