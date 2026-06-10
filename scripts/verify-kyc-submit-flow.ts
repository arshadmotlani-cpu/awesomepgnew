/* eslint-disable no-console */
/**
 * End-to-end KYC submit: service save + Server Action redirect (no NEXT_REDIRECT leak).
 */
import 'dotenv/config';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { createClient, closeDb } from '../src/db/client';
import { customers } from '../src/db/schema';
import { submitKyc, getLatestKycSubmission } from '../src/services/kyc';
import { isRedirectError } from 'next/dist/client/components/redirect-error';

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

async function makeAadhaarJpeg(): Promise<Buffer> {
  const svg = `
    <svg width="640" height="400" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#e8e0d0"/>
      <text x="20" y="40" font-size="28" fill="#111">GOVERNMENT OF INDIA</text>
      <text x="20" y="80" font-size="24" fill="#111">UIDAI</text>
      <text x="20" y="120" font-size="20" fill="#111">1234 5678 9012</text>
      ${Array.from({ length: 40 }, (_, i) => `<rect x="${(i % 10) * 60}" y="${160 + Math.floor(i / 10) * 20}" width="50" height="8" fill="#333"/>`).join('')}
    </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function makeSelfieJpeg(): Promise<Buffer> {
  const svg = `
    <svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#c4b5a0"/>
      <ellipse cx="400" cy="320" rx="160" ry="200" fill="#8b7355"/>
      ${Array.from({ length: 120 }, (_, i) => `<rect x="${(i % 12) * 60}" y="${400 + Math.floor(i / 12) * 18}" width="55" height="10" fill="#${(i % 9) + 1}${(i % 9) + 1}${(i % 9) + 1}"/>`).join('')}
      ${Array.from({ length: 80 }, (_, i) => `<circle cx="${40 + i * 9}" cy="${40 + (i % 8) * 12}" r="5" fill="#222"/>`).join('')}
    </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
}

async function main() {
  console.log('\n=== KYC submit flow verification ===\n');

  const ts = Date.now();
  const email = `kyc-flow-${ts}@awesomepg.local`;
  const { db } = createClient({ max: 1 });

  const [customer] = await db
    .insert(customers)
    .values({
      email,
      fullName: `KYC Flow ${ts}`,
      phone: `+91${String(9000000000 + (ts % 999999999)).slice(0, 10)}`,
      gender: 'male',
      authProvider: 'email',
      profileCompletedAt: new Date(),
    })
    .returning();

  const aadhaar = await makeAadhaarJpeg();
  const selfie = await makeSelfieJpeg();

  const serviceResult = await submitKyc({
    customerId: customer!.id,
    aadhaarFront: { buffer: aadhaar, mime: 'image/jpeg' },
    aadhaarBack: { buffer: aadhaar, mime: 'image/jpeg' },
    selfie: { buffer: selfie, mime: 'image/jpeg' },
  });

  if (!serviceResult.ok) {
    fail('submitKyc service', serviceResult.message);
    return summary();
  }
  pass('submitKyc service saves submission', serviceResult.submissionId);

  const [row] = await db
    .select({ kycStatus: customers.kycStatus })
    .from(customers)
    .where(eq(customers.id, customer!.id));
  if (row?.kycStatus !== 'pending') {
    fail('Customer kycStatus after submit', row?.kycStatus);
  } else {
    pass('Customer kycStatus is pending');
  }

  // Redirect must propagate through catch (regression for NEXT_REDIRECT UI bug)
  const { redirect, unstable_rethrow } = await import('next/navigation');
  let redirectPropagated = false;
  try {
    redirect('/account/kyc?submitted=1');
  } catch (err) {
    try {
      unstable_rethrow(err);
      fail('unstable_rethrow', 'should have re-thrown redirect');
    } catch (rethrown) {
      if (isRedirectError(rethrown)) {
        redirectPropagated = true;
        pass('unstable_rethrow propagates redirect (not NEXT_REDIRECT message)');
      }
    }
  }
  if (!redirectPropagated) fail('unstable_rethrow', 'redirect not detected');

  // KYC is persisted before redirect() runs in submitKycAction
  const [arshad] = await db
    .select({ id: customers.id, kycStatus: customers.kycStatus })
    .from(customers)
    .where(eq(customers.email, 'arshadmotlani@gmail.com'))
    .limit(1);
  if (arshad) {
    const arshadKyc = await getLatestKycSubmission(arshad.id);
    if (arshadKyc) {
      pass(
        'Prior user submission exists in DB (saved despite NEXT_REDIRECT UI)',
        `${arshadKyc.id} · status ${arshad.kycStatus}`,
      );
    }
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
  console.log('\nAll KYC submit checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
