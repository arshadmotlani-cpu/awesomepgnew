/** Stub domain event — full event plane wiring in Owner OS Phase. */

export type SalonPurchaseRecordedEvent = {
  engineId: 'fyh_salon';
  eventType: 'salon.purchase.recorded';
  purchaseId: string;
  vendorId: string;
  totalPaise: number;
  purchaseDate: string;
  occurredAt: string;
};

export function buildPurchaseRecordedEvent(input: {
  purchaseId: string;
  vendorId: string;
  totalPaise: number;
  purchaseDate: string;
}): SalonPurchaseRecordedEvent {
  return {
    engineId: 'fyh_salon',
    eventType: 'salon.purchase.recorded',
    purchaseId: input.purchaseId,
    vendorId: input.vendorId,
    totalPaise: input.totalPaise,
    purchaseDate: input.purchaseDate,
    occurredAt: new Date().toISOString(),
  };
}

/** Phase 2 stub — log + return payload for future outbox subscriber. */
export function emitPurchaseRecordedEvent(event: SalonPurchaseRecordedEvent): SalonPurchaseRecordedEvent {
  if (process.env.NODE_ENV !== 'test') {
    console.info('[fyh] salon.purchase.recorded', {
      purchaseId: event.purchaseId,
      vendorId: event.vendorId,
      totalPaise: event.totalPaise,
    });
  }
  return event;
}
