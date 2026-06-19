'use client';

import type { ReactNode } from 'react';

type Props = {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  children?: ReactNode;
};

/** Plain-language gate before irreversible or important actions (e.g. payment submit). */
export function ConfirmationGate({
  title = 'Please confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Go back',
  onConfirm,
  onCancel,
  pending = false,
  children,
}: Props) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-zinc-600">{message}</div>
      {children ? <div className="mt-4">{children}</div> : null}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {pending ? 'Please wait…' : confirmLabel}
        </button>
      </div>
    </div>
  );
}
