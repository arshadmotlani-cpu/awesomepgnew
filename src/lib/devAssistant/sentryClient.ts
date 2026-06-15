import type { DevAssistantDebugContext } from '@/src/lib/devAssistant/types';

type SentryLike = {
  lastEventId?: () => string | undefined;
  getCurrentHub?: () => { getScope?: () => { getLastBreadcrumb?: () => unknown } };
};

export function collectSentryContext(): DevAssistantDebugContext['sentry'] {
  if (typeof window === 'undefined') return { lastEventId: null, recentEvents: [] };

  try {
    const w = window as Window & { Sentry?: SentryLike; __SENTRY__?: { hub?: SentryLike } };
    const Sentry = w.Sentry ?? w.__SENTRY__?.hub;
    const lastEventId = Sentry?.lastEventId?.() ?? null;
    return {
      lastEventId,
      recentEvents: lastEventId ? [{ eventId: lastEventId }] : [],
    };
  } catch {
    return { lastEventId: null, recentEvents: [] };
  }
}
