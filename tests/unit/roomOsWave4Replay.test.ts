/**
 * Room OS Wave 4 — Replay Engine tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { isReplayEligible, REPLAY_MIN_EVENT_COVERAGE } from '@/src/roomOs/truthLadder';
import { formatCoverageSkipReason } from '@/src/roomOs/replay/measureEventCoverage';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('Room OS Wave 4 — Replay Engine', () => {
  test('isReplayEligible gates at 90% coverage', () => {
    assert.equal(REPLAY_MIN_EVENT_COVERAGE, 0.9);
    assert.equal(isReplayEligible(0.89), false);
    assert.equal(isReplayEligible(0.9), true);
    assert.equal(isReplayEligible(1), true);
  });

  test('formatCoverageSkipReason explains skip', () => {
    const reason = formatCoverageSkipReason({
      pgId: 'pg1',
      billingMonth: '2026-08-01',
      processed: 8,
      pending: 2,
      failedRetryable: 0,
      deadLetter: 0,
      ratio: 0.8,
      eligible: false,
      writerHooksInstrumented: 17,
    });
    assert.match(reason, /90%/);
    assert.match(reason, /80\.0%/);
  });

  test('dryRunProjection must not call upsert or append', () => {
    const src = read('src/roomOs/replay/dryRunProjection.ts');
    assert.match(src, /projectPropertyOsBundle/);
    assert.doesNotMatch(src, /upsertMaterialized/);
    assert.doesNotMatch(src, /appendRoomOsOutboxEntry/);
  });

  test('runReplay module must not import repair writers', () => {
    const src = read('src/roomOs/replay/runReplay.ts');
    assert.doesNotMatch(src, /billingIntegrityRepair/);
    assert.doesNotMatch(src, /checkoutSettlementRepair/);
    assert.doesNotMatch(src, /upsertMaterialized/);
  });

  test('replay/v1 API wrapper exists', () => {
    const api = read('src/roomOs/api/v1/replay.ts');
    assert.match(api, /replay\/v1/);
    assert.match(api, /runReplaySample/);
  });

  test('aggregatePropertyIndex collects derivation refs', () => {
    const src = read('src/roomOs/projectors/property/aggregatePropertyIndex.ts');
    assert.match(src, /collectPropertyDerivationRefs/);
    assert.match(src, /property_index\.assemble/);
  });
});
