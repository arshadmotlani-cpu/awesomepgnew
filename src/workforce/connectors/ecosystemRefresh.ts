/**
 * Fan-out: refresh all Workforce → ecosystem brain connectors.
 * Safe to call after employee mutations. Never mutates Health Brain tables.
 */
import { publishAppointmentRosterRefresh } from '@/src/workforce/connectors/appointmentBridge';
import { publishCustomerCapacitySignal } from '@/src/workforce/connectors/customerBridge';
import { publishWorkforceFinanceContribution } from '@/src/workforce/connectors/financeBridge';
import { publishWorkforceHealthSelfCheck } from '@/src/workforce/connectors/healthBridge';
import type { WorkforceEngineId } from '@/src/workforce/types';

export async function publishWorkforceEcosystemRefresh(
  engineId: WorkforceEngineId = 'fyh_salon',
) {
  const [finance, appointment, customer, health] = await Promise.all([
    publishWorkforceFinanceContribution(engineId),
    publishAppointmentRosterRefresh(engineId),
    publishCustomerCapacitySignal(engineId),
    publishWorkforceHealthSelfCheck(engineId),
  ]);
  return { finance, appointment, customer, health };
}
