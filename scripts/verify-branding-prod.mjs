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

    // Customer header mark (SVG)
    const logoMark = page.locator('header svg[aria-label="Awesome PG"]').first();
    await logoMark.waitFor({ timeout: 15000 });
    ok(`${origin} header logo`, true);

    // No old flat orange "A" badge
    const oldA = await page.locator('header span', { hasText: /^A$/ }).count();
    ok(`${origin} no letter-A placeholder`, oldA === 0);

    // Favicon / apple / manifest links in HTML
    const html = await page.content();
    ok(`${origin} apple-touch link`, html.includes('apg-apple-touch.png'));
    ok(`${origin} favicon meta`, html.includes('awesome-pg/favicon') || html.includes('apg-favicon'));

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
    const apgOsMark = page.locator('svg[aria-label="APG OS"]').first();
    await apgOsMark.waitFor({ timeout: 15000 });
    ok('admin login APG OS mark', true);
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

  {
    const apgSw = await (await browser.newPage().then(async (page) => {
      const res = await page.request.get('https://awesomepg.in/sw.js', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      const text = await res.text();
      await page.close();
      return text;
    }));
    ok('apg SW cache bumped', apgSw.includes('apg-admin-v2-brand'));
  }

  {
    const page = await browser.newPage();
    const og1 = await checkAsset(page, 'https://awesomepg.in/og/awesome-pg.png', 20000);
    ok('og awesome-pg', og1.ok, `${og1.bytes}b`);
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
