'use client';

import { useEffect, useState } from 'react';
import {
  REMINDER_COPY,
  ROACHIE_REMINDER_EVENT,
  type RoachieReminderKind,
} from '@/src/lib/cockroach/roachieReminders';
import { isOnboardingComplete, isOnboardingSkipped } from '@/src/lib/cockroach/onboardingStorage';

export function RoachieReminder() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    function onReminder(event: Event) {
      if (!isOnboardingComplete() && !isOnboardingSkipped()) return;
      const kind = (event as CustomEvent<{ kind: RoachieReminderKind }>).detail?.kind;
      if (!kind || !REMINDER_COPY[kind]) return;
      setMessage(REMINDER_COPY[kind]);
    }

    window.addEventListener(ROACHIE_REMINDER_EVENT, onReminder);
    return () => window.removeEventListener(ROACHIE_REMINDER_EVENT, onReminder);
  }, []);

  if (!message) return null;

  return (
    <div
      className="roachie-reminder"
      role="status"
      data-cockroach-ignore
    >
      <p className="roachie-reminder__text">{message}</p>
      <button
        type="button"
        className="roachie-reminder__dismiss"
        onClick={() => setMessage(null)}
        aria-label="Dismiss tip"
      >
        Got it
      </button>
    </div>
  );
}
