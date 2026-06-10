import { customType } from 'drizzle-orm/pg-core';

/**
 * Postgres `citext` — case-insensitive text. Requires the `citext` extension
 * (created by the initial constraints migration).
 */
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext';
  },
});

/**
 * Postgres `daterange`. We always store half-open ranges `[start, end)` so a
 * stay running 2026-06-01 -> 2026-06-10 occupies the bed on the 1st through
 * the 9th and frees it on the morning of the 10th. The GiST EXCLUDE constraint
 * on `bed_reservations` is what makes overlap prevention actually safe.
 */
export const daterange = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'daterange';
  },
});
