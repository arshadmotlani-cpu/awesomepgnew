/**
 * Room OS Wave 0 unit tests — rules, truth ladder, projector routing.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getWorkQueue } from '@/src/roomOs/api/v1/decision';
import { getEffectiveRulePack } from '@/src/roomOs/api/v1/rules';
import { ROOM_OS_EVENT_TYPES } from '@/src/roomOs/events/catalog';
import { getProjectorsForEventType, ROOM_OS_PROJECTORS } from '@/src/roomOs/projectors/registry';
import { runProjectorsForEvent } from '@/src/roomOs/projectors/runProjectors';
import { buildEffectiveRulePack, resolveEffectiveRules } from '@/src/roomOs/rules/effectivePack';
import { evaluateFact, evaluateRules } from '@/src/roomOs/rules/evaluate';
import { RULES_CATALOG_V1 } from '@/src/roomOs/rules/catalog/v1';
import { isReplayEligible, REPLAY_MIN_EVENT_COVERAGE, TRUTH_LADDER } from '@/src/roomOs/truthLadder';

describe('Room OS Wave 0', () => {
  test('truth ladder has four ordered levels', () => {
    assert.equal(TRUTH_LADDER.length, 4);
    assert.equal(TRUTH_LADDER[0].level, 1);
    assert.equal(TRUTH_LADDER[3].level, 4);
  });

  test('replay gate requires 90% event coverage', () => {
    assert.equal(REPLAY_MIN_EVENT_COVERAGE, 0.9);
    assert.equal(isReplayEligible(0.89), false);
    assert.equal(isReplayEligible(0.9), true);
  });

  test('effective rule pack resolves most specific scope per factKey', () => {
    const pgId = '00000000-0000-4000-8000-000000000001';
    const rules = resolveEffectiveRules(RULES_CATALOG_V1, {
      pgId,
      roomId: 'room-1',
      bedId: 'bed-1',
      bookingId: 'booking-1',
    });
    const factKeys = rules.map((r) => r.factKey);
    assert.ok(factKeys.includes('electricity.occupant_mode'));
    assert.ok(factKeys.includes('move_out.deposit_gate'));
    const roomRule = rules.find((r) => r.factKey === 'electricity.occupant_mode');
    assert.equal(roomRule?.scope, 'room');
  });

  test('evaluateRules matches facts against frozen pack', async () => {
    const pgId = '00000000-0000-4000-8000-000000000002';
    const pack = buildEffectiveRulePack(pgId, '2026-08-01T00:00:00.000Z');
    const outcomes = evaluateRules(pack, {
      facts: { 'electricity.meterReadingState': 'current' },
    });
    const meterRule = evaluateFact(pack, 'electricity.meterReadingState', {
      facts: { 'electricity.meterReadingState': 'current' },
    });
    assert.ok(outcomes.length > 0);
    assert.equal(meterRule?.matched, true);
  });

  test('rules/v1/effectivePack returns stable pack id for same inputs', async () => {
    const pgId = '00000000-0000-4000-8000-000000000003';
    const a = await getEffectiveRulePack({ pgId, asOf: '2026-08-01T00:00:00.000Z' });
    const b = await getEffectiveRulePack({ pgId, asOf: '2026-08-01T00:00:00.000Z' });
    assert.equal(a.pack.id, b.pack.id);
  });

  test('projector registry routes events to named projectors', async () => {
    assert.ok(ROOM_OS_PROJECTORS.length >= 5);
    const assigned = getProjectorsForEventType('occupancy.bed_assigned');
    assert.ok(assigned.some((p) => p.id === 'BedProjector'));
    const results = await runProjectorsForEvent({
      eventId: 'evt-1',
      streamType: 'bed',
      streamId: 'bed-1',
      eventType: 'occupancy.bed_assigned',
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      rulesEffectivePackId: 'pack-1',
      payload: {},
      sourceRef: 'test',
    });
    assert.ok(results.some((r) => r.projectorId === 'BedProjector' && r.handled));
  });

  test('decision/v1/getWorkQueue returns not_materialized stub', async () => {
    const result = await getWorkQueue({
      pgId: '00000000-0000-4000-8000-000000000004',
      billingMonth: '2026-08',
    });
    assert.equal(result.apiVersion, 'decision/v1');
    assert.equal(result.status, 'not_materialized');
    assert.deepEqual(result.page.items, []);
  });

  test('event catalog is separate from billing_events types', () => {
    assert.ok(ROOM_OS_EVENT_TYPES.includes('work_queue.rebuilt'));
    assert.ok(!ROOM_OS_EVENT_TYPES.includes('invoice.paid' as never));
  });
});
