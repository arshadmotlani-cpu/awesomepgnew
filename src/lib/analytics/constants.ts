export const VISITOR_SESSION_COOKIE = 'apg_visitor_session';

/** Sessions with activity within this window count as "live". */
export const LIVE_VISITOR_WINDOW_MS = 5 * 60 * 1000;

export const TRAFFIC_SOURCES = [
  'direct',
  'google',
  'instagram',
  'facebook',
  'whatsapp',
  'other',
] as const;

export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];

export const DEVICE_TYPES = ['mobile', 'desktop', 'tablet'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const FUNNEL_STEPS = [
  { key: 'visitors', label: 'Visitors' },
  { key: 'room_viewed', label: 'Room Viewed' },
  { key: 'bed_selected', label: 'Bed Selected' },
  { key: 'booking_started', label: 'Booking Started' },
  { key: 'payment_completed', label: 'Payment Completed' },
  { key: 'kyc_submitted', label: 'KYC Submitted' },
  { key: 'check_in_completed', label: 'Check-In Completed' },
] as const;
