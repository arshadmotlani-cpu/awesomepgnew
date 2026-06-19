'use client';

import { BookingFlowStepper } from '@/src/components/customer/checkout/BookingFlowStepper';

export function BookingNewHeader() {
  return (
    <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <BookingFlowStepper activeStep="preview" />
    </div>
  );
}
