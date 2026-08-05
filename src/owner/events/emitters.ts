/**
 * Owner OS event emitters — fire-and-forget enqueue to oo_event_inbox.
 * Dashboard numbers refresh from live Brain APIs; events are activity signals only.
 */
import { enqueueOwnerOsEvent } from '@/src/owner/events/consumers';
import { hasOwnerDatabaseUrl } from '@/src/owner/lib/db/env';

function emitSafe(
  input: Parameters<typeof enqueueOwnerOsEvent>[0],
  logLabel: string,
): void {
  if (!hasOwnerDatabaseUrl()) return;
  void enqueueOwnerOsEvent(input).catch((err) => {
    console.error(`[owner-os] ${logLabel} enqueue failed`, err);
  });
}

export function emitRentPaidEvent(payload: {
  bookingId: string;
  paymentId: string;
  amountPaise: number;
  bookingCode?: string;
}): void {
  emitSafe(
    {
      eventType: 'rent.paid',
      sourceEngine: 'awesome_pg',
      sourceBrain: 'personal_finance',
      payload,
    },
    'rent.paid',
  );
}

export function emitDepositCollectedEvent(payload: {
  bookingId: string;
  paymentId: string;
  depositPaise: number;
}): void {
  emitSafe(
    {
      eventType: 'deposit.collected',
      sourceEngine: 'awesome_pg',
      sourceBrain: 'personal_finance',
      payload,
    },
    'deposit.collected',
  );
}

export function emitSalonInvoicePaidEvent(payload: {
  invoiceId: string;
  amountPaise: number;
  customerId?: string;
}): void {
  emitSafe(
    {
      eventType: 'salon.invoice.paid',
      sourceEngine: 'fyh_salon',
      sourceBrain: 'personal_finance',
      payload,
    },
    'salon.invoice.paid',
  );
}

export function emitVehicleSoldEvent(payload: {
  assetId: string;
  salePricePaise: number;
  saleDate: string;
}): void {
  emitSafe(
    {
      eventType: 'vehicle.sold',
      sourceEngine: 'automotive_capital',
      sourceBrain: 'personal_finance',
      payload,
    },
    'vehicle.sold',
  );
}

export function emitVehicleCostRecordedEvent(payload: {
  assetId: string;
  activityId: string;
  activityType: string;
  amountPaise: number;
}): void {
  emitSafe(
    {
      eventType: 'vehicle.cost.recorded',
      sourceEngine: 'automotive_capital',
      sourceBrain: 'personal_finance',
      payload,
    },
    'vehicle.cost.recorded',
  );
}

export function emitWorkforceFinanceContributionEvent(
  payload: Record<string, unknown>,
): void {
  emitSafe(
    {
      eventType: 'employee.finance.contribution',
      sourceEngine: 'workforce',
      sourceBrain: 'personal_finance',
      payload,
    },
    'employee.finance.contribution',
  );
}
