/* eslint-disable no-console */
/**
 * Production UI check: Deposit Express save (paid ₹0) → invoice page → back to search.
 * Uses dedicated bot resident; cleans up after.
 */
import { execFileSync } from 'node:child_process';
import { and, eq, inArray } from 'drizzle-orm';
import { chromium } from 'playwright';
import { closeDb, createClient, db } from '../src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  depositLedger,
  financialInvoices,
  payments,
  pgPaymentRecords,
  rentInvoices,
  residentBillingProfiles,
} from '../src/db/schema';
import { checkoutSettlements } from '../src/db/schema/checkoutSettlements';
import {
  residentResidencies,
  residencyBookingLinks,
} from '../src/db/schema/residentResidencies';
import { vacatingRequests } from '../src/db/schema/vacatingRequests';
import { mergeOrUpsertCustomerForAdminWalkIn } from '../src/services/adminCustomerMerge';
import { assignTenantToBed } from '../src/services/tenantAssignment';
import { isBedAvailable } from '../src/services/availability';
import { todayString } from '../src/lib/dates';
import { adminUsers } from '../src/db/schema';
import type { AdminSession } from '../src/lib/auth/session';

const BOT_PHONE = '+919000009993';
const BOT_NAME = 'Deposit Invoice Redirect Bot';
const BASE = process.env.PROD_BASE_URL ?? 'https://www.awesomepg.in';

function loadAdminCookies() {
  const profile = process.env.CHROME_PROFILE ?? 'Profile 6';
  const script = `
import browser_cookie3
from pathlib import Path
cf = Path.home() / "Library/Application Support/Google/Chrome/${profile}/Cookies"
out = []
for c in browser_cookie3.chrome(cookie_file=str(cf), domain_name='awesomepg.in'):
    if c.name == 'apg_admin_session':
        out.append(c.name + '=' + c.value)
print(';'.join(out))
`;
  return execFileSync('python3', ['-c', script], { encoding: 'utf8', timeout: 120000 }).trim();
}

async function getSession(): Promise<AdminSession> {
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.role, 'super_admin')).limit(1);
  if (!admin) throw new Error('No super admin');
  return {
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    pgScope: admin.pgScope ?? [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3600000),
  };
}

async function cleanup(customerId: string | null) {
  if (!customerId) return;
  const bookingRows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.customerId, customerId));
  const bookingIds = bookingRows.map((b) => b.id);
  if (bookingIds.length === 0) {
    await db.delete(customers).where(eq(customers.id, customerId));
    return;
  }
  await db.delete(residencyBookingLinks).where(inArray(residencyBookingLinks.bookingId, bookingIds));
  await db.delete(residentResidencies).where(eq(residentResidencies.customerId, customerId));
  await db.delete(checkoutSettlements).where(inArray(checkoutSettlements.bookingId, bookingIds));
  await db.delete(vacatingRequests).where(inArray(vacatingRequests.bookingId, bookingIds));
  await db.delete(depositLedger).where(inArray(depositLedger.bookingId, bookingIds));
  await db.delete(payments).where(inArray(payments.bookingId, bookingIds));
  await db.delete(pgPaymentRecords).where(inArray(pgPaymentRecords.bookingId, bookingIds));
  await db.delete(financialInvoices).where(inArray(financialInvoices.bookingId, bookingIds));
  await db.delete(rentInvoices).where(inArray(rentInvoices.bookingId, bookingIds));
  await db
    .delete(residentBillingProfiles)
    .where(inArray(residentBillingProfiles.bookingId, bookingIds));
  await db.delete(bedReservations).where(inArray(bedReservations.bookingId, bookingIds));
  await db.delete(bookings).where(inArray(bookings.id, bookingIds));
  await db.delete(customers).where(eq(customers.id, customerId));
}

async function setupFixture(session: AdminSession) {
  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.phone, BOT_PHONE))
    .limit(1);
  if (existing) await cleanup(existing.id);

  const customerResult = await mergeOrUpsertCustomerForAdminWalkIn({
    fullName: BOT_NAME,
    phone: BOT_PHONE,
    email: 'deposit-invoice-redirect@awesomepg.internal',
    gender: 'male',
    adminVerifiedKyc: true,
    notes: 'DEPOSIT_INVOICE_REDIRECT_VERIFY',
  });
  if (!customerResult.ok) throw new Error(customerResult.error);

  const startDate = todayString();
  const candidates = await db
    .select({ id: beds.id })
    .from(beds)
    .where(eq(beds.status, 'available'))
    .limit(50);
  let bedId: string | null = null;
  for (const c of candidates) {
    if (await isBedAvailable({ bedId: c.id, startDate, endDate: null })) {
      bedId = c.id;
      break;
    }
  }
  if (!bedId) throw new Error('No bed available');

  const assigned = await assignTenantToBed(session, {
    bedId,
    startDate,
    customerId: customerResult.customerId,
    fullName: BOT_NAME,
    email: 'deposit-invoice-redirect@awesomepg.internal',
    phone: BOT_PHONE,
    gender: 'male',
    notes: 'DEPOSIT_INVOICE_REDIRECT_VERIFY',
  });
  if (!assigned.ok) throw new Error(assigned.error);

  await db
    .update(bookings)
    .set({ depositPaise: 15000, updatedAt: new Date() })
    .where(eq(bookings.id, assigned.bookingId));

  return { customerId: customerResult.customerId, bookingId: assigned.bookingId };
}

async function main() {
  createClient({ max: 3 });
  const session = await getSession();
  const { customerId, bookingId } = await setupFixture(session);

  const cookie = loadAdminCookies();
  if (!cookie) throw new Error('No admin cookie');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(
    cookie.split(';').map((pair) => {
      const [name, ...rest] = pair.split('=');
      return { name, value: rest.join('='), domain: 'www.awesomepg.in', path: '/' };
    }),
  );
  const page = await context.newPage();

  let pass = true;
  const fail = (msg: string) => {
    pass = false;
    console.error('FAIL:', msg);
  };

  try {
    await page.goto(`${BASE}/admin/deposit-express?booking=${bookingId}`, {
      waitUntil: 'networkidle',
      timeout: 90000,
    });
    await page.getByLabel(/Required deposit/i).fill('150');
    await page.getByLabel(/Paid amount/i).fill('0');
    await page.getByRole('button', { name: /Save deposit/i }).click();
    await page.waitForURL(/\/admin\/invoices\/.+\?from=deposit-express/, { timeout: 30000 });

    const url = page.url();
    if (!url.includes('from=deposit-express')) fail('invoice URL missing from=deposit-express');
    else console.log('PASS: redirected to invoice', url);

    const body = await page.locator('body').innerText();
    if (!body.includes('WhatsApp')) fail('WhatsApp button missing on invoice');
    else console.log('PASS: WhatsApp button present');
    if (!/Invoice\s+[A-Z0-9-]+/i.test(body)) fail('invoice number not visible');
    else console.log('PASS: invoice number visible');

    await page.getByRole('link', { name: /Deposit Express/i }).click();
    await page.waitForURL(/\/admin\/deposit-express\/?$/, { timeout: 20000 });
    const searchVisible = await page.getByPlaceholder('Start typing…').isVisible();
    if (!searchVisible) fail('back link did not return to Deposit Express search');
    else console.log('PASS: back link returns to Deposit Express search');
  } catch (err) {
    pass = false;
    console.error('FAIL:', err instanceof Error ? err.message : err);
  } finally {
    await browser.close();
    await cleanup(customerId);
    await closeDb();
  }

  if (!pass) process.exit(1);
  console.log('\nDeposit Express invoice redirect: PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
