/**
 * safePlatformNext — post-login destination for platform routes.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { safePlatformNext } from '@/src/platform/lib/auth/safePlatformNext';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('safePlatformNext', () => {
  test('allows deep links under /platform', () => {
    assert.equal(safePlatformNext('/platform/admin/onboarding'), '/platform/admin/onboarding');
    assert.equal(
      safePlatformNext('/platform/admin/onboarding?success=1&orgId=abc'),
      '/platform/admin/onboarding?success=1&orgId=abc',
    );
  });

  test('rejects open redirects and non-platform paths', () => {
    assert.equal(safePlatformNext('https://evil.example'), '/platform/dashboard');
    assert.equal(safePlatformNext('//evil.example'), '/platform/dashboard');
    assert.equal(safePlatformNext('/admin'), '/platform/dashboard');
    assert.equal(safePlatformNext(''), '/platform/dashboard');
    assert.equal(safePlatformNext(undefined), '/platform/dashboard');
  });
});

describe('platform onboarding route wiring', () => {
  test('onboarding page is a distinct create-salon surface', () => {
    const page = readFileSync(
      join(process.cwd(), 'app/(platform)/platform/admin/onboarding/page.tsx'),
      'utf8',
    );
    assert.match(page, /Create a new salon/);
    assert.match(page, /OrganizationOnboardingWizard/);
    assert.match(page, /data-platform-page="onboarding"/);
    assert.doesNotMatch(page, /Good morning/);
    assert.doesNotMatch(page, /getPlatformDashboardStats/);
  });

  test('login page honors next when session already exists', () => {
    const login = readFileSync(
      join(process.cwd(), 'app/(platform)/platform/auth/login/page.tsx'),
      'utf8',
    );
    assert.match(login, /safePlatformNext/);
    assert.match(login, /params\.next/);
    assert.doesNotMatch(login, /if \(session\) redirect\('\/platform\/dashboard'\)/);
  });

  test('platform shell remounts main on pathname change', () => {
    const shell = readFileSync(
      join(process.cwd(), 'src/platform/components/shell/PlatformShell.tsx'),
      'utf8',
    );
    assert.match(shell, /key=\{pathname\}/);
    assert.match(shell, /PlatformShellChrome/);
  });
});
