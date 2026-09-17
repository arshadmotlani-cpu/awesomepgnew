'use client';

import { Button } from '@/src/hair/components/ui/button';

type Props = {
  onKeep: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  keepLabel?: string;
  confirmLabel?: string;
  testId?: string;
};

export function QuickSaleClearAllConfirm({
  onKeep,
  onConfirm,
  title = 'Clear this sale?',
  description = 'This will remove all items and payment entries from the current sale.',
  keepLabel = 'Keep sale',
  confirmLabel = 'Clear all',
  testId = 'qs-clear-all-confirm',
}: Props) {
  return (
    <div
      className="qs-clear-all-confirm"
      role="dialog"
      aria-labelledby="qs-clear-all-title"
      aria-describedby="qs-clear-all-desc"
      data-testid={testId}
    >
      <p id="qs-clear-all-title" className="text-sm font-semibold text-fyh-text">
        {title}
      </p>
      <p id="qs-clear-all-desc" className="mt-1 text-xs text-fyh-text-secondary">
        {description}
      </p>
      <div className="mt-2.5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onKeep}>
          {keepLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="text-fyh-danger"
          data-testid="qs-clear-all-confirm-action"
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
