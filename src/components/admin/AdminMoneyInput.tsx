'use client';

import type { InputHTMLAttributes } from 'react';
import { sanitizeRupeeInput } from '@/src/lib/admin/moneyInput';

export const adminMoneyInputClassName = 'apg-admin-money-input tabular-nums';

function preventWheelChange(event: React.WheelEvent<HTMLInputElement>) {
  event.preventDefault();
}

/** Props for uncontrolled native `<input>` currency fields in admin forms. */
export function bindAdminMoneyInput(opts?: {
  allowDecimal?: boolean;
}): Pick<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'inputMode' | 'autoComplete' | 'onChange' | 'onWheel'
> {
  return {
    type: 'text',
    inputMode: opts?.allowDecimal ? 'decimal' : 'numeric',
    autoComplete: 'off',
    onChange: (event) => {
      event.currentTarget.value = sanitizeRupeeInput(event.currentTarget.value, opts);
    },
    onWheel: preventWheelChange,
  };
}

type AdminMoneyInputProps = {
  value: string;
  onChange: (value: string) => void;
  showPrefix?: boolean;
  className?: string;
  disabled?: boolean;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode' | 'autoComplete' | 'onWheel'
>;

export function AdminMoneyInput({
  value,
  onChange,
  showPrefix = true,
  className = '',
  disabled,
  ...rest
}: AdminMoneyInputProps) {
  return (
    <div className="relative">
      {showPrefix ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-apg-silver">
          ₹
        </span>
      ) : null}
      <input
        {...rest}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(sanitizeRupeeInput(event.target.value))}
        onWheel={preventWheelChange}
        className={`${adminMoneyInputClassName} w-full rounded-lg border border-white/10 bg-[#0f1318] py-2 text-sm text-white ${
          showPrefix ? 'pl-7 pr-3' : 'px-3'
        } ${className}`.trim()}
      />
    </div>
  );
}

export function AdminMoneyField({
  label,
  value,
  onChange,
  className,
  inputClassName,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`block text-xs text-apg-silver ${className ?? ''}`.trim()}>
      {label}
      <div className="mt-1">
        <AdminMoneyInput
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={inputClassName}
        />
      </div>
    </label>
  );
}
