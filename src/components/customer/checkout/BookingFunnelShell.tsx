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
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 sm:px-5 sm:py-5">
          <BookingFunnelProgressBar activeStep={activeStep} />
        </div>

        {showSummary ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:items-start lg:gap-8">
            <div className="min-w-0">{children}</div>
            <div className="lg:sticky lg:top-6 lg:self-start">
              <BookingSummaryRail data={summary} />
            </div>
          </div>
        ) : (
          <div className="min-w-0">{children}</div>
        )}
      </div>
    </BookingFunnelContext.Provider>
  );
}
