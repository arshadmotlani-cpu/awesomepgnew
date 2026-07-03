/**
 * Simulate shared server actions for refunds + deposit express against prod DB.
 */
import { config } from 'dotenv';
config({ path: '.env.local.ci-bak' });

import { loadDepositExpressContext, searchDepositExpressResidents } from '../src/services/depositExpress';
import { getRefundConsoleWorkspace, searchRefundConsoleBookings } from '../src/services/refundConsole';
import { toRefundConsoleWorkspaceDTO } from '../src/lib/refund/refundConsoleDto';

const BOOKING = '090692ca-71a6-44ab-9f11-9dbdc9366114';

async function assertSerializable(label: string, value: unknown) {
  JSON.parse(JSON.stringify(value));
  structuredClone(value);
  console.log(`OK serialize: ${label}`);
}

async function main() {
  console.log('--- searchRefundConsoleBookings ---');
  const search = await searchRefundConsoleBookings('harshal', 5);
  await assertSerializable('refund search rows', search.rows);

  console.log('--- searchDepositExpressResidents ---');
  const depSearch = await searchDepositExpressResidents('harshal');
  await assertSerializable('deposit express search rows', depSearch.rows);

  console.log('--- loadDepositExpressContext ---');
  const ctx = await loadDepositExpressContext(BOOKING);
  if (!ctx) throw new Error('null deposit express context');
  await assertSerializable('deposit express context', ctx);

  console.log('--- getRefundConsoleWorkspace ---');
  const ws = await getRefundConsoleWorkspace(BOOKING);
  if (!ws) throw new Error('null refund workspace');
  const dto = toRefundConsoleWorkspaceDTO(ws);
  await assertSerializable('refund workspace dto', dto);

  console.log('\n✓ All shared paths OK');
}

main().catch((err) => {
  console.error('\nCRASH:', err);
  if (err instanceof Error) console.error(err.stack);
  process.exit(1);
});
