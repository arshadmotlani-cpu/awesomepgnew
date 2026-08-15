'use client';

import { useEffect, type ReactNode } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Center modal vs right drawer */
  variant?: 'modal' | 'drawer';
  width?: 'sm' | 'md' | 'lg';
};

export function AdminOpsDialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  variant = 'modal',
  width = 'md',
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const widthClass =
    width === 'lg' ? 'max-w-2xl' : width === 'sm' ? 'max-w-sm' : 'max-w-md';

  if (variant === 'drawer') {
    return (
      <div
        className="fixed inset-0 z-[100] flex justify-end bg-black/60"
        role="dialog"
        aria-modal
        aria-label={title}
        onClick={onClose}
      >
        <div
          className={`flex h-full w-full ${widthClass} flex-col border-l border-zinc-800 bg-[#0B0F14] shadow-2xl`}
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader title={title} subtitle={subtitle} onClose={onClose} />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="border-t border-zinc-800 px-5 py-4">{footer}</div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={`flex w-full ${widthClass} max-h-[min(90vh,calc(100dvh-2rem))] flex-col rounded-2xl border border-zinc-800 bg-[#0B0F14] shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader title={title} subtitle={subtitle} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-zinc-800 px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

function DialogHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-zinc-400">{subtitle}</p> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white"
      >
        Close
      </button>
    </div>
  );
}
