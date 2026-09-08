import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function read(rel: string): string {
  return readFileSync(rel, 'utf8');
}

test('visitor analytics does not heartbeat Postgres on an interval', () => {
  const tracker = read('src/components/analytics/VisitorAnalyticsTracker.tsx');
  const client = read('src/lib/analytics/client.ts');
  const heartbeat = read('app/api/analytics/heartbeat/route.ts');
  assert.match(tracker, /\/api\/analytics\/track/);
  assert.doesNotMatch(tracker, /setInterval/);
  assert.doesNotMatch(tracker, /sendAnalyticsHeartbeat/);
  assert.doesNotMatch(tracker, /HEARTBEAT_MS/);
  assert.doesNotMatch(client, /sendAnalyticsHeartbeat/);
  assert.match(heartbeat, /heartbeat_disabled/);
  assert.doesNotMatch(heartbeat, /heartbeatSession/);
});

test('admin live polling is a single 10-minute poller', () => {
  const provider = read('src/components/admin/AdminLiveRefreshProvider.tsx');
  const notifications = read('src/components/admin/AdminNotificationCenter.tsx');
  const push = read('src/components/admin/AdminPushRegistration.tsx');
  const live = read('app/api/admin/live/route.ts');
  const vercel = read('vercel.json');
  assert.match(provider, /ADMIN_LIVE_POLL_MS = 10 \* 60 \* 1000/);
  assert.match(provider, /\/api\/admin\/live/);
  assert.doesNotMatch(notifications, /\/api\/admin\/live/);
  assert.doesNotMatch(push, /\/api\/admin\/live/);
  assert.match(live, /loadAdminNavBadges/);
  assert.doesNotMatch(live, /getUnifiedOperationsQueueForBadges/);
  assert.doesNotMatch(vercel, /"\*\/5 \* \* \* \*"/);
  assert.doesNotMatch(vercel, /"\*\/1 \* \* \* \*"/);
});

test('admin nav does not prefetch force-dynamic layouts', () => {
  const nav = read('src/components/admin/AdminNavLink.tsx');
  assert.match(nav, /prefetch=\{false\}/);
  assert.doesNotMatch(nav, /prefetch=\{true\}/);
});

test('public liveness check does not probe or write Postgres', () => {
  const health = read('app/api/health/route.ts');
  const wrapper = read('src/lib/healing/withSelfHealing.ts');
  const engine = read('src/lib/healing/healthEngine.ts');
  const customer = read('src/db/queries/customer.ts');
  const instrumentation = read('instrumentation.ts');
  assert.doesNotMatch(health, /maybeRunRecoveryCheck/);
  assert.doesNotMatch(health, /runHealthDiagnosis/);
  assert.doesNotMatch(health, /testDatabaseConnection/);
  assert.doesNotMatch(health, /withSelfHealing/);
  assert.match(wrapper, /await maybeRunRecoveryCheck\(\)/);
  assert.match(engine, /if \(status !== 'HEALTHY'\)/);
  assert.doesNotMatch(customer, /maybeRunRecoveryCheck/);
  assert.match(instrumentation, /NODE_ENV !== 'production'/);
});

test('production logger persists only errors and warnings', () => {
  const logger = read('src/lib/logger.ts');
  assert.match(logger, /function shouldPersistLog/);
  assert.match(logger, /level === 'error' \|\| level === 'warn'/);
});
