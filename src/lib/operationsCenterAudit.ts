import type { OpsPriority } from '@/src/lib/operationsCenterRules';

/** Canonical admin routes for Operations Center cards (audit-verified). */
export const OPERATIONS_CENTER_CARD_ROUTES = {
  pendingPayments: '/admin/operations/payment-reviews',
  pendingKyc: '/admin/residents/kyc',
  leavingSoon: '/admin/vacating',
  bedsReleasingSoon: '/admin/vacating',
  upcomingReservations: '/admin/bookings',
  refundsPending: '/admin/deposits',
  electricityPending: '/admin/billing?tab=electricity',
  ps4Renewals: '/admin/playstation',
} as const;

export const OPERATIONS_CENTER_EMPTY_MESSAGES = {
  pendingPayments: 'No payments awaiting approval',
  pendingKyc: 'No pending KYC reviews',
  leavingSoon: 'No residents filing notice',
  bedsReleasingSoon: 'No beds releasing in the next 30 days',
  upcomingReservations: 'No upcoming bed reservations',
  refundsPending: 'No deposit refunds pending',
  electricityPending: 'No outstanding electricity dues',
  ps4Renewals: 'No PS4 renewals needed this week',
} as const;

export type OpsTaskInput = {
  id: string;
  priority: OpsPriority;
  pgName: string;
  label: string;
  href: string;
};

/** Deduplicate tasks by stable id while preserving first occurrence order. */
export function dedupeOpsTasks(tasks: OpsTaskInput[]): OpsTaskInput[] {
  const seen = new Set<string>();
  const out: OpsTaskInput[] = [];
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    out.push(task);
  }
  return out;
}

/** Verify card counts always match item array lengths. */
export function verifyOperationsCenterCounts(data: {
  pendingPayments: { count: number; items: unknown[] };
  pendingKyc: { count: number; items: unknown[] };
  leavingSoon: { count: number; items: unknown[] };
  bedsReleasingSoon: { count: number; items: unknown[] };
  upcomingReservations: { count: number; items: unknown[] };
  refundsPending: { count: number; items: unknown[] };
  electricityPending: { count: number; items: unknown[] };
  ps4Renewals: { count: number; items: unknown[] };
  tasks: OpsTaskInput[];
}): string[] {
  const errors: string[] = [];
  const sections: Array<[string, { count: number; items: unknown[] }]> = [
    ['pendingPayments', data.pendingPayments],
    ['pendingKyc', data.pendingKyc],
    ['leavingSoon', data.leavingSoon],
    ['bedsReleasingSoon', data.bedsReleasingSoon],
    ['upcomingReservations', data.upcomingReservations],
    ['refundsPending', data.refundsPending],
    ['electricityPending', data.electricityPending],
    ['ps4Renewals', data.ps4Renewals],
  ];

  for (const [name, section] of sections) {
    if (section.count !== section.items.length) {
      errors.push(`${name}: count ${section.count} !== items.length ${section.items.length}`);
    }
  }

  const taskIds = data.tasks.map((t) => t.id);
  if (taskIds.length !== new Set(taskIds).size) {
    errors.push('tasks: duplicate task ids detected');
  }

  const allowedHrefs = new Set([
    ...Object.values(OPERATIONS_CENTER_CARD_ROUTES),
    ...data.refundsPending.items.map((_, i) => `/admin/deposits/${(data.refundsPending.items[i] as { bookingId?: string }).bookingId ?? ''}`),
  ]);

  for (const task of data.tasks) {
    if (!task.href.startsWith('/admin/')) {
      errors.push(`task ${task.id}: invalid href ${task.href}`);
    }
  }

  return errors;
}
