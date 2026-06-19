'use client';

import type { ReactNode } from 'react';
import { WorldLayer } from '@/src/components/world';

/** Phase G — calm futuristic control core shell for resident hub. */
export function ResidentControlShell({ children }: { children: ReactNode }) {
  return (
    <div className="world-control-core apg-aurora relative min-h-full">
      <WorldLayer depth={0} className="pointer-events-none absolute inset-0 opacity-40">
        <div className="world-control-glow absolute inset-0 bg-gradient-to-b from-apg-cyan/5 via-transparent to-apg-orange/5" />
      </WorldLayer>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function ResidentControlModule({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <WorldLayer depth={1} className={`world-control-module apg-glass rounded-2xl ${className}`}>
      {children}
    </WorldLayer>
  );
}
