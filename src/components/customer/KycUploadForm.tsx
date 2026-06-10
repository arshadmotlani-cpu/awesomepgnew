'use client';

import {
  useActionState,
  useEffect,
  useId,
  useState,
  startTransition,
  type FormEvent,
} from 'react';
import {
  submitKycAction,
  type KycActionState,
} from '@/app/(customer)/account/kyc/actions';
import { prepareKycImageForUpload } from '@/src/lib/kyc/clientImagePrep';
import {
  KYC_FILE_TOO_LARGE_MESSAGE,
  type KycUploadKind,
} from '@/src/lib/kyc/uploadLimits';

const INITIAL: KycActionState = { status: 'idle' };

type KycFieldName = 'aadhaarFront' | 'aadhaarBack' | 'selfie';

type Props = {
  bookingCode?: string;
};

export function KycUploadForm({ bookingCode }: Props) {
  const [state, formAction, pending] = useActionState(submitKycAction, INITIAL);
  const [files, setFiles] = useState<Partial<Record<KycFieldName, File>>>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<KycFieldName, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const allSelected =
    Boolean(files.aadhaarFront) && Boolean(files.aadhaarBack) && Boolean(files.selfie);

  useEffect(() => {
    setReady(true);
  }, []);

  function setFieldFile(name: KycFieldName, file: File | undefined) {
    setFiles((prev) => {
      const next = { ...prev };
      if (file) next[name] = file;
      else delete next[name];
      return next;
    });
  }

  function setFieldError(name: KycFieldName, message: string | null) {
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (message) next[name] = message;
      else delete next[name];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!files.aadhaarFront || !files.aadhaarBack || !files.selfie) {
      setSubmitError('Upload Aadhaar front, Aadhaar back, and a selfie.');
      return;
    }

    for (const name of ['aadhaarFront', 'aadhaarBack', 'selfie'] as const) {
      const err = fieldErrors[name];
      if (err) {
        setSubmitError(err);
        return;
      }
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set('aadhaarFront', files.aadhaarFront);
    formData.set('aadhaarBack', files.aadhaarBack);
    formData.set('selfie', files.selfie);
    startTransition(() => {
      formAction(formData);
    });
  }

  const displayError =
    submitError ??
    (state.status === 'error' && /body exceeded.*limit/i.test(state.message)
      ? KYC_FILE_TOO_LARGE_MESSAGE
      : state.status === 'error'
        ? state.message
        : null);

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="mt-6 space-y-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
    >
      {bookingCode ? <input type="hidden" name="bookingCode" value={bookingCode} /> : null}

      <KycPhotoUploadField
        name="aadhaarFront"
        label="Aadhaar — front"
        hint="Full card visible, good lighting, no glare."
        actionLabel="Take photo or choose image"
        actionHint="Camera · Photos · Files"
        kind="aadhaar"
        selectedFile={files.aadhaarFront}
        error={fieldErrors.aadhaarFront}
        onPrepared={(file, error) => {
          setFieldFile('aadhaarFront', file);
          setFieldError('aadhaarFront', error);
        }}
      />
      <KycPhotoUploadField
        name="aadhaarBack"
        label="Aadhaar — back"
        hint="Address and barcode side clearly readable."
        actionLabel="Take photo or choose image"
        actionHint="Camera · Photos · Files"
        kind="aadhaar"
        selectedFile={files.aadhaarBack}
        error={fieldErrors.aadhaarBack}
        onPrepared={(file, error) => {
          setFieldFile('aadhaarBack', file);
          setFieldError('aadhaarBack', error);
        }}
      />
      <KycPhotoUploadField
        name="selfie"
        label="Selfie"
        hint="Face clearly visible, plain background preferred."
        actionLabel="Take selfie or choose image"
        actionHint="Front camera when available · Photos · Files"
        kind="selfie"
        capture="user"
        selectedFile={files.selfie}
        error={fieldErrors.selfie}
        onPrepared={(file, error) => {
          setFieldFile('selfie', file);
          setFieldError('selfie', error);
        }}
      />

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Photos are automatically resized for upload (max 10 MB each). Images are checked for
        blank, blurry, or unreadable content before review.
      </p>

      <button
        type="submit"
        disabled={!ready || pending || !allSelected}
        className="w-full rounded-md bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-indigo-300"
      >
        {pending ? 'Validating & submitting…' : 'Submit for review'}
      </button>

      {displayError ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{displayError}</p>
      ) : null}
    </form>
  );
}

type KycPhotoUploadFieldProps = {
  name: KycFieldName;
  label: string;
  hint: string;
  actionLabel: string;
  actionHint: string;
  kind: KycUploadKind;
  selectedFile?: File;
  error?: string;
  onPrepared: (file: File | undefined, error: string | null) => void;
  capture?: 'user';
};

function KycPhotoUploadField({
  name,
  label,
  hint,
  actionLabel,
  actionHint,
  kind,
  selectedFile,
  error,
  onPrepared,
  capture,
}: KycPhotoUploadFieldProps) {
  const inputId = useId();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sizeLabel, setSizeLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setSizeLabel(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setSizeLabel(formatBytes(selectedFile.size));
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  async function onFileChange(raw: File | undefined) {
    if (!raw) {
      onPrepared(undefined, null);
      return;
    }

    setPreparing(true);
    try {
      const prepared = await prepareKycImageForUpload(raw, kind);
      const label = prepared.wasProcessed
        ? `${formatBytes(prepared.outputBytes)} (optimized from ${formatBytes(prepared.originalBytes)})`
        : formatBytes(prepared.outputBytes);
      setSizeLabel(label);
      onPrepared(prepared.file, null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not prepare this image.';
      onPrepared(undefined, message);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="space-y-2">
      <p id={`${inputId}-label`} className="text-sm font-medium text-zinc-800">
        {label}
      </p>

      <label
        htmlFor={inputId}
        className="relative block min-h-[5.5rem] w-full cursor-pointer rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 transition-colors hover:border-indigo-300 hover:bg-indigo-50/70 active:bg-indigo-100/60"
      >
        <input
          id={inputId}
          type="file"
          accept="image/*"
          {...(capture ? { capture } : {})}
          aria-labelledby={`${inputId}-label`}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          disabled={preparing}
          onChange={(e) => void onFileChange(e.target.files?.[0])}
        />

        <div className="pointer-events-none flex min-h-[5.5rem] items-center gap-4 px-4 py-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700"
            aria-hidden
          >
            <CameraIcon />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-indigo-900">
              {preparing ? 'Preparing image…' : actionLabel}
            </span>
            <span className="mt-0.5 block text-xs text-indigo-700/80">{actionHint}</span>
          </span>
        </div>
      </label>

      {selectedFile && !error ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob preview from local file picker
            <img
              src={previewUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-md border border-emerald-200 object-cover"
            />
          ) : null}
          <span className="min-w-0">
            <span className="block truncate font-medium">{selectedFile.name}</span>
            {sizeLabel ? <span className="text-xs text-emerald-800">{sizeLabel}</span> : null}
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      <p className="text-[11px] text-zinc-500">{hint}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CameraIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className="h-6 w-6"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 0 1 5.186 5.25h13.628a2.31 2.31 0 0 1 1.641.925l1.47 1.47a1 1 0 0 1-.707 1.707H6.064a1 1 0 0 1-.707-1.707l1.47-1.47Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 9.75v8.25A2.25 2.25 0 0 0 6.75 20.25h10.5A2.25 2.25 0 0 0 19.5 18V9.75M15 12.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}
