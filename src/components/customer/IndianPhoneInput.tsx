'use client';

import { indianLocalFromE164 } from '@/src/lib/phone';

type Props = {
  /** 10-digit local mobile (6–9 prefix). */
  value: string;
  onChange: (localDigits: string) => void;
  name?: string;
  id?: string;
  required?: boolean;
  readOnly?: boolean;
  autoComplete?: string;
  className?: string;
};

const PREFIX = '+91';

/**
 * India-only phone field: fixed +91 prefix, user types 10 digits only.
 * Form `name` submits the local digits; server normalises to E.164.
 */
export function IndianPhoneInput({
  value,
  onChange,
  name = 'phone',
  id,
  required,
  readOnly,
  autoComplete = 'tel',
  className = '',
}: Props) {
  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 10);
    onChange(digits);
  }

  return (
    <div
      className={
        `flex overflow-hidden rounded-md border border-zinc-300 bg-white shadow-sm transition-[border-color,box-shadow] scheme-light focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-500/30 ${readOnly ? 'bg-zinc-50' : ''} ${className}`
      }
    >
      <span
        className="flex shrink-0 items-center border-r border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm font-semibold text-zinc-800"
        aria-hidden
      >
        {PREFIX}
      </span>
      <input
        id={id}
        type="tel"
        name={name}
        inputMode="numeric"
        autoComplete={autoComplete}
        required={required}
        readOnly={readOnly}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="9876543210"
        pattern="[6-9][0-9]{9}"
        minLength={10}
        maxLength={10}
        title="Enter your 10-digit mobile number"
        className={`apg-field-input min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-base text-zinc-900 shadow-none placeholder:text-zinc-400 caret-indigo-600 focus:outline-none focus:ring-0 disabled:text-zinc-600${readOnly ? ' cursor-default' : ''}`}
      />
    </div>
  );
}

/** Build initial 10-digit state from a stored E.164 `+91…` value. */
export function indianPhoneDefaultLocal(e164: string | undefined): string {
  if (!e164) return '';
  return indianLocalFromE164(e164) ?? '';
}
