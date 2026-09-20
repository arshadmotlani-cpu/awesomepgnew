import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEPLOY_CHUNK_RELOAD_KEY,
  DEPLOY_RECOVERY_MAX_ATTEMPTS,
  DEPLOY_RECOVERY_STATE_KEY,
  buildRecoveryNavigationUrl,
  extractLiveDeployIdFromHtml,
  getBundledDeployId,
  getDeployReloadMarker,
  isDeployChunkFailure,
  nextDeployRecoveryState,
  normalizeDeployId,
  parseDeployRecoveryState,
  planDeployChunkRecovery,
  shouldRecoverAfterBfcache,
  stripDeployRecoveryParams,
} from '@/src/lib/reliability/deployChunkRecovery';
import {
  coerceWealthBps,
  coerceWealthPaise,
  serializeLiabilityDue,
} from '@/src/owner/lib/wealth/paiseCoercion';
import { appTodayIso } from '@/src/lib/dates/appTodayIso';

describe('deployChunkRecovery', () => {
  test('detects stale chunk load failures', () => {
    assert.equal(isDeployChunkFailure(new Error('ChunkLoadError: Loading chunk 123 failed')), true);
    assert.equal(
      isDeployChunkFailure(new Error('Failed to fetch dynamically imported module')),
      true,
    );
    assert.equal(isDeployChunkFailure(new Error('Loading CSS chunk app-layout failed')), true);
    assert.equal(isDeployChunkFailure(new Error('Failed to fetch RSC payload')), true);
    assert.equal(isDeployChunkFailure(new Error('Network request failed')), false);
  });

  test('detects HTML returned as JS for chunk URLs', () => {
    assert.equal(
      isDeployChunkFailure(new SyntaxError("Unexpected token '<'"), {
        source: 'https://example.com/_next/static/chunks/app.js',
      }),
      true,
    );
    assert.equal(
      isDeployChunkFailure(new TypeError('Cannot read properties of undefined')),
      false,
    );
    assert.equal(isDeployChunkFailure(new ReferenceError('foo is not defined')), false);
  });

  test('uses deploy marker env when present', () => {
    const previous = process.env.NEXT_PUBLIC_DEPLOY_ID;
    process.env.NEXT_PUBLIC_DEPLOY_ID = 'abc123';
    try {
      assert.equal(getDeployReloadMarker(), 'abc123');
      assert.equal(getBundledDeployId(), 'abc123');
      assert.equal(DEPLOY_CHUNK_RELOAD_KEY, 'apg:deploy-chunk-reload');
      assert.equal(DEPLOY_RECOVERY_STATE_KEY, 'apg:deploy-recovery-v2');
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_DEPLOY_ID;
      else process.env.NEXT_PUBLIC_DEPLOY_ID = previous;
    }
  });

  test('normalizeDeployId rejects empty values', () => {
    assert.equal(normalizeDeployId(undefined), null);
    assert.equal(normalizeDeployId(''), null);
    assert.equal(normalizeDeployId('   '), null);
    assert.equal(normalizeDeployId('  sha1  '), 'sha1');
  });

  test('bounded recovery stops after max attempts', () => {
    const deployId = 'deploy-a';
    const href = 'https://fyhair.awesomepg.in/dashboard?tab=1';
    let state = null;
    for (let i = 1; i <= DEPLOY_RECOVERY_MAX_ATTEMPTS; i++) {
      const plan = planDeployChunkRecovery({
        href,
        bundledDeployId: deployId,
        storedState: state,
        nowMs: 1_000_000 + i * 5_000,
      });
      assert.equal(plan.proceed, true);
      if (plan.proceed) {
        assert.equal(plan.attempt, i);
        state = nextDeployRecoveryState(state, deployId, plan.attempt, 1_000_000 + i * 5_000);
      }
    }
    const blocked = planDeployChunkRecovery({
      href,
      bundledDeployId: deployId,
      storedState: state,
      nowMs: 9_999_999,
    });
    assert.equal(blocked.proceed, false);
    if (!blocked.proceed) assert.equal(blocked.reason, 'max_attempts');
  });

  test('cache-busting params only appear on recovery URLs', () => {
    const base = 'https://awesomepg.in/customers?sort=name';
    const normal = new URL(base);
    assert.equal(normal.searchParams.has('__apg_recover'), false);

    const recovered = buildRecoveryNavigationUrl(base, 'commit123', 2);
    const url = new URL(recovered);
    assert.equal(url.pathname, '/customers');
    assert.equal(url.searchParams.get('sort'), 'name');
    assert.equal(url.searchParams.get('__apg_recover'), '2');
    assert.equal(url.searchParams.get('__apg_d'), 'commit123');
  });

  test('stripDeployRecoveryParams preserves route and unrelated query', () => {
    const cleaned = stripDeployRecoveryParams(
      'https://fyhair.awesomepg.in/quick-sale?foo=1&__apg_recover=2&__apg_d=abc',
    );
    assert.equal(cleaned, '/quick-sale?foo=1');
  });

  test('extractLiveDeployIdFromHtml reads meta tag', () => {
    const html =
      '<html><head><meta name="apg-deploy-id" content="live-sha" /></head><body></body></html>';
    assert.equal(extractLiveDeployIdFromHtml(html), 'live-sha');
  });

  test('bfcache recovery only when live deploy differs from bundled', () => {
    assert.equal(shouldRecoverAfterBfcache('old-sha', 'new-sha'), true);
    assert.equal(shouldRecoverAfterBfcache('same-sha', 'same-sha'), false);
    assert.equal(shouldRecoverAfterBfcache('old-sha', null), false);
  });

  test('parseDeployRecoveryState rejects malformed payloads', () => {
    assert.equal(parseDeployRecoveryState(null), null);
    assert.equal(parseDeployRecoveryState('not-json'), null);
    assert.equal(
      parseDeployRecoveryState(JSON.stringify({ v: 1, deployId: '', attempts: 1, lastAt: 1 })),
      null,
    );
  });

  test('bounded recovery throttles rapid attempts', () => {
    const state = nextDeployRecoveryState(null, 'd1', 1, 10_000);
    const throttled = planDeployChunkRecovery({
      href: 'https://example.com/',
      bundledDeployId: 'd1',
      storedState: state,
      nowMs: 10_500,
    });
    assert.equal(throttled.proceed, false);
    if (!throttled.proceed) assert.equal(throttled.reason, 'throttled');
  });

  test('missing deploy env falls back without unbounded recovery planning', () => {
    const previous = process.env.NEXT_PUBLIC_DEPLOY_ID;
    delete process.env.NEXT_PUBLIC_DEPLOY_ID;
    try {
      assert.equal(getBundledDeployId(), 'development');
      const plan = planDeployChunkRecovery({
        href: 'https://example.com/',
        bundledDeployId: getBundledDeployId(),
        storedState: null,
        nowMs: Date.now(),
      });
      assert.equal(plan.proceed, true);
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_DEPLOY_ID;
      else process.env.NEXT_PUBLIC_DEPLOY_ID = previous;
    }
  });
});

