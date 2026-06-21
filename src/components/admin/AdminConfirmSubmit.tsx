'use client';

import { useState, type ReactNode } from 'react';
import { AdminConfirmDialog, type AdminConfirmTone } from './AdminConfirmDialog';

type Props = {
  formId: string;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: AdminConfirmTone;
  disabled?: boolean;
  pending?: boolean;
  className?: string;
  children: ReactNode;
  /** Optional extra validation before opening the dialog (e.g. required fields). */
  beforeConfirm?: () => boolean;
  dialogSize?: 'default' | 'wide';
};

export function AdminConfirmSubmit({
  formId,
  title,
  description,
  confirmLabel,
  tone,
  disabled,
  pending,
  className,
  children,
  beforeConfirm,
  dialogSize,
}: Props) {
  const [open, setOpen] = useState(false);

  function tryOpen() {
    if (beforeConfirm && !beforeConfirm()) return;
    setOpen(true);
  }

  function submitForm() {
    setOpen(false);
    const form = document.getElementById(formId) as HTMLFormElement | null;
    form?.requestSubmit();
  }

  return (
    <>
      <button type="button" disabled={disabled || pending} className={className} onClick={tryOpen}>
        {pending ? '…' : children}
      </button>
      <AdminConfirmDialog
        open={open}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        tone={tone}
        pending={pending}
        size={dialogSize}
        onCancel={() => setOpen(false)}
        onConfirm={submitForm}
      />
    </>
  );
}
