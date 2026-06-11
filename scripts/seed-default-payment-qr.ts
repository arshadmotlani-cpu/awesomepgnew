/**
 * Seed both default UPI QR categories on every PG.
 *
 * Usage: npx tsx scripts/seed-default-payment-qr.ts
 */
import 'dotenv/config';

import { closeDb } from '../src/db/client';
import { ensureDefaultPaymentCategoriesForAllPgs } from '../src/services/pgPaymentDefaults';
import {
  DEFAULT_ELECTRICITY_DAILY_UPI_ID,
  DEFAULT_RENT_DEPOSIT_UPI_ID,
  ELECTRICITY_CATEGORY_NAME,
  RENT_DEPOSIT_BOOKING_CATEGORY_NAME,
} from '../src/lib/payments/defaultQr';

async function main() {
  const count = await ensureDefaultPaymentCategoriesForAllPgs();
  console.log(`Updated ${count} PG(s):`);
  console.log(`  · ${RENT_DEPOSIT_BOOKING_CATEGORY_NAME} → ${DEFAULT_RENT_DEPOSIT_UPI_ID}`);
  console.log(`  · ${ELECTRICITY_CATEGORY_NAME} → ${DEFAULT_ELECTRICITY_DAILY_UPI_ID}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
