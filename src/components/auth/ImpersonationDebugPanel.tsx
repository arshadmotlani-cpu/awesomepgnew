'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { ImpersonationContext } from '@/src/lib/auth/impersonation';

type Props = {
  context: ImpersonationContext;
  customerSessionId: string | null;
  sessionExpiresAt: string | null;
};

type DebugSnapshot = {
  route: string;
  residentId: string;
  bookingId: string | null;
  propertyId: string | null;
  roomId: string | null;
  bedId: string | null;
  sessionAgeMinutes: number | null;
  sessionExpiresAt: string | null;
  customerSessionId: string | null;
  impersonationId: string;
  reason: string;
  apiErrors: string[];
  hydrationWarnings: string[];
};

export function ImpersonationDebugPanel({
  context,
  customerSessionId,
  sessionExpiresAt,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [apiErrors, setApiErrors] = useState<string[]>([]);
  const [hydrationWarnings, setHydrationWarnings] = useState<string[]>([]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      setApiErrors((prev) => [...prev.slice(-9), event.message].slice(-10));
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const msg =
        event.reason instanceof Error
          ? event.reason.message
          : typeof event.reason === 'string'
            ? event.reason
            : 'Unhandled promise rejection';
      setApiErrors((prev) => [...prev.slice(-9), msg].slice(-10));
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  useEffect(() => {
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      const text = args.map(String).join(' ');
      if (/hydration|did not match/i.test(text)) {
        setHydrationWarnings((prev) => [...prev.slice(-4), text.slice(0, 200)].slice(-5));
      }
      orig.apply(console, args);
    };
    return () => {
      console.error = orig;
    };
  }, []);

  const snapshot: DebugSnapshot = useMemo(() => {
    const startedMs = context.startedAt.getTime();
    const ageMinutes = Number.isFinite(startedMs)
      ? Math.max(0, Math.round((Date.now() - startedMs) / 60_000))
      : null;
    return {
      route: pathname,
      residentId: context.customerId,
      bookingId: context.bookingId,
      propertyId: context.pgId,
      roomId: context.roomId,
      bedId: context.bedId,
      sessionAgeMinutes: ageMinutes,
      sessionExpiresAt,
      customerSessionId,
      impersonationId: context.impersonationId,
      reason: context.reason,
      apiErrors,
      hydrationWarnings,
    };
  }, [
    pathname,
    context,
    customerSessionId,
    sessionExpiresAt,
    apiErrors,
    hydrationWarnings,
  ]);

  return (
    <div
      className="fixed bottom-4 right-4 z-[90] max-w-sm"
      data-testid="impersonation-debug-panel"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-white/20 bg-black/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur hover:bg-black/90"
      >
        {open ? 'Hide debug' : 'Super Admin debug'}
      </button>
      {open ? (
        <div className="mt-2 max-h-[70vh] overflow-auto rounded-xl border border-white/15 bg-black/90 p-3 text-xs text-apg-silver shadow-2xl backdrop-blur">
          <p className="mb-2 font-semibold text-white">Impersonation debug</p>
          <dl className="space-y-1">
            {Object.entries(snapshot).map(([key, value]) => {
              if (Array.isArray(value)) {
                return (
                  <div key={key}>
                    <dt className="text-white/60">{key}</dt>
                    <dd className="whitespace-pre-wrap break-all text-white/90">
                      {value.length ? value.join('\n') : '—'}
                    </dd>
                  </div>
                );
              }
              return (
                <div key={key} className="flex gap-2">
                  <dt className="shrink-0 text-white/60">{key}</dt>
                  <dd className="break-all text-white/90">{value ?? '—'}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
