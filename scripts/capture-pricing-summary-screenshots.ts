/**
 * Capture mobile + desktop screenshots of the fixed pricing summary fixture.
 * Run: PRICING_PROOF=1 npx tsx scripts/capture-pricing-summary-screenshots.ts
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

const OUT_DIR = path.join(process.cwd(), 'docs/qa/pricing-summary-proof');
const PORT = 3017;
const BASE = `http://localhost:${PORT}`;
const PROOF_PATH = '/dev/pricing-proof';

async function waitForServer(url: string, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.ok) {
        const html = await res.text();
        if (html.includes('pricing-proof-review') || html.includes('Total payable')) return;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`Server not ready at ${url}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let child: ChildProcess | null = null;
  child = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PRICING_PROOF: '1',
      SKIP_MIGRATION_CHECK: 'true',
      PORT: String(PORT),
      // Avoid treating local screenshot boot as Vercel production.
      VERCEL: '',
      VERCEL_ENV: 'development',
      NEXT_PUBLIC_VERCEL_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  let bootLog = '';
  child.stdout?.on('data', (d) => {
    bootLog += String(d);
  });
  child.stderr?.on('data', (d) => {
    bootLog += String(d);
  });

  try {
    await waitForServer(`${BASE}${PROOF_PATH}`);
    const browser = await chromium.launch({ headless: true });

    // Desktop review
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`${BASE}${PROOF_PATH}`, { waitUntil: 'networkidle', timeout: 120_000 });
      await page.getByTestId('pricing-proof-review').waitFor({ state: 'visible' });
      await page.getByText('Total payable').first().waitFor({ state: 'visible' });
      await page.getByText('Promo discount applied — ₹361 saved').first().waitFor({
        state: 'visible',
      });
      await page.locator('[data-testid="pricing-proof-review"]').screenshot({
        path: path.join(OUT_DIR, 'desktop-booking-review.png'),
      });
      await page.screenshot({
        path: path.join(OUT_DIR, 'desktop-full-page.png'),
        fullPage: true,
      });
      await page.close();
    }

    // Mobile review + checkout
    {
      const iPhone = devices['iPhone 13'];
      const page = await browser.newPage({
        ...iPhone,
        viewport: { width: 390, height: 844 },
      });
      await page.goto(`${BASE}${PROOF_PATH}`, { waitUntil: 'networkidle', timeout: 120_000 });
      await page.getByTestId('pricing-proof-review').waitFor({ state: 'visible' });
      await page.locator('[data-testid="pricing-proof-review"]').screenshot({
        path: path.join(OUT_DIR, 'mobile-booking-review.png'),
      });
      await page.locator('[data-testid="pricing-proof-checkout"]').screenshot({
        path: path.join(OUT_DIR, 'mobile-checkout-compact.png'),
      });
      await page.screenshot({
        path: path.join(OUT_DIR, 'mobile-full-page.png'),
        fullPage: true,
      });
      await page.close();
    }

    await browser.close();
    console.log(`Screenshots written to ${OUT_DIR}`);
    for (const f of fs.readdirSync(OUT_DIR)) {
      console.log(` - ${f}`);
    }
  } catch (err) {
    console.error(err);
    console.error('Boot log tail:\n', bootLog.slice(-4000));
    process.exitCode = 1;
  } finally {
    if (child?.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  }
}

main();
