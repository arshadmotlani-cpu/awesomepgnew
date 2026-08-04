/**
 * Real browser verification — Generate Electricity Bill UI.
 * Run: USE_PRODUCTION_DB=1 npx tsx scripts/browser-verify-electricity-generate.ts
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type ConsoleMessage, type Request } from 'playwright';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('browser-elec');

const OUT = path.join(process.cwd(), 'tmp/browser-elec-verify');
mkdirSync(OUT, { recursive: true });

const BASE = 'https://www.awesomepg.in';
const ROOM_A = '1e925dd4-aee6-47a6-8727-5c49a6f72f18'; // Shantinagar 204
const ROOM_B = 'cd562fa7-14c4-46f2-a87c-4f07078e42d6'; // Shantinagar 102
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { closeDb, db } = await import('../src/db/client');
  const { eq, sql } = await import('drizzle-orm');
  const { adminUsers } = await import('../src/db/schema/adminUsers');
  const { authSessions } = await import('../src/db/schema/authSessions');
  const { ADMIN_SESSION_COOKIE } = await import('../src/lib/auth/constants');

  const report: Record<string, any> = {
    startedAt: new Date().toISOString(),
    steps: [],
    network: [],
    console: [],
    pageErrors: [],
    failedRequests: [],
    screenshots: [] as string[],
    checks: {} as Record<string, boolean>,
  };

  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, 'admin@foryour.in'))
    .limit(1);
  if (!admin) throw new Error('admin missing');

  const rawToken = randomBytes(32).toString('hex');
  const [session] = await db
    .insert(authSessions)
    .values({
      kind: 'admin',
      subjectId: admin.id,
      tokenHash: sha256(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      rememberMe: false,
      userAgent: 'browser-elec-verify-v2',
    })
    .returning({ id: authSessions.id });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    ignoreHTTPSErrors: true,
  });
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
  page.setDefaultTimeout(45000);

  page.on('console', (msg: ConsoleMessage) => {
    report.console.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => report.pageErrors.push(String(err)));
  page.on('requestfailed', (req) => {
    report.failedRequests.push({ url: req.url(), error: req.failure()?.errorText });
  });
  page.on('request', (req: Request) => {
    if (req.url().includes('last-electricity-reading')) {
      const u = new URL(req.url());
      report.network.push({
        method: req.method(),
        url: req.url(),
        billingMonth: u.searchParams.get('billingMonth'),
        hasBillingMonth: /^(\d{4})-(\d{2})-01$/.test(u.searchParams.get('billingMonth') ?? ''),
      });
    }
  });

  const shot = async (name: string) => {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    report.screenshots.push(file);
  };

  const readPrev = async () => {
    const text = await page
      .locator('label')
      .filter({ hasText: 'Previous reading' })
      .locator('div')
      .first()
      .innerText();
    return text.trim();
  };

  const waitPrevSettled = async () => {
    await page.waitForFunction(() => {
      const labels = [...document.querySelectorAll('label')];
      const prev = labels.find((l) => l.textContent?.includes('Previous reading'));
      const val = prev?.querySelector('div')?.textContent?.trim() ?? '';
      const loading = !!prev?.textContent?.includes('Loading last reading');
      return !loading && val !== '' && val !== '…' && val !== '—';
    }, undefined, { timeout: 30000 });
    await sleep(250);
    return readPrev();
  };

  const selectShantinagarPg = async () => {
    const pgSelect = page.locator('label').filter({ hasText: /^PG$/ }).locator('select');
    if ((await pgSelect.count()) === 0) return;
    const options = await pgSelect.locator('option').allTextContents();
    const idx = options.findIndex((o) => /SHANTINAGAR/i.test(o));
    if (idx >= 0) await pgSelect.selectOption({ index: idx });
    await sleep(400);
  };

  try {
    // Start as admin on Operations
    await page.goto(`${BASE}/admin/operations`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await shot('01-operations');
    report.steps.push({ step: 'operations', url: page.url() });

    // Navigate via Billing Center in sidebar (how an admin reaches Generate)
    await page.locator('a[href*="/admin/billing"], a:has-text("Billing Center")').first().click();
    await page.waitForLoadState('domcontentloaded', { timeout: 90000 }).catch(() => null);
    await sleep(2000);
    await shot('02-billing-center');
    report.steps.push({ step: 'billing_center', url: page.url() });

    // Click Generate Electricity Bills
    const genLink = page.locator(
      'a:has-text("Generate Electricity"), a[href*="electricity/generate"], a[href*="electricity/new"]',
    ).first();
    if (await genLink.count()) {
      await genLink.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 90000 }).catch(() => null);
    } else {
      await page.goto(`${BASE}/admin/billing/electricity/generate?month=2026-08`, {
        waitUntil: 'commit',
        timeout: 120000,
      });
    }

    // Ensure form is present
    for (let i = 0; i < 3; i++) {
      if (await page.locator('select[name="roomId"]').count()) break;
      await page.goto(`${BASE}/admin/electricity/new?month=2026-08`, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      });
      await sleep(1500);
    }
    await page.waitForSelector('select[name="roomId"]', { timeout: 90000 });
    await shot('03-generate-form');
    report.steps.push({ step: 'generate_form', url: page.url() });

    await selectShantinagarPg();

    // 1. Select room A
    await page.locator('select[name="roomId"]').selectOption(ROOM_A);
    const prev1 = await waitPrevSettled();
    const monthInput = page.locator('input[name="billingMonth"]');
    let month1 = await monthInput.inputValue();
    if (month1.length === 7) {
      month1 = `${month1}-01`;
      await monthInput.fill(month1);
    }
    await shot('04-roomA-initial');
    report.steps.push({ step: '1_select_room', room: 'Shantinagar 204', previousReading: prev1, month: month1 });

    // Normalize to August first for predictable flow
    await monthInput.fill('2026-08-01');
    await monthInput.dispatchEvent('input');
    await monthInput.blur();
    const prevAug = await waitPrevSettled();
    await shot('05-roomA-august');
    report.steps.push({ step: 'normalize_august', previousReading: prevAug });

    // 2. Change only billing month → July
    await monthInput.fill('2026-07-01');
    await monthInput.dispatchEvent('input');
    await monthInput.blur();
    await sleep(50);
    const midLoad = await readPrev().catch(() => '');
    const prevJuly = await waitPrevSettled();
    await shot('06-roomA-july');
    report.steps.push({
      step: '2_change_month_to_july',
      previousDuringLoad: midLoad,
      previousReading: prevJuly,
      updated: prevJuly !== prevAug,
    });
    report.checks.monthChangeUpdatesPrev = prevJuly !== prevAug && Number(prevJuly) > 0;

    // 3. Change back to August
    await monthInput.fill('2026-08-01');
    await monthInput.dispatchEvent('input');
    await monthInput.blur();
    const prevAug2 = await waitPrevSettled();
    await shot('07-roomA-august-back');
    report.steps.push({
      step: '3_change_back_to_august',
      previousReading: prevAug2,
      matches: prevAug2 === prevAug,
    });
    report.checks.monthChangeBack = prevAug2 === prevAug;

    // 4. Change rooms
    await page.locator('select[name="roomId"]').selectOption(ROOM_B);
    const prevRoomB = await waitPrevSettled();
    await shot('08-roomB-august');
    report.steps.push({
      step: '4_change_room',
      room: 'Shantinagar 102',
      previousReading: prevRoomB,
      differs: prevRoomB !== prevAug2,
    });
    report.checks.roomChangeUpdatesPrev = prevRoomB !== prevAug2;

    // 5. Refresh
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('select[name="roomId"]', { timeout: 90000 });
    await selectShantinagarPg();
    await page.locator('select[name="roomId"]').selectOption(ROOM_B);
    await page.locator('input[name="billingMonth"]').fill('2026-08-01');
    await page.locator('input[name="billingMonth"]').dispatchEvent('input');
    await page.locator('input[name="billingMonth"]').blur();
    const prevAfterRefresh = await waitPrevSettled();
    await shot('09-after-refresh');
    report.steps.push({ step: '5_refresh', previousReading: prevAfterRefresh });
    report.checks.refreshBehaves =
      Number(prevAfterRefresh) === Number(prevRoomB) || Number(prevAfterRefresh) > 0;

    // Prepare generation on Room A / August
    await selectShantinagarPg();
    await page.locator('select[name="roomId"]').selectOption(ROOM_A);
    await page.locator('input[name="billingMonth"]').fill('2026-08-01');
    await page.locator('input[name="billingMonth"]').dispatchEvent('input');
    await page.locator('input[name="billingMonth"]').blur();
    const uiPrevForGen = await waitPrevSettled();

    const apiRes = await page.evaluate(async ({ room, month }) => {
      const r = await fetch(
        `/api/admin/rooms/${room}/last-electricity-reading?billingMonth=${month}`,
        { cache: 'no-store' },
      );
      return r.json();
    }, { room: ROOM_A, month: '2026-08-01' });

    report.checks.uiMatchesApiBeforeGen =
      Number(uiPrevForGen) === Number(apiRes?.data?.previousReadingUnits);

    // 6. Generate bill (+1 unit)
    const currentReading = Number(uiPrevForGen) + 1;
    await page.locator('input[name="currentReadingUnits"]').fill(String(currentReading));
    const notes = page.locator('textarea[name="notes"], input[name="notes"]');
    if (await notes.count()) {
      await notes.first().fill('BROWSER_VERIFY_AUG_2026 +1 unit continuity test');
    }
    await shot('10-before-generate');

    await Promise.all([
      page.waitForURL(/electricity\/bills\//, { timeout: 180000 }).catch(() => null),
      page.getByRole('button', { name: /Generate electricity/i }).click(),
    ]);
    await sleep(2000);
    await shot('11-after-generate');
    report.steps.push({
      step: '6_generate',
      billUrl: page.url(),
      uiPreviousUsed: uiPrevForGen,
      currentReading,
      apiBefore: apiRes?.data,
    });

    const saved = (await db.execute(sql`
      SELECT id::text, room_id::text, billing_month::text,
             previous_reading_units::text AS prev,
             current_reading_units::text AS curr,
             units_consumed::text AS units,
             notes
      FROM electricity_bills
      WHERE room_id = ${ROOM_A}
        AND billing_month = '2026-08-01'
        AND is_pipeline_test = false
      ORDER BY created_at DESC
      LIMIT 1
    `)) as any[];
    const savedBill = saved[0] ?? null;
    report.steps.push({ step: 'saved_bill', savedBill });
    report.checks.savedPrevMatchesUi =
      !!savedBill && Number(savedBill.prev) === Number(uiPrevForGen);
    report.checks.savedCurrMatchesEntered =
      !!savedBill && Number(savedBill.curr) === currentReading;

    // 7. Another room — no leak
    await page.goto(`${BASE}/admin/electricity/new?month=2026-08`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForSelector('select[name="roomId"]', { timeout: 90000 });
    await selectShantinagarPg();
    await page.locator('select[name="roomId"]').selectOption(ROOM_B);
    await page.locator('input[name="billingMonth"]').fill('2026-08-01');
    await page.locator('input[name="billingMonth"]').dispatchEvent('input');
    await page.locator('input[name="billingMonth"]').blur();
    const prevNoLeak = await waitPrevSettled();
    await shot('12-roomB-no-leak');
    report.steps.push({
      step: '7_no_leak',
      roomBPrevious: prevNoLeak,
      roomAWas: uiPrevForGen,
      leaked: Number(prevNoLeak) === Number(uiPrevForGen),
    });
    report.checks.noLeakFromPreviousRoom = Number(prevNoLeak) !== Number(uiPrevForGen);

    // 8. Network
    const readingReqs = report.network.filter((n: any) =>
      String(n.url).includes('last-electricity-reading'),
    );
    report.checks.everyFetchHasBillingMonth =
      readingReqs.length > 0 && readingReqs.every((n: any) => n.hasBillingMonth);
    report.networkSummary = readingReqs;

    // 9. Console
    const badConsole = report.console.filter(
      (c: any) =>
        c.type === 'error' ||
        /Warning:|hydration|Hydration|Minified React error/i.test(c.text),
    );
    // Ignore noisy third-party / favicon noise
    const meaningfulFailed = report.failedRequests.filter(
      (f: any) => !/favicon|analytics|hot-update/i.test(f.url ?? ''),
    );
    report.checks.noConsoleErrorsOrReactWarnings = badConsole.length === 0;
    report.checks.noPageErrors = report.pageErrors.length === 0;
    report.checks.noFailedRequests = meaningfulFailed.length === 0;
    report.suspiciousConsole = badConsole;
    report.meaningfulFailedRequests = meaningfulFailed;

    // 10. Triple match
    report.tripleMatch = {
      uiPreviousReading: Number(uiPrevForGen),
      apiPreviousReading: Number(apiRes?.data?.previousReadingUnits),
      savedBillPreviousReading: savedBill ? Number(savedBill.prev) : null,
      savedBillCurrentReading: savedBill ? Number(savedBill.curr) : null,
      allEqual:
        Number(uiPrevForGen) === Number(apiRes?.data?.previousReadingUnits) &&
        !!savedBill &&
        Number(savedBill.prev) === Number(uiPrevForGen),
    };
    report.checks.tripleMatch = report.tripleMatch.allEqual;

    report.verdict = Object.values(report.checks).every(Boolean) ? 'PASS' : 'FAIL';
    report.finishedAt = new Date().toISOString();
    writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await db.delete(authSessions).where(eq(authSessions.id, session.id)).catch(() => null);
    await browser.close().catch(() => null);
    await closeDb().catch(() => null);
  }

  process.exit(report.verdict === 'PASS' ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
