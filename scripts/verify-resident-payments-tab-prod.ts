#!/usr/bin/env npx tsx
/**
 * Production cert — resident Payments tab loads for multiple booking states.
 *
 *   BASE_URL=https://www.awesomepg.in npx tsx scripts/verify-resident-payments-tab-prod.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-resident-payments-tab-prod.ts');

import { sql } from 'drizzle-orm';
import { chromium } from 'playwright';
import { createClient } from '@/src/db/client';
import { authSessions } from '@/src/db/schema';
import { randomToken, sha256 } from '@/src/lib/auth/crypto';
import { CUSTOMER_SESSION_COOKIE } from '@/src/lib/auth/constants';

const BASE = process.env.BASE_URL ?? 'https://www.awesomepg.in';
const PAYMENTS_PATH = '/account/profile?section=resident&tab=payments';

const ERROR_PATTERNS = [
  'Your stay dashboard could not load',
  'Your resident dashboard could not load',
  'Application error',
];

const CASES = [
  { code: 'APG-2026-0011', note: 'pending Sep rent' },
  { code: 'APG-2026-0021', note: 'pending Sep rent + room change' },
  { code: 'APG-2026-0096', note: 'payment_in_progress' },
] as const;

async function mintSession(customerId: string): Promise<string> {
  const token = randomToken();
  const { db, close } = createClient({ max: 1 });
  await db.insert(authSessions).values({
    kind: 'customer',
    subjectId: customerId,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    rememberMe: false,
  });
  await close();
  return token;
}

async function resolveCustomerId(bookingCode: string): Promise<string> {
  const { db, close } = createClient({ max: 1 });
  const [row] = await db.execute<{ customer_id: string }>(sql`
    SELECT b.customer_id FROM bookings b WHERE b.booking_code = ${bookingCode} LIMIT 1
  `);
  await close();
  if (!row?.customer_id) throw new Error(`No customer for ${bookingCode}`);
  return row.customer_id;
}

async function verifyCase(code: string, note: string) {
  const customerId = await resolveCustomerId(code);
  const token = await mintSession(customerId);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const domain = new URL(BASE).hostname;
  await page.context().addCookies([
    { name: CUSTOMER_SESSION_COOKIE, value: token, domain, path: '/' },
  ]);
  await page.goto(`${BASE}${PAYMENTS_PATH}`, { waitUntil: 'networkidle', timeout: 90_000 });
  const body = await page.locator('body').innerText();
  await browser.close();
  const failed = ERROR_PATTERNS.some((p) => body.includes(p));
  const hasContent =
    /Due in|overdue|Total due|Waiting for admin|Bills due|Payments/i.test(body) && !failed;
  return { code, note, failed, hasContent, ok: !failed && hasContent };
}

async function main() {
  const results = [];
  for (const c of CASES) {
    results.push(await verifyCase(c.code, c.note));
  }
  console.log(JSON.stringify({ base: BASE, results }, null, 2));
  const allOk = results.every((r) => r.ok);
  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
