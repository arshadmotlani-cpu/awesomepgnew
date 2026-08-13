/**
 * Production smoke: authenticated FYH Vendors flow.
 * Bootstraps a short-lived fyh_session for super_admin (no password in env).
 *
 * Usage: npx tsx scripts/verify-prod-vendors-flow.ts
 */
import { parse } from 'dotenv';
import { readFileSync } from 'fs';
import { chromium, type ConsoleMessage, type Page } from '@playwright/test';
import { createHairClient } from '@/src/hair/db/client';
import { fyhAuthSessions, fyhAdminUsers } from '@/src/hair/db/schema';
import { HAIR_SESSION_COOKIE } from '@/src/hair/lib/auth/constants';
import { randomToken, sha256 } from '@/src/hair/lib/auth/crypto';
import { getVendorLedger } from '@/src/hair/services/purchaseBrain';
import {
  defaultStatementDateRange,
  getVendorActivityTimeline,
  getVendorDashboard,
  getVendorStatement,
} from '@/src/hair/services/vendorBrain';
import { listVendors } from '@/src/hair/services/vendors';
import { eq } from 'drizzle-orm';

const BASE_URL = process.env.BASE_URL ?? 'https://fyhair.awesomepg.in';

function loadProductionDbEnv(): void {
  try {
    const pulled = parse(readFileSync('.env.production.local'));
    const url =
      pulled.HAIR_DATABASE_POSTGRES_URL ||
      pulled.HAIR_DATABASE_DATABASE_URL ||
      pulled.HAIR_DATABASE_URL;
    if (url) process.env.HAIR_DATABASE_URL = url;
  } catch {
    /* use existing HAIR_DATABASE_URL */
  }
}

