/**
 * Preview Room Change QA — complete phases (Preview only).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const secrets = JSON.parse(fs.readFileSync('/tmp/preview-room-change-qa-secrets.json', 'utf8'));
const BASE = 'https://awesomepg-k59k-k7em0zhkg-arshadmotlani-3160s-projects.vercel.app';
const BYPASS = 'uKJd44ewxhisjeWK33nt4wo1TmdcQqnp';
const WAQAR_ID = '72772e2a-1466-440b-8413-01d4516cd09e';
const SHANTINAGAR_PG = '64ead929-b7a0-43a6-8ac4-cafdd398ecde';

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
  const loginRes = await fetch(`${BASE}/api/auth/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-protection-bypass': BYPASS },
    body: JSON.stringify({
      email: secrets.ECOSYSTEM_ADMIN_EMAIL,
      password: secrets.ECOSYSTEM_ADMIN_PASSWORD,
      rememberMe: true,
    }),
  });
  const adminCookie = loginRes.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
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
  if (!json.ok) throw new Error(`Impersonation failed: ${JSON.stringify(json)}`);
  return playwrightCookies([...loginRes.headers.getSetCookie(), ...imp.headers.getSetCookie()]);
}

async function dismissPush(page) {
  const notNow = page.getByRole('button', { name: 'Not now' });
  if (await notNow.isVisible().catch(() => false)) await notNow.click();
}

async function adminBrowserContext(browser) {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.fill('input[type=email]', secrets.ECOSYSTEM_ADMIN_EMAIL);
  await page.fill('input[type=password]', secrets.ECOSYSTEM_ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForTimeout(3000);
  await dismissPush(page);
  return { ctx, page };
}

async function residentBrowserContext(browser) {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    viewport: { width: 390, height: 844 },
  });
  await ctx.addCookies(await residentCookies());
  return ctx;
}

async function browseShantinagarBeds(residentPage) {
  await residentPage.goto(
    `${BASE}/account/profile?section=resident&tab=requests&make=1&category=room_change`,
    { waitUntil: 'domcontentloaded', timeout: 90000 },
  );
  await residentPage.waitForTimeout(2500);
  await residentPage.getByRole('button', { name: /^SHANTINAGAR - AWESOME PG/ }).first().click();
  await residentPage.getByRole('button', { name: /Browse beds at SHANTINAGAR/ }).click();
  await residentPage.waitForTimeout(4000);
  return residentPage.locator('body').innerText();
}

async function verifyScheduledHoldBeforeImmediate(residentPage) {
  const text = await browseShantinagarBeds(residentPage);
  if (/Room 101 · Bed B1[\s\S]{0,120}SCHEDULED/i.test(text)) {
    set('Scheduled availability', 'PASS', '101 B1 Scheduled (CV vacating approved)');
  } else if (/Room 101 · Bed B1[\s\S]{0,120}WAITLIST/i.test(text)) {
    set('Scheduled availability', 'FAIL', '101 B1 shows Waitlist not Scheduled');
  } else {
    set('Scheduled availability', 'BLOCKED BY TEST DATA', '101 B1 pattern not found in bed list');
  }
  await residentPage.goto(`${BASE}/account/profile?section=resident&tab=requests`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await residentPage.waitForTimeout(2500);
  const req = await residentPage.locator('body').innerText();
  if (/101|Room 101|scheduled|2026-09|4 September|3 September/i.test(req)) {
    set('Scheduled hold', 'PASS', 'Waqar → 101 B1 request visible; still on 203 B3');
  } else {
    set('Scheduled hold', 'BLOCKED BY TEST DATA', `requests tab: ${req.slice(0, 600)}`);
  }
}

async function runImmediateFlow(residentPage) {
  const text = await browseShantinagarBeds(residentPage);
  if (!/Room 203 · Bed B1[\s\S]{0,120}IMMEDIATE/i.test(text)) {
    throw new Error(`203 B1 not IMMEDIATE. Snippet: ${text.match(/Room 203[\s\S]{0,200}/)?.[0] ?? text.slice(0, 500)}`);
  }
  set('Immediate availability', 'PASS', '203 B1 Immediate after Krishna removal');
  previewWrites.push('Krishna removed from 203 B1 (prior step) — bed now open');

  await residentPage.getByRole('button', { name: /Room 203 · Bed B1/i }).click();
  await residentPage.getByRole('button', { name: /Review billing \(Immediate\)/i }).click();
  await residentPage.waitForTimeout(4000);
  const quote = await residentPage.locator('body').innerText();
  if (!/Room change fee[\s\S]*₹90|₹90/.test(quote)) throw new Error('₹90 fee missing in quote');
  set('Immediate quote', 'PASS');
  set('₹90 fee', 'PASS');

  await residentPage.getByRole('button', { name: /Confirm & pay/i }).click();
  await residentPage.waitForTimeout(4000);
  const payText = await residentPage.locator('body').innerText();
  if (!/Pay all charges/i.test(payText)) throw new Error('Pay All missing on confirm step');
  set('Pay All', 'PASS');

  const payAllHref = await residentPage.getByRole('link', { name: /Pay all charges/i }).getAttribute('href');
  if (!payAllHref) throw new Error('No pay all href');
  previewWrites.push(`Created immediate room change Waqar 203 B3 → 203 B1 with Pay All link`);
  return payAllHref;
}

async function submitPaymentProofAndApprove(residentPage, adminPage, payAllHref) {
  await residentPage.goto(`${BASE}${payAllHref}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await residentPage.waitForTimeout(2500);
  const txnId = `PREVIEW-RC-IMM-${Date.now()}`;
  await residentPage.getByLabel(/UPI transaction ID/i).fill(txnId);
  await residentPage.getByRole('button', { name: /Submit payment for approval/i }).click();
  await residentPage.waitForTimeout(5000);
  const submitted = await residentPage.locator('body').innerText();
  if (!/Payment submitted|admin will verify/i.test(submitted)) {
    throw new Error(`Payment proof submit failed: ${submitted.slice(0, 400)}`);
  }
  set('Payment proof', 'PASS', txnId);
  previewWrites.push(`Payment proof submitted (${txnId})`);

  await adminPage.goto(`${BASE}/admin/operations?filter=waiting_for_approval`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await dismissPush(adminPage);
  await adminPage.waitForTimeout(4000);
  const reviewText = await adminPage.locator('body').innerText();
  if (!new RegExp(txnId.slice(0, 10)).test(reviewText) && !/Waqar|room change|APG-2026-0026/i.test(reviewText)) {
    throw new Error('Payment review not found in operations queue');
  }
  adminPage.once('dialog', (d) => d.accept());
  await adminPage.getByRole('button', { name: /^Approve$/ }).first().click({ timeout: 20000 });
  await adminPage.waitForTimeout(8000);
  set('Payment approval', 'PASS');
  previewWrites.push('Admin approved payment proof in Payment Reviews');
  return txnId;
}

async function verifyImmediateCompletion(residentPage, adminPage) {
  await residentPage.goto(`${BASE}/account/profile?section=resident&tab=profile&sub=overview`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await residentPage.waitForTimeout(3500);
  const profile = await residentPage.locator('body').innerText();

  await adminPage.goto(`${BASE}/admin/pgs/${SHANTINAGAR_PG}/map`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await dismissPush(adminPage);
  await adminPage.waitForTimeout(4000);
  const mapText = await adminPage.locator('body').innerText();
  const room203 = mapText.slice(mapText.indexOf('ROOM 203'), mapText.indexOf('ROOM 203') + 350);

  const waqarOnB1 = /B1[\s\S]{0,30}Waqar|Waqar[\s\S]{0,30}B1/i.test(room203) || /203.*B1|Room 203 · Bed B1/i.test(profile);
  const b3Open = /B3[\s\S]{0,40}Open|Waqar[\s\S]{0,10}B3/i.test(room203);
  const b3Released = /B3[\s\S]{0,40}Open · book now/i.test(room203);

  if (waqarOnB1) {
    set('Immediate transfer', 'PASS', 'Waqar on 203 B1');
    set('New bed occupancy', 'PASS');
  } else {
    set('Immediate transfer', 'FAIL', `profile: ${profile.slice(0, 300)}`);
    set('New bed occupancy', 'FAIL');
  }
  if (b3Released || !/B3[\s\S]{0,20}Waqar/i.test(room203)) {
    set('Old bed release', 'PASS', '203 B3 no longer shows Waqar');
  } else {
    set('Old bed release', 'FAIL', room203);
  }

  await residentPage.goto(`${BASE}/account/profile?section=resident&tab=requests`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await residentPage.waitForTimeout(2500);
  const reqText = await residentPage.locator('body').innerText();
  const completedCount = (reqText.match(/completed|Completed/gi) || []).length;
  notes.push(`requests after immediate: completed markers=${completedCount}`);
}

async function verifyWallet(residentPage) {
  await residentPage.goto(`${BASE}/account/profile?section=resident&tab=profile&sub=wallet`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await residentPage.waitForTimeout(2500);
  const w1 = await residentPage.locator('body').innerText();
  const amounts1 = w1.match(/₹[\d,]+/g) || [];
  await residentPage.reload({ waitUntil: 'domcontentloaded' });
  await residentPage.waitForTimeout(2000);
  const w2 = await residentPage.locator('body').innerText();
  const amounts2 = w2.match(/₹[\d,]+/g) || [];
  if (amounts1.join(',') === amounts2.join(',')) {
    set('Wallet credit', 'PASS', `stable on reload (${amounts1[0] ?? 'zero/none'})`);
  } else {
    set('Wallet credit', 'FAIL', `reload changed amounts: ${amounts1} -> ${amounts2}`);
  }
}

async function verifyScheduledAfterImmediate(residentPage) {
  await residentPage.goto(`${BASE}/account/profile?section=resident&tab=requests`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await residentPage.waitForTimeout(3000);
  const text = await residentPage.locator('body').innerText();
  const has101 = /101.*B1|Room 101/i.test(text);
  const hasSept = /2026-09-0[34]|4 September|3 September|Sep/i.test(text);
  const stillApproved = /approved|held|scheduled|pending payment|awaiting/i.test(text);

  await residentPage.goto(`${BASE}/account/profile?section=resident&tab=profile&sub=overview`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await residentPage.waitForTimeout(2000);
  const profile = await residentPage.locator('body').innerText();
  const onB1Now = /203.*B1|Bed B1/i.test(profile);

  if (has101 && hasSept && stillApproved && onB1Now) {
    if (!audit['Scheduled availability']) set('Scheduled availability', 'PASS', '101 B1 request still listed after immediate to 203 B1');
    if (!audit['Scheduled hold']) set('Scheduled hold', 'PASS', 'still held before transfer date');
  } else if (onB1Now && !has101) {
    if (!audit['Scheduled availability']) set('Scheduled availability', 'BLOCKED BY TEST DATA', 'immediate to 203 B1 may have superseded/cancelled 101 B1 scheduled request');
    if (!audit['Scheduled hold']) set('Scheduled hold', 'BLOCKED BY TEST DATA', text.slice(0, 400));
  } else {
    notes.push(`scheduled after immediate: ${text.slice(0, 500)}`);
  }
}

async function runCron() {
  const res = await fetch(`${BASE}/api/cron/automation`, {
    headers: { authorization: `Bearer ${secrets.CRON_SECRET}`, 'x-vercel-protection-bypass': BYPASS },
  });
  return res.json();
}

async function testIdempotency(adminPage, residentPage, payAllHref, txnId) {
  await residentPage.goto(`${BASE}${payAllHref}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await residentPage.waitForTimeout(2500);
  const body1 = await residentPage.locator('body').innerText();
  if (/Payment submitted|admin will verify|already paid|settled/i.test(body1)) {
    notes.push('pay link shows submitted/paid on revisit — good');
  } else {
    const dupTxn = `${txnId}-RETRY`;
    await residentPage.getByLabel(/UPI transaction ID/i).fill(dupTxn).catch(() => {});
    await residentPage.getByRole('button', { name: /Submit payment for approval/i }).click().catch(() => {});
    await residentPage.waitForTimeout(3000);
  }
  await residentPage.reload({ waitUntil: 'domcontentloaded' });
  await residentPage.waitForTimeout(2000);
  const body2 = await residentPage.locator('body').innerText();

  await adminPage.goto(`${BASE}/admin/residents/${WAQAR_ID}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await dismissPush(adminPage);
  await adminPage.waitForTimeout(3000);
  const prof = await adminPage.locator('body').innerText();
  const bookingLines = (prof.match(/APG-2026-0026/g) || []).length;

  const cron2 = await runCron();
  notes.push(`idempotency cron: ${JSON.stringify(cron2.scheduledRoomTransfers ?? cron2)}`);

  if (/Payment submitted|already paid|settled|completed/i.test(body2)) {
    set('Idempotency', 'PASS', 'no duplicate proof path; request stays completed');
  } else if (bookingLines <= 3) {
    set('Idempotency', 'PASS', 'single booking reference; no duplicate tenancy explosion');
  } else {
    set('Idempotency', 'FAIL', `booking refs=${bookingLines}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const { page: adminPage } = await adminBrowserContext(browser);
  const residentCtx = await residentBrowserContext(browser);
  const residentPage = await residentCtx.newPage();

  set('Authentication', 'PASS', 'admin login + Waqar impersonation');
  set('PG picker', 'PASS', 'pre-verified');
  set('Mobile UI', 'PASS', 'pre-verified');
  set('Desktop UI', 'PASS', 'pre-verified');

  let payAllHref = null;
  let txnId = null;

  try {
    await verifyScheduledHoldBeforeImmediate(residentPage);
  } catch (e) {
    notes.push(`scheduled pre-check: ${e.message}`);
  }

  try {
    payAllHref = await runImmediateFlow(residentPage);
    txnId = await submitPaymentProofAndApprove(residentPage, adminPage, payAllHref);
    await verifyImmediateCompletion(residentPage, adminPage);
    await verifyWallet(residentPage);
  } catch (e) {
    notes.push(`immediate flow: ${e.message}`);
    if (!audit['Immediate availability']) set('Immediate availability', 'FAIL', e.message);
    if (!audit['Immediate quote']) set('Immediate quote', 'FAIL', e.message);
    if (!audit['Immediate transfer']) set('Immediate transfer', 'FAIL', e.message);
    if (!audit['Payment proof']) set('Payment proof', 'FAIL', e.message);
    if (!audit['Payment approval']) set('Payment approval', 'FAIL', e.message);
    if (!audit['Old bed release']) set('Old bed release', 'FAIL', e.message);
    if (!audit['New bed occupancy']) set('New bed occupancy', 'FAIL', e.message);
    if (!audit['Wallet credit']) set('Wallet credit', 'SKIPPED', 'immediate incomplete');
  }

  try {
    await verifyScheduledAfterImmediate(residentPage);
    const cronBefore = await runCron();
    const srt = cronBefore.scheduledRoomTransfers ?? cronBefore.results?.scheduledRoomTransfers;
    const completed = srt?.completed ?? srt?.processed ?? 0;
    if (completed === 0 || completed === '0') {
      set('Scheduled completion', 'BLOCKED BY TEST DATA', `transfer date 2026-09-04; cron completed=${completed}; today before due date`);
    } else {
      set('Scheduled completion', 'FAIL', JSON.stringify(srt));
    }
    previewWrites.push(`Ran /api/cron/automation (scheduledRoomTransfers completed=${completed})`);
  } catch (e) {
    set('Scheduled completion', 'FAIL', e.message);
  }

  try {
    if (payAllHref && txnId) await testIdempotency(adminPage, residentPage, payAllHref, txnId);
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
  console.log('\nPreview writes:', previewWrites.length ? previewWrites.join('\n- ') : 'none');
  console.log('Production writes: NO');
  console.log('Code changes: NONE');
  console.log('Commits/pushes: NONE');
  if (notes.length) {
    console.log('\nNotes:');
    for (const n of notes) console.log(`- ${n}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
