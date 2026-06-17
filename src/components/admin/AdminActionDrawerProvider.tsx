'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ActionDrawer } from '@/src/components/admin/ActionDrawer';
import { invalidatePanelCache } from '@/src/lib/admin/panelFetch';

type AdminActionDrawerContextValue = {
  openActionDrawer: (actionItemId: string) => void;
  closeActionDrawer: () => void;
};

const AdminActionDrawerContext = createContext<AdminActionDrawerContextValue | null>(null);

export function useAdminActionDrawer(): AdminActionDrawerContextValue {
  const ctx = useContext(AdminActionDrawerContext);
  if (!ctx) {
    throw new Error('useAdminActionDrawer must be used within AdminActionDrawerProvider');
  }
  return ctx;
}

export function AdminActionDrawerProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [actionItemId, setActionItemId] = useState<string | null>(null);

  const openActionDrawer = useCallback((id: string) => setActionItemId(id), []);
  const closeActionDrawer = useCallback(() => setActionItemId(null), []);

  return (
    <AdminActionDrawerContext.Provider value={{ openActionDrawer, closeActionDrawer }}>
      {children}
      {actionItemId ? (
        <ActionDrawer
          actionItemId={actionItemId}
          onClose={closeActionDrawer}
          onUpdated={() => {
            invalidatePanelCache('action-detail:');
            closeActionDrawer();
            router.refresh();
          }}
        />
      ) : null}
    </AdminActionDrawerContext.Provider>
  );
}
