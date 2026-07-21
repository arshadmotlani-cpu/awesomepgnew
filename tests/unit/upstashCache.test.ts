import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cacheKeys, cacheTtl, publicRoomDetailPatternForSlug, publicRoomsPatternForPg } from '@/src/lib/cache/keys';
import { getCacheStatsSnapshot, recordCacheHit, recordCacheMiss } from '@/src/lib/cache/stats';
import { isRedisConfigured } from '@/src/lib/cache/client';

describe('cache keys', () => {
  test('public keys are namespaced and versioned', () => {
    assert.match(cacheKeys.publicPgList(), /^apg:v1:public:pg-list$/);
    assert.match(cacheKeys.publicPgBySlug('shanti-nagar'), /shanti-nagar/);
    assert.match(cacheKeys.publicRoomsForPg('pg-1', '2026-07-19'), /pg-1/);
  });

  test('TTLs are within 5–15 minute guidance', () => {
    assert.ok(cacheTtl.publicPgList >= 5 * 60);
    assert.ok(cacheTtl.publicPgList <= 15 * 60);
    assert.ok(cacheTtl.adminDashboardStats >= 5 * 60);
    assert.ok(cacheTtl.adminDashboardStats <= 15 * 60);
  });

  test('availability invalidation patterns are exported', () => {
    assert.match(publicRoomsPatternForPg('pg-1'), /pg-1/);
    assert.match(publicRoomDetailPatternForSlug('slug'), /slug/);
  });
});

describe('cache stats', () => {
  test('hit rate computed from hits and misses', () => {
    recordCacheHit('public.pg_list');
    recordCacheHit('public.pg_list');
    recordCacheMiss('public.pg_list');
    const snap = getCacheStatsSnapshot();
    assert.ok(Math.abs((snap.byNamespace['public.pg_list'].hitRate ?? 0) - 2 / 3) < 0.001);
  });
});

describe('redis optional', () => {
  test('isRedisConfigured is false without env in test runner', () => {
    assert.equal(isRedisConfigured(), false);
  });
});
