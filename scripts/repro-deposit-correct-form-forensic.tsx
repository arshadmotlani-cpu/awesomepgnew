/* eslint-disable no-console */
/**
 * Forensic repro: DepositCorrectForm render before/after deposit summary save.
 * Usage: DATABASE_URL=... npx tsx scripts/repro-deposit-correct-form-forensic.tsx [bookingId]
 */
import 'dotenv/config';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { closeDb } from '../src/db/client';
import { jsonSafe } from '../src/lib/depositPageDebug';
import { loadDepositPageData } from '../src/lib/deposits/loadDepositPageData';
import { updateDepositSummaryAdmin } from '../src/services/depositOperations';
import { DepositCorrectForm } from '../src/components/admin/deposits/DepositCorrectForm';

const BOOKING_ID = process.argv[2] ?? 'ad24c0d2-f2d1-4c08-99d1-74487560feb5';

function runtimeType(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'bigint') return 'bigint';
  return typeof value;
}

function tryRender(label: string, view: unknown) {
  console.log(`\n=== ${label} ===`);
  if (view && typeof view === 'object') {
    for (const [k, v] of Object.entries(view as Record<string, unknown>)) {
      if (k.includes('Paise') || k === 'bookingId') {
        console.log(`  ${k}: typeof=${runtimeType(v)} value=${String(v)}`);
      }
    }
  }
  try {
    const html = renderToString(<DepositCorrectForm view={view as never} />);
    console.log(`OK (${html.length} bytes)`);
    return true;
  } catch (err) {
    console.error('CRASH');
    console.error(err instanceof Error ? err.message : err);
    console.error(err instanceof Error ? err.stack : '');
    return false;
  }
}

async function main() {
  console.log('bookingId', BOOKING_ID);

  let data = await loadDepositPageData(BOOKING_ID);
  if (!data.booking) throw new Error('booking not found');
  if (!data.walletProps) throw new Error('walletProps missing');

  const beforeOk = tryRender('BEFORE SAVE', jsonSafe(data.walletProps.view));
  if (!beforeOk) process.exit(1);

  const halfRequired = Math.round(data.walletProps.view.requiredPaise / 2);
  const halfCollected = Math.round(data.walletProps.view.collectedPaise / 2);

  const save = await updateDepositSummaryAdmin({
    bookingId: BOOKING_ID,
    customerId: data.booking.customerId,
    adminId: '00000000-0000-0000-0000-000000000001',
    requiredPaise: halfRequired,
    collectedPaise: halfCollected,
    reason: 'DepositCorrectForm forensic repro',
  });
  console.log('\nsave', save);
  if (!save.ok) process.exit(1);

  data = await loadDepositPageData(BOOKING_ID);
  if (!data.walletProps) throw new Error('walletProps missing after save');

  const afterOk = tryRender('AFTER SAVE', jsonSafe(data.walletProps.view));
  if (!afterOk) process.exit(1);

  console.log('\n=== ALL RENDERS OK ===');
  await closeDb();
}

main().catch(async (err) => {
  console.error('\n=== REPRO FAILED ===', err);
  try {
    await closeDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
