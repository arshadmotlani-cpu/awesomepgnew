/**
 * Room OS Wave 2 — Materialized work_queue_index infrastructure tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  WORK_QUEUE_PROJECTOR_EVENT_TYPES,
  workQueueProjector,
} from '@/src/roomOs/projectors/workQueue/workQueueProjectorHandler';
import { getProjectorsForEventType, ROOM_OS_PROJECTORS } from '@/src/roomOs/projectors/registry';

describe('Room OS Wave 2 — Materialized Work Queue', () => {
  test('migration defines work_queue_index table', () => {
    const migration = readFileSync(
      join(process.cwd(), 'src/db/migrations/0134_work_queue_index.sql'),
      'utf8',
    );
    assert.match(migration, /work_queue_index/);
    assert.match(migration, /work_queue_index_pg_month_unique/);
  });

  test('WorkQueueProjector is registered after PropertyProjector', () => {
    const propertyIndex = ROOM_OS_PROJECTORS.findIndex((p) => p.id === 'PropertyProjector');
    const workQueueIndex = ROOM_OS_PROJECTORS.findIndex((p) => p.id === 'WorkQueueProjector');
    assert.ok(propertyIndex >= 0);
    assert.ok(workQueueIndex > propertyIndex);
    assert.equal(workQueueProjector.id, 'WorkQueueProjector');
    assert.notEqual(workQueueProjector.project, undefined);
  });

  test('WorkQueueProjector subscribes to rebuild command and domain events', () => {
    assert.ok(WORK_QUEUE_PROJECTOR_EVENT_TYPES.includes('work_queue.rebuilt'));
    assert.ok(WORK_QUEUE_PROJECTOR_EVENT_TYPES.includes('property_index.rebuild_requested'));
    assert.ok(WORK_QUEUE_PROJECTOR_EVENT_TYPES.includes('ledger.rent_projection_updated'));
  });

  test('work_queue.rebuilt routes to WorkQueueProjector', () => {
    const projectors = getProjectorsForEventType('work_queue.rebuilt');
    assert.ok(projectors.some((p) => p.id === 'WorkQueueProjector'));
  });

  test('property_index.rebuild_requested routes to both PropertyProjector and WorkQueueProjector', () => {
    const projectors = getProjectorsForEventType('property_index.rebuild_requested');
    assert.ok(projectors.some((p) => p.id === 'PropertyProjector'));
    assert.ok(projectors.some((p) => p.id === 'WorkQueueProjector'));
  });

  test('architecture: WorkQueueProjector pure layers avoid engine and SSOT imports', () => {
    const files = [
      'src/roomOs/projectors/workQueue/aggregateWorkQueue.ts',
      'src/roomOs/projectors/workQueue/projectWorkQueue.ts',
      'src/roomOs/projectors/workQueue/workQueueProjectorHandler.ts',
    ];
    for (const file of files) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      assert.doesNotMatch(src, /from ['"]@\/src\/roomOs\/engines\//);
      assert.doesNotMatch(src, /from ['"]@\/src\/services\//);
      assert.doesNotMatch(src, /residentFinancialEngine/);
      assert.doesNotMatch(src, /occupancySsot/);
    }
  });

  test('architecture: rebuild orchestration reads property_os_index only', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/roomOs/projectors/workQueue/rebuildWorkQueueIndex.ts'),
      'utf8',
    );
    assert.doesNotMatch(src, /from ['"]@\/src\/roomOs\/engines\//);
    assert.match(src, /loadMaterializedPropertyIndex/);
    assert.match(src, /projectWorkQueueSnapshot/);
    assert.doesNotMatch(src, /propertyIndex\?:/);
  });

  test('getWorkQueue reads materialized table before live projection', () => {
    const src = readFileSync(join(process.cwd(), 'src/roomOs/api/v1/decision.ts'), 'utf8');
    assert.match(src, /loadMaterializedWorkQueue/);
    assert.match(src, /projectPropertyOsBundle/);
  });

  test('PropertyOsIndexSnapshot embeds workQueueProjection source', () => {
    const src = readFileSync(join(process.cwd(), 'src/roomOs/types/domain.ts'), 'utf8');
    assert.match(src, /workQueueProjection/);
    assert.match(src, /WorkQueueProjectionSource/);
  });
});
