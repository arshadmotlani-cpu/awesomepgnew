'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ElectricityLivePreview } from '@/src/components/admin/CheckoutSettlementElectricitySection';

type CheckoutElectricityDraftContextValue = {
  livePreview: ElectricityLivePreview | null;
  setLivePreview: (preview: ElectricityLivePreview | null) => void;
};

const CheckoutElectricityDraftContext = createContext<CheckoutElectricityDraftContextValue | null>(
  null,
);

export function CheckoutElectricityDraftProvider({ children }: { children: ReactNode }) {
  const [livePreview, setLivePreview] = useState<ElectricityLivePreview | null>(null);
  const value = useMemo(() => ({ livePreview, setLivePreview }), [livePreview]);
  return (
    <CheckoutElectricityDraftContext.Provider value={value}>
      {children}
    </CheckoutElectricityDraftContext.Provider>
  );
}

export function useCheckoutElectricityDraft(): CheckoutElectricityDraftContextValue {
  const ctx = useContext(CheckoutElectricityDraftContext);
  if (!ctx) {
    return {
      livePreview: null,
      setLivePreview: () => undefined,
    };
  }
  return ctx;
}
