import type { TimelineStage } from '@/src/components/customer/design-system';

export type RequestCategoryId =
  | 'maintenance'
  | 'room_change'
  | 'complaint'
  | 'vacating'
  | 'deposit_refund'
  | 'deposit_extension'
  | 'bed_change'
  | 'visitor'
  | 'late_checkout'
  | 'early_move_in'
  | 'weekend_leave';

export type RequestCategory = {
  id: RequestCategoryId;
  title: string;
  description: string;
  confirmSentence: (ctx: { roomLabel?: string }) => string;
  whatsappMessage?: (details: string) => string;
  wired: 'whatsapp' | 'vacating' | 'deposit_refund' | 'deposit_extension';
  primaryVisible: boolean;
};

export const REQUEST_CATEGORIES: RequestCategory[] = [
  {
    id: 'maintenance',
    title: 'Fix something',
    description: 'AC, plumbing, furniture, or repairs in your room.',
    confirmSentence: () =>
      'You are sending a maintenance request. Our team will reply on WhatsApp shortly.',
    whatsappMessage: (d) =>
      `Hi, I need maintenance help at Awesome PG.${d ? ` Issue: ${d}` : ''}`,
    wired: 'whatsapp',
    primaryVisible: true,
  },
  {
    id: 'room_change',
    title: 'Change room',
    description: 'Move to another room in your PG.',
    confirmSentence: () =>
      'You are requesting a room change. We will message you on WhatsApp to confirm availability.',
    whatsappMessage: (d) =>
      `Hi, I would like to request a room change at Awesome PG.${d ? ` ${d}` : ''}`,
    wired: 'whatsapp',
    primaryVisible: true,
  },
  {
    id: 'complaint',
    title: 'Raise an issue',
    description: 'Problems with roommates or shared facilities.',
    confirmSentence: () =>
      'You are reporting an issue. We take these seriously and will respond on WhatsApp.',
    whatsappMessage: (d) =>
      `Hi, I would like to report an issue at Awesome PG.${d ? ` Details: ${d}` : ''}`,
    wired: 'whatsapp',
    primaryVisible: true,
  },
  {
    id: 'vacating',
    title: 'Request vacate',
    description: 'Choose your vacate date for admin approval.',
    confirmSentence: () =>
      'You will submit a vacate request. Deposit refund is a separate step after approval and your vacate date.',
    wired: 'vacating',
    primaryVisible: true,
  },
  {
    id: 'deposit_refund',
    title: 'Request deposit refund',
    description: 'Upload meter photo and QR after vacate is approved and your vacate date arrives.',
    confirmSentence: () =>
      'You are submitting deposit refund details. Admin will verify and send your refund.',
    wired: 'deposit_refund',
    primaryVisible: false,
  },
  {
    id: 'deposit_extension',
    title: 'More time for deposit',
    description: 'Ask for extra days to pay an outstanding deposit.',
    confirmSentence: () =>
      'You are asking for more time to pay your security deposit. Admin will review your date.',
    wired: 'deposit_extension',
    primaryVisible: false,
  },
  {
    id: 'bed_change',
    title: 'Change bed',
    description: 'Switch to a different bed in your room.',
    confirmSentence: () => 'You are requesting a bed change via WhatsApp.',
    whatsappMessage: (d) =>
      `Hi, I would like to request a bed change at Awesome PG.${d ? ` ${d}` : ''}`,
    wired: 'whatsapp',
    primaryVisible: false,
  },
  {
    id: 'visitor',
    title: 'Register a visitor',
    description: 'Let us know when a guest is coming.',
    confirmSentence: () => 'You are registering a visitor via WhatsApp.',
    whatsappMessage: (d) =>
      `Hi, I would like to register a visitor at Awesome PG.${d ? ` ${d}` : ''}`,
    wired: 'whatsapp',
    primaryVisible: false,
  },
  {
    id: 'late_checkout',
    title: 'Stay longer',
    description: 'Need extra days beyond your current plan.',
    confirmSentence: () => 'You are asking to stay longer. We will reply on WhatsApp.',
    whatsappMessage: (d) =>
      `Hi, I need help extending my stay at Awesome PG.${d ? ` ${d}` : ''}`,
    wired: 'whatsapp',
    primaryVisible: false,
  },
  {
    id: 'early_move_in',
    title: 'Move in early',
    description: 'Arrive before your booked check-in date.',
    confirmSentence: () => 'You are requesting an early move-in via WhatsApp.',
    whatsappMessage: (d) =>
      `Hi, I would like to request an early move-in at Awesome PG.${d ? ` ${d}` : ''}`,
    wired: 'whatsapp',
    primaryVisible: false,
  },
  {
    id: 'weekend_leave',
    title: 'Away for a few days',
    description: 'Register when you will be out of the PG.',
    confirmSentence: () => 'You are registering time away via WhatsApp.',
    whatsappMessage: (d) =>
      `Hi, I would like to register time away from Awesome PG.${d ? ` ${d}` : ''}`,
    wired: 'whatsapp',
    primaryVisible: false,
  },
];

