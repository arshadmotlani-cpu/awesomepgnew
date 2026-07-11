'use client';

import { useId, type ChangeEvent } from 'react';
import { buildImageFileInputProps } from '@/src/lib/uploads/fileInputPolicy';
import { cn } from '@/src/capital/lib/utils';

const DOCUMENT_ACCEPT =
  'image/*,.heic,.heif,.webp,.pdf,.doc,.docx,.xls,.xlsx,application/pdf';

export function CapitalDocumentFileInput({
  id: idProp,
  name,
  disabled,
  className,
  onFileSelected,
  required,
}: {
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  onFileSelected?: (file: File | undefined) => void;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    onFileSelected?.(file);
  }

  const safeProps = buildImageFileInputProps({ accept: DOCUMENT_ACCEPT });

  return (
    <input
      {...safeProps}
      id={id}
      name={name}
      disabled={disabled}
      required={required}
      className={cn(
        'flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-1',
        className,
      )}
      onChange={handleChange}
    />
  );
}
