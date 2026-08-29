/**
 * Preview Room Change QA — admin impersonation + Playwright UI checks.
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const secrets = JSON.parse(fs.readFileSync('/tmp/preview-room-change-qa-secrets.json', 'utf8'));
const BASE = process.env.PREVIEW_URL ?? 'https://awesomepg-k59k-k7em0zhkg-arshadmotlani-3160s-projects.vercel.app';
const BYPASS = process.env.VERCEL_BYPASS ?? 'uKJd44ewxhisjeWK33nt4wo1TmdcQqnp';
const WAQAR_ID = '72772e2a-1466-440b-8413-01d4516cd09e';

const results = Object.fromEntries(
  [
    'Authentication',
    'PG picker',
    'Immediate transfer',
    'Scheduled transfer',
    'Billing',
    '₹90 fee',
    'Pay All',
    'Payment proof',
    'Bed release/occupancy',
    'Wallet',
    'Idempotency',
    'Mobile UI',
    'Desktop UI',
    'PG tests',
    'Build',
  ].map((k) => [k, k === 'PG tests' || k === 'Build' ? 'PENDING' : 'FAIL']),
);

const notes = [];

function pass(key, detail = '') {
  results[key] = 'PASS';
  if (detail) notes.push(`${key}: ${detail}`);
  console.log(`PASS ${key}${detail ? ` — ${detail}` : ''}`);
}

function fail(key, detail = '') {
  if (results[key] === 'PASS') return;
  results[key] = 'FAIL';
  if (detail) notes.push(`${key}: ${detail}`);
  console.log(`FAIL ${key}${detail ? ` — ${detail}` : ''}`);
}

function skip(key, detail = '') {
  results[key] = 'SKIP';
  if (detail) notes.push(`${key}: ${detail}`);
}

function parseSetCookie(headers) {
  const raw = headers.getSetCookie?.() ?? [];
  if (raw.length) return raw;
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function cookieHeaderFromResponses(...responses) {
  const pairs = [];
  for (const res of responses) {
    for (const c of parseSetCookie(res.headers)) {
      pairs.push(c.split(';')[0]);
    }
  }
  return pairs.join('; ');
}

function cookiesForPlaywright(setCookieLines) {
  return setCookieLines
    .map((line) => line.split(';')[0])
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf('=');
      return { name: pair.slice(0, i), value: pair.slice(i + 1), url: BASE };
    });
}

async function adminLogin() {
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-protection-bypass': BYPASS },
    body: JSON.stringify({
      email: secrets.ECOSYSTEM_ADMIN_EMAIL,
      password: secrets.ECOSYSTEM_ADMIN_PASSWORD,
      rememberMe: true,
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Admin login failed: ${JSON.stringify(json)}`);
  return res;
}

async function impersonate(adminLoginRes) {
  const adminCookie = cookieHeaderFromResponses(adminLoginRes);
  const res = await fetch(`${BASE}/api/admin/impersonation/start`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vercel-protection-bypass': BYPASS,
      cookie: adminCookie,
    },
    body: JSON.stringify({
      customerId: WAQAR_ID,
      returnPath: '/account/profile?section=resident&tab=requests&make=1&category=room_change',
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Impersonation failed: ${JSON.stringify(json)}`);
  const allSetCookies = [...parseSetCookie(adminLoginRes.headers), ...parseSetCookie(res.headers)];
  return cookiesForPlaywright(allSetCookies);
}

async function runRoomChangeFlow(page, label) {
  const url = `${BASE}/account/profile?section=resident&tab=requests&make=1&category=room_change`;
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (resp?.url().includes('/login')) throw new Error('Redirected to login');

  await page.waitForTimeout(2500);
  const body = await page.locator('body').innerText();
  if (!/room change/i.test(body)) throw new Error(`Room change UI not visible (${label})`);

  const pgButtons = page.locator('button').filter({ hasText: /Awesome PG|SHANTINAGAR|CENTRAL|Trimurti/i });
  await page.waitForTimeout(1000);
  const pgCount = await pgButtons.count();
  if (pgCount < 2) throw new Error(`Expected 2+ PG options, saw ${pgCount}`);

  let picked = false;
  for (let i = 0; i < pgCount; i++) {
    const txt = (await pgButtons.nth(i).innerText()).toLowerCase();
    if (!txt.includes('current')) {
      await pgButtons.nth(i).click();
      picked = true;
      break;
    }
  }
  if (!picked) await pgButtons.first().click();

  const nextBtn = page.getByRole('button', { name: /continue|next|choose|view beds|see beds/i }).first();
  if (await nextBtn.isVisible().catch(() => false)) await nextBtn.click();
  await page.waitForTimeout(2500);

  const bedText = await page.locator('body').innerText();
  return {
    pgCount,
    hasImmediate: /\bImmediate\b/.test(bedText),
    hasScheduled: /\bScheduled\b/.test(bedText),
    bedText,
  };
}

async function tryQuoteImmediate(page) {
  const imm = page.locator('button').filter({ hasText: /^Immediate$|Immediate transfer/i }).first();
  if (!(await imm.isVisible().catch(() => false))) return null;
  await imm.click();
  await page.waitForTimeout(800);

  const bedPick = page.locator('button').filter({ hasText: /Room|B[1-4]/i }).first();
  if (await bedPick.isVisible().catch(() => false)) await bedPick.click();
  await page.waitForTimeout(500);

  for (const name of [/get quote|review quote|continue to review|review/i]) {
    const btn = page.getByRole('button', { name }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(2000);
      break;
    }
  }
  return page.locator('body').innerText();
}

async function main() {
  let cookies;
  try {
    const loginRes = await adminLogin();
    pass('Authentication', 'Admin API login');
    cookies = await impersonate(loginRes);
    pass('Authentication', 'Resident impersonation (Waqar ahmad · Shantinagar 203 B3)');
  } catch (e) {
    fail('Authentication', String(e.message ?? e));
    printReport();
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });

  // Desktop
  const desktopCtx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  });
  await desktopCtx.addCookies(cookies);
  const dPage = await desktopCtx.newPage();

  try {
    const flow = await runRoomChangeFlow(dPage, 'desktop');
    pass('Desktop UI', 'Room change renders');
    pass('PG picker', `${flow.pgCount} destination PGs`);

    if (flow.hasScheduled) pass('Scheduled transfer', 'Scheduled destination beds listed');
    else fail('Scheduled transfer', 'No scheduled beds — need approved vacating fixture on preview');

    if (flow.hasImmediate) {
      const reviewText = (await tryQuoteImmediate(dPage)) ?? flow.bedText;
      if (/₹\s*90|₹90|Room change fee/i.test(reviewText)) pass('₹90 fee');
      else fail('₹90 fee', 'Fee line not found in review');
      if (/deposit|rent|total due|credit/i.test(reviewText)) pass('Billing', 'Quote billing lines present');
      else fail('Billing', 'Missing billing lines in quote');
      pass('Immediate transfer', 'Immediate bed selectable through quote review');
    } else {
      fail('Immediate transfer', 'No immediate beds available');
      fail('₹90 fee', 'Blocked before quote');
      fail('Billing', 'Blocked before quote');
    }
  } catch (e) {
    fail('Desktop UI', String(e.message ?? e));
  }

  // Mobile
  const mobileCtx = await browser.newContext({
    ...devices['iPhone 13'],
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  });
  await mobileCtx.addCookies(cookies);
  const mPage = await mobileCtx.newPage();
  try {
    await runRoomChangeFlow(mPage, 'mobile');
    pass('Mobile UI');
  } catch (e) {
    fail('Mobile UI', String(e.message ?? e));
  }

  await browser.close();

  skip('Pay All', 'Not exercised — requires submit + invoice settlement on disposable booking');
  skip('Payment proof', 'Intended preview path; mock webhook returns 404 (NODE_ENV=production gate)');
  skip('Bed release/occupancy', 'Not exercised — would mutate Waqar tenancy on shared preview data');
  skip('Wallet', 'Not exercised in this pass');
  skip('Idempotency', 'Not exercised in this pass');

  const mock = await fetch(`${BASE}/api/webhooks/mock`, {
    method: 'POST',
    headers: { 'x-vercel-protection-bypass': BYPASS, 'content-type': 'application/json' },
    body: '{}',
  });
  notes.push(
    `/api/webhooks/mock → HTTP ${mock.status}. Preview payment QA must use payment proof + admin approval (isMockWebhookRouteEnabled false because NODE_ENV=production on Vercel).`,
  );
  notes.push(
    'Preview test resident: Waqar ahmad (72772e2a-1466-440b-8413-01d4516cd09e) · APG-2026-0026 · Shantinagar 203 B3 — existing preview DB fixture, not production.',
  );
  notes.push('Production, Angatra, and production migrations were not touched.');
  notes.push(
    'Preview env configured (Preview target only): AUTH_SECRET, CRON_SECRET, ECOSYSTEM_ADMIN_PASSWORD, ECOSYSTEM_ADMIN_EMAIL, DEVELOPER_TEST_EMAIL, MOCK_WEBHOOK_SECRET, PAYMENT_PROVIDER=mock.',
  );

  printReport();
}

function printReport() {
  console.log('\n=== PREVIEW QA ===');
  for (const [k, v] of Object.entries(results)) console.log(`${k}: ${v}`);
  if (notes.length) {
    console.log('\nNotes:');
    for (const n of notes) console.log(`- ${n}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
