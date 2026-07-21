'use client';

import { useEffect, useState } from 'react';
import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';
import type { NoticeDeductionPreviewResult } from '@/src/lib/vacating/previewNoticeDeductionAction';

type PreviewInput = {
  bookingId: string;
  vacatingDate: string;
  monthlyRentPaise: number;
  noticeGivenDate?: string;
};

export function useNoticeDeductionPreview(
  fetchPreview: (input: PreviewInput) => Promise<NoticeDeductionPreviewResult>,
  input: PreviewInput,
) {
  const [breakdown, setBreakdown] = useState<NoticeDeductionBreakdown | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.vacatingDate)) {
      setBreakdown(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void fetchPreview(input).then((result) => {
        if (cancelled) return;
        setBreakdown(result.ok ? result.breakdown : null);
        setLoading(false);
      });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    fetchPreview,
    input.bookingId,
    input.vacatingDate,
    input.monthlyRentPaise,
    input.noticeGivenDate,
  ]);

  return { breakdown, loading };
}
