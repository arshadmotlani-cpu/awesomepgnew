/**
 * ROOM_OS_OPERATIONS_QUEUE — Operations Centre data source switch.
 * Off by default until Shantinagar certification is accepted for cutover.
 */
export function isRoomOsOperationsQueueEnabled(): boolean {
  const raw = process.env.ROOM_OS_OPERATIONS_QUEUE;
  if (raw === undefined || raw === '') return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on';
}

/**
 * ROOM_OS_BILLING_CENTRE — Billing Centre collections via Room OS work queue.
 * Off by default; enable after Wave 3 parity audit.
 */
export function isRoomOsBillingCentreEnabled(): boolean {
  const raw = process.env.ROOM_OS_BILLING_CENTRE;
  if (raw === undefined || raw === '') return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on';
}
