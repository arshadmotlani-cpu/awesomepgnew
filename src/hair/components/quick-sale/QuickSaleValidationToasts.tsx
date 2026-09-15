'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert } from 'lucide-react';
import type { StaffRequiredCheckoutAlert } from '@/src/hair/domain/basket/staffRequired';

type Props = {
  messages: string[];
  staffAlert?: StaffRequiredCheckoutAlert | null;
  onDismiss: () => void;
  autoDismissMs?: number;
};

export function QuickSaleValidationToasts({
  messages,
  staffAlert = null,
  onDismiss,
  autoDismissMs = 5000,
}: Props) {
  const genericMessages = staffAlert
    ? messages.filter((m) => !m.includes('Staff member is required for:'))
    : messages;

  useEffect(() => {
    if (genericMessages.length === 0 && !staffAlert) return;
    if (staffAlert) return;
    const t = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(t);
  }, [genericMessages, staffAlert, onDismiss, autoDismissMs]);

  if (genericMessages.length === 0 && !staffAlert) return null;

  return createPortal(
    <div
      className="qs-validation-toasts fixed right-4 top-4 z-[150] flex max-w-sm flex-col gap-2"
      role="alert"
      aria-live="assertive"
    >
      {staffAlert ? (
        <div
          className="rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-lg"
          data-testid="qs-staff-required-alert"
        >
          <p className="font-semibold">{staffAlert.title}</p>
          <p className="mt-1 text-red-50">Staff member is required for:</p>
          <ul className="mt-1 list-none space-y-0.5 pl-0">
            {staffAlert.lineNames.map((name) => (
              <li key={name}>• {name}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-red-100">{staffAlert.intro}</p>
          <button
            type="button"
            className="mt-2 text-xs underline text-white/90"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {genericMessages.map((message) => (
        <div
          key={message}
          className="flex items-start gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{message}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
