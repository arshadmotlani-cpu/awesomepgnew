/* eslint-disable no-console */
/**
 * Reproduces booking phone validation for legacy local-format DB storage.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createClient, closeDb } from '../src/db/client';
import { customers } from '../src/db/schema';
import { indianPhonesEqual, normaliseIndianPhone } from '../src/lib/phone';

const EMAIL = 'arshadmotlani@gmail.com';
const SUBMITTED = '9049163636';

async function main() {
  const { db } = createClient({ max: 1 });
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.email, EMAIL))
    .limit(1);

  if (!customer) {
    console.error(`Customer not found: ${EMAIL}`);
    process.exit(1);
  }

  const storedPhone = customer.phone;
  const normalisedSubmitted = normaliseIndianPhone(SUBMITTED);
  const normalisedStored = normaliseIndianPhone(storedPhone);
  const sessionPhone = normaliseIndianPhone(storedPhone) ?? storedPhone;

  console.log('\n=== Booking phone match verification ===\n');
  console.log('Stored customer phone (DB):', storedPhone);
  console.log('Submitted phone (form):', SUBMITTED);
  console.log('normaliseIndianPhone(submitted):', normalisedSubmitted);
  console.log('normaliseIndianPhone(stored):', normalisedStored);
  console.log('Session phone (normalised on read):', sessionPhone);

  const oldComparison =
    Boolean(normalisedSubmitted) && normalisedSubmitted === storedPhone;
  const newComparison = indianPhonesEqual(normalisedSubmitted, sessionPhone);

  console.log('\nOld comparison (normalisedSubmitted === storedPhone):', oldComparison);
  console.log('New comparison (indianPhonesEqual):', newComparison);

  if (!newComparison) {
    console.error('\nFAIL: phones still do not match after fix');
    process.exit(1);
  }

  console.log('\nPASS: booking phone validation would succeed.\n');
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
