'use client';

import { StatusTimeline } from '@/src/components/customer/design-system';
import {
  BOOKING_FUNNEL_STEPS,
  bookingFunnelStepIndex,
  type BookingFunnelStepId,
} from '@/src/lib/booking/bookingFunnelSteps';

export function BookingFunnelProgressBar({
  activeStep = 'pg',
}: {
  activeStep?: BookingFunnelStepId;
}) {
  return (
    <StatusTimeline
      stages={BOOKING_FUNNEL_STEPS}
      activeIndex={bookingFunnelStepIndex(activeStep)}
      orientation="horizontal"
    />
  );
}

/** @deprecated Use BookingFunnelProgressBar */
export { BookingFunnelProgressBar as BookingFlowStepper };
export type { BookingFunnelStepId as BookingFlowStepId };
