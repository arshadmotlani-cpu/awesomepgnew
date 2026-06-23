'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { BookingFunnelProgressBar } from './BookingFunnelProgressBar';
import { BookingSummaryRail, type BookingSummaryData } from './BookingSummaryRail';
import type { BookingFunnelStepId } from '@/src/lib/booking/bookingFunnelSteps';

type BookingFunnelContextValue = {
  summary: BookingSummaryData;
  patchSummary: (patch: Partial<BookingSummaryData>) => void;
  setActiveStep: (step: BookingFunnelStepId | null) => void;
};

const BookingFunnelContext = createContext<BookingFunnelContextValue | null>(null);

export function useBookingFunnel() {
  return useContext(BookingFunnelContext);
}

export function BookingFunnelShell({
  activeStep: defaultStep,
  initialSummary = {},
  showSummary = true,
  children,
}: {
  activeStep: BookingFunnelStepId;
  initialSummary?: BookingSummaryData;
  showSummary?: boolean;
  children: ReactNode;
}) {
  const [summary, setSummary] = useState<BookingSummaryData>(initialSummary);
  const [stepOverride, setStepOverride] = useState<BookingFunnelStepId | null>(null);

  const patchSummary = useCallback((patch: Partial<BookingSummaryData>) => {
    setSummary((prev) => ({ ...prev, ...patch }));
  }, []);

  const setActiveStep = useCallback((step: BookingFunnelStepId | null) => {
    setStepOverride(step);
  }, []);

  const activeStep = stepOverride ?? defaultStep;

  const ctx = useMemo(
    () => ({ summary, patchSummary, setActiveStep }),
    [summary, patchSummary, setActiveStep],
  );

  return (
    <BookingFunnelContext.Provider value={ctx}>
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 apg-glass-light p-3 sm:p-4">
          <BookingFunnelProgressBar activeStep={activeStep} />
        </div>
        <div
          className={
            showSummary ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]' : ''
          }
        >
          <div className="min-w-0">{children}</div>
          {showSummary ? (
            <div className="lg:sticky lg:top-4 lg:self-start">
              <BookingSummaryRail data={summary} />
            </div>
          ) : null}
        </div>
      </div>
    </BookingFunnelContext.Provider>
  );
}
