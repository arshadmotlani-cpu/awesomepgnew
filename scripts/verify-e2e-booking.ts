/* eslint-disable no-console */
/**
 * End-to-end booking verification:
 *   email login → profile → KYC → admin approve → book → pay → verify dashboards
 */
import 'dotenv/config';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { createClient, closeDb } from '../src/db/client';
import { beds, bookings, customers, pgs } from '../src/db/schema';
import { sendEmailOtp, verifyEmailOtp } from '../src/lib/auth/otp';
import { createCustomerProfile } from '../src/lib/auth/customer';
import { randomToken, sha256 as hashToken } from '../src/lib/auth/crypto';
import { authSessions } from '../src/db/schema';
import { env } from '../src/lib/env';
import { updateCustomerProfile } from '../src/services/profile';
import { submitKyc } from '../src/services/kyc';
import { reviewKycSubmission } from '../src/services/kyc';
import { createBooking } from '../src/services/booking';
import { recordPaymentSuccess } from '../src/services/bookingLifecycle';
import { listBookingsForCustomer } from '../src/db/queries/customer';
import { listBookings, getOccupancyByPg } from '../src/db/queries/admin';
import { isBedAvailable } from '../src/services/availability';
import { adminUsers } from '../src/db/schema';
import { verifyPassword } from '../src/lib/auth/crypto';

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

async function findAvailableBed(): Promise<{ bedId: string; pgId: string } | null> {
  const { db } = createClient({ max: 1 });
  const startDate = '2026-06-08';
  const endDate = '2026-07-08';
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  const [pg] = await db.select({ id: pgs.id }).from(pgs).limit(1);
  if (!pg) return null;

  const allBeds = await db
    .select({ id: beds.id })
    .from(beds)
    .where(eq(beds.status, 'available'))
    .limit(50);

  for (const bed of allBeds) {
    const ok = await isBedAvailable({ bedId: bed.id, startDate: start, endDate: end });
    if (ok) return { bedId: bed.id, pgId: pg.id };
  }
  return null;
}