describe('serializeLiabilityDue', () => {
  test('coerces bigint paise fields for client boundaries', () => {
    const due = serializeLiabilityDue({
      principalDuePaise: 1_000_000n,
      interestDuePaise: '25000',
      totalDuePaise: 1_025_000,
      dueDate: '2026-08-30',
    });

    assert.deepEqual(due, {
      principalDuePaise: 1_000_000,
      interestDuePaise: 25_000,
      totalDuePaise: 1_025_000,
      dueDate: '2026-08-30',
    });
  });

  test('returns null for missing due snapshot', () => {
    assert.equal(serializeLiabilityDue(null), null);
  });
});

describe('liability detail coercion', () => {
  test('interest bps and principal paise coerce safely', () => {
    assert.equal(coerceWealthBps(850n), 850);
    assert.equal(coerceWealthPaise(null), 0);
    assert.equal(coerceWealthBps(undefined), 0);
  });
});

describe('appTodayIso', () => {
  test('formats business-local calendar day', () => {
    const iso = appTodayIso('Asia/Kolkata', new Date('2026-08-30T20:00:00Z'));
    assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(iso, '2026-08-31');
  });
});

describe('capital service worker', () => {
  test('does not intercept Next.js chunks or API routes', () => {
    const sw = readFileSync(join(process.cwd(), 'public/capital/sw.js'), 'utf8');
    assert.match(sw, /\/_next\//);
    assert.match(sw, /\/api\//);
    assert.match(sw, /request\.mode !== 'navigate'/);
    assert.doesNotMatch(sw, /event\.respondWith\([\s\S]*fetch\(event\.request\)[\s\S]*if \(url\.pathname\.startsWith\('\/_next/);
  });
});

describe('DeployChunkRecovery client wiring', () => {
  test('handles bfcache pageshow persisted events', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/reliability/DeployChunkRecovery.tsx'),
      'utf8',
    );
    assert.match(src, /pageshow/);
    assert.match(src, /event\.persisted/);
    assert.match(src, /shouldRecoverAfterBfcache/);
  });
});

describe('root layout deploy meta', () => {
  test('exposes live deploy id meta for bfcache alignment', () => {
    const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
    assert.match(layout, /name="apg-deploy-id"/);
    assert.match(layout, /NEXT_PUBLIC_DEPLOY_ID/);
  });
});
