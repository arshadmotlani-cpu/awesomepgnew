import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaledProofDimensions } from '@/src/lib/payments/clientProofImagePrep';
import { PROOF_MAX_EDGE_PX } from '@/src/lib/payments/proofUploadLimits';

test('scaledProofDimensions keeps aspect ratio and caps long edge', () => {
  assert.deepEqual(scaledProofDimensions(4000, 3000), { width: 1200, height: 900 });
  assert.deepEqual(scaledProofDimensions(800, 600), { width: 800, height: 600 });
  assert.deepEqual(scaledProofDimensions(3000, 4000), { width: 900, height: 1200 });
});

test('scaledProofDimensions respects custom max edge', () => {
  assert.deepEqual(scaledProofDimensions(2000, 1000, 1000), { width: 1000, height: 500 });
  assert.equal(PROOF_MAX_EDGE_PX, 1200);
});
