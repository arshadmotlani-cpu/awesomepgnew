#!/usr/bin/env npx tsx
/**
 * Browser-measure rent approval against local optimized server.
 *   BROWSER_BASE_URL=http://localhost:3010 npx tsx --tsconfig tsconfig.json ./scripts/browser-measure-rent-approval.ts
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('browser-measure-rent-approval.ts');

const OUT = join(process.cwd(), 'tmp');
const REPORT = join(OUT, 'rent-approval-browser-timings.json');
const BASE = process.env.BROWSER_BASE_URL ?? 'http://localhost:3010';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { closeDb, db } = await import('@/src/db/client');
  const { eq, sql } = await import('drizzle-orm');
  const { adminUsers } = await import('@/src/db/schema/adminUsers');
  const { authSessions } = await import('@/src/db/schema/authSessions');
  const { ADMIN_SESSION_COOKIE } = await import('@/src/lib/auth/constants');
  const { rentInvoices } = await import('@/src/db/schema');

  const TAG = `OPTBROWSER_${Date.now()}`;
  const [booking] = await db.execute<{
    booking_id: string;
    customer_id: string;
    bed_id: string;
    pg_id: string;
    customer_name: string;
  }>(sql`
    SELECT b.id AS booking_id, b.customer_id, br.bed_id, f.pg_id, c.full_name AS customer_name
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.status = 'active'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE b.status = 'confirmed'
    ORDER BY random()
    LIMIT 1
  `);
  if (!booking) throw new Error('no booking');

  const [inv] = await db
    .insert(rentInvoices)
    .values({
      bookingId: booking.booking_id,
      customerId: booking.customer_id,
      bedId: booking.bed_id,
      pgId: booking.pg_id,
      invoiceNumber: `OPTB-${TAG}`,
      billingMonth: '2099-01-01',
      dueDate: '2099-01-05',
      rentPaise: 10_000,
      status: 'pending',
      isAdhoc: true,
      paymentProofUrl: `https://example.com/opt-browser/${TAG}.png`,
      proofSubmittedAt: new Date(),
      proofSnapshotOutstandingPaise: 10_000,
      proofSnapshotLateFeePaise: 0,
      proofSnapshotPrincipalDuePaise: 10_000,
      notes: `${TAG} browser timing for ${booking.customer_name}`,
    })
    .returning({ id: rentInvoices.id });

  const reviewKey = `rent-${inv!.id}`;
  console.log('Created invoice', inv!.id, 'reviewKey', reviewKey);

  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, 'admin@foryour.in'))
    .limit(1);
  if (!admin) throw new Error('admin missing');

  const rawToken = randomBytes(32).toString('hex');
  await db.insert(authSessions).values({
    kind: 'admin',
    subjectId: admin.id,
    tokenHash: sha256(rawToken),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    rememberMe: false,
    userAgent: 'browser-measure-rent-approval',
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    ignoreHTTPSErrors: true,
  });
  await context.addCookies([
    {
      name: ADMIN_SESSION_COOKIE,
      value: rawToken,
      url: BASE,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(300_000);

  const timings: Record<string, number | string | boolean | null> = {
    invoiceId: inv!.id,
    reviewKey,
    base: BASE,
  };

  try {
    const url = `${BASE}/admin/payment-review/${encodeURIComponent(reviewKey)}`;
    console.log('goto', url);
    const navStart = performance.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    timings.nav_domcontentloaded_ms = Math.round((performance.now() - navStart) * 10) / 10;
    console.log('url after goto', page.url());
    console.log('title', await page.title());

    // Workspace SSR can take minutes because getPendingPaymentReviewByKey lists the full queue.
    await Promise.race([
      page.locator('[data-payment-review-workspace]').waitFor({ state: 'visible', timeout: 300_000 }),
      page.locator('button:has-text("Approve")').waitFor({ state: 'visible', timeout: 300_000 }),
      page.getByText(/sign in|log in/i).first().waitFor({ state: 'visible', timeout: 300_000 }),
    ]);

    await page.screenshot({ path: join(OUT, 'rent-approval-browser-before.png'), fullPage: true });
    writeFileSync(join(OUT, 'rent-approval-browser-before.html'), await page.content());

    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log('body snippet', bodyText.slice(0, 400));

    if (/sign in|login/i.test(bodyText) && !/Approve/i.test(bodyText)) {
      throw new Error('Not authenticated — landed on login');
    }

    const btn = page.locator('button:has-text("Approve")').first();
    await btn.waitFor({ state: 'visible', timeout: 60_000 });

    const clickAt = performance.now();
    await btn.click();

    const toastAt = await page
      .getByText(/Payment approved successfully/i)
      .first()
      .waitFor({ state: 'visible', timeout: 120_000 })
      .then(() => performance.now())
      .catch(() => null);

    timings.click_to_success_toast_ms =
      toastAt != null ? Math.round((toastAt - clickAt) * 10) / 10 : null;

    const redirectAt = await page
      .waitForURL(/waiting_for_approval/, { timeout: 120_000 })
      .then(() => performance.now())
      .catch(() => null);
    timings.click_to_redirect_ms =
      redirectAt != null ? Math.round((redirectAt - clickAt) * 10) / 10 : null;

    let disappeared = false;
    for (let i = 0; i < 80; i++) {
      const [row] = await db.execute<{ status: string }>(sql`
        SELECT status FROM rent_invoices WHERE id = ${inv!.id}::uuid
      `);
      if ((row as { status: string })?.status === 'paid') {
        disappeared = true;
        break;
      }
      await page.waitForTimeout(200);
    }
    timings.click_to_payment_disappeared_ms = disappeared
      ? Math.round((performance.now() - clickAt) * 10) / 10
      : null;
    timings.payment_disappeared = disappeared;
    timings.final_url = page.url();

    await page.screenshot({ path: join(OUT, 'rent-approval-browser-after.png'), fullPage: true });
  } finally {
    await browser.close();
    await closeDb();
  }

  writeFileSync(REPORT, JSON.stringify({ generatedAt: new Date().toISOString(), timings }, null, 2));
  console.log(JSON.stringify(timings, null, 2));
  console.log('Wrote', REPORT);
  if (timings.click_to_success_toast_ms == null || !timings.payment_disappeared) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
