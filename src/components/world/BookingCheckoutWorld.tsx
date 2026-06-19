'use client';

import type { ReactNode } from 'react';
import { BookingTunnel } from '@/src/components/world/BookingTunnel';

/** Client wrapper for booking checkout — descent tunnel without touching server logic. */
export function BookingCheckoutWorld({ children }: { children: ReactNode }) {
  return (
    <div className="apg-aurora min-h-full">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <BookingTunnel step={2} totalSteps={3} title="Confirm your stay">
          {children}
        </BookingTunnel>
      </div>
    </div>
  );
}
