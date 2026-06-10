/* eslint-disable no-console */
/**
 * Verifies booking intent survives login redirect chain:
 *   /booking/new?... → middleware → /login?next=... → verify API → profile or booking
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createClient, closeDb } from '../src/db/client';
import { beds, customers, emailOtpChallenges } from '../src/db/schema';
import { sha256 } from '../src/lib/auth/crypto';
import { profileRedirectWithNext, safeNext } from '../src/lib/auth/safeNext';

const BASE = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000';

const failures: string[] = [];
const passes: string[] = [];

function pass(step: string, detail?: string) {
  passes.push(step);
  console.log(`✓ ${step}${detail ? ` — ${detail}` : ''}`);
}

function fail(step: string, detail: unknown) {
  const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
  failures.push(`${step}: ${msg}`);
  console.error(`✗ ${step}: ${msg}`);
}

async function main() {
  console.log('\n=== Booking login redirect verification ===\n');

  const { db } = createClient({ max: 1 });
  const [bed] = await db
    .select({ id: beds.id })
    .from(beds)
    .where(eq(beds.status, 'available'))
    .limit(1);
  if (!bed) {
    fail('Find bed', 'no available bed');
    return summary();
  }

  const bookingPath = `/booking/new?start=2026-06-10&end=2026-07-10&mode=monthly&bed=${bed.id}`;
  const bookingUrl = `${BASE}${bookingPath}`;

  // 1. Middleware redirect preserves full cart URL in `next`
  let loginLocation: string | null = null;
  try {
    const res = await fetch(bookingUrl, { redirect: 'manual' });
    if (res.status !== 307 && res.status !== 308 && res.status !== 302) {
      fail('Middleware redirect', `expected 307, got ${res.status}`);
    } else {
      loginLocation = res.headers.get('location');
      if (!loginLocation) {
        fail('Middleware redirect', 'missing Location header');
      } else {
        const loginUrl = new URL(loginLocation, BASE);
        const next = loginUrl.searchParams.get('next');
        if (next !== bookingPath) {
          fail('Middleware next param', { expected: bookingPath, got: next });
        } else {
          pass('Middleware preserves booking cart in next', next);
        }
      }
    }
  } catch (err) {
    fail('Middleware redirect', `fetch failed — is dev server running at ${BASE}? ${err}`);
    return summary();
  }

  // 2. safeNext helper rejects open redirects
  if (safeNext('//evil.com') !== '/account/bookings') {
    fail('safeNext', 'did not reject //evil.com');
  } else {
    pass('safeNext rejects open redirect');
  }
  if (safeNext(bookingPath) !== bookingPath) {
    fail('safeNext', 'did not preserve booking path');
  } else {
    pass('safeNext preserves internal booking path');
  }

  // 3. Verify API: incomplete profile → profile?next=booking
  const ts = Date.now();
  const email = `redirect-${ts}@awesomepg.local`;
  const phone = `+91${String(9000000000 + (ts % 999999999)).slice(0, 10)}`;
  await db.insert(customers).values({
    email,
    fullName: 'X',
    phone,
    gender: 'male',
    authProvider: 'email',
  });

  const code = String(Math.floor(100_000 + Math.random() * 900_000));
  await db.insert(emailOtpChallenges).values({
    email,
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + 5 * 60_000),
  });

  const verifyRes = await fetch(`${BASE}/api/auth/customer/email/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, next: bookingPath }),
  });
  const verifyBody = (await verifyRes.json()) as {
    ok: boolean;
    needsProfileComplete?: boolean;
    redirect?: string;
  };
  const expectedProfileRedirect = profileRedirectWithNext(bookingPath);
  if (!verifyBody.needsProfileComplete) {
    fail('Verify incomplete profile', verifyBody);
  } else if (verifyBody.redirect !== expectedProfileRedirect) {
    fail('Verify profile redirect', {
      expected: expectedProfileRedirect,
      got: verifyBody.redirect,
    });
  } else {
    pass('Verify API returns profile redirect with booking next', verifyBody.redirect);
  }

  const setCookie = verifyRes.headers.get('set-cookie');
  if (!setCookie?.includes('apg_customer_session')) {
    fail('Session on profile-incomplete login', 'no apg_customer_session cookie');
  } else {
    pass('Session created before profile completion redirect');
  }

  // 4. Profile page reachable with session + next
  const cookie = setCookie!.split(';')[0]!;
  const profileUrl = `${BASE}${verifyBody.redirect}`;
  const profileRes = await fetch(profileUrl, {
    headers: { cookie },
    redirect: 'manual',
  });
  if (profileRes.status !== 200) {
    fail('Profile page with session', `status ${profileRes.status}`);
  } else {
    pass('Profile page loads with session and next query');
  }

  await closeDb();
  summary();
}

function summary() {
  console.log(`\n${passes.length} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error('\nFailures:\n', failures.join('\n'));
    process.exit(1);
  }
  console.log('\nAll booking redirect checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
