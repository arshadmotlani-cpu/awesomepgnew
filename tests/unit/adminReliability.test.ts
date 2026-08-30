import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEPLOY_CHUNK_RELOAD_KEY,
  getDeployReloadMarker,
  isDeployChunkFailure,
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
    assert.equal(isDeployChunkFailure(new Error('Network request failed')), false);
  });

  test('uses deploy marker env when present', () => {
    const previous = process.env.NEXT_PUBLIC_DEPLOY_ID;
    process.env.NEXT_PUBLIC_DEPLOY_ID = 'abc123';
    try {
      assert.equal(getDeployReloadMarker(), 'abc123');
      assert.equal(DEPLOY_CHUNK_RELOAD_KEY, 'apg:deploy-chunk-reload');
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
