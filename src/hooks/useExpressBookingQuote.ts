'use client';

import { useEffect, useState } from 'react';
import { quoteExpressBookingAction } from '@/app/(admin)/admin/quick-actions/actions';
import type { ExpressBookingQuote, ExpressBookingStayType } from '@/src/lib/admin/expressBookingTypes';

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
        try {
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
        } catch (err) {
          if (controller.signal.aborted) return;
          setQuote(null);
          setError(err instanceof Error ? err.message : 'Could not load pricing.');
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
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
