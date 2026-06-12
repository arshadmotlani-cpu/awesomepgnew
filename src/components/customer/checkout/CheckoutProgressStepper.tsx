'use client';

const STEPS = [
  { id: 'bed', label: 'Bed Selected' },
  { id: 'payment', label: 'Payment Pending' },
  { id: 'approval', label: 'Approval' },
  { id: 'checkin', label: 'Check-In' },
] as const;

export type CheckoutStepId = (typeof STEPS)[number]['id'];

export function CheckoutProgressStepper({ activeStep = 'payment' }: { activeStep?: CheckoutStepId }) {
  const activeIndex = STEPS.findIndex((s) => s.id === activeStep);

  return (
    <nav aria-label="Booking progress" className="w-full">
      <ol className="flex items-center justify-between gap-1 sm:gap-2">
        {STEPS.map((step, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-2 sm:text-left">
                <span
                  className={
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ' +
                    (done
                      ? 'bg-apg-orange/20 text-apg-orange ring-1 ring-apg-orange/50'
                      : active
                        ? 'bg-apg-orange text-white shadow-[0_0_16px_rgba(255,90,31,0.55)]'
                        : 'bg-white/5 text-apg-muted ring-1 ring-white/10')
                  }
                  aria-hidden
                >
                  {done ? '✓' : index + 1}
                </span>
                <span
                  className={
                    'truncate text-[10px] font-semibold leading-tight sm:text-xs ' +
                    (active ? 'text-white' : done ? 'text-apg-silver' : 'text-[#757575]')
                  }
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 ? (
                <div
                  className={
                    'mx-1 hidden h-px min-w-[12px] flex-1 sm:block ' +
                    (index < activeIndex
                      ? 'bg-gradient-to-r from-apg-orange/80 to-apg-orange/30 shadow-[0_0_8px_rgba(255,90,31,0.35)]'
                      : 'bg-white/10')
                  }
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
