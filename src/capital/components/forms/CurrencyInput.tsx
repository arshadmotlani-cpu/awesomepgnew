'use client';

import * as React from 'react';
import { Input, type InputProps } from '@/src/capital/components/ui/input';
import {
  formatRupeesIndian,
  tryParseIndianRupeesInput,
} from '@/src/capital/lib/money';

export type CurrencyInputProps = Omit<
  InputProps,
  'type' | 'value' | 'defaultValue' | 'onChange'
> & {
  /** Rupee amount (not paise). Empty string when blank. */
  value?: number | '' | null;
  onValueChange?: (value: number | undefined) => void;
  /** Also fire native change with plain numeric string for FormData / RHF. */
  name?: string;
  allowNegative?: boolean;
};

/**
 * Indian-formatted currency input (₹4,17,300). Stores numeric rupees via onValueChange
 * and a hidden-compatible plain value through the named input when used in forms.
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput(
    {
      value,
      onValueChange,
      onBlur,
      name,
      allowNegative = true,
      className,
      ...props
    },
    ref,
  ) {
    const numeric =
      value === '' || value == null || !Number.isFinite(Number(value))
        ? undefined
        : Number(value);

    const [text, setText] = React.useState(() =>
      numeric == null ? '' : formatRupeesIndian(numeric),
    );
    const [focused, setFocused] = React.useState(false);

    React.useEffect(() => {
      if (focused) return;
      setText(numeric == null ? '' : formatRupeesIndian(numeric));
    }, [numeric, focused]);

    function commit(raw: string) {
      const parsed = tryParseIndianRupeesInput(raw);
      if (parsed == null) {
        onValueChange?.(undefined);
        setText('');
        return;
      }
      if (!allowNegative && parsed < 0) {
        onValueChange?.(undefined);
        setText('');
        return;
      }
      onValueChange?.(parsed);
      setText(formatRupeesIndian(parsed));
    }

    return (
      <>
        {name ? (
          <input
            type="hidden"
            name={name}
            value={numeric == null ? '' : String(numeric)}
            readOnly
          />
        ) : null}
        <Input
          {...props}
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={className}
          value={text}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onChange={(e) => {
            const raw = e.target.value;
            // Allow intermediate typing (digits, commas, one dot, optional minus)
            if (raw !== '' && !/^-?[\d,]*\.?\d{0,2}$/.test(raw.replace(/₹/g, ''))) {
              return;
            }
            setText(raw);
            const parsed = tryParseIndianRupeesInput(raw);
            if (raw.trim() === '') {
              onValueChange?.(undefined);
            } else if (parsed != null && (allowNegative || parsed >= 0)) {
              onValueChange?.(parsed);
            }
          }}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
            onBlur?.(e);
          }}
        />
      </>
    );
  },
);
