/**
 * Landing page UI — before/after screenshots.
 * Usage: npx tsx scripts/capture-landing-screenshots.ts [before|after]
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';

const phase = (process.argv[2] ?? 'both') as 'before' | 'after' | 'both';
const outRoot = join(process.cwd(), 'docs/screenshots/landing-ui');

const configs = {
  before: { baseURL: process.env.BEFORE_BASE_URL ?? 'https://www.awesomepg.in' },
  after: { baseURL: process.env.AFTER_BASE_URL ?? 'http://localhost:3001' },
} as const;

const viewports = [
  { name: 'desktop-1280', width: 1280, height: 900 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
] as const;

async function dismissOverlays(page: Page) {
  const skip = page.getByRole('button', { name: /skip tour/i });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function captureViewport(baseURL: string, phaseName: string, vp: (typeof viewports)[number]) {
  const outDir = join(outRoot, phaseName);
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.name.startsWith('mobile') ? 2 : 1,
  });
  const page = await context.newPage();

  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await dismissOverlays(page);
    await page.waitForTimeout(1200);

    await page.screenshot({
      path: join(outDir, `above-fold-${vp.name}.png`),
      fullPage: false,
    });

    const features = page.locator('#features, [data-section="features"]').first();
    if (await features.count()) {
      await features.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({
        path: join(outDir, `features-${vp.name}.png`),
        fullPage: false,
      });
    }

    const amenities = page.locator('#amenities, [data-section="amenities"]').first();
    if (await amenities.count()) {
      await amenities.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({
        path: join(outDir, `amenities-${vp.name}.png`),
        fullPage: false,
      });
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(outDir, `full-page-${vp.name}.png`),
      fullPage: true,
    });

    console.log(`✓ ${phaseName} ${vp.name}`);
  } catch (err) {
    console.error(`✗ ${phaseName} ${vp.name}:`, err instanceof Error ? err.message : err);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function capturePhase(phaseName: 'before' | 'after') {
  const { baseURL } = configs[phaseName];
  for (const vp of viewports) {
    await captureViewport(baseURL, phaseName, vp);
  }
  console.log(`→ ${join(outRoot, phaseName)}`);
}

async function main() {
  if (phase === 'before' || phase === 'both') await capturePhase('before');
  if (phase === 'after' || phase === 'both') await capturePhase('after');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
