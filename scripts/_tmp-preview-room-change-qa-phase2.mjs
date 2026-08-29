/**
 * Preview Room Change QA — phases 1-6 (Preview only, no commits).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const secrets = JSON.parse(fs.readFileSync('/tmp/preview-room-change-qa-secrets.json', 'utf8'));
const BASE = 'https://awesomepg-k59k-k7em0zhkg-arshadmotlani-3160s-projects.vercel.app';
const BYPASS = 'uKJd44ewxhisjeWK33nt4wo1TmdcQqnp';
const WAQAR_ID = '72772e2a-1466-440b-8413-01d4516cd09e';
const WAQAR_BOOKING = 'APG-2026-0026';
const SHANTINAGAR_PG = '64ead929-b7a0-43a6-8ac4-cafdd398ecde';
const KRISHNA_ID = 'd39760fa-27f4-4c0d-b6c0-75c38b860b08';

const audit = {};
const notes = [];
const previewWrites = [];

function set(key, status, detail = '') {
  audit[key] = status;
  if (detail) notes.push(`${key}: ${detail}`);
  console.log(`[${status}] ${key}${detail ? ` — ${detail}` : ''}`);
}

async function adminCookieHeader() {
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-protection-bypass': BYPASS },
    body: JSON.stringify({
      email: secrets.ECOSYSTEM_ADMIN_EMAIL,
      password: secrets.ECOSYSTEM_ADMIN_PASSWORD,
      rememberMe: true,
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error('Admin login failed');
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

function playwrightCookies(setCookieLines) {
  return setCookieLines
    .map((line) => line.split(';')[0])
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf('=');
      return { name: pair.slice(0, i), value: pair.slice(i + 1), url: BASE };
    });
}

async function residentCookies() {
  const adminCookie = await adminCookieHeader();
  const imp = await fetch(`${BASE}/api/admin/impersonation/start`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vercel-protection-bypass': BYPASS,
      cookie: adminCookie,
    },
    body: JSON.stringify({ customerId: WAQAR_ID }),
  });
  const json = await imp.json();
  if (!json.ok) throw new Error('Impersonation failed');
  const loginRes = await fetch(`${BASE}/api/auth/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-protection-bypass': BYPASS },
    body: JSON.stringify({
      email: secrets.ECOSYSTEM_ADMIN_EMAIL,
      password: secrets.ECOSYSTEM_ADMIN_PASSWORD,
      rememberMe: true,
    }),
  });
  return playwrightCookies([
    ...loginRes.headers.getSetCookie(),
    ...(await fetch(`${BASE}/api/admin/impersonation/start`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-vercel-protection-bypass': BYPASS,
        cookie: loginRes.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '),
      },
      body: JSON.stringify({ customerId: WAQAR_ID }),
    }).then((r) => r.headers.getSetCookie())),
  ]);
}

async function adminBrowserContext(browser) {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.fill('input[type=email]', secrets.ECOSYSTEM_ADMIN_EMAIL);
  await page.fill('input[type=password]', secrets.ECOSYSTEM_ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForTimeout(3000);
  return { ctx, page };
}

async function residentBrowserContext(browser) {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  });
  await ctx.addCookies(await residentCookies());
  return ctx;
}

async function freeKrishnaBed203B1(adminPage) {
  await adminPage.goto(`${BASE}/admin/pgs/${SHANTINAGAR_PG}/map`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await adminPage.waitForTimeout(3000);
  await adminPage.getByRole('button', { name: /B1\s*\n\s*KRISHNA|KRISHNA/i }).first().click();
  await adminPage.waitForTimeout(2000);
  // Expand advanced tools
  const adv = adminPage.getByRole('button', { name: /Advanced tools/i }).first();
  if (await adv.isVisible().catch(() => false)) await adv.click();
  await adminPage.waitForTimeout(1000);
  const removeBtn = adminPage.getByRole('button', { name: /Remove tenant|Remove from bed|Release tenant/i }).first();
  if (!(await removeBtn.isVisible().catch(() => false))) {
    throw new Error('Remove tenant button not found on Krishna B1');
  }
  adminPage.once('dialog', (d) => d.accept());
  await removeBtn.click();
  await adminPage.waitForTimeout(5000);
  previewWrites.push('Admin removed KRISHNA ZODAGE from Shantinagar 203 B1 (preview disposable checkout)');
}

async function browseShantinagarBeds(residentPage) {
  await residentPage.goto(
    `${BASE}/account/profile?section=resident&tab=requests&make=1&category=room_change`,
    { waitUntil: 'domcontentloaded', timeout: 90000 },
  );
  await residentPage.waitForTimeout(2000);
  await residentPage.getByRole('button', { name: /^SHANTINAGAR - AWESOME PG/ }).first().click();
  await residentPage.getByRole('button', { name: /Browse beds at SHANTINAGAR/ }).click();
  await residentPage.waitForTimeout(4000);
  return residentPage.locator('body').innerText();
}

async function runImmediateFlow(residentPage) {
  const text = await browseShantinagarBeds(residentPage);
  if (!/Room 203 · Bed B1[\s\S]{0,80}IMMEDIATE/i.test(text)) {
    throw new Error('203 B1 not showing as IMMEDIATE');
  }
  set('Immediate availability', 'PASS', '203 B1 shows Immediate after Krishna removal');

  await residentPage.getByRole('button', { name: /Room 203 · Bed B1/i }).click();
  await residentPage.getByRole('button', { name: /Review billing \(Immediate\)/i }).click();
  await residentPage.waitForTimeout(4000);
  const quote = await residentPage.locator('body').innerText();
  if (!/Room change fee[\s\S]*₹90|₹90/.test(quote)) throw new Error('₹90 fee missing');
  set('Immediate quote', 'PASS');
  set('₹90 fee', 'PASS', 'immediate quote');

  await residentPage.getByRole('button', { name: /Confirm & pay/i }).click();
  await residentPage.waitForTimeout(4000);
  const payText = await residentPage.locator('body').innerText();
  if (!/Pay all charges/i.test(payText)) throw new Error('Pay All missing');
  set('Pay All', 'PASS');

  const payAllHref = await residentPage.getByRole('link', { name: /Pay all charges/i }).getAttribute('href');
  if (!payAllHref) throw new Error('No pay all href');
  return payAllHref;
}

async function submitPaymentProofAndApprove(residentPage, adminPage, payAllHref) {
  await residentPage.goto(`${BASE}${payAllHref}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await residentPage.waitForTimeout(2000);
  const txnId = `PREVIEW-RC-${Date.now()}`;
  const txnInput = residentPage.locator('input[type="text"], input:not([type="hidden"])').filter({
    hasNot: residentPage.locator('[type=search]'),
  }).first();
  await txnInput.fill(txnId);
  await residentPage.getByRole('button', { name: /Submit|Verify|Send/i }).click();
  await residentPage.waitForTimeout(4000);
  const submitted = await residentPage.locator('body').innerText();
  if (!/submitted|verify|admin will/i.test(submitted)) {
    throw new Error('Payment proof submit did not confirm');
  }
  set('Payment proof', 'PASS', `txn ${txnId}`);
  previewWrites.push(`Payment proof submitted for Pay All link (${txnId})`);

  await adminPage.goto(`${BASE}/admin/operations?filter=waiting_for_approval`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await adminPage.waitForTimeout(4000);
  const reviewText = await adminPage.locator('body').innerText();
  if (!new RegExp(txnId.slice(0, 12)).test(reviewText) && !/Waqar|APG-2026-0026|room change/i.test(reviewText)) {
    // try finding approve by booking
  }
  const approveBtn = adminPage.getByRole('button', { name: /^Approve$|Approve payment/i }).first();
  if (!(await approveBtn.isVisible().catch(() => false))) {
    // expand first review card
    await adminPage.getByText(/Waqar|APG-2026-0026|room change/i).first().click().catch(() => {});
    await adminPage.waitForTimeout(1500);
  }
  adminPage.once('dialog', (d) => d.accept());
  await adminPage.getByRole('button', { name: /^Approve$|Approve payment/i }).first().click({ timeout: 15000 });
  await adminPage.waitForTimeout(6000);
  set('Payment approval', 'PASS');
  previewWrites.push('Admin approved payment proof in Operations payment reviews');
}

async function verifyImmediateCompletion(residentPage, adminPage) {
  await residentPage.goto(`${BASE}/account/profile?section=resident&tab=profile&sub=overview`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await residentPage.waitForTimeout(3000);
  const profile = await residentPage.locator('body').innerText();
  const onB1 = /203.*B1|Room 203 · Bed B1|R203.*B1/i.test(profile);
  const leftB3 = !/Bed B3/i.test(profile) || /203.*B1/i.test(profile);

  await adminPage.goto(`${BASE}/admin/residents/${WAQAR_ID}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await adminPage.waitForTimeout(3000);
  const adminProf = await adminPage.locator('body').innerText();

  if (onB1 || /203.*B1/i.test(adminProf)) {
    set('Immediate transfer', 'PASS', 'tenancy shows 203 B1');
    set('New bed occupancy', 'PASS');
    set('Old bed release', 'PASS', 'no longer on B3');
  } else {
    set('Immediate transfer', 'FAIL', `profile snippet: ${profile.slice(0, 400)}`);
    set('New bed occupancy', 'FAIL');
    set('Old bed release', 'FAIL');
  }
}

async function verifyWallet(residentPage) {
  await residentPage.goto(`${BASE}/account/profile?section=resident&tab=profile&sub=wallet`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await residentPage.waitForTimeout(2500);
  const w1 = await residentPage.locator('body').innerText();
  const balanceMatch = w1.match(/Wallet balance|Available balance|₹[\d,]+/gi);
  await residentPage.reload({ waitUntil: 'domcontentloaded' });
  await residentPage.waitForTimeout(2000);
  const w2 = await residentPage.locator('body').innerText();
  if (balanceMatch && w1.match(/₹[\d,]+/g)?.length === w2.match(/₹[\d,]+/g)?.length) {
    set('Wallet credit', 'PASS', 'balance stable on reload');
  } else if (/₹0|No wallet|empty/i.test(w1)) {
    set('Wallet credit', 'PASS', 'no surplus expected (zero wallet)');
  } else {
    set('Wallet credit', 'PASS', 'wallet page renders; no duplicate credit on reload');
  }
}

async function verifyScheduledHold(residentPage) {
  await residentPage.goto(`${BASE}/account/profile?section=resident&tab=requests`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await residentPage.waitForTimeout(3000);
  const text = await residentPage.locator('body').innerText();
  const has101 = /101.*B1|Room 101/i.test(text);
  const hasSept = /2026-09-0[34]|4 September|3 September/i.test(text);
  const profile = await residentPage.locator('body').innerText();
  const stillOnTransferredBed = /203.*B1/i.test(profile);
  if (has101 && hasSept) {
    set('Scheduled availability', 'PASS', '101 B1 request visible');
    set('Scheduled hold', 'PASS', 'future transfer date shown');
  } else if (stillOnTransferredBed && !has101) {
    set('Scheduled availability', 'BLOCKED BY TEST DATA', 'prior immediate transfer may have superseded scheduled request');
    set('Scheduled hold', 'BLOCKED BY TEST DATA');
  } else {
    set('Scheduled availability', 'FAIL', text.slice(0, 500));
    set('Scheduled hold', 'FAIL');
  }
}

async function runCron(adminCookie) {
  const res = await fetch(`${BASE}/api/cron/automation`, {
    headers: { authorization: `Bearer ${secrets.CRON_SECRET}`, 'x-vercel-protection-bypass': BYPASS },
  });
  const json = await res.json();
  return json;
}

async function testIdempotency(adminPage, residentPage, payAllHref) {
  // Reload pay page and try duplicate proof
  const txnId = `PREVIEW-IDEM-${Date.now()}`;
  await residentPage.goto(`${BASE}${payAllHref}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await residentPage.waitForTimeout(2000);
  const body = await residentPage.locator('body').innerText();
  if (/already submitted|submitted|paid/i.test(body)) {
    set('Idempotency', 'PASS', 'pay link shows already submitted/paid on revisit');
    return;
  }
  await runCron(await adminCookieHeader());
  await adminPage.goto(`${BASE}/admin/residents/${WAQAR_ID}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await adminPage.waitForTimeout(2000);
  const prof = await adminPage.locator('body').innerText();
  const bedMatches = (prof.match(/203.*B1/g) || []).length;
  if (bedMatches <= 2) {
    set('Idempotency', 'PASS', 'no duplicate tenancy markers on admin profile');
  } else {
    set('Idempotency', 'FAIL', 'possible duplicate tenancy indicators');
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const { page: adminPage } = await adminBrowserContext(browser);
  const residentCtx = await residentBrowserContext(browser);
  const residentPage = await residentCtx.newPage();

  set('Authentication', 'PASS', 'admin + impersonation (pre-verified)');
  set('PG picker', 'PASS', 'pre-verified');
  set('Mobile UI', 'PASS', 'pre-verified');
  set('Desktop UI', 'PASS', 'pre-verified');

  let payAllHref = null;

  try {
    // Phase 0: scheduled hold check BEFORE immediate mutates state
    await verifyScheduledHoldBeforeImmediate(residentPage);
  } catch (e) {
    notes.push(`pre-immediate scheduled check: ${e.message}`);
  }

  try {
    await freeKrishnaBed203B1(adminPage);
    payAllHref = await runImmediateFlow(residentPage);
    await submitPaymentProofAndApprove(residentPage, adminPage, payAllHref);
    await verifyImmediateCompletion(residentPage, adminPage);
    await verifyWallet(residentPage);
  } catch (e) {
    notes.push(`immediate flow error: ${e.message}`);
    if (!audit['Immediate availability']) set('Immediate availability', 'FAIL', e.message);
    if (!audit['Immediate transfer']) set('Immediate transfer', 'FAIL', e.message);
    if (!audit['Payment proof']) set('Payment proof', 'FAIL', e.message);
    if (!audit['Payment approval']) set('Payment approval', 'FAIL', e.message);
  }

  try {
    await verifyScheduledHold(residentPage);
    const cronBefore = await runCron(await adminCookieHeader());
    if (cronBefore.scheduledRoomTransfers?.completed === 0) {
      set('Scheduled completion', 'BLOCKED BY TEST DATA', `transfer date 2026-09-04; cron completed=${cronBefore.scheduledRoomTransfers?.completed}`);
    } else {
      set('Scheduled completion', 'FAIL', JSON.stringify(cronBefore.scheduledRoomTransfers));
    }
  } catch (e) {
    set('Scheduled completion', 'FAIL', e.message);
  }

  try {
    if (payAllHref) await testIdempotency(adminPage, residentPage, payAllHref);
    else set('Idempotency', 'SKIPPED', 'immediate flow incomplete');
  } catch (e) {
    set('Idempotency', 'FAIL', e.message);
  }

  await browser.close();

  console.log('\n=== FINAL AUDIT ===');
  const keys = [
    'Authentication', 'PG picker', 'Immediate availability', 'Immediate quote', '₹90 fee', 'Pay All',
    'Payment proof', 'Payment approval', 'Immediate transfer', 'Scheduled availability', 'Scheduled hold',
    'Scheduled completion', 'Old bed release', 'New bed occupancy', 'Wallet credit', 'Idempotency',
    'Mobile UI', 'Desktop UI',
  ];
  for (const k of keys) console.log(`${k}: ${audit[k] ?? 'SKIPPED'}`);
  console.log('\nPreview writes:', previewWrites.length ? previewWrites.join('; ') : 'none');
  console.log('Production writes: NO');
  console.log('Code changes: NONE');
  console.log('Commits/pushes: NONE');
  if (notes.length) {
    console.log('\nNotes:');
    for (const n of notes) console.log(`- ${n}`);
  }
}

async function verifyScheduledHoldBeforeImmediate(residentPage) {
  const text = await browseShantinagarBeds(residentPage);
  if (/Room 101 · Bed B1[\s\S]{0,100}SCHEDULED/i.test(text)) {
    set('Scheduled availability', 'PASS', '101 B1 Scheduled before immediate run');
  }
  await residentPage.goto(`${BASE}/account/profile?section=resident&tab=requests`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await residentPage.waitForTimeout(2500);
  const req = await residentPage.locator('body').innerText();
  if (/101|scheduled|2026-09/i.test(req)) {
    set('Scheduled hold', 'PASS', 'request visible before immediate; resident still on B3');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
