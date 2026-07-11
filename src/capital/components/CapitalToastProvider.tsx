'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cn } from '@/src/capital/lib/utils';
import { Button } from '@/src/capital/components/ui/button';

type Toast = {
  id: string;
  message: string;
  undo?: () => void | Promise<void>;
  expiresAt: number;
};

type ToastContextValue = {
  showToast: (message: string, undo?: () => void | Promise<void>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function CapitalToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, undo?: () => void | Promise<void>) => {
    const id = crypto.randomUUID();
    const expiresAt = Date.now() + 5000;
    setToasts((t) => [...t, { id, message, undo, expiresAt }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'ac-glass-card flex min-w-[280px] items-center justify-between gap-3 px-4 py-3 text-sm shadow-xl',
              'animate-in slide-in-from-bottom-2',
            )}
          >
            <span>{t.message}</span>
            {t.undo ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await t.undo?.();
                  dismiss(t.id);
                }}
              >
                Undo
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useCapitalToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useCapitalToast must be used within CapitalToastProvider');
  return ctx;
}
