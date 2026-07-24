'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export type AdminConfirmTone = 'default' | 'danger';

type Props = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: AdminConfirmTone;
  pending?: boolean;
  size?: 'default' | 'wide' | 'statement';
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AdminConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  pending = false,
  size = 'default',
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => confirmRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClass =
    tone === 'danger'
      ? 'bg-rose-600 text-white hover:bg-rose-500'
      : 'bg-[#FF5A1F] text-white hover:brightness-110';

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="admin-confirm-title"
        className={
          'flex w-full flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl ' +
          (size === 'statement'
            ? 'max-h-[min(90vh,calc(100dvh-2rem))] max-w-3xl'
            : size === 'wide'
              ? 'max-w-lg'
              : 'max-w-md') +
          (size === 'statement' ? ' p-0' : ' p-5')
        }
      >
        <div className={size === 'statement' ? 'border-b border-zinc-200 px-5 py-4' : ''}>
          <h2 id="admin-confirm-title" className="text-lg font-semibold text-zinc-900">
            {title}
          </h2>
        </div>
        <div
          className={
            size === 'statement'
              ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 text-sm leading-relaxed text-zinc-600'
              : 'mt-2 text-sm leading-relaxed text-zinc-600'
          }
        >
          {description}
        </div>
        <div
          className={
            'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end ' +
            (size === 'statement' ? 'border-t border-zinc-200 px-5 py-4' : 'mt-5')
          }
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={pending || confirmDisabled}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${confirmClass}`}
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
