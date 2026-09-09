'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert } from 'lucide-react';

type Props = {
  messages: string[];
  onDismiss: () => void;
  autoDismissMs?: number;
};

export function QuickSaleValidationToasts({
  messages,
  onDismiss,
  autoDismissMs = 5000,
}: Props) {
  useEffect(() => {
    if (messages.length === 0) return;
    const t = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(t);
  }, [messages, onDismiss, autoDismissMs]);

  if (messages.length === 0) return null;

  return createPortal(
    <div
      className="qs-validation-toasts fixed right-4 top-4 z-[150] flex max-w-sm flex-col gap-2"
      role="alert"
      aria-live="assertive"
    >
      {messages.map((message) => (
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
