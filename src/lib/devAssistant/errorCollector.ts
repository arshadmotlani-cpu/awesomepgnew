import type {
  DevAssistantCapturedError,
  DevAssistantFailedRequest,
} from '@/src/lib/devAssistant/types';

const MAX_ERRORS = 40;
const MAX_REQUESTS = 30;

let errors: DevAssistantCapturedError[] = [];
let failedRequests: DevAssistantFailedRequest[] = [];
let installed = false;

function pushError(entry: DevAssistantCapturedError) {
  errors = [...errors.slice(-(MAX_ERRORS - 1)), entry];
}

function pushFailedRequest(entry: DevAssistantFailedRequest) {
  failedRequests = [...failedRequests.slice(-(MAX_REQUESTS - 1)), entry];
}

export function getCollectedErrors(): DevAssistantCapturedError[] {
  return [...errors];
}

export function getCollectedFailedRequests(): DevAssistantFailedRequest[] {
  return [...failedRequests];
}

export function clearCollectedErrors() {
  errors = [];
  failedRequests = [];
}

export function installDevAssistantErrorCollector() {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const message = args.map(String).join(' ');
    if (!message.includes('[DevAssistant]')) {
      pushError({
        type: 'console',
        message: message.slice(0, 2000),
        at: new Date().toISOString(),
      });
    }
    origError(...args);
  };

  window.addEventListener('error', (ev) => {
    pushError({
      type: 'unhandled',
      message: ev.message || 'Unhandled error',
      source: ev.filename ? `${ev.filename}:${ev.lineno}` : undefined,
      stack: ev.error instanceof Error ? ev.error.stack : undefined,
      at: new Date().toISOString(),
    });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    pushError({
      type: 'unhandled',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      at: new Date().toISOString(),
    });
  });

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET');
    try {
      const res = await origFetch(input, init);
      if (!res.ok && (url.includes('/api/') || url.startsWith('/api/'))) {
        let bodySnippet: string | undefined;
        try {
          const clone = res.clone();
          bodySnippet = (await clone.text()).slice(0, 400);
        } catch {
          /* ignore */
        }
        pushFailedRequest({
          url,
          method,
          status: res.status,
          statusText: res.statusText,
          bodySnippet,
          at: new Date().toISOString(),
        });
        pushError({
          type: 'api',
          message: `API ${method} ${url} → ${res.status} ${res.statusText}`,
          at: new Date().toISOString(),
        });
      }
      return res;
    } catch (err) {
      pushFailedRequest({
        url,
        method,
        status: 0,
        statusText: err instanceof Error ? err.message : 'Network error',
        at: new Date().toISOString(),
      });
      pushError({
        type: 'network',
        message: `Network error: ${method} ${url}`,
        stack: err instanceof Error ? err.stack : undefined,
        at: new Date().toISOString(),
      });
      throw err;
    }
  };
}

export function reportReactError(error: Error, info?: { componentStack?: string }) {
  pushError({
    type: 'react',
    message: error.message,
    stack: [error.stack, info?.componentStack].filter(Boolean).join('\n'),
    at: new Date().toISOString(),
  });
}
