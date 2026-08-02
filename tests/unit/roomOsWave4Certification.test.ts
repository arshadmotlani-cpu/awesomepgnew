/**
 * Room OS Wave 4 — certification catalog tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { CERTIFICATION_CHECKS_V1 } from '@/src/roomOs/certification/catalog/v1';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('Room OS Wave 4 — Certification', () => {
  test('v1 check catalog covers 10 Shantinagar parity checks (Wave 4 replay included)', () => {
    assert.equal(CERTIFICATION_CHECKS_V1.length, 10);
    const checkIds = CERTIFICATION_CHECKS_V1.map((c) => c.checkId).sort();
    assert.deepEqual(checkIds, [
      'BED_OCCUPANCY_PARITY',
      'BOOKING_LEDGER_PARITY',
      'PAYMENT_PROOF_STATE_PARITY',
      'PROPERTY_INDEX_MATERIALIZED_PARITY',
      'PROPERTY_KPI_STRIP_PARITY',
      'REPLAY_SAMPLE_PARITY',
      'RFE_BED_BRAIN_BRIDGE',
      'ROOM_ELECTRICITY_STATUS_PARITY',
      'SHANTINAGAR_PORTAL_PARITY',
      'WORK_QUEUE_MATERIALIZED_PARITY',
    ]);
  });

  test('replay sample parity check wired in runCertification', () => {
    const runner = read('src/roomOs/certification/runCertification.ts');
    assert.match(runner, /runReplaySampleParityChecks/);
  });

  test('cert:room-os-wave4 npm script exists', () => {
    const pkg = read('package.json');
    assert.match(pkg, /"cert:room-os-wave4"/);
  });
});
