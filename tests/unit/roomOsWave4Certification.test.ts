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
  test('v1 check catalog includes Wave 4 replay parity check', () => {
    const checkIds = CERTIFICATION_CHECKS_V1.map((c) => c.checkId);
    assert.ok(checkIds.includes('REPLAY_SAMPLE_PARITY'));
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
