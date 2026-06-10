/* eslint-disable no-console */
import 'dotenv/config';
import { createBooking } from '../src/services/booking';
import { closeDb } from '../src/db/client';

async function main() {
  const [, , bed1, bed2, start, end] = process.argv;
  if (!bed1 || !bed2 || !start || !end) {
    console.error(
      'usage: tsx scripts/verify-booking.ts <bedId1> <bedId2> <YYYY-MM-DD> <YYYY-MM-DD>',
    );
    process.exit(2);
  }
  const result = await createBooking({
    bedIds: [bed1, bed2],
    startDate: start,
    endDate: end,
    durationMode: 'monthly',
    customer: {
      fullName: 'Verification Bot',
      email: 'verify-bot+phase3@example.com',
      phone: '+919999000111',
      gender: 'other',
    },
    notes: 'Phase 3 verification — created by scripts/verify-booking.ts',
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.ok) {
    console.log(`\n→ Open http://localhost:3000/booking/${result.bookingCode}`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
