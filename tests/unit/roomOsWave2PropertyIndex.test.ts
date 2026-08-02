/**
 * Room OS Wave 2 — Materialized property_os_index infrastructure tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { extractPropertyIndexRebuildInput } from '@/src/roomOs/projectors/property/extractPropertyIndexRebuildInput';
import {
  PROPERTY_PROJECTOR_EVENT_TYPES,
  propertyProjector,
} from '@/src/roomOs/projectors/property/propertyProjectorHandler';
import { getProjectorsForEventType, ROOM_OS_PROJECTORS } from '@/src/roomOs/projectors/registry';
import type { RoomOsEventEnvelope } from '@/src/roomOs/types';

function event(partial: Partial<RoomOsEventEnvelope> & Pick<RoomOsEventEnvelope, 'eventType'>): RoomOsEventEnvelope {
  return {
    eventId: 'evt-1',
    streamType: 'property',
    streamId: 'pg-1',
    occurredAt: '2026-08-01T00:00:00.000Z',
    recordedAt: '2026-08-01T00:00:00.000Z',
    rulesEffectivePackId: 'rules-catalog-v1',
    payload: {},
    sourceRef: 'test',
    ...partial,
  };
}

describe('Room OS Wave 2 — Materialized Property Index', () => {
  test('migration defines property_os_index table', () => {
    const migration = readFileSync(
      join(process.cwd(), 'src/db/migrations/0133_property_os_index.sql'),
      'utf8',
    );
    assert.match(migration, /property_os_index/);
    assert.match(migration, /property_os_index_pg_month_unique/);
  });

  test('PropertyProjector subscribes to rebuild command, not materialized fact', () => {
    assert.ok(PROPERTY_PROJECTOR_EVENT_TYPES.includes('property_index.rebuild_requested'));
    assert.ok(!PROPERTY_PROJECTOR_EVENT_TYPES.includes('property_index.materialized'));
    const registered = ROOM_OS_PROJECTORS.find((p) => p.id === 'PropertyProjector');
    assert.ok(registered);
    assert.notEqual(registered?.project, undefined);
  });

  test('extractPropertyIndexRebuildInput resolves property stream id', () => {
    const input = extractPropertyIndexRebuildInput(
      event({
        streamType: 'property',
        streamId: '00000000-0000-4000-8000-000000000099',
        payload: { billingMonth: '2026-08-01' },
      }),
    );
    assert.deepEqual(input, {
      pgId: '00000000-0000-4000-8000-000000000099',
      billingMonth: '2026-08-01',
      asOf: undefined,
    });
  });

  test('extractPropertyIndexRebuildInput prefers payload pgId on bed stream', () => {
    const input = extractPropertyIndexRebuildInput(
      event({
        streamType: 'bed',
        streamId: 'bed-1',
        eventType: 'occupancy.bed_assigned',
        payload: { pgId: 'pg-from-payload', asOf: '2026-08-02' },
      }),
    );
    assert.deepEqual(input, {
      pgId: 'pg-from-payload',
      billingMonth: undefined,
      asOf: '2026-08-02',
    });
  });

  test('extractPropertyIndexRebuildInput returns null without pgId', () => {
    assert.equal(
      extractPropertyIndexRebuildInput(
        event({ streamType: 'bed', streamId: 'bed-1', eventType: 'occupancy.bed_assigned' }),
      ),
      null,
    );
  });

  test('architecture: persist and handler layers avoid engine imports', () => {
    const files = [
      'src/roomOs/projectors/property/persistPropertyIndex.ts',
      'src/roomOs/projectors/property/propertyProjectorHandler.ts',
      'src/roomOs/projectors/property/extractPropertyIndexRebuildInput.ts',
    ];
    for (const file of files) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      assert.doesNotMatch(src, /from ['"]@\/src\/roomOs\/engines\//);
      assert.doesNotMatch(src, /residentFinancialEngine/);
      assert.doesNotMatch(src, /bedOccupancyBatch/);
    }
  });

  test('loadPropertyIndex reads materialized table before live projection', () => {
    const src = readFileSync(join(process.cwd(), 'src/roomOs/api/v1/propertyOs.ts'), 'utf8');
    assert.match(src, /loadMaterializedPropertyIndex/);
    assert.match(src, /projectPropertyOsIndex/);
  });

  test('property_index.rebuild_requested routes to PropertyProjector', () => {
    const projectors = getProjectorsForEventType('property_index.rebuild_requested');
    assert.ok(projectors.some((p) => p.id === 'PropertyProjector'));
  });

  test('property_index.materialized is reserved and not handled by PropertyProjector', () => {
    const projectors = getProjectorsForEventType('property_index.materialized');
    assert.ok(!projectors.some((p) => p.id === 'PropertyProjector'));
  });
});
