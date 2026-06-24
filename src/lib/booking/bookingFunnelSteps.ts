import type { TimelineStage } from '@/src/components/customer/design-system';

export const BOOKING_FUNNEL_STEPS: TimelineStage[] = [
  { id: 'pg', label: 'PG' },
  { id: 'room', label: 'Room' },
  { id: 'bed', label: 'Bed' },
  { id: 'preview', label: 'Dates' },
  { id: 'payment', label: 'Payment' },
  { id: 'confirmation', label: 'Done' },
];

export type BookingFunnelStepId =
  | 'pg'
  | 'room'
  | 'bed'
  | 'preview'
  | 'payment'
  | 'confirmation';

const stepIndex: Record<BookingFunnelStepId, number> = {
  pg: 0,
  room: 1,
  bed: 2,
  preview: 3,
  payment: 4,
  confirmation: 5,
};

export function bookingFunnelStepIndex(step: BookingFunnelStepId): number {
  return stepIndex[step];
}