export const REQUEST_TIMELINE_STAGES: TimelineStage[] = [
  { id: 'submitted', label: 'Submitted', description: 'We received your request' },
  { id: 'under_review', label: 'Under review', description: 'Office is reviewing details' },
  { id: 'approved', label: 'Approved', description: 'Approved — next steps in progress' },
  { id: 'completed', label: 'Completed', description: 'Everything is done' },
];

export const VACATING_TIMELINE_STAGES: TimelineStage[] = [
  { id: 'pending', label: 'Submitted', description: 'Move-out notice received' },
  { id: 'approved', label: 'Approved', description: 'Office approved your notice' },
  { id: 'completed', label: 'Completed', description: 'Move-out finished' },
];

export type ActiveRequestItem = {
  id: string;
  type: string;
  typeLabel: string;
  status: string;
  createdAt: Date | string;
  adminNotes?: string | null;
  isVacating?: boolean;
};

export function requestTypeLabel(type: string): string {
  if (type === 'deposit_refund') return 'Deposit refund';
  if (type === 'deposit_due_extension') return 'More time for deposit';
  if (type === 'stay_extension') return 'Stay extension';
  if (type === 'vacating') return 'Move-out notice';
  const cat = REQUEST_CATEGORIES.find((c) => c.id === type);
  return cat?.title ?? type.replace(/_/g, ' ');
}

export function requestStatusToTimelineIndex(status: string): number {
  if (status === 'rejected') return 1;
  if (status === 'submitted') return 0;
  if (status === 'under_review') return 1;
  if (status === 'approved') return 2;
  if (status === 'completed') return 3;
  if (status === 'pending') return 0;
  return 0;
}

export function nextStepForRequest(status: string, type: string): string {
  if (status === 'rejected') {
    return 'This request was declined. Message the office on WhatsApp if you need help.';
  }
  if (status === 'submitted') {
    return 'We received your request. You will hear back once the office starts reviewing it.';
  }
  if (status === 'under_review') {
    return 'The office is reviewing your request. No action needed from you right now.';
  }
  if (status === 'approved') {
    if (type === 'deposit_refund') {
      return 'Refund approved — we will send money to your UPI once processing finishes.';
    }
    return 'Approved — we are completing the next step. Watch this page for updates.';
  }
  if (status === 'completed') {
    return 'This request is complete. Nothing else is required from you.';
  }
  if (status === 'pending' && type === 'vacating') {
    return 'Waiting for the office to approve your move-out notice.';
  }
  return 'We will update this page when something changes.';
}

export function getCategoryById(id: RequestCategoryId): RequestCategory | undefined {
  return REQUEST_CATEGORIES.find((c) => c.id === id);
}
