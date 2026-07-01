import type { TimelineStage } from '@/src/components/customer/design-system';

/** V2 primary request categories — five only. */
export type RequestCategoryId =
  | 'maintenance'
  | 'room_change'
  | 'move_out'
  | 'complaint'
  | 'support';

/** Legacy ids mapped at runtime. */
export type LegacyRequestCategoryId =
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
  wired: 'whatsapp' | 'move_out' | 'room_change';
  primaryVisible: boolean;
};

export const REQUEST_CATEGORIES: RequestCategory[] = [
  {
    id: 'maintenance',
    title: 'Maintenance',
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
    title: 'Room Change',
    description: 'Move to another available bed in your PG with automatic pricing.',
    confirmSentence: () =>
      'You are requesting a room change. Review the quote before submitting.',
    wired: 'room_change',
    primaryVisible: true,
  },
  {
    id: 'move_out',
    title: 'Move-out',
    description: 'Submit your move-out notice and track deposit refund steps.',
    confirmSentence: () =>
      'You will submit a move-out request. Deposit refund is handled from Profile → Wallet after approval.',
    wired: 'move_out',
    primaryVisible: true,
  },
  {
    id: 'complaint',
    title: 'Complaint',
    description: 'Problems with roommates or shared facilities.',
    confirmSentence: () =>
      'You are reporting an issue. We take these seriously and will respond on WhatsApp.',
    whatsappMessage: (d) =>
      `Hi, I would like to report an issue at Awesome PG.${d ? ` Details: ${d}` : ''}`,
    wired: 'whatsapp',
    primaryVisible: true,
  },
  {
    id: 'support',
    title: 'Support',
    description: 'General help — billing questions, PS4, or anything else.',
    confirmSentence: () => 'Reach our team on WhatsApp or ask the AI Concierge.',
    whatsappMessage: (d) =>
      `Hi, I need help at Awesome PG.${d ? ` ${d}` : ''}`,
    wired: 'whatsapp',
    primaryVisible: true,
  },
];

export function normalizeRequestCategoryId(
  value: string | null | undefined,
): RequestCategoryId | null {
  if (!value) return null;
  if (value === 'vacating') return 'move_out';
  if (REQUEST_CATEGORIES.some((c) => c.id === value)) return value as RequestCategoryId;
  return null;
}

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
  if (type === 'vacating' || type === 'move_out') return 'Move-out notice';
  if (type === 'room_change') return 'Room change';
  if (type === 'deposit_refund') return 'Deposit refund';
  if (type === 'deposit_due_extension') return 'More time for deposit';
  if (type === 'stay_extension') return 'Stay extension';
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
    if (type === 'room_change') {
      return 'Approved — pay any shift charges from Payments → Bills Due.';
    }
    return 'Approved — we are completing the next step. Watch this page for updates.';
  }
  if (status === 'completed') {
    return 'This request is complete. Nothing else is required from you.';
  }
  if (status === 'pending' && (type === 'vacating' || type === 'move_out')) {
    return 'Waiting for the office to approve your move-out notice.';
  }
  return 'We will update this page when something changes.';
}

export function getCategoryById(id: RequestCategoryId): RequestCategory | undefined {
  return REQUEST_CATEGORIES.find((c) => c.id === id);
}

export function isRequestCategoryId(value: string | null | undefined): value is RequestCategoryId {
  if (!value) return false;
  return normalizeRequestCategoryId(value) != null;
}
