/**
 * Workforce → Customer Brain bridge.
 * Customer Brain owns person/LTV SSOT; Workforce never stores customers.
 * Exposes service-capacity signals Customer Brain can correlate later.
 */
import { listBookableEmployees } from '@/src/workforce/services/appointmentsBridge';
import { publishEmployeeEvent } from '@/src/workforce/events/publish';
import type { WorkforceEngineId } from '@/src/workforce/types';

export type CustomerBrainServiceCapacity = {
  engineId: WorkforceEngineId;
  /** Employees who can take customer appointments */
  serviceCapacity: number;
  designations: Record<string, number>;
  asOf: string;
};

export async function getCustomerServiceCapacity(
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<CustomerBrainServiceCapacity> {
  const rows = await listBookableEmployees(engineId);
  const designations: Record<string, number> = {};
  for (const r of rows) {
    designations[r.jobRole] = (designations[r.jobRole] ?? 0) + 1;
  }
  return {
    engineId,
    serviceCapacity: rows.length,
    designations,
    asOf: new Date().toISOString(),
  };
}

export async function publishCustomerCapacitySignal(
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<CustomerBrainServiceCapacity> {
  const snapshot = await getCustomerServiceCapacity(engineId);
  await publishEmployeeEvent({
    eventType: 'employee.customer.capacity',
    engineId,
    payload: { ...snapshot, brain: 'customer' },
    sourceRef: 'workforce.connectors.customer',
  });
  return snapshot;
}
