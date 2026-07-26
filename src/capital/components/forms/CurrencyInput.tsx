'use client';

import * as React from 'react';
import { Input, type InputProps } from '@/src/capital/components/ui/input';
import {
  caretAfterIndianFormat,
  countDigitsBefore,
  formatRupeesIndian,
  normalizeIndianRupeesTyping,
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
  /** Allow paise (up to 2 decimal places). Default false — whole rupees / digits only. */
  allowDecimal?: boolean;
};

/**
 * Indian-formatted currency input (₹9,60,000).
 * Displays grouped digits while typing; stores/submits plain numeric rupees.
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput(
    {
      value,
      onValueChange,
      onBlur,
      name,
      allowNegative = true,
      allowDecimal = false,
      className,
      ...props
    },
    ref,
  ) {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const numeric =
      value === '' || value == null || !Number.isFinite(Number(value))
        ? undefined
        : Number(value);

    const [text, setText] = React.useState(() =>
      numeric == null ? '' : formatRupeesIndian(numeric),
    );
    const [focused, setFocused] = React.useState(false);
    const pendingCaret = React.useRef<number | null>(null);

    React.useEffect(() => {
      if (focused) return;
      setText(numeric == null ? '' : formatRupeesIndian(numeric));
    }, [numeric, focused]);

    React.useLayoutEffect(() => {
      if (pendingCaret.current == null || !inputRef.current) return;
      const pos = pendingCaret.current;
      pendingCaret.current = null;
      inputRef.current.setSelectionRange(pos, pos);
    }, [text]);

    function applyTyping(raw: string, caretInRaw: number) {
      const digitsBefore = countDigitsBefore(raw, caretInRaw);
      const { text: next, value: parsed } = normalizeIndianRupeesTyping(raw, {
        allowNegative,
        allowDecimal,
      });
      pendingCaret.current = caretAfterIndianFormat(next, digitsBefore);
      setText(next);
      if (raw.trim() === '' || next === '' || next === '-') {
        onValueChange?.(undefined);
      } else if (parsed != null && (allowNegative || parsed >= 0)) {
        onValueChange?.(parsed);
      }
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
          ref={setRefs}
          type="text"
          inputMode={allowDecimal ? 'decimal' : 'numeric'}
          autoComplete="off"
          className={className}
          value={text}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onKeyDown={(e) => {
            props.onKeyDown?.(e);
            if (e.defaultPrevented) return;
            const el = e.currentTarget;
            const start = el.selectionStart ?? 0;
            const end = el.selectionEnd ?? 0;
            if (e.key === 'Backspace' && start === end && start > 0) {
              const ch = el.value[start - 1];
              if (ch === ',') {
                e.preventDefault();
                // Delete the digit before the grouping comma so backspace feels natural
                let i = start - 2;
                while (i >= 0 && !/\d/.test(el.value[i]!)) i--;
                if (i < 0) return;
                const next = el.value.slice(0, i) + el.value.slice(i + 1);
                applyTyping(next, i);
              }
            }
            if (e.key === 'Delete' && start === end && start < el.value.length) {
              const ch = el.value[start];
              if (ch === ',') {
                e.preventDefault();
                let i = start + 1;
                while (i < el.value.length && !/\d/.test(el.value[i]!)) i++;
                if (i >= el.value.length) return;
                const next = el.value.slice(0, i) + el.value.slice(i + 1);
                applyTyping(next, start);
              }
            }
          }}
          onChange={(e) => {
            applyTyping(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onBlur={(e) => {
            setFocused(false);
            const { text: next, value: parsed } = normalizeIndianRupeesTyping(e.target.value, {
              allowNegative,
              allowDecimal,
            });
            if (parsed == null || (!allowNegative && parsed < 0)) {
              setText('');
              onValueChange?.(undefined);
            } else {
              setText(formatRupeesIndian(parsed));
              onValueChange?.(parsed);
            }
            onBlur?.(e);
          }}
        />
      </>
    );
  },
);
