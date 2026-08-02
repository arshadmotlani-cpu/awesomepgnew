/**
 * Room OS Wave 2 — benchmark script structural tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('Room OS Wave 2 — Benchmark', () => {
  test('benchmark script uses Room OS APIs only', () => {
    const src = read('scripts/benchmark-room-os-wave2.ts');
    assert.match(src, /rebuildPropertyOsIndex/);
    assert.match(src, /rebuildWorkQueueIndex/);
    assert.match(src, /loadPropertyIndex/);
    assert.match(src, /getWorkQueue/);
    assert.match(src, /loadRoomOsOperationsQueueItems/);
    assert.doesNotMatch(src, /billingCentreDashboard/);
    assert.doesNotMatch(src, /buildCollectionsQueue/);
  });

  test('package.json exposes bench:room-os-wave2', () => {
    const pkg = read('package.json');
    assert.match(pkg, /"bench:room-os-wave2"/);
  });
});
