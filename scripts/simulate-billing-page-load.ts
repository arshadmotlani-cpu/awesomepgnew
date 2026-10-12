/* eslint-disable no-console */
/** Simulate /admin/billing page loaders against production DB. */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('simulate-billing-page-load.ts');

const billingMonth = '2026-10-01';

async function runStep(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log('OK', name);
  } catch (err) {
    console.error('FAIL', name, err);
    throw err;
  }
}

async function main() {
  const session = {
    kind: 'admin' as const,
    sessionId: 'sim',
    adminId: 'sim',
    email: 'sim@test',
    fullName: 'Sim',
    role: 'super_admin' as const,
    pgScope: [] as string[],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86400000),
  };

  const { listAdminOpenRentInvoices, listAdminElectricityInvoicesForReminders, listPgs } =
    await import('../src/db/queries/admin');
  const { listRentBillingOverview } = await import('../src/services/rentInvoices');
  const { listRoomsMissingElectricityBill } = await import('../src/services/electricityBilling');
  const { loadFleetElectricityBillingSummary } = await import('../src/lib/billing/fleetElectricityBillingStatus');
  const { getBillingHealthSnapshot } = await import('../src/services/billingHealth');
  const { loadBillingCommandCenterSnapshot } = await import('../src/services/billingCommandCenter');
  const { loadBillingCentreDashboardSnapshot } = await import('../src/services/billingCentreDashboard');
  const { todayInBillingTimezone } = await import('../src/lib/billing/billingTimezone');
  const { getLatestBillingGenerationRun, listTodayGeneratedInvoices } =
    await import('../src/services/billingScheduler');

  await runStep('listAdminOpenRentInvoices', () => listAdminOpenRentInvoices());
  await runStep('listAdminElectricityInvoicesForReminders', () =>
    listAdminElectricityInvoicesForReminders(),
  );
  await runStep('listPgs', () => listPgs());
  await runStep('listRentBillingOverview', () => listRentBillingOverview(billingMonth));
  await runStep('listRoomsMissingElectricityBill', () =>
    listRoomsMissingElectricityBill(billingMonth),
  );
  await runStep('loadFleetElectricityBillingSummary', () =>
    loadFleetElectricityBillingSummary(billingMonth),
  );
  await runStep('getBillingHealthSnapshot', () => getBillingHealthSnapshot());
  await runStep('loadBillingCommandCenterSnapshot', () =>
    loadBillingCommandCenterSnapshot(session, billingMonth, { reconcile: false }),
  );
  await runStep('loadBillingCentreDashboardSnapshot', () =>
    loadBillingCentreDashboardSnapshot(session, billingMonth, {}),
  );
  await runStep('listTodayGeneratedInvoices', () =>
    listTodayGeneratedInvoices(todayInBillingTimezone()),
  );
  await runStep('getLatestBillingGenerationRun', () => getLatestBillingGenerationRun());

  const { closeDb } = await import('../src/db/client');
  await closeDb();
  console.log('\nAll billing page loaders OK');
}

main().catch(async (e) => {
  console.error(e);
  const { closeDb } = await import('../src/db/client');
  await closeDb().catch(() => undefined);
  process.exit(1);
});
