import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  publicRoomDetailPatternForSlug,
  publicRoomsPatternForPg,
} from '@/src/lib/cache/keys';
import {
  getRuntimeDiagnosticsSnapshot,
  recordQueryStat,
  recordRouteStat,
  resetRuntimeDiagnosticsForTests,
} from '@/src/lib/monitoring/runtimeDiagnostics';

describe('availability cache key patterns', () => {
  test('room list pattern covers all reference dates', () => {
    assert.match(publicRoomsPatternForPg('pg-uuid'), /^apg:v1:public:rooms:pg-uuid:\*$/);
  });

  test('room detail pattern covers all rooms for slug', () => {
    assert.match(
      publicRoomDetailPatternForSlug('shanti-nagar'),
      /^apg:v1:public:room:shanti-nagar:\*$/,
    );
  });
});

describe('runtime diagnostics', () => {
  test('aggregates query and route stats', () => {
    resetRuntimeDiagnosticsForTests();
    recordQueryStat('listPublicPgs', 120);
    recordQueryStat('listPublicPgs', 80);
    recordQueryStat('getPgBySlug', 400);
    recordRouteStat('/api/admin/monitoring', 50);
    recordRouteStat('/api/admin/monitoring', 150);

    const snap = getRuntimeDiagnosticsSnapshot();
    assert.equal(snap.queries.totalCount, 3);
    assert.equal(snap.queries.avgDurationMs, 200);
    assert.equal(snap.queries.slowest[0]?.key, 'getPgBySlug');
    assert.equal(snap.queries.mostFrequent[0]?.key, 'listPublicPgs');
    assert.equal(snap.endpoints.totalCount, 2);
    assert.equal(snap.endpoints.slowest[0]?.maxMs, 150);
  });
});