async function bootstrapSuperAdminSession(): Promise<{
  token: string;
  sessionId: string;
  close: () => Promise<void>;
}> {
  const { db, close } = createHairClient({ max: 1 });
  const [admin] = await db
    .select({ id: fyhAdminUsers.id, email: fyhAdminUsers.email, role: fyhAdminUsers.role })
    .from(fyhAdminUsers)
    .where(eq(fyhAdminUsers.role, 'super_admin'))
    .limit(1);
  if (!admin) throw new Error('No super_admin in production hair DB');

  const token = randomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const [session] = await db
    .insert(fyhAuthSessions)
    .values({
      adminUserId: admin.id,
      tokenHash,
      expiresAt,
      ipAddress: 'verify-prod-vendors-flow',
      userAgent: 'verify-prod-vendors-flow',
    })
    .returning({ id: fyhAuthSessions.id });

  console.log(`Bootstrapped session for ${admin.email} (${admin.role})`);
  return {
    token,
    sessionId: session.id,
    close: async () => {
      await db
        .update(fyhAuthSessions)
        .set({ revokedAt: new Date() })
        .where(eq(fyhAuthSessions.id, session.id));
      await close();
    },
  };
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function verifyServerSide(vendorId: string): Promise<string[]> {
  const failures: string[] = [];
  try {
    const ledger = await getVendorLedger(vendorId);
    if (!ledger) failures.push('getVendorLedger returned null');
    const period = defaultStatementDateRange();
    const [dashboard, timeline, statement] = await Promise.all([
      getVendorDashboard(vendorId),
      getVendorActivityTimeline(vendorId),
      getVendorStatement(vendorId, period),
    ]);
    if (!dashboard) failures.push('getVendorDashboard returned null');
    if (!Array.isArray(timeline)) failures.push('getVendorActivityTimeline not array');
    if (!statement) failures.push('getVendorStatement returned null');
  } catch (err) {
    failures.push(`Server-side vendor brain error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return failures;
}

async function main(): Promise<void> {
  loadProductionDbEnv();
  const failures: string[] = [];

  console.log('[A] Server-side vendor services (production DB)');
  const vendors = await listVendors({ status: 'active' });
  if (vendors.length === 0) {
    console.log('  WARN — no active vendors; UI detail flow will be limited');
  } else {
    const vendorId = vendors[0]!.id;
    console.log(`  Testing vendor: ${vendors[0]!.name} (${vendorId})`);
    failures.push(...(await verifyServerSide(vendorId)));
    if (failures.length === 0) console.log('  OK — ledger, dashboard, timeline, statement');
  }

  const { token, close } = await bootstrapSuperAdminSession();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'Accept-Language': 'en' },
  });
  await context.addCookies([
    {
      name: HAIR_SESSION_COOKIE,
      value: token,
      domain: 'fyhair.awesomepg.in',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  const page = await context.newPage();
  const consoleErrors = collectConsoleErrors(page);

  try {
    console.log(`\n[B] Browser flow on ${BASE_URL}`);

    console.log('[1/7] Session auth — open /vendors');
    const vendorsRes = await page.goto('/vendors', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (page.url().includes('/login')) failures.push('Authenticated /vendors redirected to login');
    if (vendorsRes && vendorsRes.status() >= 500) failures.push(`/vendors HTTP ${vendorsRes.status()}`);
    await page.getByRole('heading', { name: /^vendors$/i }).waitFor({ timeout: 30_000 });
    console.log(`  OK — ${page.url()} (${vendorsRes?.status()})`);

    console.log('[2/7] Sidebar Vendors link visible');
    const navVendors = page.getByRole('link', { name: /^vendors$/i });
    if ((await navVendors.count()) === 0) failures.push('Vendors missing from sidebar nav');
    else console.log('  OK');

    console.log('[3/7] Vendors list table or empty state');
    const vendorLinks = page.locator('table tbody a[href^="/vendors/"]');
    const vendorCount = await vendorLinks.count();
    if (vendorCount === 0) {
      const empty = await page.getByText(/no vendors yet/i).isVisible().catch(() => false);
      if (!empty) failures.push('No vendor rows and no empty state');
      else console.log('  OK — empty state (no vendors)');
    } else {
      console.log(`  OK — ${vendorCount} vendor(s)`);
    }

    if (vendorCount > 0) {
      const href = await vendorLinks.first().getAttribute('href');
      console.log(`[4/7] Open vendor detail ${href}`);
      await vendorLinks.first().click();
      await page.waitForURL(/\/vendors\/[^/]+$/, { timeout: 30_000 });
      const detailRes = page.url();
      if (detailRes.includes('/login')) failures.push('Vendor detail redirected to login');
      if (detailRes.includes('/dashboard') && !detailRes.includes('/vendors')) {
        failures.push('Permission guard blocked vendor detail');
      }
      console.log(`  OK — ${page.url()}`);

      console.log('[5/7] Dashboard cards');
      for (const label of ['Outstanding', 'Total purchases', 'Total payments', 'Total returns']) {
        if (!(await page.getByText(label, { exact: true }).isVisible())) {
          failures.push(`Missing dashboard card: ${label}`);
        }
      }

      console.log('[6/7] Ledger sections (statement, timeline, invoices, payments)');
      for (const heading of ['Vendor statement', 'Activity timeline', 'Invoices', 'Payments']) {
        if (!(await page.getByRole('heading', { name: new RegExp(heading, 'i') }).isVisible())) {
          failures.push(`Missing section: ${heading}`);
        }
      }

      console.log('[7/7] Statement PDF endpoint');
      const pdfLink = page.locator('a[href*="/api/hair/vendors/"][href*="statement/pdf"]');
      if (await pdfLink.count()) {
        const pdfHref = await pdfLink.first().getAttribute('href');
        if (pdfHref) {
          const res = await page.request.get(pdfHref);
          if (!res.ok()) failures.push(`Statement PDF HTTP ${res.status()}`);
          else console.log(`  OK — PDF ${res.status()}`);
        }
      } else {
        console.log('  SKIP — PDF link not rendered');
      }

      console.log('[extra] Purchases link from invoice row (if any)');
      const purchaseLink = page.locator('table tbody a[href^="/purchases/"]').first();
      if (await purchaseLink.count()) {
        const purchaseHref = await purchaseLink.getAttribute('href');
        const purchaseRes = await page.request.get(purchaseHref!);
        if (purchaseRes.status() === 404) failures.push(`Purchase detail 404: ${purchaseHref}`);
        else console.log(`  OK — purchase ${purchaseHref} → ${purchaseRes.status()}`);
      }
    }

    const benignConsole = consoleErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('Failed to load resource') === false,
    );
    const realConsoleErrors = consoleErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('Download the React DevTools') &&
        !(e.includes('Failed to load resource') && e.includes('404')),
    );
    if (realConsoleErrors.length) {
      failures.push(
        `Browser console errors: ${realConsoleErrors.slice(0, 3).join(' | ')}`,
      );
    }
    if (benignConsole.length && realConsoleErrors.length === 0) {
      console.log(`  (ignored ${benignConsole.length} benign console message(s))`);
    }
  } finally {
    await browser.close();
    await close();
  }

  if (failures.length) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nRESULT: Authenticated Vendors flow PASSED on production.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
