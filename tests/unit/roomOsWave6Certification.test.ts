/**
 * Room OS Wave 6 — certification catalog tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { CERTIFICATION_CHECKS_V1 } from '@/src/roomOs/certification/catalog/v1';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('Room OS Wave 6 — Certification', () => {
  test('v1 check catalog covers 14 Shantinagar parity checks (Wave 6 workflow + metrics)', () => {
    assert.equal(CERTIFICATION_CHECKS_V1.length, 14);
    const checkIds = CERTIFICATION_CHECKS_V1.map((c) => c.checkId).sort();
    assert.deepEqual(checkIds, [
      'BED_OCCUPANCY_PARITY',
      'BOOKING_LEDGER_PARITY',
      'BUSINESS_METRICS_ROLLUP_PARITY',
      'PAYMENT_PROOF_STATE_PARITY',
      'PROPERTY_INDEX_MATERIALIZED_PARITY',
      'PROPERTY_KPI_STRIP_PARITY',
      'REPLAY_SAMPLE_PARITY',
      'RFE_BED_BRAIN_BRIDGE',
      'ROOM_ELECTRICITY_STATUS_PARITY',
      'RULES_DB_PARITY',
      'SHANTINAGAR_PORTAL_PARITY',
      'TIMELINE_LAYER_B',
      'WORKFLOW_PAYMENT_PROOF_PARITY',
      'WORK_QUEUE_MATERIALIZED_PARITY',
    ]);
  });

  test('Wave 6 checks wired in runCertification', () => {
    const runner = read('src/roomOs/certification/runCertification.ts');
    assert.match(runner, /runWorkflowPaymentProofParityChecks/);
    assert.match(runner, /runBusinessMetricsRollupParityChecks/);
  });

  test('cert:room-os-wave6 npm script exists', () => {
    const pkg = read('package.json');
    assert.match(pkg, /"cert:room-os-wave6"/);
  });
});
