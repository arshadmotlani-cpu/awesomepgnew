import { chromium } from 'playwright';
import fs from 'fs';

const out = '.invoice-pdf-samples/branding-screenshots';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true });

// Capital (localhost with CAPITAL_DEV_HOST)
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:3011/login', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/capital-login.png`, fullPage: true });
  console.log('capital login ok');
  await page.close();
}

// Awesome PG via Host header (non-capital host)
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { Host: 'www.awesomepg.in' },
  });
  // Playwright Host header may be ignored; use baseURL with domain mapping via page.route or just visit /
  // Prefer: navigate with header x-forwarded-host
  const page = await context.newPage();
  await page.setExtraHTTPHeaders({ 'x-forwarded-host': 'www.awesomepg.in' });
  // With CAPITAL_DEV_HOST, host localhost still wins if forwarded not used first - check host.ts: forwarded || host
  await page.goto('http://localhost:3011/', { waitUntil: 'networkidle', timeout: 90000 }).catch(() => null);
  // If capital redirected, try without capital by using invest.localhost vs www
  const url = page.url();
  console.log('pg home url', url);
  await page.screenshot({ path: `${out}/apg-home.png`, fullPage: false });
  await page.goto('http://localhost:3011/login', { waitUntil: 'networkidle', timeout: 90000 }).catch(() => null);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/apg-login.png`, fullPage: true });
  await context.close();
}

// Also screenshot icon assets directly via file pages
{
  const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
  await page.setContent(`
    <html><body style="margin:0;background:#111;display:flex;gap:24px;padding:40px;align-items:center;justify-content:center">
      <img src="http://localhost:3011/icons/apg-admin-512.png" width="256" height="256" style="border-radius:48px" />
      <img src="http://localhost:3011/capital/icons/icon-512.png" width="256" height="256" style="border-radius:48px" />
    </body></html>
  `);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/icons-side-by-side.png` });
  await page.close();
}

await browser.close();
console.log('done', out);
