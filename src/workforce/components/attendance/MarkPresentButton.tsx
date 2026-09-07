'use client';

import { useState, useTransition } from 'react';
import { markPresentAction } from '@/src/workforce/actions/attendance';

type Props = {
  disabled?: boolean;
  alreadyMarked?: boolean;
};

export function MarkPresentButton({ disabled, alreadyMarked }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [locationHint, setLocationHint] = useState('Checking office location…');
  const [insideOffice, setInsideOffice] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  if (alreadyMarked) {
    return (
      <p className="text-sm font-medium text-emerald-400">
        ✓ Present — attendance locked for today
      </p>
    );
  }

  function requestLocationAndMark() {
    setMessage(null);
    if (!navigator.geolocation) {
      setMessage(
        'Location access is required to mark attendance. Please allow location access and try again.',
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setInsideOffice(true);
        setLocationHint("✓ You're at the office");
        startTransition(async () => {
          const result = await markPresentAction({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMetres: pos.coords.accuracy,
          });
          if (result.error) {
            setMessage(result.error);
            if (result.error.includes('not at the office')) setInsideOffice(false);
          } else {
            setMessage(result.success ?? 'Present marked.');
            window.location.reload();
          }
        });
      },
      () => {
        setInsideOffice(false);
        setLocationHint('Location unavailable');
        setMessage(
          'Location access is required to mark attendance. Please allow location access and try again.',
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-fyh-text-secondary">Location: {locationHint}</p>
      {insideOffice === false ? (
        <p className="text-sm text-amber-300">
          You are not at the office location. Please reach your office and try again.
        </p>
      ) : null}
      <button
        type="button"
        disabled={disabled || pending}
        onClick={requestLocationAndMark}
        className="rounded-lg bg-fyh-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
      >
        {pending ? 'Marking…' : 'Mark Present'}
      </button>
      {message ? <p className="text-sm text-fyh-text-secondary">{message}</p> : null}
    </div>
  );
}
