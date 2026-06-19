'use client';

import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';
import { formatDate } from '@/src/lib/format';
import type { CustomerEmailNotification } from '@/src/db/queries/customerNotifications';

type Props = {
  email?: string | null;
  notifications: CustomerEmailNotification[];
};

const KIND_ICON: Record<string, string> = {
  rent_reminder: '💳',
  electricity_reminder: '⚡',
  booking_confirmation: '🛏️',
  kyc: '🪪',
  vacating: '📦',
  payment_receipt: '✅',
};

function iconForKind(kind: string): string {
  for (const [key, icon] of Object.entries(KIND_ICON)) {
    if (kind.includes(key)) return icon;
  }
  return '📧';
}

export function NotificationCenterPanel({ email, notifications }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-apg-silver">
        Updates for{' '}
        <span className="font-medium text-white">{email ?? 'your registered email'}</span>.
        {notifications.length === 0
          ? ' No delivery log entries yet — they appear here when emails are sent.'
          : null}
      </p>
      {notifications.length > 0 ? (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <ApgCard tier="account" className="flex gap-3 p-4">
                <span className="text-xl" aria-hidden>
                  {iconForKind(n.notificationKind)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900">{n.subject}</p>
                    <StatusChip
                      status={n.status}
                      toneMap={{
                        sent: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
                        failed: 'bg-rose-50 text-rose-700 ring-rose-200',
                        skipped: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {n.notificationKind.replace(/_/g, ' ')} · {formatDate(n.createdAt)}
                  </p>
                </div>
              </ApgCard>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
