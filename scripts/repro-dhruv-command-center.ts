/**
 * Reproduce Resident Command Center load for Dhruv.
 * Usage: npx tsx scripts/repro-dhruv-command-center.ts
 */
import { loadResidentCommandCenter } from '../src/services/residentCommandCenter';

const DHRUV_ID = '3cd0d0cb-5f4c-4fd9-ae8b-780664e61f1c';

const mockSession = {
  adminId: 'repro',
  email: 'repro@awesomepg.app',
  fullName: 'Repro',
  role: 'super_admin' as const,
};

async function probe(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(`✓ ${label}`);
    return true;
  } catch (err) {
    console.error(`✗ ${label}`);
    console.error(err);
    return false;
  }
}

async function main() {
  console.log('=== Dhruv Command Center repro ===\n');
  console.log('customerId:', DHRUV_ID);

  try {
    const data = await loadResidentCommandCenter(mockSession, DHRUV_ID);
    console.log('\nSUCCESS — loaded command center');
    console.log('bookings:', data?.bookingHistory.length);
    console.log('financial:', data?.financialAccount ? 'yes' : 'no');
    console.log('deposit:', data?.depositSummary ? 'yes' : 'no');
    console.log('timeline events:', data?.timeline.length);
  } catch (err) {
    console.error('\nFAILED — loadResidentCommandCenter threw:\n');
    console.error(err);
    process.exitCode = 1;
  }
}

main();
