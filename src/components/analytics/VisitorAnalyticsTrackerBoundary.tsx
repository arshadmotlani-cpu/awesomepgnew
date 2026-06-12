'use client';

import { Suspense } from 'react';
import { VisitorAnalyticsTracker } from './VisitorAnalyticsTracker';

export function VisitorAnalyticsTrackerBoundary() {
  return (
    <Suspense fallback={null}>
      <VisitorAnalyticsTracker />
    </Suspense>
  );
}
