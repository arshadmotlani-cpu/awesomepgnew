#!/usr/bin/env npx tsx
/**
 * Capture resident move-out UI for each journey stage (dev harness + Playwright).
 *
 *   npm run dev   # separate terminal
 *   npx tsx scripts/capture-resident-moveout-ui-screenshots.ts
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = join(process.cwd(), 'docs', 'screenshots', 'resident-move-out');

const CAPTURES: { file: string; stage: string; label: string }[] = [
  { file: '01-pending-approval.png', stage: 'pending', label: 'Pending Approval' },
  { file: '02-approved.png', stage: 'approved', label: 'Approved' },
  { file: '03-request-refund.png', stage: 'request_refund', label: 'Request Refund' },
  { file: '04-under-review.png', stage: 'under_review', label: 'Under Review' },
  { file: '05-refund-completed.png', stage: 'completed', label: 'Refund Completed' },
];

async function waitForStage(page: Page, stage: string) {
  await page.goto(`${BASE}/dev/resident-move-out-stages?stage=${stage}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await page.locator(`[data-move-out-stage="${stage}"]`).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  for (const cap of CAPTURES) {
    await waitForStage(page, cap.stage);
    const path = join(OUT_DIR, cap.file);
    await page.screenshot({ path, fullPage: true });
    console.log(`Wrote ${path} (${cap.label})`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
