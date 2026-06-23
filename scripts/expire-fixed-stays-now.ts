#!/usr/bin/env npx tsx
/**
 * One-off: expire all fixed-stay bookings past 11 AM IST checkout now.
 * Usage: npx tsx scripts/expire-fixed-stays-now.ts
 */

import { processFixedStayAutoExpiryBatch } from '@/src/services/fixedStayAutoExpiry';

async function main() {
  const result = await processFixedStayAutoExpiryBatch();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
