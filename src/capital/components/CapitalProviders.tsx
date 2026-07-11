'use client';

import { CapitalToastProvider } from '@/src/capital/components/CapitalToastProvider';
import { CapitalKeyboardShortcuts } from '@/src/capital/components/CapitalKeyboardShortcuts';

export function CapitalProviders({ children }: { children: React.ReactNode }) {
  return (
    <CapitalToastProvider>
      <CapitalKeyboardShortcuts />
      {children}
    </CapitalToastProvider>
  );
}
