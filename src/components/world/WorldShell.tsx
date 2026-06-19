'use client';

import type { ReactNode } from 'react';
import { AmbientWorldLayer } from '@/src/components/world/AmbientWorldLayer';
import { WorldMotionProvider } from '@/src/components/world/WorldMotionProvider';

/** Wraps customer-facing experiences with scroll camera + ambient depth. */
export function WorldShell({ children }: { children: ReactNode }) {
  return (
    <WorldMotionProvider>
      <AmbientWorldLayer />
      <div className="world-shell relative">{children}</div>
    </WorldMotionProvider>
  );
}
