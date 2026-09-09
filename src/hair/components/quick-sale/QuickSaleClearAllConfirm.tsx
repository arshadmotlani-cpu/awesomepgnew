'use client';

import { Button } from '@/src/hair/components/ui/button';

type Props = {
  onKeep: () => void;
  onConfirm: () => void;
};

export function QuickSaleClearAllConfirm({ onKeep, onConfirm }: Props) {
  return (
    <div
      className="qs-clear-all-confirm"
      role="dialog"
      aria-labelledby="qs-clear-all-title"
      aria-describedby="qs-clear-all-desc"
      data-testid="qs-clear-all-confirm"
    >
      <p id="qs-clear-all-title" className="text-sm font-semibold text-fyh-text">
        Clear this sale?
      </p>
      <p id="qs-clear-all-desc" className="mt-1 text-xs text-fyh-text-secondary">
        This will remove all items and payment entries from the current sale.
      </p>
      <div className="mt-2.5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onKeep}>
          Keep sale
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="text-fyh-danger"
          data-testid="qs-clear-all-confirm-action"
          onClick={onConfirm}
        >
          Clear all
        </Button>
      </div>
    </div>
  );
}
