/**
 * Booking funnel UI — before/after screenshots at 1280, 1440, 390.
 *
 * Before: production (deployed baseline)
 * After:  local dev with UI fixes (SKIP_MIGRATION_CHECK=true + DATABASE_URL)
 *
 * Usage:
 *   npx tsx scripts/capture-booking-funnel-screenshots.ts
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';

const outRoot = join(process.cwd(), 'docs/screenshots/booking-funnel-ui');

const phases = {
  before: {
    baseURL: process.env.BEFORE_BASE_URL ?? 'https://www.awesomepg.in',
    pgSlug: process.env.BEFORE_PG_SLUG ?? 'shantinagar-awesome-pg',
  },
  after: {
    baseURL: process.env.AFTER_BASE_URL ?? 'http://localhost:3000',
    pgSlug: process.env.AFTER_PG_SLUG ?? 'shantinagar-awesome-pg',
    path: process.env.AFTER_PATH ?? '/dev/booking-funnel-ui',
  },
} as const;

const viewports = [
  { name: 'desktop-1280', width: 1280, height: 900 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
] as const;

async function dismissOverlays(page: Page) {
  const skipTour = page.getByRole('button', { name: /skip tour/i });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
    await page.waitForTimeout(400);
  }
}

async function waitForFunnel(page: Page) {
  await page.waitForSelector('[aria-label="Booking progress"], [aria-label="Progress"]', {
    timeout: 90_000,
  });
  await page.waitForSelector('[aria-label="Booking summary"]', { timeout: 90_000 });
  await page.waitForTimeout(600);
}

async function capturePhase(phase: 'before' | 'after') {
  const cfg = phases[phase];
  const outDir = join(outRoot, phase);
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const url =
    phase === 'after' && 'path' in cfg && cfg.path
      ? `${cfg.baseURL}${cfg.path}`
      : `${cfg.baseURL}/pgs/${cfg.pgSlug}`;

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.name.startsWith('mobile') ? 2 : 1,
    });
    const page = await context.newPage();

    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      if (!res?.ok()) {
        console.warn(`[${phase}] HTTP ${res?.status() ?? '?'} for ${url}`);
      }
      await dismissOverlays(page);
      await waitForFunnel(page);
      await page.screenshot({
        path: join(outDir, `pg-funnel-${vp.name}.png`),
        fullPage: true,
      });
      console.log(`✓ ${phase} ${vp.name}`);
    } catch (err) {
      console.error(`✗ ${phase} ${vp.name}:`, err instanceof Error ? err.message : err);
      await page.screenshot({
        path: join(outDir, `pg-funnel-${vp.name}-error.png`),
        fullPage: true,
      }).catch(() => undefined);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  console.log(`→ ${outDir}`);
}

async function main() {
  const only = process.argv[2] as 'before' | 'after' | undefined;
  if (!only || only === 'before') await capturePhase('before');
  if (!only || only === 'after') await capturePhase('after');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
