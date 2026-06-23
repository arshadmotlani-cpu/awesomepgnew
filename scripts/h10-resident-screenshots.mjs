/**
 * Capture resident UI screenshots at 390 / 768 / 1280 widths.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 node scripts/h10-resident-screenshots.mjs
 *
 * Optional auth (resident hub requires session):
 *   H10_SCREENSHOT_COOKIE="customer_session=..." node scripts/h10-resident-screenshots.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = path.join(process.cwd(), 'docs/h10-screenshots/after');
const COOKIE = process.env.H10_SCREENSHOT_COOKIE?.trim();

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 900 },
];

const ROUTES = [
  { slug: 'login', path: '/login' },
  { slug: 'resident-home', path: '/account/profile?section=resident&tab=home' },
  { slug: 'resident-payments', path: '/account/profile?section=resident&tab=payments' },
  { slug: 'resident-wallet', path: '/account/profile?section=resident&tab=wallet' },
  { slug: 'resident-requests', path: '/account/profile?section=resident&tab=requests' },
  { slug: 'bookings', path: '/account/bookings' },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext();
if (COOKIE) {
  const [name, ...rest] = COOKIE.split('=');
  await context.addCookies([
    {
      name,
      value: rest.join('='),
      domain: new URL(BASE).hostname,
      path: '/',
    },
  ]);
}

const manifest = [];

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    const page = await context.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const url = `${BASE}${route.path}`;
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => null);
    const file = `${route.slug}-${vp.name}.png`;
    const filePath = path.join(OUT, file);
    await page.screenshot({ path: filePath, fullPage: true });
    manifest.push({
      route: route.slug,
      viewport: vp.name,
      url,
      status: res?.status() ?? 'error',
      file: `after/${file}`,
    });
    await page.close();
  }
}

await writeFile(
  path.join(process.cwd(), 'docs/h10-screenshots/manifest.json'),
  JSON.stringify({ capturedAt: new Date().toISOString(), baseUrl: BASE, hasAuth: Boolean(COOKIE), shots: manifest }, null, 2),
);

await browser.close();
console.log(`Wrote ${manifest.length} screenshots to docs/h10-screenshots/after/`);
