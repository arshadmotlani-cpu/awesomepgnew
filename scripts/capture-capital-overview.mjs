import { chromium } from 'playwright';
import fs from 'fs';

const email = process.env.INVEST_ADMIN_EMAIL;
const password = process.env.INVEST_ADMIN_PASSWORD;
if (!email || !password) {
  console.error('Missing INVEST_ADMIN credentials');
  process.exit(1);
}

const outDir = '.invoice-pdf-samples/dashboard-screenshots';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:3010/login', { waitUntil: 'networkidle' });
await page.screenshot({ path: `${outDir}/01-login.png`, fullPage: true });

const emailInput = page.locator('input[type="email"], input[name="email"]').first();
const passInput = page.locator('input[type="password"], input[name="password"]').first();
await emailInput.fill(email);
await passInput.fill(password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL(/dashboard/, { timeout: 45000 }).catch(async () => {
  console.log('dashboard wait failed, current:', page.url());
  console.log(await page.content().then((h) => h.slice(0, 500)));
});
await page.waitForTimeout(3000);

console.log('after login url:', page.url());
await page.screenshot({ path: `${outDir}/02-overview-top.png` });
await page.screenshot({ path: `${outDir}/03-overview-full.png`, fullPage: true });

await page.evaluate(() => window.scrollTo(0, 900));
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/04-charts.png` });

await page.evaluate(() => window.scrollTo(0, 2000));
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/05-charts-lower.png` });

const manualBtn = page.getByRole('button', { name: /Add Manual Profit/i }).first();
if (await manualBtn.count()) {
  await manualBtn.click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/06-manual-profit-modal.png` });
}

console.log('screenshots written to', outDir);
await browser.close();
