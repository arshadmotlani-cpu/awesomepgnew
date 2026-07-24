#!/usr/bin/env node
/**
 * Playwright smoke — resident profile + move-out requests (no error boundaries).
 *
 *   npm run dev   # separate terminal
 *   BASE_URL=http://localhost:3000 \
 *   RESIDENT_VERIFY_SESSION_COOKIE="customer_session=..." \
 *   node scripts/verify-resident-moveout-playwright.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const COOKIE = process.env.RESIDENT_VERIFY_SESSION_COOKIE?.trim();

const ERROR_PATTERNS = [
  'Your resident dashboard could not load',
  'Requests could not load',
  'Your stay dashboard could not load',
  'Application error',
];

const ROUTES = [
  { id: 'profile_overview', path: '/account/profile?tab=profile&sub=overview' },
  { id: 'requests_move_out', path: '/account/profile?tab=requests&category=move_out' },
];

const POSITIVE_HINTS = ['Approved move-out date', 'How was this calculated?', 'Move-out'];

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  if (!COOKIE) {
    fail('Set RESIDENT_VERIFY_SESSION_COOKIE=customer_session=… (log in once, copy cookie from devtools)');
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const [name, ...rest] = COOKIE.split('=');
  await context.addCookies([
    {
      name,
      value: rest.join('='),
      domain: new URL(BASE).hostname,
      path: '/',
    },
  ]);

  let allPass = true;

  for (const route of ROUTES) {
    const page = await context.newPage();
    const url = `${BASE}${route.path}`;
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 }).catch(() => null);
    const body = await page.locator('body').innerText().catch(() => '');

    if (!res || res.status() >= 500) {
      console.log(`FAIL [${route.id}] HTTP ${res?.status() ?? 'error'} ${url}`);
      allPass = false;
    } else {
      const hit = ERROR_PATTERNS.find((p) => body.includes(p));
      if (hit) {
        console.log(`FAIL [${route.id}] error boundary text: "${hit}"`);
        allPass = false;
      } else {
        console.log(`PASS [${route.id}] no error boundary (${url})`);
      }
    }

    if (route.id === 'requests_move_out') {
      const hasHint = POSITIVE_HINTS.some((h) => body.includes(h));
      if (!hasHint) {
        console.log(
          `WARN [${route.id}] move-out positive copy not found — may be logged out or no approved move-out`,
        );
      } else {
        console.log(`PASS [${route.id}] move-out UI copy present`);
      }
    }

    await page.close();
  }

  await browser.close();
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
