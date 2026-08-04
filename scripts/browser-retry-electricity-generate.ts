/**
 * Retry bill generation only — capture network POST body/status for diagnosis.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('browser-gen-retry');

const OUT = path.join(process.cwd(), 'tmp/browser-elec-verify');
mkdirSync(OUT, { recursive: true });
const BASE = 'https://www.awesomepg.in';
const ROOM_A = '1e925dd4-aee6-47a6-8727-5c49a6f72f18';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { closeDb, db } = await import('../src/db/client');
  const { eq, sql } = await import('drizzle-orm');
  const { adminUsers } = await import('../src/db/schema/adminUsers');
  const { authSessions } = await import('../src/db/schema/authSessions');
  const { ADMIN_SESSION_COOKIE } = await import('../src/lib/auth/constants');

  const report: any = { posts: [], console: [], pageErrors: [], steps: [] };

  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, 'admin@foryour.in'))
    .limit(1);
  const rawToken = randomBytes(32).toString('hex');
  const [session] = await db
    .insert(authSessions)
    .values({
      kind: 'admin',
      subjectId: admin!.id,
      tokenHash: sha256(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      rememberMe: false,
      userAgent: 'browser-gen-retry',
    })
    .returning({ id: authSessions.id });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
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
  page.setDefaultTimeout(60000);
  page.on('console', (m) => report.console.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => report.pageErrors.push(String(e)));

  page.on('response', async (res) => {
    const req = res.request();
    if (req.method() === 'POST' && req.url().includes('www.awesomepg.in')) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {
        bodyText = '<unreadable>';
      }
      report.posts.push({
        url: req.url(),
        status: res.status(),
        contentType: res.headers()['content-type'],
        bodySnippet: bodyText.slice(0, 2000),
      });
    }
  });

  try {
    await page.goto(`${BASE}/admin/electricity/new?month=2026-08`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForSelector('select[name="roomId"]');

    const pgSelect = page.locator('label').filter({ hasText: /^PG$/ }).locator('select');
    if (await pgSelect.count()) {
      const options = await pgSelect.locator('option').allTextContents();
      const idx = options.findIndex((o) => /SHANTINAGAR/i.test(o));
      if (idx >= 0) await pgSelect.selectOption({ index: idx });
    }

    await page.locator('select[name="roomId"]').selectOption(ROOM_A);
    await page.locator('input[name="billingMonth"]').fill('2026-08-01');
    await page.locator('input[name="billingMonth"]').dispatchEvent('input');
    await page.locator('input[name="billingMonth"]').blur();

    await page.waitForFunction(() => {
      const labels = [...document.querySelectorAll('label')];
      const prev = labels.find((l) => l.textContent?.includes('Previous reading'));
      const val = prev?.querySelector('div')?.textContent?.trim() ?? '';
      return val === '906';
    }, undefined, { timeout: 30000 });

    const uiPrev = await page
      .locator('label')
      .filter({ hasText: 'Previous reading' })
      .locator('div')
      .first()
      .innerText();

    await page.locator('input[name="currentReadingUnits"]').fill('907');
    const notes = page.locator('textarea[name="notes"], input[name="notes"]');
    if (await notes.count()) await notes.first().fill('BROWSER_VERIFY_RETRY +1');

    await page.screenshot({ path: path.join(OUT, '13-retry-before-generate.png'), fullPage: true });

    // Click generate and wait up to 3 minutes for either success redirect, success text, or failure
    await page.getByRole('button', { name: /Generate electricity/i }).click();

    const outcome = await Promise.race([
      page.waitForURL(/electricity\/bills\//, { timeout: 180000 }).then(() => 'redirected'),
      page.waitForSelector('text=Status: Failed', { timeout: 180000 }).then(() => 'failed'),
      page.waitForSelector('text=Completed', { timeout: 180000 }).then(() => 'completed'),
      page.waitForSelector('text=Generating', { timeout: 10000 }).then(async () => {
        // stay until generating ends
        await page.waitForSelector('text=Generating', { state: 'detached', timeout: 180000 }).catch(() => null);
        return 'generating_done';
      }),
    ]).catch((e) => `timeout:${e}`);

    await sleep(2000);
    await page.screenshot({ path: path.join(OUT, '14-retry-after-generate.png'), fullPage: true });

    const pageText = await page.locator('body').innerText();
    report.steps.push({
      outcome,
      url: page.url(),
      uiPrev: uiPrev.trim(),
      pageTextSnippet: pageText.slice(pageText.indexOf('Previous reading') >= 0 ? pageText.indexOf('Previous reading') - 50 : 0, 1500),
    });

    const saved = (await db.execute(sql`
      SELECT id::text, billing_month::text, previous_reading_units::text AS prev,
             current_reading_units::text AS curr, units_consumed::text AS units, notes, created_at::text
      FROM electricity_bills
      WHERE room_id = ${ROOM_A} AND billing_month = '2026-08-01'
      ORDER BY created_at DESC LIMIT 1
    `)) as any[];

    const jobs = (await db.execute(sql`
      SELECT * FROM electricity_bill_generation_jobs
      ORDER BY created_at DESC LIMIT 5
    `)) as any[];

    report.savedBill = saved[0] ?? null;
    report.recentJobs = jobs;
    report.tripleMatch =
      saved[0] &&
      Number(saved[0].prev) === Number(uiPrev.trim()) &&
      Number(saved[0].curr) === 907;

    writeFileSync(path.join(OUT, 'generate-retry-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await db.delete(authSessions).where(eq(authSessions.id, session.id)).catch(() => null);
    await browser.close().catch(() => null);
    await closeDb().catch(() => null);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
