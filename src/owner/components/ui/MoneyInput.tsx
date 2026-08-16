'use client';

import { useCallback, useState } from 'react';
import { formatInrAmount, parseInrAmountInput } from '@/src/lib/format';

type MoneyInputProps = {
  name: string;
  defaultValue?: number;
  required?: boolean;
  placeholder?: string;
  className?: string;
  label?: string;
  hint?: string;
};

export function MoneyInput({
  name,
  defaultValue = 0,
  required,
  placeholder = '0',
  className = 'oo-form-input oo-form-input-money',
  label,
  hint,
}: MoneyInputProps) {
  const [rupees, setRupees] = useState(defaultValue);
  const [display, setDisplay] = useState(
    defaultValue > 0 ? formatInrAmount(defaultValue) : '',
  );

  const handleBlur = useCallback(() => {
    const parsed = parseInrAmountInput(display);
    setRupees(parsed);
    if (parsed !== 0 || display.trim() !== '') {
      setDisplay(formatInrAmount(parsed));
    } else {
      setDisplay('');
    }
  }, [display]);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  return (
    <div className="oo-form-field">
      {label ? <label className="oo-form-label">{label}</label> : null}
      <input type="hidden" name={name} value={rupees} />
      <input
        type="text"
        inputMode="decimal"
        className={className}
        value={display}
        onChange={(e) => setDisplay(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required && rupees <= 0}
        aria-required={required}
      />
      {hint ? <p className="oo-form-hint">{hint}</p> : null}
    </div>
  );
}
