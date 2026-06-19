'use client';

import { StatusTimeline, type TimelineStage } from '@/src/components/customer/design-system';

export const BOOKING_FLOW_STEPS: TimelineStage[] = [
  { id: 'pg', label: 'Choose PG' },
  { id: 'room', label: 'Choose room' },
  { id: 'bed', label: 'Choose bed' },
  { id: 'preview', label: 'Preview stay' },
  { id: 'confirm', label: 'Confirm & pay' },
];

export type BookingFlowStepId = 'pg' | 'room' | 'bed' | 'preview' | 'confirm';

const stepIndex: Record<BookingFlowStepId, number> = {
  pg: 0,
  room: 1,
  bed: 2,
  preview: 3,
  confirm: 4,
};

export function BookingFlowStepper({ activeStep = 'preview' }: { activeStep?: BookingFlowStepId }) {
  return (
    <StatusTimeline
      stages={BOOKING_FLOW_STEPS}
      activeIndex={stepIndex[activeStep]}
      orientation="horizontal"
    />
  );
}
