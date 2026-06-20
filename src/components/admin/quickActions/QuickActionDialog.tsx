'use client';

import { useEffect, useRef } from 'react';

export function QuickActionDialog({
  open,
  title,
  description,
  onClose,
  wide,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-2xl border border-white/10 bg-[#1A1F27] p-0 text-white shadow-2xl backdrop:bg-black/60`}
      onClose={onClose}
    >
      <div className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            {description ? (
              <p className="mt-1 text-[11px] text-apg-silver">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded border border-white/10 px-2 py-1 text-xs text-apg-silver hover:text-white"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
