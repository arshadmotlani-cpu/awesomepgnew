'use client';

import type { ReactNode } from 'react';
import { DevAssistantWidget } from '@/src/components/admin/DevAssistantWidget';

export type DevAssistantShellProps = {
  enabled: boolean;
  admin: { id: string; email: string; fullName: string; role: string };
  children: ReactNode;
};

export function DevAssistantShell({ enabled, admin, children }: DevAssistantShellProps) {
  return (
    <>
      {children}
      {enabled ? <DevAssistantWidget admin={admin} /> : null}
    </>
  );
}
