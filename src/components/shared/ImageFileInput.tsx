'use client';

import { useId, type ChangeEvent, type InputHTMLAttributes } from 'react';
import {
  buildImageFileInputProps,
  IMAGE_UPLOAD_ACCEPT,
  IMAGE_UPLOAD_HELPER_TEXT,
} from '@/src/lib/uploads/fileInputPolicy';

export type ImageFileInputProps = {
  id?: string;
  name?: string;
  accept?: string;
  disabled?: boolean;
  multiple?: boolean;
  className?: string;
  inputClassName?: string;
  'aria-labelledby'?: string;
  onFileSelected: (file: File | undefined) => void;
};

/**
 * Single shared image file picker — never sets `capture`.
 * Use this (or ImageFileUploadField) instead of raw `<input type="file">`.
 */
export function ImageFileInput({
  id: idProp,
  name,
  accept = IMAGE_UPLOAD_ACCEPT,
  disabled,
  multiple,
  className,
  inputClassName,
  'aria-labelledby': ariaLabelledBy,
  onFileSelected,
}: ImageFileInputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    onFileSelected(file ?? undefined);
    event.target.value = '';
  }

  const safeProps = buildImageFileInputProps({ accept, multiple });

  return (
    <input
      {...safeProps}
      id={id}
      name={name}
      disabled={disabled}
      aria-labelledby={ariaLabelledBy}
      className={inputClassName ?? className}
      onChange={handleChange}
    />
  );
}

export type ImageFileUploadFieldProps = Omit<ImageFileInputProps, 'inputClassName'> & {
  label: string;
  hint?: string;
  actionLabel?: string;
  variant?: 'overlay' | 'dashed' | 'hidden';
  status?: 'idle' | 'uploading' | 'ready';
  readyLabel?: string;
  readyDetail?: string;
  tone?: 'light' | 'dark';
};

/**
 * Accessible tap target wrapping ImageFileInput — gallery + camera on all platforms.
 */
export function ImageFileUploadField({
  label,
  hint,
  actionLabel = IMAGE_UPLOAD_HELPER_TEXT,
  variant = 'dashed',
  status = 'idle',
  readyLabel = 'Image ready',
  readyDetail,
  tone = 'light',
  disabled,
  className,
  ...inputProps
}: ImageFileUploadFieldProps) {
  const generatedId = useId();
  const inputId = inputProps.id ?? generatedId;
  const isLight = tone === 'light';
  const uploading = status === 'uploading';
  const ready = status === 'ready';

  if (variant === 'hidden') {
    return (
      <>
        <ImageFileInput
          {...inputProps}
          id={inputId}
          disabled={disabled || uploading}
          inputClassName="sr-only"
          onFileSelected={inputProps.onFileSelected}
        />
        <label htmlFor={inputId} className={className}>
          {label}
        </label>
      </>
    );
  }

  const overlayLabelClass =
    'relative block min-h-[5.5rem] w-full rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 transition-colors ' +
    (disabled || uploading
      ? 'cursor-not-allowed opacity-60'
      : 'cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/70 active:bg-indigo-100/60');

  const dashedLabelClass =
    'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ' +
    (ready
      ? isLight
        ? 'border-emerald-300 bg-emerald-50'
        : 'border-emerald-500/50 bg-emerald-500/10'
      : isLight
        ? 'border-zinc-300 bg-white hover:border-[#FF5A1F]/50'
        : 'border-[#FF5A1F]/40 bg-[#FF5A1F]/5 hover:border-[#FF5A1F]/70 hover:bg-[#FF5A1F]/10');

  return (
    <div className={className}>
      {label ? (
        <p className={`text-sm font-medium ${isLight ? 'text-zinc-900' : 'text-white'}`}>{label}</p>
      ) : null}

      <label
        htmlFor={inputId}
        className={variant === 'overlay' ? overlayLabelClass : dashedLabelClass}
      >
        <ImageFileInput
          {...inputProps}
          id={inputId}
          disabled={disabled || uploading}
          inputClassName={
            variant === 'overlay'
              ? 'absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed'
              : 'sr-only'
          }
          onFileSelected={inputProps.onFileSelected}
        />

        {variant === 'overlay' ? (
          <div className="pointer-events-none flex min-h-[5.5rem] items-center gap-4 px-4 py-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold">
              IMG
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-indigo-900">
                {uploading ? 'Preparing image…' : actionLabel}
              </span>
              {hint ? (
                <span className="mt-0.5 block text-xs text-indigo-700/80">{hint}</span>
              ) : null}
            </span>
          </div>
        ) : uploading ? (
          <span className={`text-sm font-medium ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>
            Uploading…
          </span>
        ) : ready ? (
          <>
            <span className={`text-sm font-semibold ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
              {readyLabel}
            </span>
            {readyDetail ? (
              <span className={`max-w-full truncate text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-300'}`}>
                {readyDetail}
              </span>
            ) : null}
            <span className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-300'}`}>Tap to replace</span>
          </>
        ) : (
          <>
            <span className={`text-sm font-semibold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
              {actionLabel}
            </span>
            {hint ? (
              <span className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>{hint}</span>
            ) : null}
          </>
        )}
      </label>
    </div>
  );
}

/** Inline admin/customer bare picker — still uses safe accept, no capture. */
export function ImageFileInputInline(
  props: ImageFileInputProps & Pick<InputHTMLAttributes<HTMLInputElement>, 'className'>,
) {
  return <ImageFileInput {...props} inputClassName={props.className} />;
}
