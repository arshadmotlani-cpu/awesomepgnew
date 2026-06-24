'use client';

import { motion, useReducedMotion } from 'framer-motion';
import {
  BOOKING_FUNNEL_STEPS,
  bookingFunnelStepIndex,
  type BookingFunnelStepId,
} from '@/src/lib/booking/bookingFunnelSteps';
import { duration, easing } from '@/src/lib/design-system/motion';

export function BookingFunnelProgressBar({
  activeStep = 'pg',
}: {
  activeStep?: BookingFunnelStepId;
}) {
  const reduceMotion = useReducedMotion();
  const activeIndex = bookingFunnelStepIndex(activeStep);

  return (
    <nav aria-label="Booking progress" className="w-full">
      <ol className="flex items-start gap-0 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:justify-between">
        {BOOKING_FUNNEL_STEPS.map((stage, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          const isLast = index === BOOKING_FUNNEL_STEPS.length - 1;

          return (
            <li
              key={stage.id}
              className={`flex min-w-[5.5rem] shrink-0 items-center sm:min-w-0 sm:flex-1 ${isLast ? 'shrink-0 sm:flex-none' : ''}`}
            >
              <div className="flex flex-col items-center gap-1.5 text-center sm:min-w-0 sm:flex-1">
                <motion.span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    done
                      ? 'bg-apg-orange/15 text-apg-orange ring-1 ring-apg-orange/40'
                      : active
                        ? 'bg-apg-orange text-white shadow-[0_0_20px_rgba(255,90,31,0.45)]'
                        : 'bg-white/[0.06] text-apg-muted ring-1 ring-white/10'
                  }`}
                  initial={reduceMotion ? false : { scale: 0.9 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: reduceMotion ? 0 : index * 0.04, duration: duration.quick }}
                >
                  {done ? '✓' : index + 1}
                </motion.span>
                <span
                  className={`whitespace-nowrap text-[11px] font-semibold leading-none sm:text-xs ${
                    active ? 'text-white' : done ? 'text-apg-silver' : 'text-apg-muted'
                  }`}
                >
                  {stage.label}
                </span>
              </div>
              {!isLast ? (
                <div
                  className={`mx-1 mt-4 hidden h-px min-w-[1rem] flex-1 sm:block ${
                    done ? 'bg-gradient-to-r from-apg-orange/70 to-apg-orange/20' : 'bg-white/10'
                  }`}
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

/** @deprecated Use BookingFunnelProgressBar */
export { BookingFunnelProgressBar as BookingFlowStepper };
export type { BookingFunnelStepId as BookingFlowStepId };
