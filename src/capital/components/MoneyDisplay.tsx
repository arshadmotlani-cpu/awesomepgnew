import { formatInr } from '@/src/capital/lib/money';
import { cn } from '@/src/capital/lib/utils';

type MoneyDisplayProps = {
  paise: number;
  showPaise?: boolean;
  className?: string;
  negativeIsDanger?: boolean;
};

export function MoneyDisplay({
  paise,
  showPaise,
  className,
  negativeIsDanger = true,
}: MoneyDisplayProps) {
  const isNegative = paise < 0;
  return (
    <span
      className={cn(
        'ac-money',
        isNegative && negativeIsDanger && 'text-ac-danger',
        className,
      )}
    >
      {isNegative ? '−' : ''}
      {formatInr(Math.abs(paise), { showPaise })}
    </span>
  );
}
