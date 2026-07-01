'use client';

import { useEffect, useState } from 'react';
import { quoteExpressBookingAction, type ExpressBookingQuote } from '@/app/(admin)/admin/quick-actions/actions';
import type { ExpressBookingStayType } from '@/src/services/expressBookingQuote';

export function useExpressBookingQuote(input: {
  bedId: string;
  checkInDate: string;
  checkOutDate: string;
  stayType: ExpressBookingStayType;
  enabled: boolean;
}) {
  const [quote, setQuote] = useState<ExpressBookingQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!input.enabled || !input.bedId || !input.checkInDate) {
      setQuote(null);
      setError(null);
      return;
    }
    if (input.stayType === 'fixed' && !input.checkOutDate) {
      setQuote(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        const res = await quoteExpressBookingAction({
          bedId: input.bedId,
          checkInDate: input.checkInDate,
          checkOutDate: input.stayType === 'fixed' ? input.checkOutDate : null,
          stayType: input.stayType,
        });
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setQuote(null);
          setError(res.error);
        } else {
          setQuote(res.quote);
          setError(null);
        }
        setLoading(false);
      })();
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    input.bedId,
    input.checkInDate,
    input.checkOutDate,
    input.stayType,
    input.enabled,
  ]);

  return { quote, loading, error };
}
