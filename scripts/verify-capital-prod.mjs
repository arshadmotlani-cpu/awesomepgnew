import { chromium } from 'playwright';
import fs from 'fs';

const base = 'https://invest.awesomepg.in';
const email = process.env.INVEST_ADMIN_EMAIL || 'admin@foryour.in';
const password = process.env.INVEST_ADMIN_PASSWORD || '@Admin1345';
const outDir = '.invoice-pdf-samples/dashboard-screenshots/prod';
fs.mkdirSync(outDir, { recursive: true });

const results = [];
function ok(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  // Login
  const loginRes = await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  ok('login page', loginRes?.ok() === true, `status ${loginRes?.status()}`);
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/dashboard/, { timeout: 45000 });
  ok('login → dashboard', /dashboard/.test(page.url()), page.url());

  // Dashboard Investment OS
  await page.waitForTimeout(2000);
  const overview = await page.getByRole('heading', { name: 'Overview' }).count();
  const investmentOs = await page.getByText('Investment OS').count();
  const kpi = await page.getByText('Current Investment').count();
  const purchaseVol = await page.getByText('Lifetime Purchase Volume').count();
  const lifetimeProfit = await page.getByText('Lifetime Profit').count();
  const charts = await page.getByText('Portfolio Growth').count();
  const monthlyProfit = await page.getByText('Monthly Profit').count();
  const manualBtn = await page.getByRole('button', { name: /Add Manual Profit/i }).count();
  ok('dashboard Overview heading', overview > 0);
  ok('dashboard Investment OS label', investmentOs > 0);
  ok('dashboard Current Investment KPI', kpi > 0);
  ok('dashboard Lifetime Purchase Volume', purchaseVol > 0);
  ok('dashboard Lifetime Profit', lifetimeProfit > 0);
  ok('dashboard Portfolio Growth chart', charts > 0);
  ok('dashboard Monthly Profit chart', monthlyProfit > 0);
  ok('dashboard Manual Profit CTA', manualBtn > 0);
  await page.screenshot({ path: `${outDir}/prod-overview.png`, fullPage: true });

  // Manual profit modal + submit tiny amount then verify ledger
  await page.getByRole('button', { name: /Add Manual Profit/i }).first().click();
  await page.waitForTimeout(500);
  const modal = page.locator('.fixed.inset-0.z-50');
  const modalTitle = await modal.getByRole('heading', { name: 'Add Manual Profit' }).count();
  ok('manual profit modal', modalTitle > 0);
  const stamp = `Deploy verify ${Date.now()}`;
  await modal.locator('input[type="number"]').fill('1');
  await modal.locator('input[placeholder*="Investor"]').fill('Deploy verification');
  await modal.locator('textarea').fill(stamp);
  await modal.getByRole('button', { name: /^Add Manual Profit$/ }).click();
  await page.waitForTimeout(4000);
  const modalGone = (await page.getByRole('heading', { name: 'Add Manual Profit' }).count()) === 0;
  ok('manual profit submit closes modal', modalGone);

  // Ledger should show manual_profit
  const ledgerRes = await page.goto(`${base}/ledger`, { waitUntil: 'networkidle', timeout: 60000 });
  ok('ledger page', ledgerRes?.ok() === true, `status ${ledgerRes?.status()}`);
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  ok('ledger shows manual_profit', /manual_profit/i.test(body), 'entry type present');
  ok('ledger shows verification note', body.includes('Deploy verification') || body.includes(stamp.slice(0, 20)));

  // Regression pages
  for (const path of ['/assets', '/expenses', '/payments', '/reports', '/capital']) {
    const res = await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    ok(`${path} loads`, res?.ok() === true || res?.status() === 200, `status ${res?.status()}`);
  }

  // Confirm not old CRUD dashboard copy
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  const oldCopy = await page.getByText('Portfolio overview and insights').count();
  ok('not old dashboard copy', oldCopy === 0);

  // Health API if available
  const health = await page.request.get(`${base}/api/capital/health`);
  ok('health API', health.ok(), `status ${health.status()}`);
} catch (e) {
  ok('script error', false, e instanceof Error ? e.message : String(e));
  await page.screenshot({ path: `${outDir}/prod-error.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\nSUMMARY ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('Failures:');
  for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
  process.exit(1);
}