async function main() {
  const ts = Date.now();
  const email = `e2e-${ts}@awesomepg.local`;
  const phoneLocal = String(9000000000 + (ts % 999999999)).slice(0, 10);
  const fullName = `E2E User ${ts}`;

  console.log('\n=== E2E Booking Verification ===\n');
  console.log(`Customer: ${email} / +91${phoneLocal}\n`);

  const { sha256 } = await import('../src/lib/auth/crypto');
  const { emailOtpChallenges } = await import('../src/db/schema');
  const { db } = createClient({ max: 1 });

  // 1. Send email OTP (exercises email delivery path)
  const sent = await sendEmailOtp(email);
  if (!sent.ok) {
    fail('Send email OTP', sent);
    return summary();
  }
  pass('Send email OTP');

  // Use a known code for automated verify (dev E2E only)
  const code = String(Math.floor(100_000 + Math.random() * 900_000));
  await db.insert(emailOtpChallenges).values({
    email,
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + 5 * 60_000),
  });

  const verified = await verifyEmailOtp(email, code, {}, { consume: false });
  if (!verified.ok) {
    fail('Verify email OTP', verified);
    return summary();
  }
  pass('Verify email OTP');

  // 2. Create account
  let customer;
  try {
    customer = await createCustomerProfile({ email, fullName, phone: phoneLocal });
  } catch (err) {
    fail('Create customer profile', err instanceof Error ? err.message : err);
    return summary();
  }
  pass('Create customer account', customer.id);

  const sessionToken = randomToken();
  await db.insert(authSessions).values({
    kind: 'customer',
    subjectId: customer.id,
    tokenHash: hashToken(sessionToken),
    expiresAt: new Date(Date.now() + env.AUTH_CUSTOMER_SESSION_DAYS * 86_400_000),
  });
  pass('Create customer session (DB)');

  // 3. Complete profile
  const profile = await updateCustomerProfile({
    customerId: customer.id,
    fullName,
    email,
    phone: phoneLocal,
  });
  if (!profile.ok) {
    fail('Complete profile', profile.message);
    return summary();
  }
  pass('Complete profile');

  // 4. Upload KYC
  const aadhaar = await makeAadhaarJpeg();
  const selfie = await makeSelfieJpeg();
  const kyc = await submitKyc({
    customerId: customer.id,
    aadhaarFront: { buffer: aadhaar, mime: 'image/jpeg' },
    aadhaarBack: { buffer: aadhaar, mime: 'image/jpeg' },
    selfie: { buffer: selfie, mime: 'image/jpeg' },
  });
  if (!kyc.ok) {
    fail('Upload KYC', kyc.message);
    return summary();
  }
  pass('Upload KYC', kyc.submissionId);

  // 5. Admin approve KYC
  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, 'admin@awesomepg.local'))
    .limit(1);
  if (!admin) {
    fail('Find admin user', 'admin@awesomepg.local not found');
    return summary();
  }
  const approved = await reviewKycSubmission({
    submissionId: kyc.submissionId,
    adminId: admin.id,
    decision: 'approved',
  });
  if (!approved.ok) {
    fail('Admin approve KYC', approved.message);
    return summary();
  }
  pass('Admin approve KYC');

  // 6. Find available bed
  const bed = await findAvailableBed();
  if (!bed) {
    fail('Find available bed', 'no bed available for 2026-06-08 → 2026-07-08');
    return summary();
  }
  pass('Find available bed', bed.bedId);

  // 7. Create booking
  const booked = await createBooking({
    bedIds: [bed.bedId],
    startDate: '2026-06-08',
    endDate: '2026-07-08',
    durationMode: 'monthly',
    customer: {
      fullName,
      email,
      phone: `+91${phoneLocal}`,
      gender: 'male',
    },
    notes: `E2E verification ${ts}`,
  });
  if (!booked.ok) {
    fail('Create booking', booked);
    return summary();
  }
  pass('Create booking', `${booked.bookingCode} (${booked.status})`);

  if (booked.status !== 'pending_payment') {
    fail('Booking status after create', `expected pending_payment, got ${booked.status}`);
    return summary();
  }

  // 8. Pay booking
  const payId = `e2e_pay_${ts}`;
  const paid = await recordPaymentSuccess({
    provider: 'mock',
    providerPaymentId: payId,
    providerOrderId: `mock_order_${payId}`,
    amountPaise: booked.totalPaise ?? 0,
    bookingCode: booked.bookingCode,
    rawPayload: { e2e: true },
  });
  if (!paid.ok) {
    fail('Pay booking', paid);
    return summary();
  }
  if (!paid.stateChanged) {
    fail('Payment state change', 'stateChanged=false');
    return summary();
  }
  pass('Pay booking (mock webhook)', payId);

  // 9. Confirm booking status
  const [confirmed] = await db
    .select({ status: bookings.status, customerId: bookings.customerId })
    .from(bookings)
    .where(eq(bookings.bookingCode, booked.bookingCode))
    .limit(1);
  if (!confirmed || confirmed.status !== 'confirmed') {
    fail('Confirm booking', confirmed?.status ?? 'not found');
    return summary();
  }
  pass('Confirm booking status', 'confirmed');

  // 10. Customer dashboard
  const customerBookings = await listBookingsForCustomer(customer.id);
  if (!customerBookings.ok) {
    fail('Customer dashboard query', customerBookings.error);
  } else {
    const found = customerBookings.data.some((b) => b.bookingCode === booked.bookingCode);
    if (!found) fail('Customer dashboard', `booking ${booked.bookingCode} not listed`);
    else pass('Customer dashboard', `found ${booked.bookingCode}`);
  }

  // 11. Admin dashboard
  const adminBookings = await listBookings();
  if (!adminBookings.ok) {
    fail('Admin bookings query', adminBookings.error);
  } else {
    const found = adminBookings.data.some((b) => b.bookingCode === booked.bookingCode);
    if (!found) fail('Admin dashboard', `booking ${booked.bookingCode} not listed`);
    else pass('Admin dashboard', `found ${booked.bookingCode}`);
  }

  // 12. Bed occupancy
  const occupancy = await getOccupancyByPg();
  if (!occupancy.ok) {
    fail('Occupancy query', occupancy.error);
  } else {
    const pgOcc = occupancy.data.find((o) => o.pgId === bed.pgId);
    if (!pgOcc || pgOcc.occupiedBeds < 1) {
      fail('Bed occupancy', pgOcc ?? 'pg not found');
    } else {
      pass('Bed occupancy', `${pgOcc.occupiedBeds} occupied / ${pgOcc.totalBeds} total`);
    }
  }

  // Verify KYC approved on customer
  const [custRow] = await db
    .select({ kycStatus: customers.kycStatus })
    .from(customers)
    .where(eq(customers.id, customer.id))
    .limit(1);
  if (custRow?.kycStatus !== 'approved') {
    fail('Customer KYC status', custRow?.kycStatus);
  } else {
    pass('Customer KYC approved');
  }

  return summary();
}

function summary() {
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passes.length}`);
  for (const p of passes) console.log(`  ✓ ${p}`);
  if (failures.length > 0) {
    console.log(`\nFailed: ${failures.length}`);
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll steps passed.');
    process.exitCode = 0;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
