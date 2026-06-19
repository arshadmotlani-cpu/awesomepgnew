'use client';

import { BookingFlowStepper } from '@/src/components/customer/checkout/BookingFlowStepper';

export function BookingNewHeader() {
  return (
    <div className="mb-6 apg-glass rounded-xl p-4">
      <BookingFlowStepper activeStep="preview" />
    </div>
  );
}
