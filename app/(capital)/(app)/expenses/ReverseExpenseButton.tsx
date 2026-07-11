'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reverseExpenseAction } from '@/src/capital/actions/expenses';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { useCapitalToast } from '@/src/capital/components/CapitalToastProvider';

export function ReverseExpenseButton({ expenseId }: { expenseId: string }) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { showToast } = useCapitalToast();
  const router = useRouter();

  function handleReverse() {
    const fd = new FormData();
    fd.set('expenseId', expenseId);
    fd.set('reason', reason || 'Reversed from expenses list');
    startTransition(async () => {
      const result = await reverseExpenseAction({}, fd);
      if (result.error) {
        showToast(result.error);
      } else {
        showToast('Expense reversed');
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Reverse
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="h-8 w-40 text-xs"
        aria-label="Reversal reason"
      />
      <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={handleReverse}>
        Confirm
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
