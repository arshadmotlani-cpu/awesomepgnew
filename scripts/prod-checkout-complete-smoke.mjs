/**
 * Production smoke — checkout Pay & complete (UI + console errors).
 * Requires Chrome admin cookies (Profile 6) like verify-harish-checkout-prod.mjs.
 *
 *   PROD_BASE_URL=https://www.awesomepg.in node scripts/prod-checkout-complete-smoke.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = process.env.PROD_BASE_URL ?? 'https://www.awesomepg.in';
const MAX_BOOKINGS = Number(process.env.MAX_BOOKINGS ?? 5);
const OUT = join(process.cwd(), 'public/assets/prod-checkout-complete-smoke');
mkdirSync(OUT, { recursive: true });

function loadChromeAdminCookies() {
  const profile = process.env.CHROME_PROFILE ?? 'Profile 6';
  const script = `
import json, browser_cookie3
from pathlib import Path
cf = Path.home() / "Library/Application Support/Google/Chrome/${profile}/Cookies"
out = []
for c in browser_cookie3.chrome(cookie_file=str(cf), domain_name='awesomepg.in'):
    if c.name in ('apg_admin_session', 'apg_visitor_session'):
        out.append({
            'name': c.name,
            'value': c.value,
            'domain': c.domain,
            'path': c.path or '/',
            'expires': c.expires,
            'httpOnly': True,
            'secure': bool(c.secure),
            'sameSite': 'Lax',
        })
print(json.dumps(out))
`;
  const raw = execFileSync('python3', ['-c', script], { encoding: 'utf8', timeout: 120000 });
  return JSON.parse(raw.trim());
}

const report = {
  base: BASE,
  tested: 0,
  passed: 0,
  failed: 0,
  idempotency: null,
  consoleErrors: [],
  serverErrors: [],
  bookings: [],
  blockers: [],
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      report.consoleErrors.push(msg.text().slice(0, 500));
    }
  });
  page.on('response', (res) => {
    if (res.status() >= 500 && res.url().includes('awesomepg.in')) {
      report.serverErrors.push(`${res.status()} ${res.url().slice(0, 200)}`);
    }
  });

  try {
    const cookies = loadChromeAdminCookies();
    if (!cookies.some((c) => c.name === 'apg_admin_session')) {
      throw new Error('apg_admin_session cookie not found');
    }
    await context.addCookies(cookies);
  } catch (err) {
    report.blockers.push(err instanceof Error ? err.message : String(err));
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(2);
  }

  await page.goto(`${BASE}/admin/operations?filter=checkout`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(3000);

  if (page.url().includes('/admin/login')) {
    report.blockers.push('Admin login required');
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(2);
  }

  const financialLinks = page.locator('a[href*="/admin/bookings/"][href*="/financial"]');
  const count = await financialLinks.count();
  const take = Math.min(count, MAX_BOOKINGS);

  if (take === 0) {
    await page.goto(`${BASE}/admin/checkout-settlements?tab=completed`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await page.waitForTimeout(2000);
    const openLinks = page.locator('a[href*="/admin/checkout-settlements/"]');
    const n = Math.min(await openLinks.count(), MAX_BOOKINGS);
    for (let i = 0; i < n; i++) {
      const href = await openLinks.nth(i).getAttribute('href');
      if (!href) continue;
      await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(2000);
      await validateSettlementPage(page, href);
    }
  } else {
    for (let i = 0; i < take; i++) {
      const href = await financialLinks.nth(i).getAttribute('href');
      if (!href) continue;
      const url = href.includes('#') ? href : `${href}#checkout`;
      await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(2500);
      await validateFinancialCheckout(page, url);
    }
  }

  if (report.bookings.length > 0) {
    const first = report.bookings.find((b) => b.pass)?.href;
    if (first) {
      report.idempotency = await runIdempotency(page, first);
    }
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.failed > 0 ? 1 : 0);
}

async function validateFinancialCheckout(page, href) {
  const entry = { href, kind: 'financial', pass: false, notes: [] };
  report.tested++;
  const body = await page.locator('body').innerText();
  const finished =
    /checkout complete|refund receipt|checkout complete/i.test(body) ||
    (body.includes('Checkout complete') && !body.includes('Approve & complete checkout'));
  const completeBtn = page.getByRole('button', { name: /approve & complete checkout/i });
  const hasComplete = (await completeBtn.count()) > 0;

  if (finished && !hasComplete) {
    entry.pass = true;
    entry.notes.push('already_complete_ui');
    report.passed++;
  } else if (hasComplete) {
    entry.notes.push('ready_to_complete_not_clicked_in_smoke');
    entry.pass = false;
    report.failed++;
  } else {
    entry.notes.push('no_complete_control');
    entry.pass = false;
    report.failed++;
  }
  report.bookings.push(entry);
}

async function validateSettlementPage(page, href) {
  const entry = { href, kind: 'settlement_detail', pass: false, notes: [] };
  report.tested++;
  const body = await page.locator('body').innerText();
  if (/completed|refund paid|checkout complete/i.test(body)) {
    entry.pass = true;
    entry.notes.push('terminal_status_visible');
    report.passed++;
  } else {
    entry.notes.push('not_terminal');
    report.failed++;
  }
  report.bookings.push(entry);
}

async function runIdempotency(page, href) {
  const url = href.includes('/financial') ? (href.includes('#') ? href : `${href}#checkout`) : href;
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const btn = page.getByRole('button', { name: /approve & complete checkout/i });
  const visible = (await btn.count()) > 0;
  const body = await page.locator('body').innerText();
  return {
    completeButtonVisibleAfterRefresh: visible,
    showsCompleteState: /checkout complete|refund receipt/i.test(body),
    safe: !visible || body.includes('Checkout complete'),
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
