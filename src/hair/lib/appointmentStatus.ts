import type { FyhAppointmentStatus } from '@/src/hair/db/schema/appointments';
import { FYH_APPOINTMENT_STATUSES } from '@/src/hair/db/schema/appointments';

/**
 * Luxury Forest–friendly status colors for calendar cards and chips.
 * Values are CSS color strings (hex) safe for inline styles / Tailwind arbitrary values.
 */
export const FYH_APPOINTMENT_STATUS_COLORS: Record<
  FyhAppointmentStatus,
  { bg: string; fg: string; border: string; label: string }
> = {
  booked: {
    bg: '#E8F1F8',
    fg: '#1E4A6E',
    border: '#7BA3C4',
    label: 'Booked',
  },
  confirmed: {
    bg: '#E6F4EF',
    fg: '#1B5E4A',
    border: '#5FA88A',
    label: 'Confirmed',
  },
  arrived: {
    bg: '#FBF3E0',
    fg: '#7A5A12',
    border: '#D4A84B',
    label: 'Arrived',
  },
  in_service: {
    bg: '#EEEAF6',
    fg: '#4A3A6B',
    border: '#9B87C0',
    label: 'In service',
  },
  completed: {
    bg: '#E7F2E9',
    fg: '#245C35',
    border: '#6BA87A',
    label: 'Completed',
  },
  cancelled: {
    bg: '#F3F1EF',
    fg: '#5C5652',
    border: '#B0A9A2',
    label: 'Cancelled',
  },
  no_show: {
    bg: '#F8EBE8',
    fg: '#8B3A2E',
    border: '#D08A7A',
    label: 'No show',
  },
  paid: {
    bg: '#E3F5EC',
    fg: '#0F5C3A',
    border: '#3D9B6E',
    label: 'Paid',
  },
};

/**
 * Allowed manual / engine status transitions.
 * `paid` is normally set by the invoice payment path after `completed`.
 * Terminal: cancelled, no_show, paid.
 */
export const FYH_APPOINTMENT_STATUS_TRANSITIONS: Record<
  FyhAppointmentStatus,
  readonly FyhAppointmentStatus[]
> = {
  booked: ['confirmed', 'arrived', 'cancelled', 'no_show'],
  confirmed: ['arrived', 'cancelled', 'no_show'],
  arrived: ['in_service', 'cancelled', 'no_show'],
  in_service: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
  paid: [],
};

/** Statuses that still occupy a live calendar slot (movable / conflict-relevant). */
const ACTIVE_CALENDAR_STATUSES: readonly FyhAppointmentStatus[] = [
  'booked',
  'confirmed',
  'arrived',
  'in_service',
];

/** Terminal / finished — do not block rebooking of the same stylist/chair slot. */
const NON_OCCUPYING_STATUSES: readonly FyhAppointmentStatus[] = [
  'cancelled',
  'no_show',
  'completed',
  'paid',
];

/** Statuses allowed to create an invoice (checkout). */
export const CHECKOUT_ALLOWED_STATUSES: readonly FyhAppointmentStatus[] = [
  'arrived',
  'in_service',
  'completed',
];

export function isFyhAppointmentStatus(value: string): value is FyhAppointmentStatus {
  return (FYH_APPOINTMENT_STATUSES as readonly string[]).includes(value);
}

export function isActiveCalendarStatus(status: FyhAppointmentStatus): boolean {
  return (ACTIVE_CALENDAR_STATUSES as readonly string[]).includes(status);
}

/** Whether this appointment still occupies a bookable slot for conflict checks. */
export function occupiesBookableSlot(status: FyhAppointmentStatus): boolean {
  return !(NON_OCCUPYING_STATUSES as readonly string[]).includes(status);
}

export function isCheckoutAllowedStatus(status: FyhAppointmentStatus): boolean {
  return (CHECKOUT_ALLOWED_STATUSES as readonly string[]).includes(status);
}

export function canTransitionAppointmentStatus(
  from: FyhAppointmentStatus,
  to: FyhAppointmentStatus,
): boolean {
  if (from === to) return true;
  return FYH_APPOINTMENT_STATUS_TRANSITIONS[from].includes(to);
}

/** @deprecated Prefer canTransitionAppointmentStatus */
export const canTransitionFyhAppointmentStatus = canTransitionAppointmentStatus;

export function assertAppointmentStatusTransition(
  from: FyhAppointmentStatus,
  to: FyhAppointmentStatus,
): void {
  if (!canTransitionAppointmentStatus(from, to)) {
    throw new Error(`Invalid appointment status transition: ${from} → ${to}`);
  }
}

export function getAppointmentStatusColor(status: FyhAppointmentStatus) {
  return FYH_APPOINTMENT_STATUS_COLORS[status];
}

export function getAllowedAppointmentStatusTransitions(
  status: FyhAppointmentStatus,
): readonly FyhAppointmentStatus[] {
  return FYH_APPOINTMENT_STATUS_TRANSITIONS[status];
}
