/**
 * Room OS Wave 5 — certification catalog tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { CERTIFICATION_CHECKS_V1 } from '@/src/roomOs/certification/catalog/v1';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('Room OS Wave 5 — Certification', () => {
  test('v1 check catalog superseded by Wave 6 (14 checks) — see roomOsWave6Certification.test.ts', () => {
    assert.equal(CERTIFICATION_CHECKS_V1.length, 14);
  });

  test('Wave 5 checks wired in runCertification', () => {
    const runner = read('src/roomOs/certification/runCertification.ts');
    assert.match(runner, /runRulesDbParityChecks/);
    assert.match(runner, /runTimelineLayerBChecks/);
  });

  test('cert:room-os-wave5 npm script exists', () => {
    const pkg = read('package.json');
    assert.match(pkg, /"cert:room-os-wave5"/);
  });
});
