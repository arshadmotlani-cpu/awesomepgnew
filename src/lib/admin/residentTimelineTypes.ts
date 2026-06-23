export type ResidentTimelineEventKind =
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'status_changed'
  | 'created_settlement'
  | 'created_refund'
  | 'uploaded_document'
  | 'linked_upload'
  | 'created_action_item'
  | 'notification_sent'
  | 'booking_created';

export type ResidentTimelineEvent = {
  id: string;
  kind: ResidentTimelineEventKind;
  label: string;
  status: string;
  recordId: string;
  sourceTable: string;
  timestamp: Date;
  bookingId: string | null;
  bookingCode: string | null;
  detail: string | null;
  adminHref: string | null;
};

export type ResidentTimelineSubject = {
  customerId: string;
  customerName: string;
  phone: string | null;
  email: string | null;
  bookingId: string | null;
  bookingCode: string | null;
  bookingStatus: string | null;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
};

export type ResidentTimelineMatch = ResidentTimelineSubject;

export type ResidentTimelineResult = {
  subject: ResidentTimelineSubject;
  events: ResidentTimelineEvent[];
  nextAction: string;
  blockedReason: string | null;
  existsSummary: string;
};
