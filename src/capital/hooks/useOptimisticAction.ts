'use client';

import { useRouter } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';
import { useCapitalToast } from '@/src/capital/components/CapitalToastProvider';

export function useOptimisticAction<T>({
  optimisticUpdate,
  action,
  undoAction,
  successMessage,
  onSuccess,
}: {
  optimisticUpdate: (current: T) => T;
  action: () => Promise<{ error?: string; success?: string }>;
  undoAction?: () => Promise<{ error?: string; success?: string }>;
  successMessage: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const { showToast } = useCapitalToast();
  const [isPending, startTransition] = useTransition();

  function run(current: T, setOptimistic: (u: T) => void) {
    const snapshot = current;
    setOptimistic(optimisticUpdate(current));
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setOptimistic(snapshot);
        showToast(result.error);
        return;
      }
      showToast(successMessage, undoAction
        ? async () => {
            const undo = await undoAction();
            if (!undo.error) router.refresh();
          }
        : undefined);
      onSuccess?.();
      router.refresh();
    });
  }

  return { isPending, run };
}

export function useOptimisticList<T>(initial: T[]) {
  return useOptimistic(initial, (_state, update: T) => [..._state, update]);
}
