/* eslint-disable no-console */
/**
 * Verifies KYC upload inputs expose mobile-friendly attributes in rendered HTML.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createClient, closeDb } from '../src/db/client';
import { authSessions, customers } from '../src/db/schema';
import { IMAGE_UPLOAD_ACCEPT } from '../src/lib/uploads/fileInputPolicy';
import { randomToken, sha256 } from '../src/lib/auth/crypto';

const BASE = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000';

function extractInputs(html: string): Array<Record<string, string>> {
  const inputs: Array<Record<string, string>> = [];
  const re = /<input[^>]*type="file"[^>]*>/gi;
  for (const match of html.matchAll(re)) {
    const tag = match[0]!;
    const attrs: Record<string, string> = {};
    for (const [, key, value] of tag.matchAll(/(\w+)="([^"]*)"/g)) {
      attrs[key] = value;
    }
    inputs.push(attrs);
  }
  return inputs;
}

async function main() {
  const { db } = createClient({ max: 1 });
  const [customer] = await db
    .select({ id: customers.id, kycStatus: customers.kycStatus })
    .from(customers)
    .where(eq(customers.email, 'arshadmotlani@gmail.com'))
    .limit(1);

  if (!customer) {
    console.error('Test customer not found');
    process.exit(1);
  }

  const token = randomToken();
  await db.insert(authSessions).values({
    kind: 'customer',
    subjectId: customer.id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 86_400_000),
  });

  const res = await fetch(`${BASE}/account/kyc`, {
    headers: { cookie: `apg_customer_session=${token}` },
  });
  const html = await res.text();
  await closeDb();

  if (res.status !== 200) {
    console.error('Expected 200, got', res.status);
    process.exit(1);
  }

  const inputs = extractInputs(html);
  if (inputs.length !== 3) {
    console.error('Expected 3 file inputs, found', inputs.length);
    process.exit(1);
  }

  const [front, back, selfie] = inputs;
  const acceptOk = (accept?: string) =>
    accept === IMAGE_UPLOAD_ACCEPT || accept === 'image/*' || (accept?.includes('image/*') ?? false);

  const checks: Array<[string, boolean]> = [
    ['Aadhaar front accept allows images', acceptOk(front.accept)],
    ['Aadhaar back accept allows images', acceptOk(back.accept)],
    ['Selfie accept allows images', acceptOk(selfie.accept)],
    ['Selfie has no capture (gallery allowed)', !selfie.capture],
    ['Aadhaar front has no capture', !front.capture],
    ['Aadhaar back has no capture', !back.capture],
    ['Inputs use opacity overlay tap target', html.includes('opacity-0')],
    ['Large tap target class present', html.includes('min-h-[5.5rem]')],
  ];

  console.log('\n=== KYC mobile upload verification ===\n');
  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failed += 1;
  }

  console.log('\nFile inputs:');
  for (const input of inputs) {
    console.log(`  - name=${input.name} accept=${input.accept} capture=${input.capture ?? '(none)'}`);
  }

  if (failed) process.exit(1);
  console.log('\nAll automated checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
