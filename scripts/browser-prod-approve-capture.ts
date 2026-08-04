#!/usr/bin/env npx tsx
/**
 * Hit production Approve via Playwright: capture HTTP status, body, UI error.
 * Creates a synthetic pending rent proof then opens payment-review workspace.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('browser-prod-approve-capture');

const OUT = join(process.cwd(), 'tmp');
const BASE = 'https://www.awesomepg.in';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { closeDb, db } = await import('@/src/db/client');
  const { eq, sql } = await import('drizzle-orm');
  const { adminUsers, rentInvoices } = await import('@/src/db/schema');
  const { authSessions } = await import('@/src/db/schema/authSessions');
  const { ADMIN_SESSION_COOKIE } = await import('@/src/lib/auth/constants');

  const TAG = `PRODCAP_${Date.now()}`;
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
    ORDER BY random() LIMIT 1
  `);
  if (!booking) throw new Error('no booking');

  const [inv] = await db
    .insert(rentInvoices)
    .values({
      bookingId: booking.booking_id,
      customerId: booking.customer_id,
      bedId: booking.bed_id,
      pgId: booking.pg_id,
      invoiceNumber: `PCAP-${TAG}`,
      billingMonth: '2099-03-01',
      dueDate: '2099-03-05',
      rentPaise: 10_000,
      status: 'pending',
      isAdhoc: true,
      paymentProofUrl: `https://example.com/prodcap/${TAG}.png`,
      proofSubmittedAt: new Date(),
      proofSnapshotOutstandingPaise: 10_000,
      proofSnapshotLateFeePaise: 0,
      proofSnapshotPrincipalDuePaise: 10_000,
      notes: `${TAG} prod capture`,
    })
    .returning({ id: rentInvoices.id });

  const reviewKey = `rent-${inv!.id}`;
  console.log('invoice', inv!.id, reviewKey);

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
    userAgent: 'prod-approve-capture',
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.addCookies([
    {
      name: ADMIN_SESSION_COOKIE,
      value: rawToken,
      domain: 'www.awesomepg.in',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);

  const posts: Array<{
    url: string;
    status: number;
    contentType: string | null;
    body: string;
    headers: Record<string, string>;
    durationHint?: number;
  }> = [];

  page.on('response', async (res) => {
    const req = res.request();
    if (req.method() !== 'POST') return;
    if (!res.url().includes('awesomepg.in')) return;
    // Server actions post to the page URL
    const ct = res.headers()['content-type'] ?? null;
    const body = await res.text().catch(() => '<unreadable>');
    const nextAction = req.headers()['next-action'];
    if (!nextAction && !ct?.includes('text/x-component') && !ct?.includes('text/plain')) {
      // still capture admin POSTs
      if (!res.url().includes('/admin/')) return;
    }
    posts.push({
      url: res.url(),
      status: res.status(),
      contentType: ct,
      body: body.slice(0, 8000),
      headers: {
        'next-action': nextAction ?? '',
        'x-matched-path': res.headers()['x-matched-path'] ?? '',
        'x-vercel-id': res.headers()['x-vercel-id'] ?? '',
        'x-vercel-cache': res.headers()['x-vercel-cache'] ?? '',
        server: res.headers()['server'] ?? '',
      },
    });
    console.log('POST', res.status(), ct, res.url().slice(0, 120), 'body0:', body.slice(0, 200));
  });

  const url = `${BASE}/admin/payment-review/${encodeURIComponent(reviewKey)}`;
  console.log('goto', url);
  const nav = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  console.log('nav status', nav?.status(), 'final', page.url());

  // If redirected away, still try operations focus
  if (!page.url().includes('payment-review')) {
    console.log('redirected — trying focus URL');
    await page.goto(
      `${BASE}/admin/operations?filter=waiting_for_approval&focus=${encodeURIComponent(reviewKey)}`,
      { waitUntil: 'domcontentloaded', timeout: 180_000 },
    );
  }

  await page.screenshot({ path: join(OUT, 'prod-approve-capture-before.png'), fullPage: true });
  writeFileSync(join(OUT, 'prod-approve-capture-before.html'), await page.content());

  const btn = page.locator('button:has-text("Approve")').first();
  const visible = await btn.isVisible().catch(() => false);
  console.log('approve visible', visible);

  let uiError: string | null = null;
  let clickMs: number | null = null;
  if (visible) {
    const t0 = performance.now();
    await btn.click();
    await page.waitForTimeout(45_000);
    clickMs = Math.round((performance.now() - t0) * 10) / 10;
    uiError =
      (await page
        .locator('text=/unexpected response|approval failed|PostgreSQL|room_os|does not exist|error/i')
        .first()
        .textContent()
        .catch(() => null)) ?? null;
  }

  await page.screenshot({ path: join(OUT, 'prod-approve-capture-after.png'), fullPage: true });

  const [after] = await db
    .select({ status: rentInvoices.status, paymentId: rentInvoices.paymentId })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, inv!.id))
    .limit(1);

  const report = {
    invoiceId: inv!.id,
    reviewKey,
    navStatus: nav?.status() ?? null,
    finalUrl: page.url(),
    approveVisible: visible,
    clickMs,
    uiError,
    posts,
    invoiceAfter: after,
  };
  writeFileSync(join(OUT, 'prod-approve-http-capture.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
