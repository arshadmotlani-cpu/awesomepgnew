/* eslint-disable no-console */
/**
 * Browser repro for Payment Review → Approve server action.
 * Usage: npx tsx scripts/repro-payment-approve-playwright.ts
 */
import { chromium } from 'playwright';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@awesomepg.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'dev-admin-pass';
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const actionResponses: Array<{
    status: number;
    contentType: string | null;
    bodyPreview: string;
  }> = [];

  page.on('response', async (res) => {
    const req = res.request();
    if (req.method() !== 'POST') return;
    const url = res.url();
    if (!url.includes('/admin/operations')) return;
    const ct = res.headers()['content-type'] ?? null;
    let bodyPreview = '';
    try {
      bodyPreview = (await res.text()).slice(0, 500);
    } catch {
      bodyPreview = '<unreadable>';
    }
    actionResponses.push({ status: res.status(), contentType: ct, bodyPreview });
    console.log('\n=== SERVER ACTION RESPONSE ===');
    console.log('status:', res.status());
    console.log('content-type:', ct);
    console.log('body preview:', bodyPreview);
  });

  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 30_000 });

  await page.goto(`${BASE}/admin/operations?filter=payment_proof`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });

  const approveBtn = page.getByRole('button', { name: /^approve$/i }).first();
  await approveBtn.waitFor({ state: 'visible', timeout: 30_000 });
  await approveBtn.click();

  await page.waitForTimeout(5000);

  const errText = await page.getByText(/unexpected response|approval failed|error/i).first().textContent().catch(() => null);
  console.log('\nUI error text:', errText ?? '(none)');

  if (actionResponses.length === 0) {
    console.error('No server action POST captured');
    process.exitCode = 1;
  } else {
    const last = actionResponses[actionResponses.length - 1]!;
    const ok =
      last.status === 200 &&
      (last.contentType?.includes('text/x-component') ||
        last.contentType?.includes('text/plain'));
    if (!ok) process.exitCode = 1;
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
