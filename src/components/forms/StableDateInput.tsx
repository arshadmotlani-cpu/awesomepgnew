'use client';

import type { InputHTMLAttributes } from 'react';
import { appTodayIso } from '@/src/lib/dates/appTodayIso';

type StableDateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'defaultValue'> & {
  /** YYYY-MM-DD in business timezone. Defaults to app-local today. */
  defaultDateIso?: string;
};

/** Date input that avoids UTC `toISOString()` hydration mismatches. */
export function StableDateInput({
  defaultDateIso,
  className,
  ...props
}: StableDateInputProps) {
  const value = defaultDateIso ?? appTodayIso();
  return (
    <input
      type="date"
      defaultValue={value}
      className={className}
      suppressHydrationWarning
      {...props}
    />
  );
}
