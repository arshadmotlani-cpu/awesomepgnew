import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  CLIENT_NAV_FALLBACK_MS,
  currentDocumentHref,
  resolveSameOriginNavHref,
  shouldScheduleClientNavFallback,
} from '@/src/lib/reliability/clientNavigationFallback';

function mockAnchor(
  href: string,
  opts: { target?: string; download?: boolean } = {},
): HTMLAnchorElement {
  return {
    getAttribute(name: string) {
      if (name === 'href') return href;
      return null;
    },
    target: opts.target ?? '',
    hasAttribute(name: string) {
      return name === 'download' && Boolean(opts.download);
    },
  } as HTMLAnchorElement;
}

describe('clientNavigationFallback', () => {
  test('resolves internal hrefs and ignores external / hash links', () => {
    const origin = 'https://www.awesomepg.in';
    assert.equal(resolveSameOriginNavHref(mockAnchor('/login?next=/pgs'), origin), '/login?next=/pgs');
    assert.equal(resolveSameOriginNavHref(mockAnchor('https://example.com/x'), origin), null);
    assert.equal(resolveSameOriginNavHref(mockAnchor('#features'), origin), null);
  });

  test('schedules fallback for primary same-origin navigation', () => {
    const origin = 'https://www.awesomepg.in';
    const event = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false } as MouseEvent;
    const dest = shouldScheduleClientNavFallback({
      event,
      anchor: mockAnchor('/pgs'),
      origin,
      currentHref: currentDocumentHref('/', '', ''),
    });
    assert.equal(dest, '/pgs');
  });

  test('root layout mounts ClientNavigationFallback next to DeployChunkRecovery', () => {
    const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
    assert.match(layout, /ClientNavigationFallback/);
    assert.match(layout, /DeployChunkRecovery/);
  });

  test('fallback delay matches admin nav hard fallback', () => {
    const adminNav = readFileSync(
      join(process.cwd(), 'src/components/admin/AdminNavLink.tsx'),
      'utf8',
    );
    assert.match(adminNav, /CLIENT_NAV_FALLBACK_MS/);
    assert.equal(CLIENT_NAV_FALLBACK_MS, 2_000);
  });
});
