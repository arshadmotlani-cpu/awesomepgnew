/**
 * Seed the default rent/deposit/booking UPI QR on every PG.
 *
 * Usage: npx tsx scripts/seed-default-payment-qr.ts
 */
import 'dotenv/config';

import { closeDb } from '../src/db/client';
import { ensureDefaultPaymentCategoriesForAllPgs } from '../src/services/pgPaymentDefaults';
import {
  DEFAULT_RENT_DEPOSIT_UPI_ID,
  RENT_DEPOSIT_BOOKING_CATEGORY_NAME,
} from '../src/lib/payments/defaultQr';

async function main() {
  const count = await ensureDefaultPaymentCategoriesForAllPgs();
  console.log(
    `Updated ${count} PG(s) with "${RENT_DEPOSIT_BOOKING_CATEGORY_NAME}" · UPI ${DEFAULT_RENT_DEPOSIT_UPI_ID}`,
  );
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
