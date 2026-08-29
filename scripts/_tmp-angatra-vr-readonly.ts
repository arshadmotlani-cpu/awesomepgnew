/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.prod.live' });
dotenv.config({ path: '.env.production.local' });

import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { vacatingRequests } from '@/src/db/schema';

const VR_ID = '198831f7-189c-4aaf-874b-c066d6323d05';
const BOOKING_ID = 'ad24c0d2-f2d1-4c08-99d1-74487560feb5';

async function main() {
  const rows = await db
    .select({
      id: vacatingRequests.id,
      bookingId: vacatingRequests.bookingId,
      status: vacatingRequests.status,
      vacatingDate: vacatingRequests.vacatingDate,
      noticeGivenDate: vacatingRequests.noticeGivenDate,
      originalNoticeSubmittedAt: vacatingRequests.originalNoticeSubmittedAt,
      monthlyRentPaiseSnapshot: vacatingRequests.monthlyRentPaiseSnapshot,
      deductionPaise: vacatingRequests.deductionPaise,
    })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.bookingId, BOOKING_ID));

  const byId = rows.find((r) => r.id === VR_ID) ?? null;
  console.log(
    JSON.stringify(
      {
        foundExactId: Boolean(byId),
        byId,
        allForBooking: rows,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
