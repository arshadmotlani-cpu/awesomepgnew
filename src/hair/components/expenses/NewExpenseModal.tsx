'use client';

import { useEffect } from 'react';
import { Button } from '@/src/hair/components/ui/button';
import { ExpenseForm } from '@/src/hair/components/expenses/ExpenseForm';

type Props = {
  open: boolean;
  onClose: () => void;
  staffName: string;
};

export function NewExpenseModal({ open, onClose, staffName }: Props) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fyh-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="fyh-modal-panel sm:max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-expense-title"
      >
        <header className="fyh-modal-header flex items-center justify-between gap-2">
          <h2 id="new-expense-title" className="fyh-modal-title">New expense</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </header>
        <div className="fyh-modal-body">
          <ExpenseForm staffName={staffName} onSaved={onClose} />
        </div>
      </div>
    </div>
  );
}
