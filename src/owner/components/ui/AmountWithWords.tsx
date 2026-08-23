import { asPlainNumber, formatInrAmount } from '@/src/lib/format';
import { inrInputToWords, paiseToIndianWords } from '@/src/lib/money/inrToWords';

function formatPaiseFigure(paise: number): string {
  const n = asPlainNumber(paise);
  const negative = n < 0;
  const absRounded = Math.round(Math.abs(n));
  const rupees = absRounded / 100;
  const hasPaise = absRounded % 100 !== 0;
  const formatted = formatInrAmount(rupees, { decimals: hasPaise ? 2 : 0 });
  return `${negative ? '-' : ''}₹${formatted}`;
}

type AmountWithWordsProps = {
  paise: number | bigint | string | null | undefined;
  className?: string;
  amountClassName?: string;
  wordsClassName?: string;
  suffix?: string;
  prefix?: string;
  align?: 'start' | 'end';
};

/** Display ₹ amount with automatic Indian amount-in-words underneath. */
export function AmountWithWords({
  paise,
  className = '',
  amountClassName = '',
  wordsClassName = '',
  suffix = '',
  prefix = '',
  align = 'start',
}: AmountWithWordsProps) {
  const n = asPlainNumber(paise);
  const words = paiseToIndianWords(n);
  return (
    <span
      className={`oo-amount-with-words ${align === 'end' ? 'oo-amount-with-words-end' : ''} ${className}`.trim()}
    >
      <span className={`oo-amount-figure ${amountClassName}`.trim()}>
        {prefix}
        {formatPaiseFigure(n)}
        {suffix}
      </span>
      {words ? <span className={`oo-amount-words ${wordsClassName}`.trim()}>{words}</span> : null}
    </span>
  );
}

type AmountInWordsProps = {
  paise?: number | bigint | string | null;
  rupees?: number | null;
  input?: string;
  className?: string;
};

/** Words-only line — for inputs (live) or when the figure is already rendered. */
export function AmountInWords({ paise, rupees, input, className = '' }: AmountInWordsProps) {
  let words: string | null = null;
  if (input != null) {
    words = inrInputToWords(input);
  } else if (rupees != null && Number.isFinite(rupees)) {
    words = paiseToIndianWords(Math.round(rupees * 100));
  } else if (paise != null) {
    words = paiseToIndianWords(asPlainNumber(paise));
  }
  if (!words) return null;
  return <span className={`oo-amount-words ${className}`.trim()}>{words}</span>;
}
