'use client';

import { useEffect } from 'react';
import { useOperationsActionToast } from '@/src/components/admin/operations/OperationsActionToast';
import { consumeOperationsApprovedToast } from '@/src/lib/operations/operationsActionToastFlash';

/** Shows a one-shot success toast after redirect from Payment Review approve. */
export function OperationsFlashToast() {
  const { showToast, toastNode } = useOperationsActionToast();

  useEffect(() => {
    const message = consumeOperationsApprovedToast();
    if (message) showToast(message, 'success');
  }, [showToast]);

  return toastNode;
}
