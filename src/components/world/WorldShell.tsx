'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AmbientWorldLayer } from '@/src/components/world/AmbientWorldLayer';
import { WorldMotionProvider } from '@/src/components/world/WorldMotionProvider';

type BoundaryProps = { children: ReactNode };

type BoundaryState = { motionFailed: boolean };

/** Keeps spatial chrome visible even if motion layer throws. */
class WorldMotionBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { motionFailed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { motionFailed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[WorldShell] motion layer error — rendering static fallback', error, info.componentStack);
  }

  render() {
    if (this.state.motionFailed) {
      return (
        <>
          <div className="world-ambient-static pointer-events-none fixed inset-0 -z-10" aria-hidden />
          <div className="world-shell relative">{this.props.children}</div>
        </>
      );
    }
    return (
      <>
        <AmbientWorldLayer />
        <div className="world-shell relative">{this.props.children}</div>
      </>
    );
  }
}

/** Public homepage / customer spatial wrapper — always renders aurora + grid. */
export function WorldShell({ children }: { children: ReactNode }) {
  return (
    <div className="apg-landing apg-aurora apg-grid-overlay world-entry relative min-h-full overflow-hidden">
      <WorldMotionProvider>
        <WorldMotionBoundary>{children}</WorldMotionBoundary>
      </WorldMotionProvider>
    </div>
  );
}
