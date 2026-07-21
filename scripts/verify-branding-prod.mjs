import { chromium } from 'playwright';
import crypto from 'crypto';

const results = [];
function ok(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function hashBytes(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

async function checkAsset(page, url, minBytes = 1000) {
  const res = await page.request.get(url, { headers: { 'Cache-Control': 'no-cache' } });
  const body = Buffer.from(await res.body());
  const hash = await hashBytes(body);
  return { status: res.status(), bytes: body.length, hash, ok: res.ok() && body.length >= minBytes };
}

const browser = await chromium.launch({ headless: true });

try {
  // --- Awesome PG sites ---
  for (const origin of ['https://awesomepg.in', 'https://www.awesomepg.in']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const home = await page.goto(origin + '/', { waitUntil: 'networkidle', timeout: 90000 });
    ok(`${origin} home`, home?.ok() === true, `status ${home?.status()}`);

    // New logo in header (next/image src)
    const logoImg = page.locator('header img[alt="Awesome PG"]').first();
    await logoImg.waitFor({ timeout: 15000 });
    const logoSrc = await logoImg.getAttribute('src');
    ok(`${origin} header logo`, Boolean(logoSrc?.includes('apg-')), `src=${logoSrc}`);

    // No old flat orange "A" badge
    const oldA = await page.locator('header span', { hasText: /^A$/ }).count();
    ok(`${origin} no letter-A placeholder`, oldA === 0);

    // Favicon / apple / manifest links in HTML
    const html = await page.content();
    ok(`${origin} apple-touch link`, html.includes('apg-apple-touch.png'));
    ok(`${origin} favicon 32`, html.includes('apg-favicon-32.png') || html.includes('apg-favicon'));

    // Assets
    const fav = await checkAsset(page, `${origin}/icons/apg-favicon-32.png`, 800);
    ok(`${origin} favicon asset`, fav.ok, `${fav.status} ${fav.bytes}b hash=${fav.hash}`);
    const apple = await checkAsset(page, `${origin}/icons/apg-apple-touch.png`, 5000);
    ok(`${origin} apple-touch asset`, apple.ok, `${apple.status} ${apple.bytes}b hash=${apple.hash}`);
    const pwa192 = await checkAsset(page, `${origin}/icons/apg-admin-192.png`, 10000);
    ok(`${origin} pwa 192`, pwa192.ok, `${pwa192.status} ${pwa192.bytes}b hash=${pwa192.hash}`);
    const pwa512 = await checkAsset(page, `${origin}/icons/apg-admin-512.png`, 50000);
    ok(`${origin} pwa 512`, pwa512.ok, `${pwa512.status} ${pwa512.bytes}b hash=${pwa512.hash}`);

    const man = await page.request.get(`${origin}/manifest.webmanifest`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    const manJson = await man.json();
    ok(
      `${origin} manifest icons`,
      Array.isArray(manJson.icons) && manJson.icons.some((i) => i.src.includes('apg-admin-512')),
      `${manJson.icons?.length} icons`,
    );
    // New icons are much larger than old flat ones (~3-14KB)
    ok(`${origin} icons not old tiny placeholders`, pwa512.bytes > 50000 && fav.bytes > 1000);

    await page.close();
  }

  // Admin login branding (public)
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const res = await page.goto('https://awesomepg.in/admin/login', {
      waitUntil: 'networkidle',
      timeout: 90000,
    });
    ok('admin login page', res?.ok() === true, `status ${res?.status()}`);
    const logo = page.locator('img[alt="Awesome PG"]').first();
    await logo.waitFor({ timeout: 15000 });
    ok('admin login logo', true);
    // /admin without auth should redirect to login — still verify route responds
    const admin = await page.goto('https://awesomepg.in/admin', {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    ok(
      'admin route reachable',
      admin?.status() === 200 || admin?.status() === 307 || admin?.status() === 302 || page.url().includes('login'),
      `status ${admin?.status()} url=${page.url()}`,
    );
    await page.close();
  }

  // --- Capital ---
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const login = await page.goto('https://invest.awesomepg.in/login', {
      waitUntil: 'networkidle',
      timeout: 90000,
    });
    ok('invest login', login?.ok() === true, `status ${login?.status()}`);
    const logo = page.locator('img[alt="Automotive Capital"]').first();
    await logo.waitFor({ timeout: 15000 });
    const src = await logo.getAttribute('src');
    ok('invest login logo', Boolean(src?.includes('capital/icons')), `src=${src}`);

    // No letter A placeholder
    const letterA = await page.locator('text=/^A$/').count();
    // The gradient "A" box should be gone — check for old class pattern
    const oldBox = await page.locator('.from-ac-accent.to-ac-violet').count();
    ok('invest no gradient A mark', oldBox === 0, `letterA=${letterA}`);

    const html = await page.content();
    ok('invest apple-touch meta', html.includes('apple-touch.png') || html.includes('apple-touch-icon'));
    ok('invest favicon meta', html.includes('capital/icons/favicon') || html.includes('favicon-32'));

    const fav = await checkAsset(page, 'https://invest.awesomepg.in/capital/icons/favicon-32.png', 800);
    ok('invest favicon asset', fav.ok, `${fav.status} ${fav.bytes}b hash=${fav.hash}`);
    const apple = await checkAsset(page, 'https://invest.awesomepg.in/capital/icons/apple-touch.png', 5000);
    ok('invest apple-touch asset', apple.ok, `${apple.status} ${apple.bytes}b hash=${apple.hash}`);
    const i192 = await checkAsset(page, 'https://invest.awesomepg.in/capital/icons/icon-192.png', 10000);
    ok('invest pwa 192', i192.ok, `${i192.status} ${i192.bytes}b hash=${i192.hash}`);
    const i512 = await checkAsset(page, 'https://invest.awesomepg.in/capital/icons/icon-512.png', 50000);
    ok('invest pwa 512', i512.ok, `${i512.status} ${i512.bytes}b hash=${i512.hash}`);
    ok('invest icons not old placeholders', i512.bytes > 50000 && i192.bytes > 10000);

    const man = await (await page.request.get('https://invest.awesomepg.in/capital/manifest.webmanifest', {
      headers: { 'Cache-Control': 'no-cache' },
    })).json();
    ok(
      'invest manifest',
      man.short_name === 'Capital Investments' && man.icons?.some((i) => i.src.includes('icon-512')),
      `short=${man.short_name} icons=${man.icons?.length}`,
    );

    // Login and check dashboard sidebar logo
    const email = process.env.INVEST_ADMIN_EMAIL || 'admin@foryour.in';
    const password = process.env.INVEST_ADMIN_PASSWORD || '@Admin1345';
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/dashboard/, { timeout: 45000 });
    ok('invest dashboard', /dashboard/.test(page.url()), page.url());
    const sideLogo = page.locator('aside img[alt="Automotive Capital"]').first();
    await sideLogo.waitFor({ timeout: 15000 });
    ok('invest sidebar logo', true);

    // SW cache version string
    const sw = await page.request.get('https://invest.awesomepg.in/capital/sw.js', {
      headers: { 'Cache-Control': 'no-cache' },
    });
    const swText = await sw.text();
    ok('invest SW cache bumped', swText.includes('capital-shell-v2-brand'));

    const apgSw = await page.request.get('https://awesomepg.in/sw.js', {
      headers: { 'Cache-Control': 'no-cache' },
    });
    const apgSwText = await apgSw.text();
    ok('apg SW cache bumped', apgSwText.includes('apg-admin-v2-brand'));

    await page.close();
  }

  // Cross-check old capital placeholder size (~11KB) vs new (~300KB)
  {
    const page = await browser.newPage();
    // Ensure OG images exist
    const og1 = await checkAsset(page, 'https://awesomepg.in/og/awesome-pg.png', 20000);
    const og2 = await checkAsset(page, 'https://invest.awesomepg.in/og/automotive-capital.png', 20000);
    ok('og awesome-pg', og1.ok, `${og1.bytes}b`);
    ok('og automotive-capital', og2.ok, `${og2.bytes}b`);
    await page.close();
  }
} catch (e) {
  ok('script error', false, e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\nSUMMARY ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
  process.exit(1);
}
