import type { DevAssistantDebugContext } from '@/src/lib/devAssistant/types';
import { collectPageAwareness, collectFilters } from '@/src/lib/devAssistant/pageAwareness';
import {
  getCollectedErrors,
  getCollectedFailedRequests,
} from '@/src/lib/devAssistant/errorCollector';
import { collectSentryContext } from '@/src/lib/devAssistant/sentryClient';
import { getRecentActions } from '@/src/lib/devAssistant/recentActions';

function deviceType(width: number): 'mobile' | 'tablet' | 'desktop' {
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

export type AdminContextUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};

export function collectDevAssistantContext(admin: AdminContextUser): DevAssistantDebugContext {
  const url = window.location.href;
  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const awareness = collectPageAwareness(pathname, searchParams);
  const searchQuery =
    searchParams.get('search') ??
    searchParams.get('q') ??
    (document.querySelector<HTMLInputElement>('input[type="search"]')?.value || undefined);

  const recentActions = getRecentActions().map((a) => `${a.at}: ${a.label}`);

  return {
    url,
    pathname,
    pageName: awareness.pageName,
    pageTitle: document.title,
    admin,
    entity: awareness.entity,
    filters: collectFilters(searchParams),
    searchQuery: searchQuery || undefined,
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      deviceType: deviceType(window.innerWidth),
    },
    timestamp: new Date().toISOString(),
    recentErrors: getCollectedErrors(),
    recentFailedRequests: getCollectedFailedRequests(),
    sentry: collectSentryContext(),
    pageHints: {
      ...awareness.pageHints,
      recentActions,
    },
  };
}
