#!/usr/bin/env npx tsx
/**
 * Playwright smoke — resident profile + move-out (creates temporary session).
 *
 *   npm run dev   # separate terminal, or set BASE_URL to production
 *   RESIDENT_VERIFY_BOOKING_CODE=APG-2026-0048 npx tsx scripts/verify-resident-moveout-playwright.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-resident-moveout-playwright.ts');

import { sql } from 'drizzle-orm';
import { chromium } from 'playwright';
import { createClient, closeDb } from '@/src/db/client';
import { authSessions } from '@/src/db/schema';
import { randomToken, sha256 } from '@/src/lib/auth/crypto';
import { CUSTOMER_SESSION_COOKIE } from '@/src/lib/auth/constants';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

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

async function resolveCustomerId(): Promise<string> {
  const bookingCode = process.env.RESIDENT_VERIFY_BOOKING_CODE?.trim();
  const customerEmail = process.env.RESIDENT_VERIFY_CUSTOMER_EMAIL?.trim();
  const { db, close } = createClient({ max: 1 });
  const rows = await db.execute<{ customer_id: string }>(sql`
    SELECT b.customer_id
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE b.status = 'confirmed'
      AND (
        (${bookingCode ?? null}::text IS NOT NULL AND b.booking_code = ${bookingCode ?? null})
        OR (${customerEmail ?? null}::text IS NOT NULL AND lower(c.email) = lower(${customerEmail ?? null}))
      )
    LIMIT 1
  `);
  await close();
  const id = rows[0]?.customer_id;
  if (!id) {
    throw new Error('Set RESIDENT_VERIFY_BOOKING_CODE or RESIDENT_VERIFY_CUSTOMER_EMAIL');
  }
  return id;
}

async function mintSessionToken(customerId: string): Promise<string> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const { db, close } = createClient({ max: 1 });
  await db.insert(authSessions).values({
    kind: 'customer',
    subjectId: customerId,
    tokenHash: sha256(token),
    expiresAt,
    rememberMe: false,
  });
  await close();
  return token;
}

async function main() {
  const manualCookie = process.env.RESIDENT_VERIFY_SESSION_COOKIE?.trim();
  let sessionToken: string | null = null;

  if (manualCookie) {
    const parts = manualCookie.split('=');
    sessionToken = parts.slice(1).join('=');
  } else {
    const customerId = await resolveCustomerId();
    sessionToken = await mintSessionToken(customerId);
    console.log(`Minted temporary session for customer ${customerId.slice(0, 8)}…`);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: CUSTOMER_SESSION_COOKIE,
      value: sessionToken,
      domain: new URL(BASE).hostname,
      path: '/',
    },
  ]);

  let allPass = true;

  for (const route of ROUTES) {
    const page = await context.newPage();
    const url = `${BASE}${route.path}`;
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 }).catch(() => null);
    const body = await page.locator('body').innerText().catch(() => '');

    if (!res || res.status() >= 500) {
      console.log(`FAIL [${route.id}] HTTP ${res?.status() ?? 'error'} ${url}`);
      allPass = false;
    } else {
      const hit = ERROR_PATTERNS.find((p) => body.includes(p));
      if (hit) {
        console.log(`FAIL [${route.id}] error boundary: "${hit}"`);
        allPass = false;
      } else {
        console.log(`PASS [${route.id}] no error boundary (${url})`);
      }
    }

    if (route.id === 'requests_move_out') {
      const hints = ['Move-out', 'leaving', '2026-', 'Approved', 'pending'];
      if (hints.some((h) => body.toLowerCase().includes(h.toLowerCase()))) {
        console.log(`PASS [${route.id}] move-out content visible`);
      } else {
        console.log(`WARN [${route.id}] move-out copy not detected (check login/session)`);
      }
    }

    await page.close();
  }

  await browser.close();
  await closeDb();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
