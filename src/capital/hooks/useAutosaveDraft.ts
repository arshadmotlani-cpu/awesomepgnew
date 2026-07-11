'use client';

import { useEffect, useRef } from 'react';
import { useWatch, type Control, type FieldValues } from 'react-hook-form';
import { saveDraftAction } from '@/src/capital/actions/drafts';

export function useAutosaveDraft<T extends FieldValues>(
  draftKey: string,
  control: Control<T>,
  enabled = true,
) {
  const values = useWatch({ control });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    if (initial.current) {
      initial.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveDraftAction(draftKey, values as Record<string, unknown>);
    }, 2000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draftKey, values, enabled]);
}
