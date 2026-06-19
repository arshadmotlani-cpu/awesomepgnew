'use client';

import { ApgCard } from '@/src/components/customer/design-system';

type Props = {
  email?: string | null;
};

const NOTIFICATION_CATEGORIES = [
  {
    type: 'payment',
    title: 'Payment updates',
    description: 'Rent, electricity, and deposit receipts are sent to your email when processed.',
    icon: '💳',
  },
  {
    type: 'kyc',
    title: 'KYC & verification',
    description: 'Approval or resubmission requests arrive by email.',
    icon: '🪪',
  },
  {
    type: 'vacating',
    title: 'Vacating & refunds',
    description: 'Notice approval and refund status updates via email.',
    icon: '📦',
  },
  {
    type: 'booking',
    title: 'Booking & check-in',
    description: 'Booking confirmations and check-in reminders.',
    icon: '🛏️',
  },
];

export function NotificationCenterPanel({ email }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-apg-silver">
        In-app notification center is rolling out. Today, updates go to{' '}
        <span className="font-medium text-white">{email ?? 'your registered email'}</span>.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {NOTIFICATION_CATEGORIES.map((cat) => (
          <ApgCard key={cat.type} tier="account" className="p-4">
            <div className="flex gap-3">
              <span className="text-2xl" aria-hidden>
                {cat.icon}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">{cat.title}</h3>
                <p className="mt-1 text-xs text-zinc-600">{cat.description}</p>
              </div>
            </div>
          </ApgCard>
        ))}
      </div>
    </div>
  );
}
