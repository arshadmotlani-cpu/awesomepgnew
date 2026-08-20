'use client';

import { useState } from 'react';

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  confirmMessage: string;
  label: string;
  className?: string;
  hiddenFields?: Record<string, string>;
};

export function ConfirmSubmitButton({
  action,
  confirmMessage,
  label,
  className = 'plt-btn-danger',
  hiddenFields = {},
}: Props) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <span className="text-xs text-[var(--plt-text-muted)]">{confirmMessage}</span>
      <button type="submit" className={className}>{label}</button>
      <button
        type="button"
        className="plt-btn-secondary text-xs py-1"
        onClick={() => setArmed(false)}
      >
        Cancel
      </button>
    </form>
  );
}
